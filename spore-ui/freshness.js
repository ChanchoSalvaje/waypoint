(function(root){
 'use strict';
 const scopes=['daily_brief','career','writing','two_week_sweep'];
 const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x);
 const iso=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(x)&&Number.isFinite(Date.parse(x));
 const exact=(r,keys)=>r&&!Array.isArray(r)&&Object.keys(r).every(k=>keys.includes(k))&&keys.every(k=>Object.hasOwn(r,k));
 const token=x=>uuid(x)&&x[14]==='4'&&/[89ab]/i.test(x[19]);
 function receipt(n){try{
  const r=JSON.parse(n.body),base=['type','v','run_id','scope','scheduled_for','checked_at','outcome','content_id','message'],extra=['claim_id','attempt','owner_token','coverage','content_ids'],extended=extra.some(k=>Object.hasOwn(r,k));
  const legacyISO=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(x)&&Number.isFinite(Date.parse(x));
  if(!exact(r,extended?base.concat(extra):base)||r.type!=='spore_run_receipt'||r.v!==1||n.section!=='today'||!scopes.includes(r.scope)||!['published','no_change','failed'].includes(r.outcome)||typeof r.run_id!=='string'||r.run_id.length<1||r.run_id.length>120||!legacyISO(r.checked_at)||!legacyISO(r.scheduled_for)||!(r.content_id===null||(typeof r.content_id==='string'&&/^[a-f0-9-]{36}$/i.test(r.content_id)))||typeof r.message!=='string'||r.message.length>500)return null;
  if(extended&&(n.brief_id!==null||n.body.length>=3000||!uuid(n.id)||!uuid(r.run_id)||!uuid(r.claim_id)||![0,1].includes(r.attempt)||!token(r.owner_token)||!['full','partial'].includes(r.coverage)||!Array.isArray(r.content_ids)||r.content_ids.length>3||!r.content_ids.every(uuid)||new Set(r.content_ids).size!==r.content_ids.length||!iso(r.scheduled_for)||!iso(r.checked_at)||!(r.content_id===null||uuid(r.content_id))||(r.content_id!==null&&!r.content_ids.includes(r.content_id))||(r.outcome==='published'&&!r.content_ids.length)||(r.outcome==='failed'&&(r.content_ids.length||r.content_id!==null))))return null;
  return {...r,recorded_at:n.created_at,row_id:n.id,extended,verified:false};
 }catch{return null;}}
 function claim(n){try{const r=JSON.parse(n.body);if(!exact(r,['type','v','scope','run_id','scheduled_for','claimed_at','attempt','owner_token','terminal_id'])||r.type!=='spore_run_claim'||r.v!==1||n.section!=='today'||n.brief_id!==null||n.body.length>=3000||!uuid(n.id)||!scopes.concat('recovery_check').includes(r.scope)||!uuid(r.run_id)||!iso(r.scheduled_for)||!iso(r.claimed_at)||![0,1].includes(r.attempt)||!token(r.owner_token)||!uuid(r.terminal_id))return null;if(r.scope==='recovery_check'&&(r.attempt!==0||new Intl.DateTimeFormat('en-GB',{timeZone:'America/Phoenix',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(r.scheduled_for))!=='08:30'))return null;return {...r,row_id:n.id,verified:false};}catch{return null;}}
 function day(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Phoenix',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
 async function id(parts){const cryptoAPI=typeof module==='object'?require('node:crypto').webcrypto:root.crypto;const hash=new Uint8Array(await cryptoAPI.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(parts))));const bytes=hash.slice(0,16);bytes[6]=(bytes[6]&15)|128;bytes[8]=(bytes[8]&63)|128;const h=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
 async function runIds(owner,scope,date,attempt){return {run_id:await id(['spore-run-v1',owner,scope,date]),claim_id:await id(['spore-run-claim-v1',owner,scope,date,attempt]),terminal_id:await id(['spore-run-receipt-v1',owner,scope,date,attempt])};}
 async function verifyRuns(notes,owner,artifacts=[],now=new Date()){
  const owned=notes.filter(n=>n.user_id===owner),receipts=owned.map(receipt).filter(Boolean),claims=owned.map(claim).filter(Boolean),known=new Set(artifacts.filter(a=>a.user_id===owner).map(a=>a.id));
  for(const c of claims){const ids=await runIds(owner,c.scope,day(new Date(c.scheduled_for)),c.attempt);c.verified=c.row_id===ids.claim_id&&c.run_id===ids.run_id&&c.terminal_id===ids.terminal_id&&Date.parse(c.claimed_at)<=now.getTime();}
  for(const r of receipts){const c=claims.find(c=>c.verified&&c.row_id===r.claim_id);r.verified=!!(r.extended&&c&&r.row_id===c.terminal_id&&['attempt','owner_token','run_id','scope','scheduled_for'].every(k=>r[k]===c[k])&&Date.parse(r.checked_at)>=Date.parse(c.claimed_at)&&Date.parse(r.checked_at)<=now.getTime()&&r.content_ids.every(x=>known.has(x)));}
  // Attempt 1 is not an elapsed-time takeover. An accepted failed terminal is required.
  for(const c of claims.filter(c=>c.attempt===1)){const prior=receipts.find(r=>r.verified&&r.run_id===c.run_id&&r.attempt===0&&r.outcome==='failed'&&r.content_ids.length===0&&r.content_id===null);c.verified=c.verified&&!!prior&&Date.parse(c.claimed_at)>=Date.parse(prior.checked_at);if(!c.verified)for(const r of receipts.filter(r=>r.claim_id===c.row_id))r.verified=false;}
  return {receipts,claims};
 }
 function assess(brief,receipts=[],now=new Date(),claims=[],scope='daily_brief'){
  const today=day(now),deadline=Date.parse(today+'T09:30:00-07:00');
  const runs=receipts.filter(r=>r.verified&&r.scope===scope&&day(new Date(r.scheduled_for))===today&&Date.parse(r.checked_at)<=now.getTime()).sort((a,b)=>b.attempt-a.attempt||Date.parse(b.checked_at)-Date.parse(a.checked_at));
  const active=claims.filter(c=>c.verified&&c.scope===scope&&day(new Date(c.scheduled_for))===today&&!runs.some(r=>r.claim_id===c.row_id));
  if(active.length)return {kind:now.getTime()>=deadline?'warning':'pending',text:now.getTime()>=deadline?'Check stalled or unverified · no matching completion recorded.':'Check in progress · completion not yet recorded.'};
  const last=runs[0];if(last?.outcome==='failed')return {kind:'warning',text:'Check reported a failure. Last saved content remains available.',last};
  if(last?.coverage==='partial')return {kind:'warning',text:'Check completed with partial source coverage · review freshness details.',last};
  if(last)return {kind:'ok',text:last.outcome==='no_change'?'Check completed · no material changes.':'Publication confirmed by a linked completion receipt.',last,success:last};
  if(brief?.brief_date===today)return {kind:now.getTime()>=deadline?'warning':'pending',text:'Today’s brief is saved. Source-check completion is unverified.'};
  return {kind:now.getTime()>=deadline?'warning':'pending',text:now.getTime()>=deadline?'Daily brief or successful check overdue · expected by 9:30 a.m. Arizona.':'Awaiting today’s brief or check · due by 9:30 a.m. Arizona.'};
 }
 const api={receipt,claim,verifyRuns,runIds,assess,day};if(typeof module==='object')module.exports=api;else root.SporeFreshness=api;
})(typeof globalThis==='object'?globalThis:this);
