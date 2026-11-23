create or replace function public.waypoint_patch_record(
  p_id text,p_table_key text,p_patch jsonb,p_expected jsonb default null
) returns setof public.waypoint_records
language sql security invoker set search_path=''
as $$
  update public.waypoint_records r
  set fields=r.fields||p_patch,updated_at=now()
  where r.id=p_id and r.table_key=p_table_key
    and jsonb_typeof(p_patch)='object'
    and (p_expected is null or not exists (
      select 1 from jsonb_each(p_expected) e
      where coalesce(r.fields->e.key,'null'::jsonb) is distinct from e.value
    ))
  returning r.*;
$$;
revoke all on function public.waypoint_patch_record(text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.waypoint_patch_record(text,text,jsonb,jsonb) to service_role;

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

create or replace function public.waypoint_record_changed()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare
  definition jsonb;
  target text;
  targets jsonb;
  changes jsonb;
begin
  if tg_op='UPDATE' and old.fields is not distinct from new.fields then return new; end if;
  delete from public.waypoint_record_links where record_id=new.id;
  for definition in select jsonb_array_elements(field_definitions)
    from public.waypoint_tables where table_key=new.table_key
  loop
    if definition->>'type'='Link to another record' then
      targets=coalesce(nullif(new.fields->(definition->>'id'),'null'::jsonb),'[]'::jsonb);
      if jsonb_typeof(targets)<>'array' then raise exception 'Linked records must be an array'; end if;
      for target in select jsonb_array_elements_text(targets)
      loop
        if not exists (select 1 from public.waypoint_records
          where id=target and table_key=definition->'options'->>'linked_table') then
          raise exception 'Linked record does not exist in its declared table';
        end if;
        insert into public.waypoint_record_links(record_id,field_id,target_id)
          values(new.id,definition->>'id',target) on conflict do nothing;
      end loop;
    end if;
  end loop;
  if tg_op='INSERT' then
    changes=new.fields;
  else
    select coalesce(jsonb_object_agg(k,jsonb_build_object('before',old.fields->k,'after',new.fields->k)),'{}'::jsonb)
    into changes from (select jsonb_object_keys(old.fields||new.fields) as k) keys
    where old.fields->k is distinct from new.fields->k;
  end if;
  insert into public.waypoint_audit(record_id,table_key,operation,changed_fields)
    values(new.id,new.table_key,tg_op,changes);
  return new;
end;
$$;
revoke all on function public.waypoint_record_changed() from public,anon,authenticated;
create trigger waypoint_record_protection before update on public.waypoint_records
  for each row execute function public.waypoint_protect_record();
create trigger waypoint_record_history after insert or update on public.waypoint_records
  for each row execute function public.waypoint_record_changed();
