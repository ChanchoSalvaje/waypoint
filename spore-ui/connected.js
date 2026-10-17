let syncAt=null,syncState='loading',runReceipts=[];
let busy=false,latestBrief=null,taskVersions=new Map(),workspaceEpoch=0,loadCounter=0;
const client=SporeSDK.publicClient(SporeSDK.createClient,{url:'https://ujsliyqjzyofcytcemhs.supabase.co',publishableKey:'sb_publishable_aeVSmS8RJ5SotDmQdtaZig_HjzagE8X',redirectTo:SporeSDK.CALLBACK});
const adapter=SporeSDK.createAdapter(client,{redirectTo:SporeSDK.CALLBACK,onInvalidate:lockWorkspace});
function showSignIn(show){$('login-form').hidden=!show;$('sign-in-help').hidden=!show;}
function authMessage(text){$('auth-message').textContent=text;}
function lockWorkspace(){if($('detail-reader')?.open)$('detail-reader').close();if(typeof readerBody!=='undefined')readerBody.replaceChildren();runReceipts=[];syncAt=null;$('freshness').replaceChildren();if($('set-password-form'))$('set-password-form').reset();if($('login-password'))$('login-password').value='';showSignIn(false);workspaceEpoch++;loadCounter++;state=null;latestBrief=null;taskVersions.clear();noteDrafts={};editing=null;undoAction=null;document.querySelector('.studio').hidden=true;$('auth-gate').hidden=false;$('view').replaceChildren();$('notes').replaceChildren();$('history-list').replaceChildren();$('task-detail').replaceChildren();$('task-form').reset();$('note').value='';if($('task-dialog').open)$('task-dialog').close();authMessage('Workspace locked. Sign in or check access again.');}
function convertSnapshot(s){
 s=SporeVisibility.snapshot(s);
 runReceipts=s.notes.map(SporeFreshness.receipt).filter(Boolean);s={...s,notes:s.notes.filter(n=>!SporeFreshness.receipt(n))};
 taskVersions=new Map(s.tasks.map(t=>[t.id,t.revision]));latestBrief=s.briefs.sort((a,b)=>b.brief_date.localeCompare(a.brief_date))[0]||null;
 fixtures.commitments=(latestBrief?.commitments||[]).filter(c=>c&&typeof c.title==='string'&&typeof c.date==='string').map(c=>[c.date,c.title,names[c.section]||'Personal',Object.hasOwn(names,c.section)?c.section:'personal']);
 return {owner:s.owner,version:2,revision:0,mode:'connected',planningDate:DailySpark.dayKey(),generatedAt:new Date().toISOString(),tasks:s.tasks.map(t=>({...t,nextAction:t.next_action,deferUntil:t.defer_until||'',due:t.due||'',opportunityRef:t.airtable_record_id})),notes:s.notes.map(n=>({...n,at:n.created_at})),history:s.history.map(h=>({...h,at:h.created_at,text:h.kind.replaceAll('_',' ')}))};
}
async function loadConnected(){
 if(busy)return false;
 const ticket=++loadCounter,epoch=workspaceEpoch;syncState='loading';if(state)renderFreshness();
 try{const s=await adapter.load();if(ticket!==loadCounter||epoch!==workspaceEpoch)return false;
 if(busy){syncState='pending';renderFreshness();return false;}
 noteDrafts[active]=$('note').value;
 state=convertSnapshot(s);syncAt=new Date().toISOString();syncState='ok';
 $('auth-gate').hidden=true;document.querySelector('.studio').hidden=false;
 if(!$('task-dialog').open&&!$('detail-reader')?.open)select(Object.hasOwn(names,active)?active:'today');else renderFreshness();
 return true;
 }catch(e){if(ticket!==loadCounter||epoch!==workspaceEpoch)return false;syncState='error';
 if(state&&!['AUTH','FORBIDDEN','SESSION_CHANGED'].includes(e.code)){renderFreshness();return false;}
 lockWorkspace();showSignIn(e.code==='AUTH');authMessage(e.code==='FORBIDDEN'?'Workspace access is awaiting activation.':e.code==='AUTH'?'Sign in with your invited account.':'Could not load the workspace. Check your connection and try again.');return false;}}

