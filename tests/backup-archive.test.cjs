const {test}=require('node:test');const assert=require('node:assert/strict');
const {seal,unseal}=require('../scripts/backup/archive.cjs');
const policy=require('../config/backup-policy.json');
function snapshot(){
 const data={'public.waypoint_tables':policy.requiredTables.map(table_key=>({table_key})),
 'public.waypoint_records':policy.requiredTables.map((table_key,i)=>({id:'rec'+String(i+1).padStart(14,'0'),table_key,fields:{notes:'Existing full notes\nUnicode: café — preserved'}})),
 'public.waypoint_record_links':[],'public.waypoint_comments':[]};
 return {version:1,capturedAt:'2026-11-23T20:00:00Z',databaseBytes:30*1024*1024,data,schema:Object.keys(data).map(name=>({name})),functions:[]};
}
test('encrypted backups restore exact Unicode notes, original IDs, and counts without plaintext exposure',()=>{
 const source=snapshot(),key='ab'.repeat(32),first=seal(source,key),second=seal(source,key);
 assert.notDeepEqual(first.archive,second.archive);assert.ok(!first.archive.includes(Buffer.from('Existing full notes')));
 assert.deepEqual(unseal(first.archive,key).snapshot,source);assert.equal(first.manifest.counts.opportunities,1);
});
test('wrong keys, corrupted archives, broken links, and missing tables fail backup validation',()=>{
 const key='ab'.repeat(32),{archive}=seal(snapshot(),key);
 assert.throws(()=>unseal(archive,'cd'.repeat(32)));const corrupted=Buffer.from(archive);corrupted[38]^=1;assert.throws(()=>unseal(corrupted,key));
 let source=snapshot();source.data['public.waypoint_record_links'].push({record_id:source.data['public.waypoint_records'][0].id,target_id:'rec99999999999999'});assert.throws(()=>seal(source,key));
 source=snapshot();source.data['public.waypoint_tables'].pop();assert.throws(()=>seal(source,key));
});
