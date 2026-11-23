const {test}=require('node:test');
const assert=require('node:assert/strict');
const {preflight}=require('../scripts/backup/preflight.cjs');
const {validateExport}=require('../scripts/migration/validate-export.cjs');
const policy=require('../config/backup-policy.json');
const MiB=1024*1024;
const measurements=()=>({archiveBytes:10*MiB,accountStorageUsedBytes:80*MiB,accountStorageAllowanceBytes:500*MiB,managedStorageBytes:60*MiB,databaseBytes:100*MiB,monthlyTransferBytes:300*MiB,includedComputeRemainingUsd:10,estimatedRunCostUsd:0.03,runsToday:0,retainedCopies:6,runtimeSeconds:120,privateDestinationVerified:true,encryptionVerified:true,paidUsageBlockedVerified:true,freshUsageVerified:true,copyIntegrityVerified:true});
test('backup upload is blocked without verified privacy, encryption, integrity, usage and spending controls',()=>{
 const good=measurements();assert.equal(preflight(good).ok,true);
 for(const key of ['privateDestinationVerified','encryptionVerified','paidUsageBlockedVerified','freshUsageVerified','copyIntegrityVerified'])assert.equal(preflight({...good,[key]:undefined}).ok,false,key);
});
test('storage preflight includes new-copy overlap and preserves reserve across the whole account',()=>{
 const good=measurements();
 assert.equal(preflight({...good,accountStorageUsedBytes:395*MiB}).ok,false);
 assert.equal(preflight({...good,managedStorageBytes:195*MiB}).ok,false);
 assert.equal(preflight({...good,archiveBytes:26*MiB}).ok,false);
});
test('compute, frequency, database, transfer and runtime caps fail closed',()=>{
 const good=measurements();
 for(const [key,value] of [['includedComputeRemainingUsd',0],['runsToday',2],['databaseBytes',351*MiB],['monthlyTransferBytes',3*1024*MiB],['runtimeSeconds',301],['archiveBytes',0]])assert.equal(preflight({...good,[key]:value}).ok,false,key);
 for(const value of [null,-1,Infinity,NaN,'10'])assert.equal(preflight({...good,accountStorageUsedBytes:value}).ok,false);
});
function exportFixture(){
 const id='rec00000000000001',field='fld00000000000001';
 return {version:1,source:{provider:'airtable',complete:true,paginationComplete:true,allStagesIncluded:true,commentsComplete:true,capturedAt:'2026-11-23T12:00:00Z',activeSettingsRecordId:id,verifiedCommentCount:0,verifiedCounts:Object.fromEntries(policy.requiredTables.map(name=>[name,1]))},tables:Object.fromEntries(policy.requiredTables.map(name=>[name,{fields:[{id:field,name:'Synthetic text',type:'multilineText'}],records:[{id,createdTime:'2026-11-20T12:00:00Z',fields:{[field]:'Synthetic preserved value'}}]}])),comments:[]};
}
const now=new Date('2026-11-23T13:00:00Z');
test('complete exports are checksummed without exposing private record contents',()=>{
 const result=validateExport(exportFixture(),now);assert.equal(result.ok,true);
 assert.equal(Object.keys(result.counts).length,policy.requiredTables.length);
 assert.ok(Object.values(result.checksums).every(value=>/^[a-f0-9]{64}$/.test(value)));
 assert.ok(!JSON.stringify(result).includes('Synthetic preserved value'));
});
test('incomplete, stale, partial and duplicate-record exports cannot pass migration validation',()=>{
 for(const mutate of [
  data=>delete data.tables.contacts,
  data=>data.source.paginationComplete=false,
  data=>data.source.allStagesIncluded=false,
  data=>data.source.commentsComplete=false,
  data=>data.source.capturedAt='2026-11-15T12:00:00Z',
  data=>data.source.capturedAt='2026-11-24T12:00:00Z',
  data=>data.source.verifiedCounts.opportunities=2,
  data=>data.tables.opportunities.records.push(data.tables.opportunities.records[0]),
  data=>data.source.activeSettingsRecordId='rec00000000000002',
 ]){const data=exportFixture();mutate(data);assert.equal(validateExport(data,now).ok,false);}
});
test('unmapped fields, broken relationships, and orphaned comments prevent cutover',()=>{
 const data=exportFixture(),field='fld00000000000002';
 data.tables.opportunities.fields.push({id:field,name:'Contact',type:'multipleRecordLinks',linkedTableKey:'contacts'});
 data.tables.opportunities.records[0].fields[field]=['rec00000000000001'];
 assert.equal(validateExport(data,now).ok,true);
 data.tables.opportunities.records[0].fields[field]=['rec00000000000002'];
 assert.equal(validateExport(data,now).ok,false);
 const comments=exportFixture();comments.comments=[{table:'opportunities',recordId:'rec00000000000002',id:'comment1',text:'Synthetic comment',createdTime:'2026-11-23T12:00:00Z'}];comments.source.verifiedCommentCount=1;
 assert.equal(validateExport(comments,now).ok,false);
});
