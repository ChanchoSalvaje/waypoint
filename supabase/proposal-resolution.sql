-- Approved proposal resolution remains compare-and-swap protected and audited.
create or replace function public.waypoint_protect_record()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare
  definition jsonb;
  before_text text;
  after_text text;
begin
  if new.table_key is distinct from old.table_key or new.id is distinct from old.id then
    raise exception 'Record identity cannot be reassigned';
  end if;
  for definition in select jsonb_array_elements(field_definitions)
    from public.waypoint_tables where table_key=new.table_key
  loop
    if definition->>'name' in ('Notes','Change Log') then
      before_text=coalesce(old.fields->>(definition->>'id'),'');
      after_text=coalesce(new.fields->>(definition->>'id'),'');
      if left(after_text,length(before_text)) <> before_text then
        raise exception 'History fields are append-only';
      end if;
    end if;
  end loop;
  new.updated_at=now();
  return new;
end;
$$;
revoke all on function public.waypoint_protect_record() from public,anon,authenticated;

