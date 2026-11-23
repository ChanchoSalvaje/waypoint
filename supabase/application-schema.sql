-- Server-only datastore. The existing website password gate remains required.
create table public.waypoint_tables (
  table_key text primary key,
  source_table_id text not null unique,
  field_definitions jsonb not null,
  comment_archive_url text not null,
  provenance jsonb not null default '{}'::jsonb
);
create table public.waypoint_records (
  id text primary key check (id ~ '^rec[A-Za-z0-9]{14}$'),
  table_key text not null references public.waypoint_tables(table_key),
  fields jsonb not null check (jsonb_typeof(fields) = 'object'),
  source_export_id uuid,
  source_row_number integer,
  source_created_at timestamptz,
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(source_export_id,source_row_number)
    references waypoint_migration.csv_rows(export_id,row_number),
  unique(source_export_id,source_row_number)
);
create index waypoint_records_table_id on public.waypoint_records(table_key,id);
create table public.waypoint_record_links (
  record_id text not null references public.waypoint_records(id),
  field_id text not null,
  target_id text not null references public.waypoint_records(id),
  primary key(record_id,field_id,target_id)
);
create table public.waypoint_comments (
  id uuid primary key default gen_random_uuid(),
  record_id text not null references public.waypoint_records(id),
  created_at timestamptz not null default now(),
  author text not null,
  body text not null check (length(body) between 1 and 100000)
);
create table public.waypoint_audit (
  id bigint generated always as identity primary key,
  record_id text not null,
  table_key text not null,
  occurred_at timestamptz not null default now(),
  operation text not null,
  changed_fields jsonb not null
);
alter table public.waypoint_tables enable row level security;
alter table public.waypoint_records enable row level security;
alter table public.waypoint_record_links enable row level security;
alter table public.waypoint_comments enable row level security;
alter table public.waypoint_audit enable row level security;
revoke all on public.waypoint_tables,public.waypoint_records,public.waypoint_record_links,
  public.waypoint_comments,public.waypoint_audit from public,anon,authenticated;
grant select on public.waypoint_tables to service_role;
grant select,insert,update on public.waypoint_records to service_role;
grant select,insert,delete on public.waypoint_record_links to service_role;
grant select,insert on public.waypoint_comments,public.waypoint_audit to service_role;
grant usage,select on sequence public.waypoint_audit_id_seq to service_role;
comment on table public.waypoint_records is
  'Private Waypoint records. Imported IDs are original Airtable IDs; raw CSV strings remain in waypoint_migration. Imported creation times are unknown; exported timestamps have minute precision.';
comment on table public.waypoint_comments is
  'New Waypoint comments. Historical Airtable comments stay in the source archive by owner instruction on 2026-11-23.';
