'use strict';
const M=BriefModel, KEY='unused-connected-no-demo-import';
const $=id=>document.getElementById(id);
const names={today:'Today',career:'Career',safoj:'SAFOJ',personal:'Personal',writing:'Writing Room'};
const intro={career:'Your employment work, from the next application to the follow-up worth making.',safoj:'Reading, community commitments, and ideas worth exploring together.',personal:'Commitments, small practical things, and what matters beyond work.',writing:'A place for drafts, fragments, and whatever wants to become a story.'};
// Presentation fixtures are deliberately separate from saved user state and future service adapters.
const fixtures={decision:'Would a short board-support outline be useful this week?',commitments:[]};
let previewOffset=0,sparkOpen=false,artDay=DailySpark.dayKey();
let state,active='today',storageOK=true,editing=null,returnFocus=null,noteDrafts={},undoAction=null;
const dateLabel=value=>value?new Intl.DateTimeFormat('en-US',{timeZone:'America/Phoenix',month:'short',day:'numeric'}).format(new Date(value+'T12:00:00-07:00')):'';
function el(tag,text='',cls=''){const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;}
function button(label,fn,cls='text-button'){const b=el('button',label,cls);b.type='button';b.addEventListener('click',fn);return b;}
function notify(message){$('feedback').hidden=false;$('status').textContent=message;$('undo').hidden=!undoAction;}
function storageNotice(){ $('storage-notice').textContent=storageOK?'Changes are stored only in this browser. Clearing browser data removes them; there is no device or chat sync.':'Storage is unavailable or unreadable. Changes last only until reload. Existing stored data has not been overwritten.';if(!storageOK){$('disclosure').open=true;$('disclosure').querySelector('summary').textContent='Synthetic preview · session only';} }
async function commit(action){
 if(busy){notify('Wait for the current save.');return false;}busy=true;
 try {await saveConnected(action);undoAction=null;render();notify('Saved to your private workspace.');return true;}
 catch(e){notify(e.message||'Save not confirmed. Your draft is retained.');return false;}
 finally{busy=false;}
}
function select(section){noteDrafts[active]=$('note').value;active=section;location.hash=section;document.querySelectorAll('[role=tab]').forEach(t=>{const selected=t.dataset.section===active;t.setAttribute('aria-selected',String(selected));t.tabIndex=selected?0:-1;});$('panel').setAttribute('aria-labelledby','tab-'+active);render();}
async function toggleTask(t){const wasDone=t.done;if(await commit({kind:'toggle',id:t.id})){undoAction={id:t.id,wasDone,revision:state.revision};notify((wasDone?'Reopened: ':'Completed: ')+t.title);$('undo').focus();}}
$('undo').addEventListener('click',async()=>{const u=undoAction;if(!u)return;const t=state.tasks.find(t=>t.id===u.id);if(!t||state.revision!==u.revision||t.done===u.wasDone){undoAction=null;notify('That change can no longer be undone here. Use the task details.');return;}if(await commit({kind:'toggle',id:u.id})){notify('Undone. Your task is restored.');$('add-task').focus();}});
function meta(t,showSection=false){return [showSection?names[t.section]:null,t.due?'Due '+dateLabel(t.due):null,M.deferred(t,state.planningDate)?'Deferred to '+dateLabel(t.deferUntil):null,t.priority==='high'?'Priority':null,t.minutes+' min estimate'].filter(Boolean).join(' · ');}
function taskRow(t,showSection=false){const row=el('article','','task-row'+(t.done?' is-done':''));row.dataset.taskId=t.id;const check=document.createElement('input');check.type='checkbox';check.checked=t.done;check.setAttribute('aria-label',(t.done?'Reopen: ':'Complete: ')+t.title);check.addEventListener('change',()=>{toggleTask(t);check.checked=t.done;});const body=el('div','','row-body');body.append(button(t.title,()=>openTask(t,false,showSection),'task-link'),el('p',meta(t,showSection),'meta'));if(active==='career'&&['demo-career-1','demo-career-2'].includes(t.id))body.append(el('span',t.id.endsWith('1')?'Sample opportunity A':'Sample opportunity B','reference'));row.append(check,body,el('span','↗','row-arrow'));return row;}
function section(title,cls=''){const node=el('section','',cls);node.append(el('h2',title));return node;}

