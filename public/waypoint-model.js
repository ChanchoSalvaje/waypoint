(function(root,factory){ if(typeof module==='object')module.exports=factory();else root.Waypoint=factory(); })(typeof self==='undefined'?this:self,function(){
  const stages=['Saved','Tailoring','Ready to apply','Applied','Screening','Interviewing','Offer','Closed'];
  function date(value){ if(!value)return null;const d=new Date(value);return Number.isFinite(d.getTime())?d:null; }
  function localDate(value=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Phoenix',year:'numeric',month:'2-digit',day:'2-digit'}).format(value);}
  function days(iso,now=new Date()){ const d=date(iso); if(!d)return null;return Math.round((new Date(localDate(now)+'T12:00:00Z')-new Date(localDate(d)+'T12:00:00Z'))/86400000); }
  function due(job,now=new Date()){return job.stage!=='Closed'&&job.nextActionDate&&job.nextActionDate<=localDate(now);}
  function urgent(job,now=new Date()){const proposed=(job.suggestedUpdate||'').match(/\[(\d{4}-\d{2}-\d{2})[^\]]*\][^\n]*TYPE:\s*(interview|needs-action)/i);const recentProposal=proposed?days(proposed[1]+'T12:00:00Z',now)<=7:/TYPE:\s*(interview|needs-action)/i.test(job.suggestedUpdate||'');const age=job.nextActionDate?days(job.nextActionDate+'T12:00:00Z',now):null;return recentProposal||(due(job,now)&&age<=7);}
  function research(job){ if(job.researchStatus)return job.researchStatus;return job.decisionBrief?'Partial':job.prep?.background?'Existing research':'Queued'; }
  function rank(job,now=new Date()){return (urgent(job,now)?1000:0)+(/Interviewing|Screening|Offer/.test(job.stage)?400:0)+(job.stage==='Ready to apply'?350:0)+(job.stage==='Tailoring'?250:0)+({'Worth a look':20,'Verify first':-20,'Low priority':-70}[job.recommendation]||0)+(job.fitBasis==='JD'?30:0)+(job.fit||0)*10+(job.decisionBrief?15:0);}
  function shortlist(jobs,now=new Date()){return jobs.filter(j=>j.stage!=='Closed'&&(j.stage==='Saved'||j.nextAction||j.suggestedUpdate||/Tailoring|Ready to apply|Screening|Interviewing|Offer/.test(j.stage))).slice().sort((a,b)=>rank(b,now)-rank(a,now)||String(b.firstSeenAt||b.dateFound).localeCompare(String(a.firstSeenAt||a.dateFound))).slice(0,3);}
  function safeUrl(value){if(typeof value!=='string'||!value.trim()||!(/^(https?:\/\/|\/(?!\/)|#)/i.test(value.trim())))return '';try{const u=new URL(value.trim(),'https://waypoint-hq.netlify.app');return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}}
  function freshness(job,now=new Date()){const t=date(job.firstSeenAt);if(!t)return {label:job.dateFound?'Logged '+job.dateFound:'Discovery date unknown',kind:'muted'}; const age=Math.max(0,Math.floor((now-t)/3600000));return {label:age<1?'First seen this hour':age<24?'First seen '+age+'h ago':'First seen '+Math.floor(age/24)+'d ago',kind:age<24?'fresh':'muted'};}
  function sourceHealth(source,now=new Date()) { if(!source.Enabled)return {kind:'muted',label:'Paused'};const last=date(source['Last Success']);if(!last)return {kind:'partial',label:'Not yet verified'};if(last>now)return {kind:'partial',label:'Check source timestamp'};if(source['Last Error'])return {kind:'partial',label:'Latest read failed'};return now-last>7200000?{kind:'partial',label:'Read overdue'}:{kind:'ready',label:'Recently read'}; }
  const applicationStages = new Set(['Applied', 'Screening', 'Interviewing', 'Offer']);
  const preparationStages = new Set(['Pursue', 'Tailoring', 'Tailoring–in review', 'Ready to apply']);
  function opportunityMatches(job, view) {
    if (job.stage === 'Closed') return false;
    const submitted = applicationStages.has(job.stage);
    const preparing = preparationStages.has(job.stage);
    // The Pursue checkbox can queue research without advancing a Saved role.
    const deciding = job.stage === 'Saved';
    if (view === 'decide') return deciding;
    if (view === 'applied') return submitted;
    if (view === 'preparing') return preparing;
    if (view === 'research') return (deciding || preparing) && research(job) !== 'Ready';
    return view === 'active';
  }
  function discoveryDay(item) {
    const observed = date(item.firstSeenAt);
    return observed ? localDate(observed) : (item.dateFound || '').slice(0, 10);
  }
  function windowStart(length, now = new Date()) {
    const today = new Date(localDate(now) + 'T00:00:00Z');
    today.setUTCDate(today.getUTCDate() - length + 1);
    return today.toISOString().slice(0, 10);
  }
  function newestFirst(a, b) {
    const byDay = discoveryDay(b).localeCompare(discoveryDay(a));
    if (byDay) return byDay;
    const byTime = (date(b.firstSeenAt)?.getTime() || 0) - (date(a.firstSeenAt)?.getTime() || 0);
    return byTime || (a.company || '').localeCompare(b.company || '') ||
      (a.role || '').localeCompare(b.role || '') || a.id.localeCompare(b.id);
  }
  function opportunityRows(jobs, { view, query, sort }, now = new Date()) {
    const search = query.trim().toLowerCase();
    return jobs.filter(job => opportunityMatches(job, view))
      .filter(job => !search || [job.company, job.role, job.decisionBrief, job.fitRead].join(' ').toLowerCase().includes(search))
      .sort((a, b) => {
        if (sort === 'priority') return rank(b, now) - rank(a, now) || newestFirst(a, b);
        if (sort === 'fit') return (b.fit ?? -1) - (a.fit ?? -1) || newestFirst(a, b);
        return newestFirst(a, b);
      });
  }
  function recentPosts(items, length, now = new Date()) {
    const start = windowStart(length, now), today = localDate(now);
    return items.filter(item => {
      const day = discoveryDay(item);
      return day >= start && day <= today && (!item.firstSeenAt || date(item.firstSeenAt) <= now);
    }).sort(newestFirst);
  }
  function inPostReview(post, currentStage) {
    if ((currentStage || post.stage) === 'Closed' || post.decision === 'Close') return false;
    return post.state !== 'Ignored' || post.decision === 'Pursue';
  }
  function postRows(items, length, history, now = new Date()) {
    if (length) return recentPosts(items,length,now);
    if (history) return items.slice().sort(newestFirst);
    return items.filter(p=>p.kind==='lead' && p.state==='New' && p.decision!=='Close').sort(newestFirst);
  }
  return {postRows,inPostReview,stages,date,localDate,days,due,urgent,research,rank,shortlist,safeUrl,freshness,sourceHealth,opportunityMatches,opportunityRows,discoveryDay,windowStart,recentPosts};
});
