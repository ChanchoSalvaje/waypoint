const {test}=require('node:test');
const assert=require('node:assert/strict');
const store=require('../netlify/functions/lib/supabase-store');
const {dataFetch,serverToken}=require('../netlify/functions/lib/data-backend');
const {parseFilter,evaluate,restCondition}=require('../netlify/functions/lib/record-filter');

const F={company:'flduaK4UtRwoU9WLu',role:'fldAGmW3YgUsHNbWe',stage:'fldE1YGHZdjiPIkiR',
  fit:'fldybh7PiN0armOSP',notes:'fldXN9uz1ZcIFtsKm',next:'fldQjbPglCq07XJJD',
  nextBy:'fld3pSuhVDc8gW4cU',excitement:'fldOzdAtFpCpi2GVU',pursue:'fldk41nshQmCXHanE',
  found:'fldsfSFJUdiVr4VFZ',seen:'fldGoCjcgaTFOwY8U'};
const definitions=[['Company','company','Long text'],['Role','role','Long text'],['Stage','stage','Single select'],
  ['Fit Score','fit','Number'],['Notes','notes','Long text'],['Next Action','next','Long text'],
  ['Next Action By','nextBy','Date'],['Excitement','excitement','Number'],['Pursue','pursue','Checkbox'],
  ['Date Found','found','Date'],['First Seen At','seen','Date']].map(([name,key,type])=>({name,id:F[key],type}));
const table={table_key:'opportunities',source_table_id:'tblWZyC4j4z12roVq',field_definitions:definitions};
function setup(t){
 const names=['WAYPOINT_DATA_BACKEND','WAYPOINT_SUPABASE_URL','WAYPOINT_SUPABASE_SECRET_KEY','AIRTABLE_TOKEN'];
 const before=Object.fromEntries(names.map(name=>[name,process.env[name]]));
 process.env.WAYPOINT_DATA_BACKEND='supabase';process.env.WAYPOINT_SUPABASE_URL='https://abcdefghijklmnopqrst.supabase.co';
 process.env.WAYPOINT_SUPABASE_SECRET_KEY='sb_secret_synthetic_not_live';delete process.env.AIRTABLE_TOKEN;store.clearCache();
 t.after(()=>{for(const name of names)before[name]===undefined?delete process.env[name]:process.env[name]=before[name];store.clearCache();});
}
const row=(number,fields={})=>({id:'rec'+String(number).padStart(14,'0'),fields,source_export_id:'synthetic-import',source_created_at:null,inserted_at:'2026-11-23T19:00:00Z'});
const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json',...headers}});