const discoveries=[
 {title:'Letting seaweed make its own portrait',body:'Beginning in 1843, Anna Atkins published cyanotype images of British algae. She placed specimens directly on light-sensitive paper and exposed them to sunlight, then labeled the resulting plates by hand. Her pages combined botanical identification with an emerging photographic technique.',source:'Metropolitan Museum of Art',url:'https://www.metmuseum.org/art/collection/search/286656',question:'What might you understand better by making a direct record instead of describing it?'},
 {title:'A rhinoceros assembled from reports',body:'Albrecht Dürer made his famous rhinoceros woodcut in 1515 using other people’s images and descriptions. He captured recognizable features but also gave the animal armored plates, scaly legs and an extra horn on its back. The striking print circulated widely and inspired later copies.',source:'National Gallery of Art',url:'https://www.nga.gov/stories/articles/horns-scales-and-armor',question:'Where might a vivid picture in your mind be outrunning the evidence behind it?'},
 {title:'Ancient mathematics beneath the prayers',body:'Parchment from a medieval copy of Archimedes’ writings was scraped and reused for a prayer book completed in 1229. Centuries later, conservation and imaging helped scholars read the erased mathematics. The project published its images and transcriptions online in 2008.',source:'Archimedes Palimpsest project',url:'https://archimedespalimpsest.org/digital/index.php',question:'What unfinished idea deserves another look with the tools or experience you have now?'},
 {title:'An envelope for a fragile filament',body:'Lewis Latimer’s 1882 patent tackled a practical problem: fragile lamp-filament blanks broke or warped while being carbonized. His method enclosed them in protective cardboard envelopes that contracted with the material. The invention made a delicate manufacturing step more dependable.',source:'Lewis H. Latimer · U.S. Patent 252,386',url:'https://patents.google.com/patent/US252386A/en',question:'Which fragile step in something you make would benefit from a better support system?'},
 {title:'Fifty people, one larger bookshelf',body:'In 1731, fifty founding shareholders helped establish Philadelphia’s Library Company. Each contributed forty shillings and promised ten more annually. Benjamin Franklin and his fellow Junto members pooled resources to buy books they could not individually afford.',source:'Library Company of Philadelphia',url:'https://librarycompany.org/about-lcp/',question:'What could your circle learn together that would be difficult to pursue alone?'},
 {title:'An invitation across nineteen centuries',body:'Around AD 100, Claudia Severa invited Sulpicia Lepidina to her birthday celebration in Roman Britain. The invitation survives on a thin wooden tablet found at Vindolanda. A scribe wrote most of it; Severa added a personal greeting in her own hand.',source:'British Museum · Vindolanda tablets',url:'https://www.britishmuseum.org/collection/galleries/roman-britain/vindolanda-tablets',question:'Whose presence would make an ordinary day feel like an occasion?'}
];
function selectedArtDay(){return DailySpark.shift(DailySpark.dayKey(),previewOffset);}
function imageContent(asset,section,key){
 const box=el('div','','art-image');
 const fallback=()=>{box.replaceChildren(DailySpark.art(section,key),el('small','Original Spore illustration · museum image unavailable','art-fallback'));};
 if(!asset){fallback();return box;}
 const img=document.createElement('img');img.alt=asset.alt;img.decoding='async';img.addEventListener('error',fallback,{once:true});img.src=asset.data;box.append(img);return box;
}
function artworkFigure(asset,cls='',section=active,key=selectedArtDay()){
 const figure=el('figure','',cls);figure.append(imageContent(asset,section,key));
 if(asset){const credit=el('figcaption'),a=el('a',asset.credit);a.href=asset.source;a.target='_blank';a.rel='noopener noreferrer';a.referrerPolicy='no-referrer';credit.append(a);figure.append(credit);}return figure;
}
function renderArt(){
 const key=selectedArtDay();artDay=DailySpark.dayKey();
 const pick=ArtCycle.resolve(active,key,ArtCatalog);$('art-figure').hidden=active==='today';
 $('daily-art').replaceChildren(imageContent(pick.asset,active,key));$('art-credit').replaceChildren();
 if(pick.asset){const a=el('a',pick.asset.credit);a.href=pick.asset.source;a.target='_blank';a.rel='noopener noreferrer';a.referrerPolicy='no-referrer';$('art-credit').append(a);}
 $('art-credit').append(el('span',pick.caption,'art-thought'));
 $('art-caption').textContent='Art & reading: '+key+(previewOffset?' · preview':'')+'. Changes at midnight in Arizona. Seven-day art collection.';
 $('reset-day').hidden=previewOffset===0;$('panel').classList.toggle('with-art',active!=='today');
}

