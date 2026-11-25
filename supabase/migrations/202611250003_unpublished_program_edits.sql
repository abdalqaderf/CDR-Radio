begin;

alter table radio_private.programs add column unpublished_edit jsonb;

create function public.radio_save_program_edit(p_id uuid, p_revision integer, p_doc jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := radio_private.require_admin(); name text := btrim(p_doc->>'title');
  ids text[]; spec jsonb := p_doc->'window'; next_revision integer;
begin
  if coalesce(length(name),0) not between 1 and 150
    or jsonb_typeof(p_doc->'title') is distinct from 'string'
    or coalesce(p_doc->>'playback','') not in ('repeat','once')
    or coalesce(p_doc->>'endPolicy','') not in ('daily','stop')
    or coalesce(p_doc->>'transition','') not in ('finish','interrupt')
    then raise exception 'invalid_draft'; end if;
  ids := radio_private.track_ids(p_doc->'tracks');
  perform 1 from radio_private.program_window(spec);
  update radio_private.programs set
    unpublished_edit=jsonb_build_object('title',name,'tracks',ids,
      'window',jsonb_build_object('date',spec->>'date','wholeDay',spec->'wholeDay','start',spec->>'start','end',spec->>'end'),
      'playback',p_doc->>'playback','endPolicy',p_doc->>'endPolicy','transition',p_doc->>'transition'),
    revision=revision+1, updated_at=now()
    where id=p_id and revision=p_revision and status='scheduled' and pending_action is null
    returning revision into next_revision;
  if next_revision is null then raise exception 'revision_conflict'; end if;
  insert into radio_private.audit_events(actor,action,entity_id,outcome)
    values(actor,'save_program_edit',p_id,'saved');
  return next_revision;
end $$;

create function radio_private.clear_verified_program_edit() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.unpublished_edit := null;
  return new;
end $$;
create trigger clear_verified_program_edit before update of status on radio_private.programs
for each row when (old.status='publishing' and new.status in ('scheduled','cancelled'))
execute function radio_private.clear_verified_program_edit();

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
      'unpublishedEdit',unpublished_edit,
      'tracks',(select jsonb_agg(media_id order by position) from radio_private.program_items where program_id=p.id)
    ) order by starts_at,id) from radio_private.programs p),'[]')
  );
end $$;

revoke all on function radio_private.clear_verified_program_edit(), public.radio_save_program_edit(uuid,integer,jsonb)
  from public, anon, authenticated;
grant execute on function public.radio_save_program_edit(uuid,integer,jsonb) to authenticated;
commit;
