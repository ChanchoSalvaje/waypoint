/* Shared publisher/UI contract and insert-only task reconciliation. No network client or credentials. */
(function(root){
'use strict';
const sections=['career','safoj','personal','writing'];
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
function sourceURL(value){if(value===undefined||value==='')return '';try{const u=new URL(value);if(value.length>1000||u.protocol!=='https:'||u.username||u.password||/[\s\\]/.test(value))return null;return value;}catch{return null;}}
function valid(c){return !!c&&c.v===1&&text(c.id,160)&&/^[A-Za-z0-9][A-Za-z0-9:._/-]*$/.test(c.id)&&['action','event'].includes(c.kind)&&text(c.title,160)&&date(c.date)&&sections.includes(c.section)&&(c.why===undefined||typeof c.why==='string'&&c.why.length<=1000)&&(c.next_action===undefined||typeof c.next_action==='string'&&c.next_action.length<=800)&&sourceURL(c.source_url)!==null;}
function references(list){const ids=new Map();for(const c of Array.isArray(list)?list:[])if(c?.id)ids.set(c.id,(ids.get(c.id)||0)+1);return (Array.isArray(list)?list:[]).filter(c=>c&&text(c.title,160)&&date(c.date)).map(c=>({...c,promotable:valid(c)&&c.kind==='action'&&ids.get(c.id)===1}));}
function validatePublication(list){if(!Array.isArray(list)||JSON.stringify(list).length>5000)fail('VALIDATION','Commitments must be an array within the existing 5,000-character limit.');const ids=new Set();for(const c of list){if(!valid(c)||ids.has(c.id))fail('VALIDATION','Each new commitment needs a valid v1 contract and unique source occurrence ID.');ids.add(c.id);}return list;}
async function taskID(owner,c){if(!text(owner,100)||!valid(c)||c.kind!=='action')fail('VALIDATION','A verified owner and structured action commitment are required.');const bytes=new Uint8Array(await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(['spore-commitment-v1',owner,c.id]))));bytes[6]=(bytes[6]&15)|128;bytes[8]=(bytes[8]&63)|128;const h=[...bytes.slice(0,16)].map(b=>b.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
function payload(id,owner,c){return {id,user_id:owner,section:c.section,title:c.title,why:c.why||'From the published brief commitment.',next_action:[c.next_action,c.source_url?'Source: '+c.source_url:''].filter(Boolean).join('\n\n'),due:c.date,defer_until:null,priority:'normal',minutes:10,done:false,airtable_record_id:null};}
function createAdder(adapter,{isCurrent=()=>true}={}){
 const pending=new Map();
 function guard(owner){if(!isCurrent(owner))fail('SESSION_CHANGED','Workspace changed. Reload before adding.');}
 async function snapshot(owner){guard(owner);const s=await adapter.load();guard(owner);if(s.owner!==owner)fail('SESSION_CHANGED','Workspace owner changed.');return s;}
 function find(s,id,owner){const row=s.tasks.find(t=>t.id===id);if(row&&row.user_id!==owner)fail('FORBIDDEN','Task ownership could not be verified.');return row;}
 async function reconcile(owner,c,id){let s=await snapshot(owner),row=find(s,id,owner);if(row)return {task:row,snapshot:s,outcome:'existing'};
  // Recheck against the latest canonical brief, never notes/prose or stale caller content.
  const latest=s.briefs.slice().sort((a,b)=>b.brief_date.localeCompare(a.brief_date))[0];
  const fresh=references(latest?.commitments).find(x=>x.id===c.id&&x.promotable);if(!fresh)fail('STALE','This suggestion is no longer available. Refresh the brief.');
  let writeError=null;try{guard(owner);await adapter.createTask(payload(id,owner,fresh));guard(owner);}catch(e){if(['AUTH','FORBIDDEN','SESSION_CHANGED','VALIDATION'].includes(e.code))throw e;if(!['CONFLICT','UNKNOWN','SAVE'].includes(e.code))throw e;writeError=e;}
  // Read authoritative state after success OR uncertain/conflicting outcome. Never retry or upsert.
  s=await snapshot(owner);row=find(s,id,owner);if(row)return {task:row,snapshot:s,outcome:writeError?'reconciled':'created'};
  if(writeError)throw writeError;fail('UNKNOWN','Task was not visible on reload. Keep the suggestion and retry only after checking access.');
 }
 return {async add(owner,c){const id=await taskID(owner,c);guard(owner);const key=owner+':'+id;if(pending.has(key))return pending.get(key);const p=reconcile(owner,c,id);pending.set(key,p);try{return await p;}finally{if(pending.get(key)===p)pending.delete(key);}}};
}
const api={valid,references,validatePublication,taskID,createAdder};if(typeof module==='object'&&module.exports)module.exports=api;else root.SporeCommitments=api;
})(globalThis);
