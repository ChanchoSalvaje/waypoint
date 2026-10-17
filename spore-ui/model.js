/* Pure demo-state rules; no network or storage. Also used by the Node checks. */
(function (root) {
  'use strict';
  const sections = ['career','safoj','personal','writing'];
  const validDate = value => value === '' || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value);
  const short = (value,max) => typeof value === 'string' && value.length <= max;
  function validTask(t) {
    return t && short(t.id,100) && sections.includes(t.section) && short(t.title,160) && t.title.trim().length > 0 && short(t.why,1500) && short(t.nextAction,2000) && validDate(t.due) && validDate(t.deferUntil) && ['high','normal'].includes(t.priority) && Number.isInteger(t.minutes) && t.minutes >= 5 && t.minutes <= 60 && typeof t.done === 'boolean' && t.opportunityRef === null;
  }
  function validate(s) {
    return !!s && s.version === 2 && s.mode === 'demo' && Number.isInteger(s.revision) && s.revision >= 0 && validDate(s.planningDate) && s.planningDate !== '' && short(s.generatedAt,40) && Array.isArray(s.tasks) && s.tasks.every(validTask) && new Set(s.tasks.map(t=>t.id)).size===s.tasks.length && Array.isArray(s.notes) && s.notes.every(n=>n && short(n.id,100) && [...sections,'today'].includes(n.section) && short(n.body,3000) && short(n.at,40)) && Array.isArray(s.history) && s.history.every(h=>h && [...sections,'today'].includes(h.section) && short(h.text,500) && short(h.at,40));
  }
  const deferred = (t,day) => !!t.deferUntil && t.deferUntil > day;
  function today(s) {
    return s.tasks.filter(t=>!t.done && !deferred(t,s.planningDate) && (t.section!=='writing' || (t.due && t.due<=s.planningDate))).sort((a,b)=>{
      const rank = t => t.section==='writing' ? 5 : t.section==='career' && t.priority==='high' ? 0 : (t.due && t.due<=s.planningDate ? 1 : t.priority==='high' ? 2 : t.section==='career' ? 3 : 4);
      return rank(a)-rank(b) || (a.due||'9999').localeCompare(b.due||'9999') || a.id.localeCompare(b.id);
    });
  }
  function plan(s) {
    return today(s).slice(0,3).map(t=>({task:t,minutes:t.minutes}));
  }
  function groups(s,section) {
    const tasks=s.tasks.filter(t=>t.section===section);
    return {active:tasks.filter(t=>!t.done&&!deferred(t,s.planningDate)),waiting:tasks.filter(t=>!t.done&&deferred(t,s.planningDate)),completed:tasks.filter(t=>t.done)};
  }
  function change(s, action) {
    const next=JSON.parse(JSON.stringify(s)); let message; let section;
    if(action.kind==='task') {
      if(!validTask(action.task))throw new Error('Please check the task fields.');
      const index=next.tasks.findIndex(t=>t.id===action.task.id);
      if(index<0) next.tasks.push(action.task); else next.tasks[index]=action.task;
      message=`${index<0?'Added':'Edited'} task: ${action.task.title}`; section=action.task.section;
    } else if(action.kind==='toggle') {
      const t=next.tasks.find(t=>t.id===action.id);if(!t)throw new Error('Task not found.');t.done=!t.done;message=`${t.done?'Completed':'Reopened'} task: ${t.title}`;section=t.section;
    } else if(action.kind==='note') {
      if(![...sections,'today'].includes(action.section) || !short(action.body,3000) || !action.body.trim())throw new Error('Write an update first (up to 3,000 characters).');
      next.notes.push({id:action.id,section:action.section,body:action.body.trim(),at:action.at});message='Added a note';section=action.section;
    } else throw new Error('Unknown demo action.');
    next.history.push({section,text:message,at:action.at});next.revision++;
    if(!validate(next))throw new Error('Invalid demo data.');return next;
  }
  const api={sections,validDate,validate,deferred,today,plan,groups,change};
  if(typeof module==='object' && module.exports)module.exports=api;else root.BriefModel=api;
})(typeof globalThis==='object'?globalThis:this);
