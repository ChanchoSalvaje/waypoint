// Decrypt locally and emit a reviewable restore script for an EMPTY, isolated
// Supabase database. Never point a restore at the live project.
const fs=require('node:fs');
const {unseal}=require('./archive.cjs');
const ident=value=>'"'+String(value).replaceAll('"','""')+'"';
const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
const qualified=name=>name.split('.').map(ident).join('.');
function restoreSQL(snapshot){
 const sql=['begin;','create schema if not exists waypoint_migration;','revoke all on schema waypoint_migration from public,anon,authenticated;'];
 for(const table of snapshot.schema){
  if(table.policies?.length)throw Error('Review policies before restoring a snapshot with row policies.');
  sql.push(table.create);
  if(table.rls)sql.push('alter table '+qualified(table.name)+' enable row level security;');
  if(table.forceRls)sql.push('alter table '+qualified(table.name)+' force row level security;');
  sql.push('revoke all on '+qualified(table.name)+' from public,anon,authenticated;');
 }
 for(const table of snapshot.schema){
  const rows=snapshot.data[table.name];if(!rows.length)continue;
  const columns=Object.keys(rows[0]).map(ident).join(',');
  // jsonb_populate_recordset turns a JSON null into SQL NULL. This column
  // intentionally stores JSON null as a value, so retain the raw JSON token.
  if(table.name==='waypoint_migration.cell_values'){
   sql.push('insert into '+qualified(table.name)+" (export_id,row_number,field_id,value) select (r->>'export_id')::uuid,(r->>'row_number')::integer,r->>'field_id',r->'value' from jsonb_array_elements("+literal(JSON.stringify(rows))+"::jsonb) r;");
  }else{
   sql.push('insert into '+qualified(table.name)+' ('+columns+') overriding system value select '+columns+' from jsonb_populate_recordset(null::'+qualified(table.name)+','+literal(JSON.stringify(rows))+'::jsonb);');
  }
 }
 // Foreign keys are installed after primary/unique constraints across all tables.
 for(const foreign of [false,true])for(const table of snapshot.schema)for(const c of table.constraints||[])
  if(c.definition.startsWith('FOREIGN KEY')===foreign)sql.push('alter table '+qualified(table.name)+' add constraint '+ident(c.name)+' '+c.definition+';');
 for(const table of snapshot.schema){
  for(const index of table.indexes||[])sql.push(index+';');
  if(table.comment!==null&&table.comment!==undefined)sql.push('comment on table '+qualified(table.name)+' is '+literal(table.comment)+';');
 }
 for(const fn of snapshot.functions){
  sql.push(fn.definition+';','revoke all on function '+fn.identity+' from public,anon,authenticated;');
 }
 // This datastore intentionally has no browser grants or policies. Preserve the
 // canonical server role's minimal application grants; no passwords are restored.
 sql.push('grant usage on schema waypoint_migration to service_role;',
 'grant select on all tables in schema waypoint_migration to service_role;',
 'grant select on public.waypoint_tables to service_role;',
 'grant select,insert,update on public.waypoint_records to service_role;',
 'grant select,insert,delete on public.waypoint_record_links to service_role;',
 'grant select,insert on public.waypoint_comments,public.waypoint_audit to service_role;',
 'grant usage,select on sequence public.waypoint_audit_id_seq to service_role;',
 "select setval('public.waypoint_audit_id_seq',greatest(coalesce((select max(id) from public.waypoint_audit),0),1),exists(select 1 from public.waypoint_audit));",
 'grant execute on function public.waypoint_patch_record(text,text,jsonb,jsonb),public.waypoint_backup_snapshot() to service_role;');
 for(const table of snapshot.schema)for(const trigger of table.triggers||[])sql.push(trigger+';');
 sql.push('commit;');return sql.join('\n')+'\n';
}
if(require.main===module){
 try{
  if(process.argv.length!==4||!process.argv[3].includes('/.backup-data/'))throw Error('Use an output inside .backup-data.');
  const {snapshot,manifest}=unseal(fs.readFileSync(process.argv[2]),process.env.WAYPOINT_BACKUP_ENCRYPTION_KEY);
  fs.writeFileSync(process.argv[3],restoreSQL(snapshot),{mode:0o600,flag:'wx'});
  process.stdout.write(JSON.stringify({prepared:true,capturedAt:manifest.capturedAt,counts:manifest.counts})+'\n');
 }catch{process.stderr.write('Restore preparation failed. Check the archive, recovery key, and a new private output path.\n');process.exitCode=1;}
}
module.exports={restoreSQL};
