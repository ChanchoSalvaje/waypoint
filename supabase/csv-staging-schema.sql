-- Isolated recovery area. Never expose this schema through PostgREST.
-- CSV field values are preserved as strings; normalization happens separately.
create schema if not exists waypoint_migration;
revoke all on schema waypoint_migration from public, anon, authenticated;

create table waypoint_migration.csv_exports (
  export_id uuid primary key,
  table_key text not null,
  source_filename text not null,
  file_sha256 text not null check (file_sha256 ~ '^[a-f0-9]{64}$'),
  file_bytes bigint not null check (file_bytes > 0),
  headers jsonb not null check (jsonb_typeof(headers) = 'array'),
  expected_rows integer not null check (expected_rows >= 0),
  imported_at timestamptz not null default now(),
  verified_at timestamptz,
  unique (table_key, file_sha256)
);
create table waypoint_migration.csv_rows (
  export_id uuid not null references waypoint_migration.csv_exports(export_id),
  row_number integer not null check (row_number > 0),
  cells jsonb not null check (jsonb_typeof(cells) = 'array'),
  primary key (export_id, row_number)
);
alter table waypoint_migration.csv_exports enable row level security;
alter table waypoint_migration.csv_rows enable row level security;
revoke all on all tables in schema waypoint_migration from public, anon, authenticated;
comment on schema waypoint_migration is
  'Private CSV recovery staging. Source IDs, comments, schema and links must be reconciled before production cutover.';
