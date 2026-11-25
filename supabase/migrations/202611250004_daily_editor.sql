begin;

alter table radio_private.station_settings add column daily_order_operation uuid,
  add column daily_order_lease_until timestamptz;

create or replace function radio_private.lock_daily_selection() returns trigger
language plpgsql set search_path = '' as $$
declare lease timestamptz;
begin
  select daily_order_lease_until into lease from radio_private.station_settings where singleton for update;
  if lease > clock_timestamp() then raise exception 'sync_busy'; end if;
  return null;
end $$;

create function public.radio_save_daily(p_id uuid, p_revision integer, p_doc jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare selected uuid;
begin
  perform radio_private.require_admin();
  select daily_draft_id into selected from radio_private.station_settings where singleton for update;
  if (p_revision = 0 and selected is not null) or (p_revision > 0 and selected is distinct from p_id) then
    raise exception 'revision_conflict';
  end if;
  return public.radio_save_draft('playlist', p_id, p_revision, p_doc || '{"daily":true}'::jsonb);
end $$;

create function public.radio_begin_daily_order(p_actor uuid, p_revision integer, p_id uuid, p_operation uuid)
returns text[] language plpgsql security definer set search_path = '' as $$
declare config radio_private.station_settings%rowtype; desired text[];
begin
  if not exists (select from radio_private.admin where user_id = p_actor) then
    raise insufficient_privilege;
  end if;
  select * into config from radio_private.station_settings where singleton for update;
  if config.daily_order_lease_until > clock_timestamp() then raise exception 'sync_busy'; end if;
  if config.daily_draft_id is distinct from p_id then raise exception 'revision_conflict'; end if;
  select tracks into desired from radio_private.playlist_drafts where id = p_id and revision = p_revision;
  if desired is null then raise exception 'revision_conflict'; end if;
  update radio_private.station_settings set daily_order_operation = p_operation,
    daily_order_lease_until = clock_timestamp() + interval '45 seconds' where singleton;
  return desired;
end $$;

create function public.radio_finish_daily_order(p_operation uuid, p_actor uuid, p_id uuid, p_outcome text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update radio_private.station_settings set daily_order_operation = null, daily_order_lease_until = null
    where singleton and daily_order_operation = p_operation;
  if found then
    insert into radio_private.audit_events(actor,action,entity_id,outcome)
      values(p_actor,'daily_order',p_id,p_outcome);
  end if;
end $$;

revoke all on function public.radio_save_daily(uuid,integer,jsonb),
  public.radio_begin_daily_order(uuid,integer,uuid,uuid), public.radio_finish_daily_order(uuid,uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.radio_save_daily(uuid,integer,jsonb) to authenticated;
grant execute on function public.radio_begin_daily_order(uuid,integer,uuid,uuid),
  public.radio_finish_daily_order(uuid,uuid,uuid,text) to service_role;
commit;