test('date filters preserve Arizona calendar dates and never substitute import time for creation time',()=>{
 const midnight="DATETIME_PARSE('2026-11-20T00:00:00-07:00')",calendar="DATETIME_PARSE('2026-11-20T00:00:00Z')";
 const ast=parseFilter(`IF({First Seen At},NOT(IS_BEFORE({First Seen At},${midnight})),AND({Date Found},NOT(IS_BEFORE({Date Found},${calendar}))))`);
 assert.equal(evaluate(ast,{fields:{[F.seen]:'2026-11-20T06:59:00Z'}},table),false);
 assert.equal(evaluate(ast,{fields:{[F.seen]:'2026-11-20T07:01:00Z'}},table),true);
 assert.equal(evaluate(ast,{fields:{[F.found]:'2026-11-20T00:00:00Z'}},table),true);
 const lead=parseFilter(`NOT(IS_BEFORE(IF({First Seen At},{First Seen At},CREATED_TIME()),${midnight}))`);
 assert.equal(evaluate(lead,{fields:{},createdTime:null},table),null);
 assert.equal(evaluate(lead,{fields:{},createdTime:'2026-11-19T18:00:00Z'},table),false);
});
test('tracker expressions reject executable syntax, unknown functions, and unrecognized fields',()=>{
 for(const source of ["eval('x')","RUN('x')","{Stage}='Saved';process.exit()","AND({Stage}='Saved'"])
  assert.throws(()=>parseFilter(source));
 assert.throws(()=>restCondition(parseFilter("{Unknown}='Saved'"),table));
 assert.match(restCondition(parseFilter("AND({Stage}='Saved',OR(RECORD_ID()='rec00000000000001',{Stage}='Applied'))"),table),/^and\(/);
});
test('complete reads pass the 1000-row default limit and imported creation time stays unknown',async t=>{
 setup(t);const dataset=Array.from({length:1101},(_,i)=>row(i+1,{[F.stage]:'Saved'}));let pages=0;
 t.mock.method(global,'fetch',async(input,options)=>{
  const url=new URL(input);assert.equal(options.headers.apikey,'sb_secret_synthetic_not_live');
  if(url.pathname.endsWith('/waypoint_tables'))return json([table]);
  pages++;const start=Number(url.searchParams.get('offset'));return json(dataset.slice(start,start+Number(url.searchParams.get('limit'))));
 });
 const result=await store.list(table.source_table_id);assert.equal(result.length,1101);assert.equal(pages,3);assert.equal(result[0].createdTime,null);
});
test('direct endpoint paging reads each page once and preserves field IDs and values',async t=>{
 setup(t);const dataset=Array.from({length:205},(_,i)=>row(i+1,{[F.fit]:4,[F.pursue]:false}));let pages=0;
 t.mock.method(global,'fetch',async(input)=>{const url=new URL(input);if(url.pathname.endsWith('/waypoint_tables'))return json([table]);pages++;const start=Number(url.searchParams.get('offset'));return json(dataset.slice(start,start+Number(url.searchParams.get('limit'))),200,{'Content-Range':`${start}-${Math.min(start+99,204)}/205`});});
 let records=[],offset;
 do{const data=await store.request(table.source_table_id+'?pageSize=100'+(offset?'&offset='+offset:''));records.push(...data.records);offset=data.offset;}while(offset);
 assert.equal(records.length,205);assert.equal(pages,3);assert.equal(records[0].fields[F.fit],4);assert.equal(records[0].fields[F.pursue],false);
});
test('field projection keeps filter inputs while omitting large unrelated text',async t=>{
 setup(t);let selection;
 t.mock.method(global,'fetch',async(input)=>{const url=new URL(input);if(url.pathname.endsWith('/waypoint_tables'))return json([table]);selection=url.searchParams.get('select');return json([{...row(1),[F.company]:'Synthetic employer',[F.seen]:'2026-11-23T18:00:00Z'}]);});
 const records=await store.list(table.source_table_id,{'fields[]':['Company'],filterByFormula:"NOT(IS_BEFORE({First Seen At},DATETIME_PARSE('2026-11-20T07:00:00Z')))"});
 assert.ok(selection.includes(F.seen+':fields->'));assert.ok(!selection.includes(F.notes));assert.deepEqual(records[0].fields,{[F.company]:'Synthetic employer'});
});
test('Supabase mode never falls back or sends the secret in an Airtable request',async t=>{
 setup(t);const urls=[];
 t.mock.method(global,'fetch',async(input)=>{urls.push(String(input));return json({error:'synthetic failure'},503);});
 const response=await dataFetch('https://api.airtable.com/v0/appUQQ4gnT7UuFOOm/'+table.source_table_id,{headers:{Authorization:'Bearer must-not-forward'}});
 assert.equal(response.status,503);assert.ok(urls.every(url=>url.startsWith(process.env.WAYPOINT_SUPABASE_URL)));
 assert.ok(!(await response.text()).includes(process.env.WAYPOINT_SUPABASE_SECRET_KEY));assert.equal(serverToken(),'private-tracker-configured');
 process.env.WAYPOINT_SUPABASE_SECRET_KEY='sb_publishable_synthetic';assert.equal(serverToken(),null);
});
test('unknown fields, wrong types, and stale optimistic updates are rejected',async t=>{
 setup(t);let payload;
 t.mock.method(global,'fetch',async(input,options)=>{if(String(input).includes('/waypoint_tables'))return json([table]);payload=JSON.parse(options.body);return json([]);});
 await assert.rejects(store.write(table.source_table_id,[{id:row(1).id,fields:{Unknown:'x'}}],'PATCH'),/Unknown tracker field/);
 await assert.rejects(store.write(table.source_table_id,[{id:row(1).id,fields:{[F.fit]:'5'}}],'PATCH'),error=>error.statusCode===400);
 await assert.rejects(store.write(table.source_table_id,[{id:row(1).id,fields:{[F.notes]:'old\nnew'},expectedFields:{[F.notes]:'old'}}],'PATCH'),error=>error.statusCode===409);
 assert.deepEqual(payload.p_expected,{[F.notes]:'old'});assert.equal(payload.p_table_key,'opportunities');
});
test('Pursue, Close, and notes retain the endpoint whitelist and preserve previous notes',async t=>{
 setup(t);const current=row(1,{[F.stage]:'Saved',[F.notes]:'Existing history',[F.fit]:4,[F.pursue]:false});let patches=[];
 t.mock.method(global,'fetch',async(input,options)=>{
  const url=new URL(input);if(url.pathname.endsWith('/waypoint_tables'))return json([table]);
  if(url.pathname.endsWith('/rpc/waypoint_patch_record')){
   const body=JSON.parse(options.body);patches.push(body);
   if(body.p_expected&&Object.entries(body.p_expected).some(([id,value])=>(current.fields[id]??null)!==value))return json([]);
   Object.assign(current.fields,body.p_patch);return json([current]);
  }
  return json([current]);
 });
 const {handler}=require('../netlify/functions/update-job');
 const call=body=>handler({httpMethod:'POST',body:JSON.stringify({id:current.id,...body})});
 assert.equal((await call({pursue:true,fit:99,notes:'erase'})).statusCode,200);assert.equal(current.fields[F.fit],4);assert.equal(current.fields[F.notes],'Existing history');
 assert.equal((await call({closeReason:'Synthetic close',fit:99})).statusCode,200);assert.equal(current.fields[F.stage],'Closed');assert.equal(current.fields[F.pursue],false);assert.equal(current.fields[F.next],'');assert.equal(current.fields[F.nextBy],null);assert.ok(current.fields[F.notes].startsWith('Existing history\n'));
 assert.equal((await call({noteAppend:'Synthetic appended note',notes:'erase'})).statusCode,200);assert.ok(current.fields[F.notes].endsWith('Synthetic appended note'));assert.equal(current.fields[F.fit],4);
 assert.ok(patches.filter(p=>Object.hasOwn(p.p_patch,F.notes)).every(p=>Object.hasOwn(p.p_expected,F.notes)));
 const before=patches.length;assert.equal((await call({fit:5})).statusCode,400);assert.equal((await call({stage:'Invented stage'})).statusCode,400);assert.equal(patches.length,before);
});
test('deployment connection check is read-only and never returns settings, URLs, or credentials',async t=>{
 setup(t);const settings={table_key:'settings',source_table_id:'tbl00000000000001',field_definitions:[]};
 t.mock.method(global,'fetch',async(input,options)=>{assert.ok(!options.method||options.method==='GET');return json(String(input).includes('/waypoint_tables')?[settings]:[row(1)]);});
 const {handler}=require('../netlify/functions/datastore-status');
 const response=await handler({httpMethod:'GET'}),body=JSON.parse(response.body);
 assert.equal(response.statusCode,200);assert.equal(body.connection,'verified');
 for(const forbidden of [process.env.WAYPOINT_SUPABASE_SECRET_KEY,process.env.WAYPOINT_SUPABASE_URL,row(1).id])assert.ok(!response.body.includes(forbidden));
 assert.equal((await handler({httpMethod:'POST'})).statusCode,405);
 process.env.WAYPOINT_SUPABASE_SECRET_KEY='sb_publishable_synthetic';assert.equal((await handler({httpMethod:'GET'})).statusCode,503);
});