function payload(t){return {id:t.id,section:t.section,title:t.title,why:t.why,next_action:t.nextAction,due:t.due||null,defer_until:t.deferUntil||null,priority:t.priority,minutes:t.minutes,done:t.done,airtable_record_id:t.opportunityRef||null};}
async function saveConnected(action){
 if(!state)throw Error('Sign in before saving.');const epoch=workspaceEpoch;
 let saved;
 try{
 if(action.kind==='note'){saved=await adapter.appendNote({id:action.id,section:action.section,body:action.body});if(epoch!==workspaceEpoch)throw Error('Session changed.');state.notes.push({...saved,at:saved.created_at});}
 else{const t=action.kind==='toggle'?{...state.tasks.find(t=>t.id===action.id)}:{...action.task};if(action.kind==='toggle')t.done=!t.done;const rev=taskVersions.get(t.id);saved=rev===undefined?await adapter.createTask(payload(t)):await adapter.updateTask(payload(t),rev);if(epoch!==workspaceEpoch)throw Error('Session changed.');taskVersions.set(saved.id,saved.revision);state.tasks=state.tasks.filter(t=>t.id!==saved.id);state.tasks.push({...saved,nextAction:saved.next_action,due:saved.due||'',deferUntil:saved.defer_until||'',opportunityRef:saved.airtable_record_id});}
 state.revision++;state.history.push({at:new Date().toISOString(),section:saved.section,text:action.kind==='note'?'Note saved':'Task saved'});
 }catch(e){if(['AUTH','FORBIDDEN','SESSION_CHANGED'].includes(e.code))lockWorkspace();throw e;}
}
$('login-form').addEventListener('submit',async e=>{e.preventDefault();const email=$('login-email').value.trim().toLowerCase(),input=$('login-password'),b=e.submitter;let password=input.value;input.value='';b.disabled=true;try{await adapter.signInPassword(email,password);password='';await loadConnected();}catch(error){authMessage(error.message);}finally{password='';b.disabled=false;}});
const passwordForm=$('set-password-form');
if(passwordForm)passwordForm.addEventListener('submit',async e=>{e.preventDefault();const b=e.submitter;let password=$('new-password').value,confirmation=$('confirm-password').value;passwordForm.reset();b.disabled=true;try{$('password-message').textContent=await adapter.setPassword(password,confirmation);}catch(error){$('password-message').textContent=error.message;}finally{password='';confirmation='';b.disabled=false;}});

$('retry-auth').addEventListener('click',()=>loadConnected());
$('refresh').addEventListener('click',async()=>{if(busy){notify('Wait for the current save.');return;}await loadConnected();});
async function signOutConnected(){lockWorkspace();try{await adapter.signOut();showSignIn(true);authMessage('Signed out.');}catch{showSignIn(true);authMessage('Locked here; server sign-out was not confirmed. Try again.');}}
$('sign-out').addEventListener('click',signOutConnected);$('gate-sign-out').addEventListener('click',signOutConnected);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state)refreshSafely();});
window.addEventListener('online',()=>{if(state)refreshSafely();});
window.addEventListener('offline',()=>{syncState='offline';if(state)renderFreshness();});
setInterval(()=>{if(state&&!document.hidden)refreshSafely();},300000);
async function startConnected(){try{await SporeSDK.finishReturn(client.auth,location.href,()=>history.replaceState(null,'',location.pathname));active=Object.hasOwn(names,location.hash.slice(1))?location.hash.slice(1):'today';await loadConnected();}catch(e){lockWorkspace();showSignIn(true);authMessage(e.message);}}
startConnected();
