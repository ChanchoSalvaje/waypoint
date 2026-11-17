const M=window.Waypoint,$=id=>document.getElementById(id);
let jobs=[],ops=null,signals=[],posts=null,selected=null,detailTab='brief',closing=null,preview=false,opsError='',signalsError='',postsError='',lastRefresh=0;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const short=(s,n=210)=>String(s||'').replace(/\s+/g,' ').slice(0,n)+(String(s||'').length>n?'…':'');
const link=(url,label,cls='')=>{const safe=M.safeUrl(url);return safe?`<a class="${cls}" href="${esc(safe)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`:'';};
// Linkify original text, then escape each non-link segment; never reinterpret escaped entities.
function prose(value){const s=String(value||''),re=/https?:\/\/[^\s<>"']+/g;let out='',last=0;for(const m of s.matchAll(re)){out+=esc(s.slice(last,m.index));const u=m[0].replace(/[),.;]+$/,'');out+=link(u,u)+esc(m[0].slice(u.length));last=m.index+m[0].length;}return '<div class="prose">'+(out+esc(s.slice(last))).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')+'</div>';}
function notify(message){$('toast').textContent=message;$('toast').hidden=false;setTimeout(()=>$('toast').hidden=true,6500);}
async function get(path){const r=await fetch(path,{cache:'no-store'});let d;try{d=await r.json();}catch{throw new Error('Could not read the server response.');}if(!r.ok||d.error)throw new Error(d.error||`Request failed (${r.status}).`);return d;}
async function load(){
 if ($('refresh').disabled) return;
 $('refresh').disabled=true;$('load-error').hidden=true;$('data-status').textContent='Refreshing…';
 const results=await Promise.allSettled([get('/.netlify/functions/jobs?active=true'),get('/.netlify/functions/operations'),get('/.netlify/functions/signals'),get('/.netlify/functions/new-posts')]);
 if(results[0].status==='fulfilled'){const d=results[0].value;jobs=d.jobs||[];preview=!!d.preview;$('data-status').textContent=`Pipeline read ${new Date(d.asOf||Date.now()).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/Phoenix'})} Tucson time`;$('notice').hidden=!preview;$('notice').textContent='Review preview: a captured tracker snapshot. Changes are disabled here.';}
 else{$('load-error').hidden=false;$('load-error').textContent=results[0].reason.message+' Previously loaded data, if any, may be stale.';$('data-status').textContent='Pipeline refresh failed';}
 if(results[1].status==='fulfilled'){ops=results[1].value;opsError='';}else{ops=null;opsError=results[1].reason.message;}
 if(results[2].status==='fulfilled'){signals=results[2].value.signals||[];signalsError='';}else{signals=[];signalsError=results[2].reason.message;}
 if(results[3].status==='fulfilled' && Array.isArray(results[3].value.posts)){
  posts=results[3].value.posts;postsError='';
 }else{postsError=results[3].reason?.message||'Recent discoveries could not be read.';}
 lastRefresh=Date.now();
 $('today-date').textContent=new Date().toLocaleDateString('en-US',{timeZone:'America/Phoenix',weekday:'long',month:'long',day:'numeric'});
 render();$('refresh').disabled=false;
}
function card(j){const state=M.research(j),fresh=M.freshness(j),basis=j.fitBasis==='JD'?'JD reviewed':j.fitBasis==='Title'?'Title only':'Basis not recorded';
 return `<article class="job-card ${selected===j.id?'selected':''}"><div class="job-top"><div class="company"><span class="avatar" aria-hidden="true">${esc(j.company.charAt(0))}</span>${esc(j.company)}</div><div class="fit">${j.fit??'—'}${j.fit?'/5':''}<small>${esc(basis)}</small></div></div><h3>${esc(j.role)}</h3><div class="meta"><span>${esc(j.comp||'Pay needs checking')}</span><span>${esc(j.workMode||'Location needs checking')}</span></div><p class="brief-preview">${esc(short(j.decisionBrief||j.fitRead||'A decision brief is queued. The existing score has not yet been checked against the full job description.'))}</p><div class="tagline">${j.recommendation?'<span class="tag partial">'+esc(j.recommendation)+'</span>':''}<span class="tag ${state==='Ready'?'ready':state==='Partial'||state==='Blocked'?'partial':''}">${esc(state==='Existing research'?'Existing research · date varies':'Research: '+state.toLowerCase())}</span><span class="tag ${fresh.kind}">${esc(fresh.label)}</span>${M.urgent(j)?'<span class="tag urgent">Needs attention</span>':''}<span class="tag">${esc(j.stage||'Stage unknown')}</span></div><div class="card-actions"><button class="primary-btn" data-review="${j.id}">Review brief →</button><button class="quiet" data-pursue="${j.id}" ${preview?'disabled':''}>${j.pursue?'Pursuing ✓':'Pursue'}</button><button class="text-btn" data-close="${j.id}" ${preview?'disabled':''}>Close</button></div></article>`;
}
function render(){const active=jobs.filter(j=>M.opportunityMatches(j,'active')),decide=active.filter(j=>M.opportunityMatches(j,'decide')),research=decide.filter(j=>M.research(j)==='Ready'),replies=active.filter(j=>j.suggestedUpdate),applied=active.filter(j=>M.opportunityMatches(j,'applied'));
 $('stats').innerHTML=[[decide.length,'awaiting a decision'],[research.length,'decision briefs ready'],[replies.length,'reply updates to review'],[applied.length,'applications in motion']].map(([n,s])=>`<div class="stat"><b>${n}</b><span>${s}</span></div>`).join('');
 const top=M.shortlist(active);$('today-cards').innerHTML=top.length?top.map(card).join(''):'<p class="empty">No immediate decisions in the current active pipeline.</p>';
 const follow=active.filter(j=>j.suggestedUpdate||j.nextAction).sort((a,b)=>M.rank(b)-M.rank(a));$('followups').innerHTML=follow.length?follow.map(j=>`<div class="followup"><button data-review="${j.id}"><strong>${esc(j.company)} · ${esc(j.stage)}</strong><p>${esc(short(j.suggestedUpdate||j.nextAction,220))}</p></button><span class="due">${esc(j.nextActionDate||'Date not set')}</span></div>`).join(''):'<p class="empty">No recorded follow-ups. The reply watcher will propose changes when employer mail needs attention.</p>';
 renderNewPosts();renderOpportunities();renderSignals();renderSystem();if(selected)renderDetail();
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
 const active=activeById.get(post.id),status=active?.stage||post.status;
 const observed=post.firstSeenAt?(post.usesCreatedTime?'Logged ':'First seen ')+tucsonDate(post.firstSeenAt,true):'Logged '+post.dateFound;
 const employer=tucsonDate(post.employerAt);
 const source=link(post.applyUrl||post.sourceUrl,'View posting');
 return `<article class="job-card post-card"><div class="post-top"><strong class="company">${esc(post.company||'Company unknown')}</strong><span class="tag ${status==='Needs verification'?'partial':''}">${esc(status)}</span></div>
 <h3>${esc(post.role||'Role unknown')}</h3><div class="meta"><span>${esc(observed)}</span>${post.location?'<span>'+esc(post.location)+'</span>':''}${employer?'<span>'+esc((post.employerDateKind||'Employer date')+' · '+employer)+'</span>':''}</div>
 ${post.nextStep?'<p class="brief-preview post-next">'+esc(post.nextStep)+'</p>':''}
 <div class="post-links">${source}${active?.stage&&active.stage!=='Closed'?'<button class="quiet" data-open-opportunity="'+esc(post.id)+'">Review brief</button>':''}</div></article>`;
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
 const today=M.recentPosts(posts,1);
 const leads=today.filter(post=>post.kind==='lead').length;
 summary.textContent=postsError?'Showing the last successful read.':`${quantity(today.length,'discovery','discoveries')} today · ${quantity(leads,'lead')} · ${quantity(today.length-leads,'tracked opportunity','tracked opportunities')}`;
 const available=M.recentPosts(posts,Number($('post-window').value));
 const query=$('post-search').value.trim().toLowerCase();
 const rows=available.filter(post=>!query||[post.company,post.role].join(' ').toLowerCase().includes(query));
 const activeById=new Map(jobs.map(job=>[job.id,job]));
 count.textContent=query?`${rows.length} of ${quantity(available.length,'post')}`:quantity(rows.length,'post');
 const warning=postsError?`<p class="error">${esc(postsError)} Showing the last successful read.</p>`:'';
 const empty=query&&available.length?'No posts match this search.':'No posts were recorded in this date range.';
 cards.innerHTML=warning+(rows.length?rows.map(post=>postCard(post,activeById)).join(''):`<p class="empty">${empty}</p>`);
}
function renderSignals(){$('signal-cards').innerHTML=signalsError?`<p class="error">Signals could not refresh: ${esc(signalsError)}</p>`:signals.filter(s=>!['Dismissed','Closed','Archived'].includes(s.status)).map(s=>`<article class="signal-card"><div class="meta">${esc(s.company||'Company not recorded')} · ${esc(s.date||'Date not recorded')}</div><h3>${esc(s.signal||s.title||'Signal')}</h3><p>${esc(s.summary||'No summary recorded.')}</p>${link(s.sourceUrl,'Original source')}${s.angle?'<h4>Conversation angle</h4>'+prose(s.angle):''}${s.staged?'<details><summary>Outreach draft</summary>'+prose(s.staged)+'</details>':''}</article>`).join('')||'<p class="empty">No active signals recorded.</p>';}
function renderSystem(){if(!ops){$('system-content').innerHTML=`<div class="error">System coverage could not refresh: ${esc(opsError||'No response')}. A pipeline read does not prove discovery or research ran.</div>`;return;}
 const sources=ops.sources||[],runs=ops.runs||[],enabled=sources.filter(s=>s.Enabled),fresh=enabled.filter(s=>M.sourceHealth(s).kind==='ready').length;$('system-content').innerHTML=`<section class="system-card"><h2>What is covered</h2><p class="${fresh<enabled.length?'notice':''}">${fresh} of ${enabled.length} enabled employer boards read successfully within two hours.${fresh<enabled.length?' Discovery coverage needs attention; email intake and other research may still be working.':''}</p><p>${esc(ops.coverage)}</p><p><b>${sources.filter(s=>s.Enabled).length} enabled employer boards.</b> A first scan establishes the baseline. New postings are compared against that baseline; the first-seen time is kept separate from employer dates.</p></section><section class="system-card"><h2>Employer sources</h2>${sources.map(s=>`<div class="system-row"><div>${link(s['Careers URL'],s.Company)}<small>${esc(s.Provider)} · ${s['Jobs Seen']??'—'} postings on last successful read</small>${s['Last Error']?'<small>'+esc(s['Last Error'])+'</small>':''}</div><span class="status"><span class="tag ${M.sourceHealth(s).kind}">${esc(M.sourceHealth(s).label)}</span><br>${s['Last Success']?'Read '+esc(new Date(s['Last Success']).toLocaleString('en-US',{timeZone:'America/Phoenix',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})):'Not yet verified'}<small>${s.Enabled?'Enabled':'Paused'}</small></span></div>`).join('')||'<p>No employer boards configured yet.</p>'}</section><section class="system-card"><h2>Recent runs</h2>${runs.slice(0,12).map(r=>`<div class="system-row"><div>${esc(r.Workflow)}<small>${esc(r['Started At']||'Time unknown')}</small><small>${esc(short(r.Details,280))}</small></div><span class="status">${esc(r.Status)}<small>${r['Items Read']??'—'} read · ${r['Items Written']??'—'} written</small></span></div>`).join('')||'<p>No run receipt yet. Coverage is unverified until a real run completes.</p>'}</section><section class="system-card"><h2>Hiring contacts</h2><p>Hunter: ${ops.hunterConfigured?'API key configured. Lookup requires enablement and a click.':'Website link available. API not connected.'} We identify the person before looking up an address. Deliverability does not prove that person owns the hiring decision.</p>${link('https://hunter.io/email-finder','Open Hunter')}</section>`;
}
const views={
 today:['Your next move.','A few worthwhile decisions, with the research close at hand.'],
 'new-posts':['New posts','Everything Waypoint captured in the selected period, including leads under review and tracked opportunities. Newest discoveries first.'],
 opportunities:['Find the work that fits.','Your active pipeline, with evidence and open questions together.'],
 signals:['Get there before the posting.','Business changes that may open a useful conversation.'],
 system:['Know what is working.','Actual run receipts and source coverage, including the gaps.'],
};
function showView(name){
 document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!=='view-'+name);
 document.querySelectorAll('[data-view]').forEach(el=>{
  const current=el.dataset.view===name;
  el.classList.toggle('active',current);
  if(current) el.setAttribute('aria-current','page');
  else el.removeAttribute('aria-current');
 });
 const hasDetail=name==='today'||name==='opportunities';
 $('detail').hidden=!hasDetail;
 $('stats').hidden=!hasDetail;
 document.querySelector('.workspace').classList.toggle('full-width',!hasDetail);
 $('page-title').textContent=views[name][0];
 $('page-subtitle').textContent=views[name][1];
}
function showHashView(){
 const name=location.hash.slice(1);
 showView(Object.hasOwn(views,name)?name:'today');
}
function review(id){selected=id;detailTab='brief';render();if(innerWidth<761)$('detail').scrollIntoView({behavior:'smooth'});}
function renderDetail(){const j=jobs.find(j=>j.id===selected);if(!j)return;const basis=j.fitBasis==='JD'?'Full job description reviewed':j.fitBasis==='Title'?'Provisional title score':'Score basis not recorded';const tabs=['brief','prep','contacts','history'];let body='';
 if(detailTab==='brief')body=`<h3>Decision brief</h3>${j.decisionBrief?prose(j.decisionBrief):'<div class="info-box">No new decision brief yet. Existing research below may have unresolved source or date checks.</div>'}${!j.decisionBrief&&j.fitRead?'<h3>Existing fit read</h3>'+prose(j.fitRead):''}${j.prep?.edge?'<h3>Role &amp; watch-outs</h3>'+prose(j.prep.edge):''}${j.prep?.background?'<details><summary>Company background</summary>'+prose(j.prep.background)+'</details>':''}<h3>Verification</h3><div class="info-box">${esc(basis)}<br>${j.lastVerifiedAt?'Employer content read: '+esc(j.lastVerifiedAt):'Employer content read: not recorded'}<br>${j.employerPostedAt?'Employer publication date: '+esc(j.employerPostedAt):'Employer publication date: unknown'}${j.closeDate?'<br>Application deadline: '+esc(j.closeDate):''}</div>${j.nextAction?'<h3>Next action</h3>'+prose(j.nextAction):''}${j.suggestedUpdate?'<h3>Employer reply · proposed update</h3>'+prose(j.suggestedUpdate):''}<div class="detail-links">${link(j.applyLink,'Open employer application','primary-btn')}${link(j.link,'Discovery source','quiet')}</div><p class="inline-notice">Opening the employer link does not submit an application.</p>`;
 if(detailTab==='prep')body=`<h3>Likely questions and your examples</h3>${j.prep?.likely?prose(j.prep.likely):'<p class="inline-notice">Interview preparation has not been recorded for this opportunity.</p>'}<h3>Questions to ask</h3>${j.prep?.questions?prose(j.prep.questions):'<p class="inline-notice">No interview questions have been recorded yet.</p>'}`;
 if(detailTab==='contacts')body=`<h3>A human path in</h3>${prose(j.contactResearch||j.contactReferral||'Contact research is queued. We will look for a named recruiter, a source-backed likely manager, and a genuine referral path. An executive title alone does not establish hiring responsibility.')}<div class="detail-links">${link('https://hunter.io/email-finder','Find a work email in Hunter','quiet')}</div><p class="inline-notice">Use a verified company domain and a named person. A guessed or accept-all address remains uncertain.</p>${ops?.hunterConfigured?'<form id="hunter-form" class="hunter-form"><label>Company domain<input name="domain" placeholder="company.com" required></label><label>First name<input name="firstName" required></label><label>Last name<input name="lastName" required></label><button class="quiet" type="submit">Look up in Hunter (uses account credits)</button></form><div id="hunter-result"></div>':''}<h3>Outreach package</h3>${j.outreach?prose(j.outreach):'<p class="inline-notice">A short personal note and tailored application materials can be prepared once the role and recipient are verified. Nothing is sent automatically.</p>'}`;
 if(detailTab==='history')body=`<h3>Next action</h3>${prose(j.nextAction||'No next action recorded.')}<h3>Activity &amp; source history</h3>${prose(j.notes||'No activity recorded.')}`;
 $('detail').innerHTML=`<div class="detail-head"><div class="company">${esc(j.company)}<span class="stage-label">${esc(j.stage)}</span></div><h2>${esc(j.role)}</h2><div class="meta"><span>${esc(j.comp||'Compensation needs checking')}</span><span>${esc(j.workMode)}</span></div></div><div class="detail-tabs" role="tablist" aria-label="Opportunity sections">${tabs.map(t=>`<button role="tab" aria-selected="${t===detailTab}" class="${t===detailTab?'active':''}" data-detail-tab="${t}">${{brief:'Role brief',prep:'Interview prep',contacts:'Contact path',history:'History'}[t]}</button>`).join('')}</div><div class="detail-body">${body}</div><div class="detail-controls"><button class="primary-btn" data-pursue="${j.id}" ${preview?'disabled':''}>${j.pursue?'Pursuing ✓':'Pursue this role'}</button><button class="quiet" data-close="${j.id}" ${preview?'disabled':''}>Close</button>${link('/classic.html','Full tools','quiet')}</div>`;
}
async function update(id,body){if(preview)return;document.body.classList.add('busy');try{const r=await fetch('/.netlify/functions/update-job',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,...body})});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'Update failed.');Object.assign(jobs.find(j=>j.id===id),d);render();notify(body.closeReason?'Closed. The record remains in your history.':'Saved to your tracker.');}catch(e){notify(e.message);}finally{document.body.classList.remove('busy');}}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.view)location.hash=b.dataset.view;if(b.dataset.openOpportunity){location.hash='opportunities';showView('opportunities');review(b.dataset.openOpportunity);}if(b.dataset.review)review(b.dataset.review);if(b.dataset.detailTab){detailTab=b.dataset.detailTab;renderDetail();}if(b.dataset.pursue){const j=jobs.find(j=>j.id===b.dataset.pursue);if(j)update(j.id,{pursue:!j.pursue});}if(b.dataset.close){closing=b.dataset.close;$('close-reason').value='';$('close-dialog').showModal();}});
document.addEventListener('submit',async e=>{if(e.target.id!=='hunter-form')return;e.preventDefault();const form=e.target,values=Object.fromEntries(new FormData(form));form.querySelector('button').disabled=true;try{const r=await fetch('/.netlify/functions/hunter-contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(values)});const d=await r.json();if(!r.ok)throw new Error(d.error);$('hunter-result').innerHTML=prose(d.found?`${d.email}\nVerification: ${d.status}\nProvenance: ${d.provenance}\nChecked: ${d.checkedAt}\n${d.caution}\n${d.sources.map(s=>s.uri).join('\n')}`:'No address found.');}catch(err){$('hunter-result').textContent=err.message;}finally{form.querySelector('button').disabled=false;}});
$('close-form').addEventListener('submit',e=>{e.preventDefault();const reason=$('close-reason').value;if(reason){$('close-dialog').close();update(closing,{closeReason:reason});}});$('cancel-close').addEventListener('click',()=>$('close-dialog').close());$('refresh').addEventListener('click',load);$('search').addEventListener('input',renderOpportunities);$('stage-filter').addEventListener('change',renderOpportunities);
$('opportunity-sort').addEventListener('change',renderOpportunities);
$('post-window').addEventListener('change',renderNewPosts);
$('post-search').addEventListener('input',renderNewPosts);
window.addEventListener('hashchange',showHashView);
document.addEventListener('visibilitychange',()=>{
 if(!document.hidden && Date.now()-lastRefresh>300000) load();
});
showHashView();
load();
