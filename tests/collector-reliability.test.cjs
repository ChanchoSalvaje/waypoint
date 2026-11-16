const {test}=require('node:test'), assert=require('node:assert/strict');
const {createHandler}=require('../netlify/functions/collect-employer-jobs-background');
const {schema,request}=require('../netlify/functions/lib/airtable');
const M=require('../public/waypoint-model');
const S=schema.sourceFields,L=schema.leadFields,R=schema.runFields;
const job={id:'new',key:'gh:new',title:'Senior Program Manager',location:'Remote US',url:'https://example.com/job',apply:'https://example.com/job',text:'Synthetic JD',timestamp:null,timestampKind:'Not supplied'};
function fixture({baseline='[]',failure=false,lostCreate=false,badReadback=false,running=false}={}) {
 let now=new Date('2026-11-16T01:10:00Z'),sequence=0,leadCreates=0;
 const rows={ [schema.sources]:[{id:'recSource',fields:{[S.Company]:'Fixture',[S.Provider]:'Greenhouse',[S.Board]:'fixture',[S.Enabled]:true,...(baseline===null?{}:{[S['Known Job IDs']]:baseline})}}], [schema.leads]:[], [schema.runs]:running?[{id:'recRunning',fields:{[R.Workflow]:'employer-collector',[R.Status]:'Running',[R['Run Key']]:'older'}}]:[] };
 const list=async(table,params={})=>{
  let data=rows[table];const filter=params.filterByFormula||'';
  const ids=[...filter.matchAll(/RECORD_ID\(\)='([^']+)'/g)].map(m=>m[1]);
  if(ids.length)data=data.filter(r=>ids.includes(r.id));
  const key=filter.match(/\{Run Key\}='([^']+)'/);if(key)data=data.filter(r=>r.fields[R['Run Key']]===key[1]);
  const result=structuredClone(data);if(badReadback&&table===schema.leads&&ids.length&&result[0])delete result[0].fields[L.Role];return result;
 };
 const write=async(table,items,method='POST')=>{
  const result=items.map(item=>{let row;if(method==='PATCH'){row=rows[table].find(r=>r.id===item.id);assert.ok(row);}else{row={id:'recFixture'+(++sequence),fields:{}};rows[table].push(row);if(table===schema.leads)leadCreates++;}Object.assign(row.fields,item.fields);return structuredClone(row);});
  if(lostCreate&&table===schema.leads&&method==='POST'){lostCreate=false;throw Error('Synthetic lost response after committed create');}return result;
 };
 const handler=createHandler({list,write,clock:()=>now,fetchBoard:async()=>{if(failure)throw Error('Synthetic provider failure');return [job];}});
 return {rows,handler,advance:()=>now=new Date(now.getTime()+3600000),leadCreates:()=>leadCreates};
}
const event={body:JSON.stringify({next_run:'2026-11-16T02:10:00Z'})};
test('missing or invalid links stay absent instead of opening undefined paths',()=>{for(const value of [undefined,null,'','  ','not a URL','javascript:alert(1)','//unverified.example'])assert.equal(M.safeUrl(value),'');assert.equal(M.safeUrl('/classic.html'),'https://waypoint-hq.netlify.app/classic.html');assert.equal(M.safeUrl('https://example.com/job'),'https://example.com/job');});
test('baseline scan verifies a real zero-new result and repeated hourly slot is a no-op',async()=>{const f=fixture({baseline:null});assert.equal((await f.handler(event)).statusCode,200);assert.equal(f.rows[schema.leads].length,0);assert.equal(f.rows[schema.runs][0].fields[R.Status],'Success');assert.equal(f.rows[schema.sources][0].fields[S['Known Job IDs']],'["new"]');assert.equal((await f.handler(event)).statusCode,202);assert.equal(f.rows[schema.runs].length,1);});
test('new candidate is read back before baseline advance and is not recreated next hour',async()=>{const f=fixture();await f.handler(event);assert.equal(f.leadCreates(),1);assert.equal(f.rows[schema.runs][0].fields[R['Items Written']],1);f.advance();await f.handler(event);assert.equal(f.leadCreates(),1);assert.equal(f.rows[schema.runs].length,2);});
test('provider failure preserves prior baseline and never stamps successful coverage',async()=>{const f=fixture({failure:true,baseline:'["prior"]'});await f.handler(event);const source=f.rows[schema.sources][0].fields;assert.equal(source[S['Known Job IDs']],'["prior"]');assert.equal(source[S['Last Success']],undefined);assert.match(source[S['Last Error']],/provider failure/);assert.equal(f.rows[schema.runs][0].fields[R.Status],'Partial');});
test('uncertain candidate create reconciles by source key on a later run without retrying create',async()=>{const f=fixture({lostCreate:true});await f.handler(event);assert.equal(f.leadCreates(),1);assert.equal(f.rows[schema.sources][0].fields[S['Known Job IDs']],'[]');assert.equal(f.rows[schema.runs][0].fields[R.Status],'Partial');f.advance();await f.handler(event);assert.equal(f.leadCreates(),1);assert.equal(f.rows[schema.sources][0].fields[S['Known Job IDs']],'["new"]');});
test('candidate readback mismatch does not advance the baseline or claim success',async()=>{const f=fixture({badReadback:true});await f.handler(event);assert.equal(f.rows[schema.sources][0].fields[S['Known Job IDs']],'[]');assert.equal(f.rows[schema.sources][0].fields[S['Last Success']],undefined);assert.equal(f.rows[schema.runs][0].fields[R.Status],'Partial');});
test('unresolved Running receipt blocks a second collector without additional writes',async()=>{const f=fixture({running:true});assert.equal((await f.handler(event)).statusCode,202);assert.equal(f.rows[schema.runs].length,1);assert.equal(f.leadCreates(),0);});
test('invalid invocation never creates a receipt',async()=>{const f=fixture();assert.equal((await f.handler({body:'{}'})).statusCode,405);assert.equal((await f.handler({body:'{"next_run":"invalid"}'})).statusCode,405);assert.equal(f.rows[schema.runs].length,0);});
test('Airtable POST 5xx is not automatically retried',async t=>{const previous=process.env.AIRTABLE_TOKEN;process.env.AIRTABLE_TOKEN='synthetic-fixture-only';t.after(()=>{if(previous===undefined)delete process.env.AIRTABLE_TOKEN;else process.env.AIRTABLE_TOKEN=previous;});let calls=0;await assert.rejects(request('fixture',{method:'POST'},async()=>{calls++;return{ok:false,status:503};}),/503/);assert.equal(calls,1);});
test('source freshness distinguishes failure, stale, future, paused and fresh reads',()=>{const now=new Date('2026-11-16T01:10:00Z'),base={Enabled:true};assert.equal(M.sourceHealth(base,now).label,'Not yet verified');assert.equal(M.sourceHealth({...base,'Last Success':'2026-11-15T22:00:00Z'},now).label,'Read overdue');assert.equal(M.sourceHealth({...base,'Last Success':'2026-11-16T01:00:00Z','Last Error':'failure'},now).label,'Latest read failed');assert.equal(M.sourceHealth({...base,'Last Success':'2026-11-16T02:00:00Z'},now).label,'Check source timestamp');assert.equal(M.sourceHealth({...base,'Last Success':'2026-11-16T00:00:00Z'},now).kind,'ready');assert.equal(M.sourceHealth({},now).label,'Paused');});
