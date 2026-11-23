const {createHash,randomBytes,createCipheriv,createDecipheriv}=require('node:crypto');
const {gzipSync,gunzipSync}=require('node:zlib');
const policy=require('../../config/backup-policy.json');
const hash=value=>createHash('sha256').update(value).digest('hex');
const canonical=value=>JSON.stringify(value);
function validateSnapshot(snapshot) {
 if(snapshot?.version!==1||!Array.isArray(snapshot.schema)||!snapshot.data||!Array.isArray(snapshot.functions))throw Error('Incomplete backup snapshot.');
 const names=Object.keys(snapshot.data),defined=snapshot.schema.map(t=>t.name);
 if(names.length!==defined.length||new Set(defined).size!==defined.length||names.some(n=>!defined.includes(n)||!Array.isArray(snapshot.data[n])))throw Error('Backup schema and data differ.');
 if(names.some(n=>!/^public\.waypoint_[a-z_]+$|^waypoint_migration\.[a-z_]+$/.test(n)))throw Error('Backup includes an unexpected schema.');
 if(!Number.isFinite(Date.parse(snapshot.capturedAt))||snapshot.databaseBytes>policy.maximumDatabaseBytes)throw Error('Invalid capture time or database cap exceeded.');
 const records=snapshot.data['public.waypoint_records'],tables=snapshot.data['public.waypoint_tables'];
 if(!Array.isArray(records)||!Array.isArray(tables))throw Error('Application data is missing.');
 const ids=new Map(records.map(r=>[r.id,r]));
 if(ids.size!==records.length||records.some(r=>!/^rec[A-Za-z0-9]{14}$/.test(r.id)))throw Error('Invalid or duplicate record identity.');
 const counts=Object.fromEntries(policy.requiredTables.map(name=>[name,0]));
 for(const table of tables)if(!Object.hasOwn(counts,table.table_key))throw Error('Unexpected application table.');
 if(policy.requiredTables.some(name=>!tables.some(t=>t.table_key===name)))throw Error('An application table is missing.');
 for(const row of records){if(!Object.hasOwn(counts,row.table_key))throw Error('Unmapped record table.');counts[row.table_key]++;}
 for(const link of snapshot.data['public.waypoint_record_links']||[])if(!ids.has(link.record_id)||!ids.has(link.target_id))throw Error('Orphaned linked record.');
 for(const comment of snapshot.data['public.waypoint_comments']||[])if(!ids.has(comment.record_id))throw Error('Orphaned record comment.');
 const checksums=Object.fromEntries(names.sort().map(name=>[name,{rows:snapshot.data[name].length,sha256:hash(canonical(snapshot.data[name]))}]));
 return {version:1,capturedAt:snapshot.capturedAt,counts,checksums};
}
function keyBytes(key) {
 if(typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key))throw Error('A separate 256-bit recovery key is required.');
 return Buffer.from(key,'hex');
}
function seal(snapshot,key){
 const manifest=validateSnapshot(snapshot),plain=Buffer.from(canonical({manifest,snapshot}));
 const compressed=gzipSync(plain),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',keyBytes(key),iv);
 const data=Buffer.concat([cipher.update(compressed),cipher.final()]);
 const archive=Buffer.concat([Buffer.from('WPBK0001'),iv,cipher.getAuthTag(),data]);
 if(archive.length>policy.maximumBackupBytes)throw Error('Encrypted backup exceeds the per-copy cap.');
 return {archive,manifest,sha256:hash(archive)};
}
function unseal(archive,key){
 archive=Buffer.from(archive);
 if(archive.length<37||archive.length>policy.maximumBackupBytes||archive.subarray(0,8).toString()!=='WPBK0001')throw Error('Invalid encrypted backup.');
 const decipher=createDecipheriv('aes-256-gcm',keyBytes(key),archive.subarray(8,20));decipher.setAuthTag(archive.subarray(20,36));
 const compressed=Buffer.concat([decipher.update(archive.subarray(36)),decipher.final()]);
 const result=JSON.parse(gunzipSync(compressed,{maxOutputLength:256*1024*1024}));
 const verified=validateSnapshot(result.snapshot);
 if(canonical(verified)!==canonical(result.manifest))throw Error('Backup manifest does not match restored data.');
 return result;
}
module.exports={seal,unseal,validateSnapshot,hash};
