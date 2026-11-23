create table waypoint_migration.original_record_ids (
  export_id uuid not null,
  row_number integer not null,
  record_id text not null unique check (record_id ~ '^rec[A-Za-z0-9]{14}$'),
  primary key (export_id,row_number),
  foreign key (export_id,row_number) references waypoint_migration.csv_rows(export_id,row_number)
);
create table waypoint_migration.field_definitions (
  export_id uuid not null references waypoint_migration.csv_exports(export_id),
  field_id text primary key check (field_id ~ '^fld[A-Za-z0-9]{14}$'),
  field_name text not null,
  field_index integer not null check (field_index >= 0),
  display_type text not null,
  options jsonb not null default '{}'::jsonb,
  unique(export_id,field_index),
  unique(export_id,field_name)
);
create table waypoint_migration.cell_values (
  export_id uuid not null,
  row_number integer not null,
  field_id text not null references waypoint_migration.field_definitions(field_id),
  value jsonb not null,
  primary key(export_id,row_number,field_id),
  foreign key(export_id,row_number) references waypoint_migration.csv_rows(export_id,row_number)
);
alter table waypoint_migration.original_record_ids enable row level security;
alter table waypoint_migration.field_definitions enable row level security;
alter table waypoint_migration.cell_values enable row level security;
revoke all on all tables in schema waypoint_migration from public,anon,authenticated;