function explore(prompt){const d=el('details','','spark-explore');d.append(el('summary','Explore, if you like'),el('p',prompt),el('small','Spore original reflection · No answer or sharing needed.'));return d;}
function sparkPanel(){
 const key=selectedArtDay(),pick=DailySpark.selection(key),r=pick.reflection,curation=ArtCycle.resolve('today',key,ArtCatalog);
 const wrapper=el('section','','spark-feature');wrapper.id='spark-feature';wrapper.dataset.day=key;
 wrapper.append(artworkFigure(curation.asset,'spark-art','today',key));
 const copy=el('div','','spark-copy');copy.append(el('p','Daily Spark · '+key,'kicker'),el('h2',curation.theme),el('p',curation.caption,'spark-thought'));
 const panel=el('details','','daily-spark');panel.open=sparkOpen;panel.addEventListener('toggle',()=>{sparkOpen=panel.open;});panel.append(el('summary','A reflection & a story'));
 const contents=el('div','','spark-columns'),lens=el('section','','spark-lens');
 lens.append(el('p','Tarot · Reflection','kicker'),el('h3',r[0]),el('span',r[1],'archetype'),el('p',r[2]),explore(r[3]),el('p','An original reflection by Spore, not a prediction or diagnosis. The artwork above is a visual companion, not a depiction of this card.','spark-note'));
 const discovery=el('section','','spark-discovery'),d=discoveries[pick.index%discoveries.length];
 discovery.append(el('p','From the archive','kicker'),el('h3',d.title),el('p',d.body));
 const a=el('a',d.source+' ↗','spark-source');a.href=d.url;a.target='_blank';a.rel='noopener noreferrer';a.referrerPolicy='no-referrer';discovery.append(a,explore(d.question));contents.append(lens,discovery);panel.append(contents);copy.append(panel);wrapper.append(copy);return wrapper;
}
function refreshDailyPresentation(){
 if(!state)return;const spark=$('spark-feature');if(artDay===DailySpark.dayKey()&&(!spark||spark.dataset.day===selectedArtDay()))return;
 // Only replace art/date nodes. Note input, planner, task editor, selection and focus stay mounted.
 renderArt();if(active==='today'){$('eyebrow').textContent=new Date().toLocaleDateString('en-US',{timeZone:'America/Phoenix',weekday:'long',month:'long',day:'numeric'});const old=$('spark-feature');if(old){if(old.contains(document.activeElement))return;old.replaceWith(sparkPanel());}}
}
let dayTimer;
function scheduleDayRefresh(){clearTimeout(dayTimer);dayTimer=setTimeout(()=>{refreshDailyPresentation();scheduleDayRefresh();},ArtCycle.untilMidnight());}
scheduleDayRefresh();
document.addEventListener('focusout',()=>queueMicrotask(refreshDailyPresentation));
window.addEventListener('focus',()=>{refreshDailyPresentation();scheduleDayRefresh();});

$('preview-day').addEventListener('click',()=>{previewOffset++;render();$('preview-day').focus();});
$('reset-day').addEventListener('click',()=>{previewOffset=0;render();$('preview-day').focus();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){refreshDailyPresentation();scheduleDayRefresh();}});

