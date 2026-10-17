(function(root){
 'use strict';
 const scopes=['daily_brief','career','writing'];
 function receipt(n){try{
  const r=JSON.parse(n.body),keys=['type','v','run_id','scope','scheduled_for','checked_at','outcome','content_id','message'];
  const iso=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(x)&&Number.isFinite(Date.parse(x));
  if(!r||Array.isArray(r)||Object.keys(r).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(r,k))||r.type!=='spore_run_receipt'||r.v!==1||n.section!=='today'||!scopes.includes(r.scope)||!['published','no_change','failed'].includes(r.outcome)||typeof r.run_id!=='string'||r.run_id.length<1||r.run_id.length>120||!iso(r.checked_at)||!iso(r.scheduled_for)||!(r.content_id===null||(typeof r.content_id==='string'&&/^[a-f0-9-]{36}$/i.test(r.content_id)))||typeof r.message!=='string'||r.message.length>500)return null;
  return {...r,recorded_at:n.created_at};
 }catch{return null;}}

 function day(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Phoenix',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
 function assess(brief,receipts=[],now=new Date()){
  const today=day(now),deadline=Date.parse(today+'T09:30:00-07:00');
  const runs=receipts.filter(r=>r.scope==='daily_brief'&&day(new Date(r.scheduled_for))===today&&Date.parse(r.checked_at)<=now.getTime()).sort((a,b)=>Date.parse(b.checked_at)-Date.parse(a.checked_at));
  const last=runs[0],success=runs.find(r=>r.outcome!=='failed');
  if(last?.outcome==='failed')return {kind:'warning',text:'Daily check reported a failure. Last saved content remains available.',last,success};
  if(success)return {kind:'ok',text:success.outcome==='no_change'?'Daily check completed · no material changes.':'Daily publication confirmed by its run receipt.',last,success};
  if(brief?.brief_date===today)return {kind:'ok',text:'Today’s brief is saved. Source-check receipt not recorded.',last,success};
  return {kind:now.getTime()>=deadline?'warning':'pending',text:now.getTime()>=deadline?'Daily brief or successful check overdue · expected by 9:30 a.m. Arizona.':'Awaiting today’s brief or check · due by 9:30 a.m. Arizona.',last,success};
 }
 const api={receipt,assess,day};if(typeof module==='object')module.exports=api;else root.SporeFreshness=api;
})(typeof globalThis==='object'?globalThis:this);
