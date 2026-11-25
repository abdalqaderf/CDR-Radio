begin;

alter table radio_private.programs
  add column pending_action text check (pending_action in ('apply','cancel')),
  add column sync_lease_until timestamptz;

-- Serialize operations on the station. The Edge worker stops sending provider
-- requests before this lease expires. A lost response can be reconciled on retry.
create function public.radio_begin_program_sync(
  p_actor uuid, p_id uuid, p_revision integer, p_operation uuid, p_action text, p_doc jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  program radio_private.programs;
  w record;
  spec jsonb;
  ids text[];
  requested text := p_action;
  name text;
begin
  if not exists(select from radio_private.admin where user_id=p_actor) then
    raise insufficient_privilege using message = 'admin_required';
  end if;
  if p_operation is null or p_revision is null or p_action is null
    or p_action not in ('publish','edit','retry','cancel') then raise exception 'invalid_request'; end if;
  perform pg_advisory_xact_lock(161173, 12);
  select * into program from radio_private.programs where id=p_id for update;
  if not found or program.revision <> p_revision then raise exception 'revision_conflict'; end if;
  if exists(select from radio_private.programs where sync_lease_until > clock_timestamp())
    then raise exception 'sync_busy'; end if;

  if requested = 'retry' then
    if program.status not in ('publishing','sync_failed') or program.pending_action is null
      then raise exception 'revision_conflict'; end if;
    requested := program.pending_action;
  elsif requested = 'cancel' then
    if program.status not in ('scheduled','publishing','sync_failed')
      then raise exception 'revision_conflict'; end if;
  else
    if (requested = 'publish' and program.status <> 'draft')
      or (requested = 'edit' and program.status <> 'scheduled') then raise exception 'revision_conflict'; end if;
    if requested = 'edit' then
      if program.starts_at <= clock_timestamp() + interval '1 minute' then raise exception 'edit_window_started'; end if;
      name := btrim(p_doc->>'title');
      if coalesce(length(name),0) not between 1 and 150
        or jsonb_typeof(p_doc->'title') is distinct from 'string' then raise exception 'invalid_draft'; end if;
      ids := radio_private.track_ids(p_doc->'tracks');
      spec := p_doc->'window';
      select * into strict w from radio_private.program_window(spec);
      program.title := name;
      program.window_spec := jsonb_build_object('date',spec->>'date','wholeDay',spec->'wholeDay','start',spec->>'start','end',spec->>'end');
      program.starts_at := w.starts_at;
      program.ends_at := w.ends_at;
      program.playback := p_doc->>'playback';
      program.end_policy := p_doc->>'endPolicy';
      program.transition := p_doc->>'transition';
    end if;
    requested := 'apply';
  end if;

  if requested = 'apply' then
    -- During an unresolved edit the former window may still be armed.
    if exists(select from radio_private.programs where id<>p_id and pending_action is not null)
      then raise exception 'sync_busy'; end if;
    if program.starts_at <= clock_timestamp() + interval '1 minute' then raise exception 'window_too_soon'; end if;
    ids := coalesce(ids, array(select media_id from radio_private.program_items where program_id=p_id order by position));
    if cardinality(ids) < 2 or cardinality(ids) <> (select count(distinct media) from unnest(ids) as t(media))
      or exists(select from unnest(ids) as t(media) where media !~ '^[1-9][0-9]{0,14}$' or media in ('1350','1351'))
      then raise exception 'unsupported_tracks'; end if;
    if program.playback is distinct from 'repeat' or program.end_policy is distinct from 'daily'
      or program.transition is distinct from 'finish' or program.ends_at - program.starts_at >= interval '24 hours'
      then raise exception 'unsupported_policy'; end if;
  end if;

  update radio_private.programs set title=program.title, window_spec=program.window_spec,
    starts_at=program.starts_at, ends_at=program.ends_at, playback=program.playback,
    end_policy=program.end_policy, transition=program.transition,
    pending_action=requested, sync_lease_until=clock_timestamp() + interval '75 seconds',
    operation_id=p_operation, status='publishing', revision=revision+1, updated_at=now() where id=p_id;
  if p_action = 'edit' then
    delete from radio_private.program_items where program_id=p_id;
    insert into radio_private.program_items select p_id, pos, media from unnest(ids) with ordinality as t(media,pos);
  end if;
  insert into radio_private.audit_events(actor,action,entity_id,outcome) values(p_actor,p_action,p_id,'publishing');
  return jsonb_build_object('id',p_id,'action',requested,'startsAt',program.starts_at,'endsAt',program.ends_at,
    'tracks',ids,'playlistId',program.provider_playlist_id);
end $$;

create function public.radio_finish_program_sync(
  p_actor uuid, p_id uuid, p_operation uuid, p_outcome text, p_playlist text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare program radio_private.programs;
begin
  if not exists(select from radio_private.admin where user_id=p_actor) then
    raise insufficient_privilege using message = 'admin_required';
  end if;
  select * into program from radio_private.programs where id=p_id for update;
  if not found or p_operation is null or program.operation_id is distinct from p_operation
    or program.status <> 'publishing' or program.pending_action is null
    or program.sync_lease_until <= clock_timestamp() then raise exception 'revision_conflict'; end if;
  if p_outcome is null or p_outcome not in ('sync_failed','scheduled','cancelled')
    or (p_outcome='scheduled' and (program.pending_action<>'apply' or p_playlist is null))
    or (p_outcome='cancelled' and program.pending_action<>'cancel')
    or (p_playlist is not null and (p_playlist !~ '^[1-9][0-9]{0,14}$' or p_playlist='176'))
    or (program.provider_playlist_id is not null and p_playlist is distinct from program.provider_playlist_id)
    then raise exception 'invalid_outcome'; end if;
  update radio_private.programs set status=p_outcome,
    pending_action=case when p_outcome='sync_failed' then program.pending_action end,
    sync_lease_until=null, provider_playlist_id=coalesce(p_playlist,program.provider_playlist_id),
    last_verified_at=case when p_outcome='sync_failed' then program.last_verified_at else now() end,
    revision=revision+1,updated_at=now() where id=p_id returning * into program;
  insert into radio_private.audit_events(actor,action,entity_id,outcome) values(p_actor,'verify_provider',p_id,p_outcome);
  return jsonb_build_object('status',program.status,'revision',program.revision,
    'providerPlaylistId',program.provider_playlist_id,'verifiedAt',program.last_verified_at);
end $$;

create or replace function public.radio_workspace() returns jsonb
language plpgsql security definer stable set search_path = '' as $$
begin
  perform radio_private.require_admin();
  return jsonb_build_object(
    'dailyId',(select daily_draft_id from radio_private.station_settings where singleton),
    'playlists',coalesce((select jsonb_agg(to_jsonb(p) order by title,id) from radio_private.playlist_drafts p),'[]'),
    'programs',coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,'title',title,'window',window_spec,'startsAt',starts_at,'endsAt',ends_at,
      'playback',playback,'endPolicy',end_policy,'transition',transition,'status',status,'revision',revision,
      'providerPlaylistId',provider_playlist_id,'verifiedAt',last_verified_at,'pendingAction',pending_action,
      'tracks',(select jsonb_agg(media_id order by position) from radio_private.program_items where program_id=p.id)
    ) order by starts_at,id) from radio_private.programs p),'[]')
  );
end $$;

revoke all on function public.radio_begin_program_sync(uuid,uuid,integer,uuid,text,jsonb),
  public.radio_finish_program_sync(uuid,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.radio_begin_program_sync(uuid,uuid,integer,uuid,text,jsonb),
  public.radio_finish_program_sync(uuid,uuid,uuid,text,text) to service_role;
commit;
