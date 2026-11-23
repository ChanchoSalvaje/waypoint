// Independent, read-only freshness check behind the existing password gate.
import {getStore} from '@netlify/blobs';
import backup from './lib/backup.js';
const {health,configured,runtimeStore}=backup;
const json=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export default async request=>{
 if(request.method!=='GET')return json(405,{error:'Use GET.'});
 if(!configured())return json(200,{state:'not_activated'});
 try{
  const store=await runtimeStore(AbortSignal.timeout(10000),getStore);
  const [latest,attempt]=await Promise.all([store.get('latest.json',{type:'json'}),store.get('last-attempt.json',{type:'json'})]);
  const result=health(latest,attempt);return json(result.state==='stale'?503:200,result);
 }catch(error){return json(503,{state:'unavailable',code:['MissingBlobsEnvironmentError','BlobsConsistencyError','TypeError','TimeoutError','Error'].includes(error?.name)?error.name:'StorageError'});}
};
