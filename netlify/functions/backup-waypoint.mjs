// Ordinary scheduled code, without model calls. Activation is explicit.
import backup from './lib/backup.js';
const {run,configured,runtimeStore}=backup;
import datastore from './lib/supabase-store.js';
const {config}=datastore;
export default async ()=>{
 if(!configured())return new Response('Backups are not activated.');
 const signal=AbortSignal.timeout(25000);
 try{
  const store=await runtimeStore(signal),{url,key}=config();
  const result=await run({store,key:process.env.WAYPOINT_BACKUP_ENCRYPTION_KEY,spendBlock:process.env.WAYPOINT_BACKUP_SPEND_BLOCK,
   readSnapshot:async()=>{const r=await fetch(url+'/rest/v1/rpc/waypoint_backup_snapshot',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:'{}',signal});if(!r.ok)throw Error('Snapshot unavailable.');return r.json();}});
  return Response.json(result);
 }catch{return new Response('Backup could not be verified. Previous recovery copies were preserved.',{status:500});}
};
