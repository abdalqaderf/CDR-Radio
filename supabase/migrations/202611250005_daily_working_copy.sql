begin;

-- The legacy daily selection may point to a reusable list with unrelated audio.
-- Keep it available to old clients without using it to seed the new editor.
alter table radio_private.station_settings add column daily_editor_draft_id uuid
  references radio_private.playlist_drafts(id);

create or replace function public.radio_workspace() returns jsonb
language plpgsql security definer stable set search_path = '' as $$
begin
  perform radio_private.require_admin();
  return jsonb_build_object(
    'dailyId',(select daily_draft_id from radio_private.station_settings where singleton),
    'dailyEditorId',(select daily_editor_draft_id from radio_private.station_settings where singleton),
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

create or replace function public.radio_save_daily(p_id uuid, p_revision integer, p_doc jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare config radio_private.station_settings%rowtype; next_revision integer;
begin
  perform radio_private.require_admin();
  select * into config from radio_private.station_settings where singleton for update;
  if (p_revision = 0 and config.daily_editor_draft_id is not null) or
    (p_revision > 0 and config.daily_editor_draft_id is distinct from p_id) then raise exception 'revision_conflict'; end if;
  next_revision := public.radio_save_draft('playlist', p_id, p_revision,
    p_doc || jsonb_build_object('daily',coalesce(p_id = config.daily_draft_id,false)));
  if p_revision = 0 then
    update radio_private.station_settings set daily_editor_draft_id = p_id where singleton;
  end if;
  return next_revision;
end $$;

create or replace function public.radio_begin_daily_order(p_actor uuid, p_revision integer, p_id uuid, p_operation uuid)
returns text[] language plpgsql security definer set search_path = '' as $$
declare config radio_private.station_settings%rowtype; desired text[];
begin
  if not exists (select from radio_private.admin where user_id = p_actor) then raise insufficient_privilege; end if;
  select * into config from radio_private.station_settings where singleton for update;
  if config.daily_order_lease_until > clock_timestamp() then raise exception 'sync_busy'; end if;
  if config.daily_editor_draft_id is distinct from p_id then raise exception 'revision_conflict'; end if;
  select tracks into desired from radio_private.playlist_drafts where id = p_id and revision = p_revision;
  if desired is null then raise exception 'revision_conflict'; end if;
  update radio_private.station_settings set daily_order_operation = p_operation,
    daily_order_lease_until = clock_timestamp() + interval '45 seconds' where singleton;
  return desired;
end $$;
commit;
