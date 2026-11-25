begin;

create table radio_private.audio_collections (
  id uuid primary key,
  title text not null,
  tracks text[] not null,
  revision integer not null default 1
);
alter table radio_private.audio_collections enable row level security;
revoke all on radio_private.audio_collections from public, anon, authenticated;

-- Preserve reusable lists as independent library collections. The daily working
-- copy remains in the original table, and neither daily selection is changed.
insert into radio_private.audio_collections(id, title, tracks)
select id, title, array(
  select media from unnest(tracks) with ordinality as items(media, position)
  group by media order by min(position)
)
from radio_private.playlist_drafts
where id is distinct from (select daily_editor_draft_id from radio_private.station_settings where singleton);

create or replace function public.radio_workspace() returns jsonb
language plpgsql security definer stable set search_path = '' as $$
begin
  perform radio_private.require_admin();
  return jsonb_build_object(
    'dailyId',(select daily_draft_id from radio_private.station_settings where singleton),
    'dailyEditorId',(select daily_editor_draft_id from radio_private.station_settings where singleton),
    'playlists',coalesce((select jsonb_agg(to_jsonb(p) order by title,id) from radio_private.playlist_drafts p),'[]'),
    'collections',coalesce((select jsonb_agg(to_jsonb(c) order by title,id) from radio_private.audio_collections c),'[]'),
    'programs',coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,'title',title,'window',window_spec,'startsAt',starts_at,'endsAt',ends_at,
      'playback',playback,'endPolicy',end_policy,'transition',transition,'status',status,'revision',revision,
      'providerPlaylistId',provider_playlist_id,'verifiedAt',last_verified_at,'pendingAction',pending_action,
      'unpublishedEdit',unpublished_edit,
      'tracks',(select jsonb_agg(media_id order by position) from radio_private.program_items where program_id=p.id)
    ) order by starts_at,id) from radio_private.programs p),'[]')
  );
end $$;

create function public.radio_save_collection(p_id uuid, p_revision integer, p_doc jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := radio_private.require_admin();
  name text := btrim(p_doc->>'title');
  ids text[];
  next_revision integer;
begin
  if p_id is null or p_revision is null or p_revision < 0 or coalesce(length(name),0) not between 1 and 150
    or jsonb_typeof(p_doc->'title') is distinct from 'string' then raise exception 'invalid_draft'; end if;
  if p_doc->'tracks' = '[]'::jsonb then
    ids := array[]::text[];
  else
    ids := radio_private.track_ids(p_doc->'tracks');
    if cardinality(ids) <> (select count(distinct media) from unnest(ids) as t(media))
      then raise exception 'invalid_tracks'; end if;
  end if;
  if p_revision = 0 then
    insert into radio_private.audio_collections(id, title, tracks) values(p_id,name,ids)
      on conflict (id) do nothing returning revision into next_revision;
  else
    update radio_private.audio_collections set title=name, tracks=ids, revision=revision+1
      where id=p_id and revision=p_revision returning revision into next_revision;
  end if;
  if next_revision is null then raise exception 'revision_conflict'; end if;
  insert into radio_private.audit_events(actor,action,entity_id,outcome) values(actor,'save_collection',p_id,'saved');
  return next_revision;
end $$;

revoke all on function public.radio_save_collection(uuid,integer,jsonb) from public, anon, authenticated;
grant execute on function public.radio_save_collection(uuid,integer,jsonb) to authenticated;
commit;