function goDomain(key){select(key);$('section-title').tabIndex=-1;$('section-title').focus();}
function render(){if(!state)return;renderArt();$('eyebrow').textContent=active==='today'?new Date().toLocaleDateString('en-US',{timeZone:'America/Phoenix',weekday:'long',month:'long',day:'numeric'}):'Workspace';$('section-title').textContent=active==='today'?'Today':names[active];$('section-description').textContent=active==='today'?'':intro[active];$('view').replaceChildren();if(active==='today')renderToday($('view'));else renderDomain($('view'));
 $('notes-title').textContent=active==='today'?'Notes for the day':'Working notes';$('note').value=noteDrafts[active]||'';const notes=state.notes.filter(n=>n.section===active).slice().reverse();$('notes').replaceChildren(...notes.map(n=>{const item=el('article','','note-entry');item.append(SporeBrief.renderBrief(document,n.body),el('time',new Date(n.at).toLocaleString(),'meta'));return item;}));const events=state.history.filter(h=>active==='today'||h.section===active).slice().reverse();$('history-list').replaceChildren(...events.map(h=>el('p',`${new Date(h.at).toLocaleString()} · ${names[h.section]} · ${h.text}`)));if(!events.length)$('history-list').append(el('p','No updates yet.','meta'));
}
function openTask(task,edit=false,inDomain=false){if(inDomain&&task)select(task.section);returnFocus=inDomain&&task?$('tab-'+task.section):document.activeElement;editing=task?.id||null;$('form-error').textContent='';$('task-detail').hidden=!task||edit;$('task-form').hidden=!!task&&!edit;
 if(task&&!edit){const detail=$('task-detail');detail.replaceChildren(el('p',names[task.section],'kicker'),el('h2',task.title),el('p',meta(task),'meta'));if(task.why)detail.append(el('h3','Why this matters'),el('p',task.why));if(task.nextAction)detail.append(el('h3','Working details'),el('p',task.nextAction));if(task.section==='career')detail.append(el('p','No linked opportunity record','meta'));const actions=el('div','','actions');actions.append(button('Edit task',()=>showEditor(task),'primary'),button(task.done?'Reopen task':'Mark complete',()=>{closeTask();toggleTask(task);}));detail.append(actions);$('task-dialog').setAttribute('aria-labelledby','task-detail-title');detail.querySelector('h2').id='task-detail-title';}
 else fillEditor(task);
 if(!$('task-dialog').open)$('task-dialog').showModal();if(!task||edit)$('task-title').focus();else $('close-task').focus();
}
function fillEditor(task){$('task-form').reset();$('dialog-title').textContent=task?'Edit task':'Add task';$('task-dialog').setAttribute('aria-labelledby','dialog-title');const values=task||{title:'',section:active==='today'?'career':active,priority:'normal',due:'',deferUntil:'',minutes:10,why:'',nextAction:''};Object.entries({title:'title',section:'section',priority:'priority',due:'due',defer:'deferUntil',minutes:'minutes',why:'why',next:'nextAction'}).forEach(([id,key])=>$('task-'+id).value=values[key]);}
function showEditor(task){$('task-detail').hidden=true;$('task-form').hidden=false;fillEditor(task);$('task-title').focus();}
function closeTask(){$('task-dialog').close();if(returnFocus?.isConnected)returnFocus.focus();else $('add-task').focus();}
$('close-task').addEventListener('click',closeTask);$('cancel-task').addEventListener('click',closeTask);$('task-dialog').addEventListener('cancel',e=>{e.preventDefault();closeTask();});
$('task-dialog').addEventListener('keydown',e=>{if(e.key!=='Tab')return;const items=[...$('task-dialog').querySelectorAll('input,select,textarea,button')].filter(n=>!n.disabled&&!n.closest('[hidden]'));const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}});
$('add-task').addEventListener('click',()=>openTask(null,true));
$('task-form').addEventListener('submit',async e=>{e.preventDefault();const old=state.tasks.find(t=>t.id===editing);const task={id:editing||crypto.randomUUID(),section:$('task-section').value,title:$('task-title').value.trim(),why:$('task-why').value.trim(),nextAction:$('task-next').value.trim(),due:$('task-due').value,deferUntil:$('task-defer').value,priority:$('task-priority').value,minutes:Number($('task-minutes').value),done:old?.done||false,opportunityRef:old?.opportunityRef||null};if(!M.validDate(task.due)||!M.validDate(task.deferUntil)||!task.title){$('form-error').textContent='Enter a title and valid dates.';return;}if(await commit({kind:'task',task}))closeTask();else $('form-error').textContent=$('status').textContent;});
$('note').addEventListener('input',()=>noteDrafts[active]=$('note').value);$('note-form').addEventListener('submit',async e=>{e.preventDefault();if(await commit({kind:'note',id:crypto.randomUUID(),section:active,body:$('note').value})){noteDrafts[active]='';$('note').value='';$('note').focus();}});
const tabs=[...document.querySelectorAll('[role=tab]')];tabs.forEach((tab,i)=>{tab.addEventListener('click',()=>select(tab.dataset.section));tab.addEventListener('keydown',e=>{let n;if(e.key==='ArrowRight'||e.key==='ArrowDown')n=(i+1)%tabs.length;if(e.key==='ArrowLeft'||e.key==='ArrowUp')n=(i+tabs.length-1)%tabs.length;if(e.key==='Home')n=0;if(e.key==='End')n=tabs.length-1;if(n!==undefined){e.preventDefault();tabs[n].focus();select(tabs[n].dataset.section);}});});

