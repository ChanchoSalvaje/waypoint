const M=window.Waypoint,$=id=>document.getElementById(id);
let backupStatus={state:'unavailable'};
let jobs=[],ops=null,signals=[],posts=null,selected=null,detailTab='brief',closing=null,preview=false,opsError='',signalsError='',postsError='',lastRefresh=0;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const short=(s,n=210)=>String(s||'').replace(/\s+/g,' ').slice(0,n)+(String(s||'').length>n?'…':'');
const link=(url,label,cls='')=>{const safe=M.safeUrl(url);return safe?`<a class="${cls}" href="${esc(safe)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`:'';};
// Linkify original text, then escape each non-link segment; never reinterpret escaped entities.
function prose(value){const s=String(value||''),re=/https?:\/\/[^\s<>"']+/g;let out='',last=0;for(const m of s.matchAll(re)){out+=esc(s.slice(last,m.index));const u=m[0].replace(/[),.;]+$/,'');out+=link(u,u)+esc(m[0].slice(u.length));last=m.index+m[0].length;}return '<div class="prose">'+(out+esc(s.slice(last))).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')+'</div>';}
function notify(message){$('toast').textContent=message;$('toast').hidden=false;setTimeout(()=>$('toast').hidden=true,6500);}
async function get(path){const r=await fetch(path,{cache:'no-store'});let d;try{d=await r.json();}catch{throw new Error('Could not read the server response.');}if(!r.ok||d.error){const error=new Error(d.error||`Request failed (${r.status}).`);error.code=d.code;throw error;}return d;}
async function readFeeds(){
 const results=[];
 let blocked=null;
 // Read one feed at a time. A monthly block affects every feed, so stop rather
 // than issuing more calls that are guaranteed to fail.
 for(const path of ['/.netlify/functions/jobs?active=true','/.netlify/functions/operations','/.netlify/functions/signals','/.netlify/functions/new-posts']){
  if(blocked){results.push({status:'rejected',reason:blocked});continue;}
  try{results.push({status:'fulfilled',value:await get(path)});}
  catch(reason){results.push({status:'rejected',reason});if(reason.code==='AIRTABLE_MONTHLY_LIMIT')blocked=reason;}
 }
 return results;
}
async function load(){
 if ($('refresh').disabled) return;
 $('refresh').disabled=true;$('load-error').hidden=true;$('data-status').textContent='Refreshing…';
 const results=await readFeeds();
 backupStatus=await fetch('/.netlify/functions/backup-status',{cache:'no-store'}).then(r=>r.json()).catch(()=>({state:'unavailable'}));
 if(results[0].status==='fulfilled'){const d=results[0].value;jobs=d.jobs||[];preview=!!d.preview;$('data-status').textContent=`Pipeline read ${new Date(d.asOf||Date.now()).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/Phoenix'})} Tucson time`;$('notice').hidden=!preview;$('notice').textContent='Review preview: a captured tracker snapshot. Changes are disabled here.';}
 else{$('load-error').hidden=false;$('load-error').textContent=results[0].reason.message+' Previously loaded data, if any, may be stale.';$('data-status').textContent=results[0].reason.code==='AIRTABLE_MONTHLY_LIMIT'?'Tracker blocked · monthly API allowance exhausted':'Pipeline refresh failed';}
 if(results[1].status==='fulfilled'){ops=results[1].value;opsError='';}else{ops=null;opsError=results[1].reason.message;}
 if(results[2].status==='fulfilled'){signals=results[2].value.signals||[];signalsError='';}else{signals=[];signalsError=results[2].reason.message;}
 if(results[3].status==='fulfilled' && Array.isArray(results[3].value.posts)){
  posts=results[3].value.posts;postsError='';
 }else{postsError=results[3].reason?.message||'Recent discoveries could not be read.';}
 lastRefresh=Date.now();
 $('today-date').textContent=new Date().toLocaleDateString('en-US',{timeZone:'America/Phoenix',weekday:'long',month:'long',day:'numeric'});
 render();$('refresh').disabled=false;
}
function fitBadge(item) {
 const score=item.fit;
 if (!Number.isInteger(score) || score<1 || score>5) return '<span class="fit-score unrated">Fit unscored</span>';
 const basis={JD:'Job description',Title:'Title only'}[item.fitBasis] || 'Basis unrecorded';
 return `<span class="fit-score level-${score}"><b>Fit ${score}/5</b><span>${basis}</span></span>`;
}
function card(j){const state=M.research(j),fresh=M.freshness(j);
 return `<article class="job-card ${selected===j.id?'selected':''}"><div class="job-top"><div class="company"><span class="avatar" aria-hidden="true">${esc(j.company.charAt(0))}</span>${esc(j.company)}</div>${fitBadge(j)}</div><h3>${esc(j.role)}</h3><div class="meta"><span>${esc(j.comp||'Pay needs checking')}</span><span>${esc(j.workMode||'Location needs checking')}</span></div><p class="brief-preview">${esc(short(j.decisionBrief||j.fitRead||'A decision brief is queued. The existing score has not yet been checked against the full job description.'))}</p><div class="tagline">${j.recommendation?'<span class="tag partial">'+esc(j.recommendation)+'</span>':''}<span class="tag ${state==='Ready'?'ready':state==='Partial'||state==='Blocked'?'partial':''}">${esc(state==='Existing research'?'Existing research · date varies':'Research: '+state.toLowerCase())}</span><span class="tag ${fresh.kind}">${esc(fresh.label)}</span>${M.urgent(j)?'<span class="tag urgent">Needs attention</span>':''}<span class="tag">${esc(j.stage||'Stage unknown')}</span></div><div class="card-actions"><button class="primary-btn" data-review="${j.id}">Review brief →</button><button class="quiet" data-pursue="${j.id}" ${preview?'disabled':''}>${j.pursue?'Pursuing ✓':'Pursue'}</button><button class="text-btn" data-close="${j.id}" ${preview?'disabled':''}>Close</button></div></article>`;
}
function render(){const active=jobs.filter(j=>M.opportunityMatches(j,'active')),decide=active.filter(j=>M.opportunityMatches(j,'decide')),research=decide.filter(j=>M.research(j)==='Ready'),replies=active.filter(j=>j.suggestedUpdate),applied=active.filter(j=>M.opportunityMatches(j,'applied'));
 $('stats').innerHTML=[[decide.length,'awaiting a decision'],[research.length,'decision briefs ready'],[replies.length,'reply updates to review'],[applied.length,'applications in motion']].map(([n,s])=>`<div class="stat"><b>${n}</b><span>${s}</span></div>`).join('');
 const applications = active.filter(job => M.opportunityMatches(job,'applied'));
 const priority = M.shortlist(applications).find(job => M.urgent(job) || ['Interviewing','Screening','Offer'].includes(job.stage));
 const prep = priority && (priority.stage==='Interviewing'||/TYPE:\s*interview/i.test(priority.suggestedUpdate||'')) && (priority.prep?.likely||priority.prep?.questions);
 $('priority-action').innerHTML = priority ? `<article class="priority-panel"><div class="priority-copy"><div class="priority-meta"><small>${prep?'Interview preparation':'Application follow-up'}</small>${fitBadge(priority)}</div><h2>${esc(priority.company)}</h2><b>${esc(priority.role)}</b><p>${esc(short(priority.decisionBrief||priority.nextAction||priority.fitRead,245))}</p><button class="quiet" data-review="${esc(priority.id)}" data-section="${prep?'prep':'brief'}">${prep?'Open interview prep':'Review next step'} →</button></div><img class="priority-art" src="/catalina-sunset.webp" alt="" width="1400" height="467"></article>` : '';
 renderPicks(decide);
 const follow=active.filter(j=>j.id!==priority?.id && (j.suggestedUpdate||j.nextAction)).sort((a,b)=>M.rank(b)-M.rank(a));
 $('follow-count').textContent='('+follow.length+')';
 $('followups').innerHTML=follow.map(j=>`<div class="followup"><button data-review="${esc(j.id)}"><strong>${esc(j.company)}</strong><p>${esc(j.nextAction||j.role)}</p></button></div>`).join('')||'<p>No other follow-ups recorded.</p>';
 const sweep=ops?.runs?.find(run=>run.Workflow==='intake-research-replies' && run['Finished At']);
 const finish=M.date(sweep?.['Finished At']);
 const overdue=finish && Date.now()-finish.getTime()>7200000;
 $('sweep-health').textContent=finish?`Last intake sweep · ${tucsonDate(finish,true)} Tucson · ${sweep.Status}${overdue?' · Overdue':''}`:'Intake sweep status unavailable';
 renderNewPosts();renderOpportunities();renderSignals();renderSystem();if(selected)renderDetail();
}
function decisionButtons(job, lead) {
 const disabled=preview?'disabled':'';
 if(job && job.stage!=='Closed') {
  return `<button class="primary-btn" data-pursue="${esc(job.id)}" aria-pressed="${!!job.pursue}" ${disabled}>${job.pursue?'Pursuing ✓':'Pursue'}</button><button class="quiet" data-close="${esc(job.id)}" ${disabled}>Close</button>`;
 }
 if(!lead?.leadRecordId || !['New','Ignored'].includes(lead.state)) return '';
 const button=(value,label,style)=>`<button class="${style}" data-lead-id="${esc(lead.leadRecordId)}" data-decision="${value}" ${disabled}>${label}</button>`;
 if(lead.decision==='Close') return button('','Undo close','quiet');
 return button(lead.decision==='Pursue'?'':'Pursue',lead.decision==='Pursue'?'Pursuing ✓':'Pursue','primary-btn')+button('Close','Close','quiet');
}
function renderPicks(saved) {
 const today=M.localDate();
 let picks;
 for(const run of ops?.briefs||[]) {
  const finished=M.date(run['Finished At']);
  if(!finished||M.localDate(finished)!==today) continue;
  try {
   const review=JSON.parse(run.Details).daily_review;
   if(review?.date===today && Array.isArray(review.picks)){picks=review.picks;break;}
  } catch { continue; }
 }
 const tracked=new Map(saved.map(job=>[job.id,job]));
 const leads=new Map((posts||[]).filter(p=>p.kind==='lead' && p.state==='New' && p.decision!=='Close').map(p=>[p.sourceKey,p]));
 const choices=picks===undefined ? M.opportunityRows(saved.filter(j=>M.research(j)==='Ready' && j.recommendation!=='Low priority'),{view:'decide',query:'',sort:'priority'}).slice(0,2).map(job=>({key:job.id,why:short(job.decisionBrief||job.fitRead,260)})) : picks;
 const rows=choices.filter(p=>p && (tracked.has(p.key)||leads.has(p.key))).slice(0,2);
 $('today-cards').innerHTML=rows.map(p=>{
  const job=tracked.get(p.key),item=job||leads.get(p.key);
  const secondary=job?`<button class="quiet" data-review="${esc(job.id)}">Review brief →</button>`:link(item.applyUrl||item.sourceUrl,'Read posting','quiet');
  return `<article class="pick"><div class="pick-top"><div class="pick-company">${esc(item.company)}<span>${esc(job?.recommendation||item.status)}</span></div>${fitBadge(item)}</div><h3>${esc(item.role)}</h3><p>${esc(p.why)}</p>${p.question?'<p class="pick-question"><strong>Weigh up</strong> '+esc(p.question)+'</p>':''}<div class="post-links">${decisionButtons(job,item)}${secondary}</div></article>`;
 }).join('')||(postsError?'<p class="error">Recent leads could not refresh. Use Refresh to retry.</p>':'<p class="empty">No current picks ready for a decision.</p>');
}
function renderOpportunities(){
 const rows=M.opportunityRows(jobs,{view:$('stage-filter').value,query:$('search').value,sort:$('opportunity-sort').value});
 $('opportunity-count').textContent=quantity(rows.length,'opportunity','opportunities');
 $('opportunity-cards').innerHTML=rows.length?rows.map(card).join(''):'<p class="empty">No opportunities match this category and search.</p>';
}
function quantity(n,one,many=one+'s'){return n+' '+(n===1?one:many);}
function tucsonDate(value,withTime=false){
 const d=M.date(value);
 return d?d.toLocaleString('en-US',{timeZone:'America/Phoenix',month:'short',day:'numeric',...(withTime?{hour:'numeric',minute:'2-digit'}:{})}):'';
}
function postCard(post,activeById){
 const active=activeById.get(post.id),status=active?.stage||(post.decision==='Close'?'Closed by you':post.decision==='Pursue'?'Pursuing':post.status);
 const observed=post.firstSeenAt?(post.usesCreatedTime?'Logged ':'First seen ')+tucsonDate(post.firstSeenAt,true):'Logged '+post.dateFound;
 const employer=tucsonDate(post.employerAt);
 const source=link(post.applyUrl||post.sourceUrl,'View posting');
 return `<article class="job-card post-card"><div class="post-top"><div class="post-identity"><strong class="company">${esc(post.company||'Company unknown')}</strong><span class="tag ${status==='Needs verification'?'partial':''}">${esc(status)}</span></div>${fitBadge(active||post)}</div>
 <h3>${esc(post.role||'Role unknown')}</h3><div class="meta"><span>${esc(observed)}</span>${post.location?'<span>'+esc(post.location)+'</span>':''}${employer?'<span>'+esc((post.employerDateKind||'Employer date')+' · '+employer)+'</span>':''}</div>
 ${post.nextStep?'<details class="post-check"><summary>What needs checking</summary><p>'+esc(post.nextStep)+'</p></details>':''}
 <div class="post-links">${decisionButtons(active,post)}${source}${active?.stage&&active.stage!=='Closed'?'<button class="quiet" data-open-opportunity="'+esc(post.id)+'">Review brief</button>':''}</div></article>`;
}
function renderNewPosts(){
 const summary=$('new-posts-summary'),count=$('post-count'),cards=$('post-cards');
 if(!posts){
  if(postsError){
   summary.textContent='Recent discoveries could not refresh.';
   cards.innerHTML=`<p class="error">${esc(postsError)}</p>`;
  }
  return;
 }
 const activeById=new Map(jobs.map(job=>[job.id,job]));
 const visible=post=>M.inPostReview(post,activeById.get(post.id)?.stage);
 const today=M.recentPosts(posts,1);
 const reviewCount=today.filter(visible).length;
 summary.textContent=postsError?'Showing the last successful read.':`${quantity(reviewCount,'new post')} to review today · ${today.length} discovered`;
 const period=M.recentPosts(posts,Number($('post-window').value));
 const includeHistory=$('post-history').checked;
 const available=includeHistory?period:period.filter(visible);
 const query=$('post-search').value.trim().toLowerCase();
 const rows=available.filter(post=>!query||[post.company,post.role].join(' ').toLowerCase().includes(query));
 count.textContent=query?`${rows.length} of ${quantity(available.length,'post')}`:quantity(rows.length,'post');
 const warning=postsError?`<p class="error">${esc(postsError)} Showing the last successful read.</p>`:'';
 const empty=query&&available.length?'No posts match this search.':period.length?'No posts to review. Include screened-out and closed roles to see the history.':'No posts were recorded in this date range.';
 cards.innerHTML=warning+(rows.length?rows.map(post=>postCard(post,activeById)).join(''):`<p class="empty">${empty}</p>`);
}
function renderSignals(){$('signal-cards').innerHTML=signalsError?`<p class="error">Signals could not refresh: ${esc(signalsError)}</p>`:signals.filter(s=>!['Dismissed','Closed','Archived'].includes(s.status)).map(s=>`<article class="signal-card"><div class="meta">${esc(s.company||'Company not recorded')} · ${esc(s.date||'Date not recorded')}</div><h3>${esc(s.signal||s.title||'Signal')}</h3><p>${esc(s.summary||'No summary recorded.')}</p>${link(s.sourceUrl,'Original source')}${s.angle?'<h4>Conversation angle</h4>'+prose(s.angle):''}${s.staged?'<details><summary>Outreach draft</summary>'+prose(s.staged)+'</details>':''}</article>`).join('')||'<p class="empty">No active signals recorded.</p>';}
function recoveryCard(){return `<section class="system-card"><h2>Recovery copies</h2><p class="${backupStatus?.state==='healthy'?'':'notice'}">${esc(({healthy:'Daily encrypted backup verified.',warning:'The latest backup attempt failed. The previous verified copy is preserved.',stale:'Backup overdue or not yet verified. Recovery needs attention.',not_activated:'Daily backups are awaiting activation.',unavailable:'Backup status could not be checked.'})[backupStatus?.state]||'Backup status is unavailable.')}</p>${backupStatus?.lastVerifiedAt?'<p>Newest verified copy: '+esc(new Date(backupStatus.lastVerifiedAt).toLocaleString('en-US',{timeZone:'America/Phoenix',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))+'.</p>':''}<p>A backup is overdue after 36 hours. Historical Airtable record comments remain in the Airtable archive.</p></section>`;}
function renderSystem(){if(!ops){$('system-content').innerHTML=`${recoveryCard()}<div class="error">System coverage could not refresh: ${esc(opsError||'No response')}. A pipeline read does not prove discovery or research ran.</div>`;return;}
 const sources=ops.sources||[],runs=ops.runs||[],enabled=sources.filter(s=>s.Enabled),fresh=enabled.filter(s=>M.sourceHealth(s).kind==='ready').length;$('system-content').innerHTML=`${recoveryCard()}<section class="system-card"><h2>What is covered</h2><p class="${fresh<enabled.length?'notice':''}">${fresh} of ${enabled.length} enabled employer boards read successfully within two hours.${fresh<enabled.length?' Discovery coverage needs attention; email intake and other research may still be working.':''}</p><p>${esc(ops.coverage)}</p><p><b>${sources.filter(s=>s.Enabled).length} enabled employer boards.</b> A first scan establishes the baseline. New postings are compared against that baseline; the first-seen time is kept separate from employer dates.</p></section><section class="system-card"><h2>Employer sources</h2>${sources.map(s=>`<div class="system-row"><div>${link(s['Careers URL'],s.Company)}<small>${esc(s.Provider)} · ${s['Jobs Seen']??'—'} postings on last successful read</small>${s['Last Error']?'<small>'+esc(s['Last Error'])+'</small>':''}</div><span class="status"><span class="tag ${M.sourceHealth(s).kind}">${esc(M.sourceHealth(s).label)}</span><br>${s['Last Success']?'Read '+esc(new Date(s['Last Success']).toLocaleString('en-US',{timeZone:'America/Phoenix',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})):'Not yet verified'}<small>${s.Enabled?'Enabled':'Paused'}</small></span></div>`).join('')||'<p>No employer boards configured yet.</p>'}</section><section class="system-card"><h2>Recent runs</h2>${runs.slice(0,12).map(r=>`<div class="system-row"><div>${esc(r.Workflow)}<small>${esc(r['Started At']||'Time unknown')}</small><small>${esc(short(r.Details,280))}</small></div><span class="status">${esc(r.Status)}<small>${r['Items Read']??'—'} read · ${r['Items Written']??'—'} written</small></span></div>`).join('')||'<p>No run receipt yet. Coverage is unverified until a real run completes.</p>'}</section><section class="system-card"><h2>Hiring contacts</h2><p>Hunter: ${ops.hunterConfigured?'API key configured. Lookup requires enablement and a click.':'Website link available. API not connected.'} We identify the person before looking up an address. Deliverability does not prove that person owns the hiring decision.</p>${link('https://hunter.io/email-finder','Open Hunter')}</section>`;
}
const views={
 today:['Today’s review',''],
 'new-posts':['New posts','New leads and active opportunities, newest first.'],
 opportunities:['Find the work that fits.','Your active pipeline, with evidence and open questions together.'],
 signals:['Get there before the posting.','Business changes that may open a useful conversation.'],
 system:['Know what is working.','Actual run receipts and source coverage, including the gaps.'],
};
function showView(name){
 document.body.dataset.view=name;
 document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!=='view-'+name);
 document.querySelectorAll('[data-view]').forEach(el=>{
  const current=el.dataset.view===name;
  el.classList.toggle('active',current);
  if(current) el.setAttribute('aria-current','page');
  else el.removeAttribute('aria-current');
 });
 const hasDetail=name==='today'||name==='opportunities';
 $('detail').hidden=!hasDetail||!selected;
 $('stats').hidden=name!=='opportunities';
 document.querySelector('.workspace').classList.toggle('full-width',!hasDetail||!selected);
 $('page-title').textContent=views[name][0];
 $('page-subtitle').textContent=views[name][1];
 $('page-subtitle').hidden=!views[name][1];
}
function showHashView(){
 const name=location.hash.slice(1);
 showView(Object.hasOwn(views,name)?name:'today');
}
function review(id,section='brief'){selected=id;detailTab=section;showHashView();render();$('detail').scrollIntoView({block:'nearest'});}
function renderDetail(){const j=jobs.find(j=>j.id===selected);if(!j)return;const basis=j.fitBasis==='JD'?'Full job description reviewed':j.fitBasis==='Title'?'Provisional title score':'Score basis not recorded';const tabs=['brief','prep','contacts','history'];let body='';
 if(detailTab==='brief')body=`<h3>Decision brief</h3>${j.decisionBrief?prose(j.decisionBrief):'<div class="info-box">No new decision brief yet. Existing research below may have unresolved source or date checks.</div>'}${!j.decisionBrief&&j.fitRead?'<h3>Existing fit read</h3>'+prose(j.fitRead):''}${j.prep?.edge?'<h3>Role &amp; watch-outs</h3>'+prose(j.prep.edge):''}${j.prep?.background?'<details><summary>Company background</summary>'+prose(j.prep.background)+'</details>':''}<h3>Verification</h3><div class="info-box">${esc(basis)}<br>${j.lastVerifiedAt?'Employer content read: '+esc(j.lastVerifiedAt):'Employer content read: not recorded'}<br>${j.employerPostedAt?'Employer publication date: '+esc(j.employerPostedAt):'Employer publication date: unknown'}${j.closeDate?'<br>Application deadline: '+esc(j.closeDate):''}</div>${j.nextAction?'<h3>Next action</h3>'+prose(j.nextAction):''}${j.suggestedUpdate?'<h3>Employer reply · proposed update</h3>'+prose(j.suggestedUpdate):''}<div class="detail-links">${link(j.applyLink,'Open employer application','primary-btn')}${link(j.link,'Discovery source','quiet')}</div><p class="inline-notice">Opening the employer link does not submit an application.</p>`;
 if(detailTab==='prep')body=`<h3>Likely questions and your examples</h3>${j.prep?.likely?prose(j.prep.likely):'<p class="inline-notice">Interview preparation has not been recorded for this opportunity.</p>'}<h3>Questions to ask</h3>${j.prep?.questions?prose(j.prep.questions):'<p class="inline-notice">No interview questions have been recorded yet.</p>'}`;
 if(detailTab==='contacts')body=`<h3>A human path in</h3>${prose(j.contactResearch||j.contactReferral||'Contact research is queued. We will look for a named recruiter, a source-backed likely manager, and a genuine referral path. An executive title alone does not establish hiring responsibility.')}<div class="detail-links">${link('https://hunter.io/email-finder','Find a work email in Hunter','quiet')}</div><p class="inline-notice">Use a verified company domain and a named person. A guessed or accept-all address remains uncertain.</p>${ops?.hunterConfigured?'<form id="hunter-form" class="hunter-form"><label>Company domain<input name="domain" placeholder="company.com" required></label><label>First name<input name="firstName" required></label><label>Last name<input name="lastName" required></label><button class="quiet" type="submit">Look up in Hunter (uses account credits)</button></form><div id="hunter-result"></div>':''}<h3>Outreach package</h3>${j.outreach?prose(j.outreach):'<p class="inline-notice">A short personal note and tailored application materials can be prepared once the role and recipient are verified. Nothing is sent automatically.</p>'}`;
 if(detailTab==='history')body=`<h3>Next action</h3>${prose(j.nextAction||'No next action recorded.')}<h3>Activity &amp; source history</h3>${prose(j.notes||'No activity recorded.')}`;
 $('detail').innerHTML=`<div class="detail-head"><button class="panel-dismiss" aria-label="Close details" data-dismiss-detail>×</button><div class="company">${esc(j.company)}<span class="stage-label">${esc(j.stage)}</span>${fitBadge(j)}</div><h2>${esc(j.role)}</h2><div class="meta"><span>${esc(j.comp||'Compensation needs checking')}</span><span>${esc(j.workMode)}</span></div></div><div class="detail-tabs" role="tablist" aria-label="Opportunity sections">${tabs.map(t=>`<button role="tab" aria-selected="${t===detailTab}" class="${t===detailTab?'active':''}" data-detail-tab="${t}">${{brief:'Role brief',prep:'Interview prep',contacts:'Contact path',history:'History'}[t]}</button>`).join('')}</div><div class="detail-body">${body}</div><div class="detail-controls"><button class="primary-btn" data-pursue="${j.id}" ${preview?'disabled':''}>${j.pursue?'Pursuing ✓':'Pursue this role'}</button><button class="quiet" data-close="${j.id}" ${preview?'disabled':''}>Close</button>${link('/classic.html','Full tools','quiet')}</div>`;
}
const pendingLeads=new Set();
async function saveLeadDecision(id,decision){
 const lead=posts?.find(post=>post.leadRecordId===id);
 if(preview || !lead || pendingLeads.has(id))return;
 pendingLeads.add(id);
 try{
  const response=await fetch('/.netlify/functions/lead-decision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,decision,previous:lead.decision||''})});
  const result=await response.json();
  if(!response.ok || !result.ok)throw new Error(result.error||'Could not save the decision.');
  const current=posts?.find(post=>post.leadRecordId===id);
  if(current)current.decision=result.decision;
  render();
  notify(decision==='Pursue'?'Pursuing. Queued for research.':decision==='Close'?'Closed. You can undo this in New posts.':'Decision cleared.');
 }catch(error){notify(error.message);}finally{pendingLeads.delete(id);}
}
async function update(id,body){if(preview)return;document.body.classList.add('busy');try{const r=await fetch('/.netlify/functions/update-job',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,...body})});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'Update failed.');Object.assign(jobs.find(j=>j.id===id),d);render();notify(body.closeReason?'Closed. The record remains in your history.':'Saved to your tracker.');}catch(e){notify(e.message);}finally{document.body.classList.remove('busy');}}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.leadId){saveLeadDecision(b.dataset.leadId,b.dataset.decision);return;}if(b.dataset.view)location.hash=b.dataset.view;if(b.dataset.openOpportunity){location.hash='opportunities';showView('opportunities');review(b.dataset.openOpportunity);}if(b.dataset.review)review(b.dataset.review,b.dataset.section);if(b.hasAttribute('data-dismiss-detail')){selected=null;showHashView();}if(b.dataset.detailTab){detailTab=b.dataset.detailTab;renderDetail();}if(b.dataset.pursue){const j=jobs.find(j=>j.id===b.dataset.pursue);if(j)update(j.id,{pursue:!j.pursue});}if(b.dataset.close){closing=b.dataset.close;$('close-reason').value='';$('close-dialog').showModal();}});
document.addEventListener('submit',async e=>{if(e.target.id!=='hunter-form')return;e.preventDefault();const form=e.target,values=Object.fromEntries(new FormData(form));form.querySelector('button').disabled=true;try{const r=await fetch('/.netlify/functions/hunter-contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(values)});const d=await r.json();if(!r.ok)throw new Error(d.error);$('hunter-result').innerHTML=prose(d.found?`${d.email}\nVerification: ${d.status}\nProvenance: ${d.provenance}\nChecked: ${d.checkedAt}\n${d.caution}\n${d.sources.map(s=>s.uri).join('\n')}`:'No address found.');}catch(err){$('hunter-result').textContent=err.message;}finally{form.querySelector('button').disabled=false;}});
$('close-form').addEventListener('submit',e=>{e.preventDefault();const reason=$('close-reason').value;if(reason){$('close-dialog').close();update(closing,{closeReason:reason});}});$('cancel-close').addEventListener('click',()=>$('close-dialog').close());$('refresh').addEventListener('click',load);$('search').addEventListener('input',renderOpportunities);$('stage-filter').addEventListener('change',renderOpportunities);
$('opportunity-sort').addEventListener('change',renderOpportunities);
$('post-history').addEventListener('change',renderNewPosts);
$('post-window').addEventListener('change',renderNewPosts);
$('post-search').addEventListener('input',renderNewPosts);
window.addEventListener('hashchange',showHashView);
document.addEventListener('visibilitychange',()=>{
 if(!document.hidden && Date.now()-lastRefresh>300000) load();
});
showHashView();
load();
