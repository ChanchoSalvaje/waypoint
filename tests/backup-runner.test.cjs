const {test}=require('node:test');const assert=require('node:assert/strict');
const {run,health}=require('../netlify/functions/lib/backup');
const policy=require('../config/backup-policy.json');
const instant=new Date('2026-11-23T10:40:00Z'),key='ab'.repeat(32);
function snapshot(){const data={'public.waypoint_tables':policy.requiredTables.map(table_key=>({table_key})),
 'public.waypoint_records':policy.requiredTables.map((table_key,i)=>({id:'rec'+String(i+1).padStart(14,'0'),table_key,fields:{notes:'Preserved history'}})),
 'public.waypoint_record_links':[],'public.waypoint_comments':[]};
 return {version:1,capturedAt:instant.toISOString(),databaseBytes:30*1024*1024,data,schema:Object.keys(data).map(name=>({name})),functions:[]};}
class Store{
 constructor(){this.rows=new Map();this.sequence=0;this.deleted=[];this.corrupt=false;}
 async set(name,data,options={}){const old=this.rows.get(name);if(options.onlyIfNew&&old||options.onlyIfMatch&&options.onlyIfMatch!==old?.etag)return {modified:false};const etag=String(++this.sequence);this.rows.set(name,{data:Buffer.from(data),metadata:options.metadata||{},etag});return {modified:true,etag};}
 async setJSON(name,value,options){return this.set(name,JSON.stringify(value),options);}
 async get(name,options={}){const row=this.rows.get(name);if(!row)return null;if(options.type==='json')return JSON.parse(row.data);let bytes=Buffer.from(row.data);if(this.corrupt&&name.startsWith('archives/'))bytes[bytes.length-1]^=1;return bytes;}
 async getWithMetadata(name,options){const row=this.rows.get(name);return row?{data:await this.get(name,options),etag:row.etag,metadata:row.metadata}:null;}
 async getMetadata(name){const row=this.rows.get(name);return row?{metadata:row.metadata,etag:row.etag}:null;}
 async *list({prefix}){yield {blobs:[...this.rows.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key})),directories:[]};}
 async delete(name){this.deleted.push(name);this.rows.delete(name);}
}
const options=store=>({store,readSnapshot:async()=>snapshot(),key,spendBlock:'netlify-auto-recharge-disabled',now:()=>instant});
test('daily backups verify uploaded decryption before pruning and enforce the two-attempt limit',async()=>{
 const store=new Store();const first=await run(options(store));assert.equal(first.verified,true);
 assert.equal((await store.get('latest.json',{type:'json'})).verified,true);
 assert.equal((await run(options(store))).verified,true);assert.match((await run(options(store))).skipped,/limit/);
 assert.equal([...store.rows.keys()].filter(k=>k.startsWith('archives/')).length,2);assert.equal(store.deleted.filter(k=>k.startsWith('archives/')).length,0);
});
test('corrupted readback cannot replace the last good recovery point or prune older copies',async()=>{
 const store=new Store();await run(options(store));const before=await store.get('latest.json',{type:'json'});
 store.corrupt=true;await assert.rejects(run(options(store)),/older recovery points/);
 assert.deepEqual(await store.get('latest.json',{type:'json'}),before);assert.equal(store.deleted.filter(k=>k.startsWith('archives/')).length,0);
});
test('backup cost attestation, measured overlap, and leases fail closed',async()=>{
 const store=new Store();await assert.rejects(run({...options(store),spendBlock:undefined}),/spending block/);
 await store.setJSON('lease.json',{until:+instant+10000});assert.match((await run(options(store))).skipped,/running/);
 await store.delete('lease.json');await store.set('archives/old.wpbk','old',{metadata:{bytes:policy.maximumManagedStorageBytes}});
 await assert.rejects(run(options(store)),/older recovery points/);assert.ok(store.rows.has('archives/old.wpbk'));
});
test('independent freshness checks detect a job that never ran, old backups, and recent failures',()=>{
 assert.equal(health(null,null,+instant).state,'stale');
 const latest={verified:true,capturedAt:instant.toISOString()};
 assert.equal(health(latest,null,+instant+35*3600000).state,'healthy');
 assert.equal(health(latest,null,+instant+37*3600000).state,'stale');
 assert.equal(health(latest,{state:'failed',startedAt:instant.toISOString()},+instant).state,'warning');
});
