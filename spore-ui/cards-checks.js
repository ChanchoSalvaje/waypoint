// Local synthetic integration checks; excluded from the production build.
async function runCardChecks(){
 const results=[],check=(name,ok)=>results.push({name,passed:!!ok});
 const original=structuredClone(fakeStore),load=adapter.load,dayKey=DailySpark.dayKey;
 try{
  for(const sectionKey of Object.keys(names)){select(sectionKey);check(sectionKey+' no page overflow',document.documentElement.scrollWidth<=innerWidth+1);}
  select('career');$('note').value='unsaved career draft';$('note').dispatchEvent(new Event('input'));select('writing');check('draft does not leak to another section',$('note').value==='');select('career');check('draft survives tab switch',$('note').value==='unsaved career draft');
  await loadConnected();check('draft survives successful refresh',$('note').value==='unsaved career draft');
  const current=state;adapter.load=async()=>{throw Object.assign(Error('Simulated offline'),{code:'LOAD'});};await loadConnected();check('failed read retains loaded data',state===current);check('failed read visible',$('freshness').textContent.includes('Refresh failed'));check('failed read retains draft',$('note').value==='unsaved career draft');adapter.load=load;
  await loadConnected();check('reconnect clears error',syncState==='ok'&&!$('freshness').textContent.includes('Refresh failed'));
  openTask(null,true);$('task-title').value='unfinished editor';await refreshSafely();check('open editor defers automatic refresh',syncState==='pending'&&$('task-title').value==='unfinished editor');closeTask();
  const t=state.tasks[0];await toggleTask(t);await loadConnected();check('completion survives reload',state.tasks.find(x=>x.id===t.id).done);select(t.section);check('completed task remains accessible',document.querySelector('.task-row.is-done')?.textContent.includes(t.title));
  const today=dayKey();DailySpark.dayKey=()=>DailySpark.shift(today,1);const draftBefore=$('note').value;refreshDailyPresentation();check('rollover updates planning date',state.planningDate===DailySpark.shift(today,1));check('rollover updates artwork',document.querySelector('#live-art-card').textContent.includes(dateLabel(DailySpark.shift(today,1))));check('rollover preserves draft',$('note').value===draftBefore);DailySpark.dayKey=dayKey;
  select('career');const detail=document.querySelector('.main-column .detail-link');detail.focus();detail.click();check('details open',reader.open);check('original source links retained',readerBody.querySelectorAll('a').length>0);reader.close();await Promise.resolve();
  const before=state.tasks.length;check('reading notes creates no tasks',before===fakeStore.tasks.length);
  const runTime=new Date().toISOString(),ids=await SporeFreshness.runIds(fakeStore.owner,'daily_brief',DailySpark.dayKey(),0),token='22222222-2222-4222-8222-222222222222';
  fakeStore.notes.push({id:ids.claim_id,user_id:fakeStore.owner,section:'today',brief_id:null,created_at:runTime,body:JSON.stringify({type:'spore_run_claim',v:1,scope:'daily_brief',run_id:ids.run_id,scheduled_for:runTime,claimed_at:runTime,attempt:0,owner_token:token,terminal_id:ids.terminal_id})});
  fakeStore.notes.push({id:ids.terminal_id,user_id:fakeStore.owner,section:'today',brief_id:null,created_at:runTime,body:JSON.stringify({type:'spore_run_receipt',v:1,run_id:ids.run_id,scope:'daily_brief',scheduled_for:runTime,checked_at:runTime,outcome:'no_change',content_id:null,message:'No material changes.',claim_id:ids.claim_id,attempt:0,owner_token:token,coverage:'full',content_ids:[]})});await loadConnected();check('valid receipt excluded from ordinary notes',!state.notes.some(n=>n.id===ids.terminal_id));check('linked no-change success visible',$('freshness').textContent.includes('no material changes'));
  for(const key of Object.keys(names)){select(key);check(key+' post-refresh no overflow',document.documentElement.scrollWidth<=innerWidth+1);}
  readDetails('Private detail','Synthetic private content');adapter.load=async()=>{throw Object.assign(Error('Expired'),{code:'AUTH'});};await loadConnected();check('auth failure closes and clears detail reader',!reader.open&&readerBody.textContent==='');check('auth failure clears workspace',state===null&&$('view').textContent==='');adapter.load=load;await loadConnected();check('reauthenticated reload restores saved content',!!state&&state.tasks.length>0);
 }catch(e){check('unexpected error: '+e.message,false);}
 finally{adapter.load=load;DailySpark.dayKey=dayKey;Object.assign(fakeStore,original);noteDrafts={};$('note').value='';await loadConnected();select('today');}
 $('card-test-output').textContent=JSON.stringify({passed:results.filter(r=>r.passed).length,total:results.length,results},null,2);
}
const cardTools=el('div','','preview-tools'),cardOutput=el('output');cardOutput.id='card-test-output';cardTools.append(button('Run card integration checks',runCardChecks),cardOutput);document.querySelector('.preview-banner').after(cardTools);
