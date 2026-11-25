begin;

-- These RPCs are reserved for a future trusted worker after it verifies the admin.
-- Browser roles cannot reserve a broadcast or attest a provider read-back.
create function public.radio_reserve_publication(p_actor uuid, p_id uuid, p_revision integer, p_operation uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare program radio_private.programs;
begin
  if not exists(select from radio_private.admin where user_id=p_actor) then raise insufficient_privilege; end if;
  if p_operation is null or p_revision is null then raise exception 'invalid_operation'; end if;
  select * into strict program from radio_private.programs where id=p_id for update;
  if program.operation_id = p_operation then return false; end if;
  if program.revision <> p_revision or program.status <> 'draft' then raise exception 'revision_conflict'; end if;
  if program.ends_at <= now() then raise exception 'window_ended'; end if;
  update radio_private.programs set operation_id=p_operation,status='publishing',revision=revision+1,updated_at=now() where id=p_id;
  insert into radio_private.audit_events(actor,action,entity_id,outcome) values(p_actor,'reserve_publication',p_id,'publishing');
  return true;
end $$;

create function public.radio_record_publication(p_actor uuid, p_id uuid, p_operation uuid, p_outcome text, p_playlist text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare program radio_private.programs;
begin
  if not exists(select from radio_private.admin where user_id=p_actor) then raise insufficient_privilege; end if;
  select * into strict program from radio_private.programs where id=p_id for update;
  if p_operation is null or program.operation_id is distinct from p_operation then raise exception 'invalid_operation'; end if;
  if p_outcome is null or p_outcome not in ('sync_failed','scheduled','cancelled') then raise exception 'invalid_outcome'; end if;
  if p_outcome in ('scheduled','cancelled') and coalesce(length(btrim(p_playlist)),0) not between 1 and 160
    then raise exception 'missing_provider_readback'; end if;
  if program.provider_playlist_id is not null and p_playlist is not null and program.provider_playlist_id <> p_playlist
    then raise exception 'provider_identity_mismatch'; end if;
  if program.status=p_outcome then return false; end if;
  if program.status not in ('publishing','sync_failed','scheduled')
    or (program.status='scheduled' and p_outcome='scheduled') then raise exception 'invalid_transition'; end if;
  update radio_private.programs set status=p_outcome,provider_playlist_id=coalesce(p_playlist,provider_playlist_id),
    last_verified_at=case when p_outcome in ('scheduled','cancelled') then now() else last_verified_at end,
    revision=revision+1,updated_at=now() where id=p_id;
  insert into radio_private.audit_events(actor,action,entity_id,outcome) values(p_actor,'record_publication',p_id,p_outcome);
  return true;
end $$;

revoke all on function public.radio_reserve_publication(uuid,uuid,integer,uuid),
  public.radio_record_publication(uuid,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.radio_reserve_publication(uuid,uuid,integer,uuid),
  public.radio_record_publication(uuid,uuid,uuid,text,text) to service_role;
commit;
