-- Provider source identity and workflow slots remain unique under concurrency.
create unique index waypoint_run_key_unique on public.waypoint_records
 ((fields->>'fldV2TqtdfgdxoUPX'))
 where table_key='automation_runs' and coalesce(fields->>'fldV2TqtdfgdxoUPX','')<>'';
create unique index waypoint_lead_source_key_unique on public.waypoint_records
 ((fields->>'fldgDJSNvOLxhB07P'))
 where table_key='lead_inbox' and coalesce(fields->>'fldgDJSNvOLxhB07P','')<>'';
create unique index waypoint_one_running_workflow on public.waypoint_records
 ((fields->>'fldv7n2luLvIa0IVD'))
 where table_key='automation_runs' and fields->>'fldvoOXJWpYYHLfSj'='Running'
 and coalesce(fields->>'fldv7n2luLvIa0IVD','')<>'';
