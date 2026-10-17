/* Reversible display-only exclusions for two explicitly identified acceptance fixtures.
   Rows remain in Supabase. Never infer test data from titles/content. */
(function(root){
'use strict';
const taskId='ec715082-5f0c-4ad6-b81b-ad55d1e3a7c7';
const noteId='da3015e0-c6ae-49f4-ae20-01e9f7fec315';
function snapshot(s){return {...s,tasks:s.tasks.filter(t=>t.id!==taskId),notes:s.notes.filter(n=>n.id!==noteId),history:s.history.filter(h=>h.entity_id!==taskId&&h.entity_id!==noteId)};}
const api={snapshot};if(typeof module==='object'&&module.exports)module.exports=api;else root.SporeVisibility=api;
})(globalThis);
