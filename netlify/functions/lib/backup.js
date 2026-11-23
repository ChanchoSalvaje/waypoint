const {seal,unseal,hash}=require('../../../scripts/backup/archive.cjs');
const policy=require('../../../config/backup-policy.json');
const {randomUUID}=require('node:crypto');
function health(latest,lastAttempt,now=Date.now()){
 const age=latest?.verified===true ? now-Date.parse(latest.capturedAt) : NaN;
 return {state:!Number.isFinite(age)||age<0||age>policy.staleAfterHours*3600000?'stale':lastAttempt?.state==='failed'?'warning':'healthy',
  lastVerifiedAt:latest?.verified===true?latest.capturedAt:null,lastAttemptAt:lastAttempt?.startedAt||null,
  staleAfterHours:policy.staleAfterHours};
}
async function listed(store,prefix){
 const rows=[];for await(const page of store.list({prefix,paginate:true})){rows.push(...page.blobs);if(rows.length>1000)throw Error('Backup inventory exceeds its operating cap.');}return rows;
}
async function run({store,readSnapshot,key,spendBlock,now=()=>new Date()}){
 if(spendBlock!=='netlify-auto-recharge-disabled')throw Error('A verified provider spending block is required.');
 if(!/^[a-f0-9]{64}$/.test(key||''))throw Error('A private recovery key is required.');
 const start=now(),day=start.toISOString().slice(0,10),startedAt=start.toISOString();
 const lease=await store.getWithMetadata('lease.json',{type:'json'});
 if(lease?.data?.until>+start)return {skipped:'Another backup is running.'};
 const leaseWrite=await store.setJSON('lease.json',{until:+start+policy.jobTimeoutMinutes*60000},lease?{onlyIfMatch:lease.etag}:{onlyIfNew:true});
 if(!leaseWrite.modified)return {skipped:'Another backup claimed the lease.'};
 let attempt;
 for(let slot=1;slot<=policy.maximumRunsPerDay;slot++){
  const name=`attempts/${day}/${slot}.json`;
  if((await store.setJSON(name,{startedAt,state:'started'},{onlyIfNew:true})).modified){attempt=name;break;}
 }
 if(!attempt){await store.delete('lease.json');return {skipped:'Daily backup attempt limit reached.'};}
 let transferBytes=0;
 try{
  const attempts=await listed(store,'attempts/');let monthly=0;
  for(const item of attempts.filter(x=>x.key.startsWith('attempts/'+day.slice(0,7)))){
   const receipt=await store.get(item.key,{type:'json'});
   if(item.key!==attempt)monthly+=receipt?.transferBytes??policy.maximumBackupBytes*3;
  }
  const snapshot=await readSnapshot(),plainBytes=Buffer.byteLength(JSON.stringify(snapshot));
  transferBytes+=plainBytes;
  const {archive,manifest,sha256}=seal(snapshot,key);
  // Include source egress, the upload, and immediate integrity readback.
  const projected=monthly+transferBytes+archive.length*2;
  if(projected>policy.maximumMonthlyTransferBytes)throw Error('Monthly backup transfer cap reached.');
  if(+now()-start>25000)throw Error('Backup preparation exceeded its runtime cap.');
  const inventory=await listed(store,'archives/');let managed=0;const prior=[];
  for(const item of inventory){
   const metadata=(await store.getMetadata(item.key))?.metadata;
   if(!Number.isFinite(metadata?.bytes)||metadata.bytes<0)throw Error('Backup storage measurement is unavailable.');
   managed+=metadata.bytes;const receipt=await store.get(item.key.replace('archives/','receipts/'),{type:'json'});
   if(receipt?.verified===true)prior.push({...receipt,key:item.key});
  }
  if(managed+archive.length>policy.maximumManagedStorageBytes||archive.length*policy.minimumRetainedCopies>policy.maximumManagedStorageBytes)throw Error('Backup storage cap reached.');
  const id=start.toISOString().replaceAll(':','-')+'-'+randomUUID()+'.wpbk',object='archives/'+id;
  const uploaded=await store.set(object,archive,{onlyIfNew:true,metadata:{bytes:archive.length,sha256,capturedAt:manifest.capturedAt}});
  if(!uploaded.modified)throw Error('Backup destination conflict.');transferBytes+=archive.length;
  const readback=await store.get(object,{type:'arrayBuffer'});transferBytes+=archive.length;
  if(!readback||hash(Buffer.from(readback))!==sha256)throw Error('Uploaded archive checksum mismatch.');
  const restored=unseal(readback,key);
  const receipt={verified:true,capturedAt:restored.manifest.capturedAt,bytes:archive.length,sha256};
  await store.setJSON('receipts/'+id,receipt,{onlyIfNew:true});
  await store.setJSON('latest.json',receipt);
  // A new verified, uploaded, decrypted copy exists before any old copy is pruned.
  const all=[...prior,{...receipt,key:object}].sort((a,b)=>Date.parse(b.capturedAt)-Date.parse(a.capturedAt));
  for(const old of all.slice(policy.maximumRetainedCopies)){
   await store.delete(old.key);await store.delete(old.key.replace('archives/','receipts/'));
  }
  for(const item of attempts)if(item.key.slice(9,19)<new Date(+start-32*86400000).toISOString().slice(0,10))await store.delete(item.key);
  const completed={startedAt,state:'success',transferBytes,bytes:archive.length,verifiedAt:now().toISOString()};
  await store.setJSON(attempt,completed);await store.setJSON('last-attempt.json',completed);
  await store.delete('lease.json');return {verified:true,bytes:archive.length,capturedAt:receipt.capturedAt};
 }catch(error){
  // Preserve the last verified recovery point and all older copies on failure.
  const failed={startedAt,state:'failed',transferBytes:Math.max(transferBytes,policy.maximumBackupBytes*3)};
  try{await store.setJSON(attempt,failed);await store.setJSON('last-attempt.json',failed);}catch{}
  throw Error('Backup did not complete; older recovery points were preserved.');
 }
}
function configured(){return process.env.WAYPOINT_BACKUPS_ENABLED==='true';}
async function runtimeStore(signal,storeFactory){
 // Modern Netlify Functions provide the complete Blobs context automatically.
 return storeFactory({name:'waypoint-backups',consistency:'strong',fetch:(url,options)=>fetch(url,{...options,signal})});
}
module.exports={health,run,configured,runtimeStore};
