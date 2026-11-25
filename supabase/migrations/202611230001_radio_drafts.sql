begin;

create schema radio_private;
revoke all on schema radio_private from public, anon, authenticated;

create table radio_private.admin (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id)
);
create table radio_private.playlist_drafts (
  id uuid primary key, title text not null, tracks text[] not null,
  revision integer not null default 1
);
create table radio_private.station_settings (
  singleton boolean primary key default true check (singleton),
  title text not null default 'راديو الفروع',
  timezone text not null default 'Asia/Amman' check (timezone = 'Asia/Amman'),
  daily_draft_id uuid references radio_private.playlist_drafts(id),
  default_provider_playlist_id text
);
insert into radio_private.station_settings default values;

create table radio_private.programs (
  id uuid primary key, title text not null, window_spec jsonb not null,
  starts_at timestamptz not null, ends_at timestamptz not null check (ends_at > starts_at),
  timezone text not null default 'Asia/Amman' check (timezone = 'Asia/Amman'),
  playback text not null check (playback in ('repeat','once')),
  end_policy text not null check (end_policy in ('daily','stop')),
  transition text not null check (transition in ('finish','interrupt')),
  status text not null default 'draft' check (status in ('draft','publishing','scheduled','sync_failed','cancelled')),
  revision integer not null default 1, operation_id uuid unique,
  provider_playlist_id text, last_verified_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  exclude using gist (tstzrange(starts_at, ends_at, '[)') with &&)
    where (status in ('publishing','scheduled','sync_failed'))
);
create table radio_private.program_items (
  program_id uuid not null references radio_private.programs(id) on delete cascade,
  position integer not null check (position >= 1), media_id text not null,
  primary key (program_id, position)
);
create table radio_private.audit_events (
  correlation_id uuid primary key default gen_random_uuid(),
  actor uuid not null, action text not null, entity_id uuid not null,
  outcome text not null, occurred_at timestamptz not null default now()
);

alter table radio_private.admin enable row level security;
alter table radio_private.playlist_drafts enable row level security;
alter table radio_private.station_settings enable row level security;
alter table radio_private.programs enable row level security;
alter table radio_private.program_items enable row level security;
alter table radio_private.audit_events enable row level security;
revoke all on all tables in schema radio_private from public, anon, authenticated;

create function radio_private.require_admin() returns uuid
language plpgsql stable set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if not exists (select from radio_private.admin where user_id = actor) then
    raise insufficient_privilege using message = 'admin_required';
  end if;
  return actor;
end $$;

create function radio_private.track_ids(items jsonb) returns text[]
language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(items) is distinct from 'array' then raise exception 'invalid_tracks'; end if;
  if jsonb_array_length(items) not between 1 and 250 or exists (
    select from jsonb_array_elements(items) t(v) where jsonb_typeof(v) <> 'string'
      or (v #>> '{}') !~ '^[A-Za-z0-9_:.~-]{1,160}$'
  ) then raise exception 'invalid_tracks'; end if;
  return array(select jsonb_array_elements_text(items));
end $$;

create function radio_private.program_window(spec jsonb)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql stable set search_path = '' as $$
declare
  day date; start_local timestamp; end_local timestamp; whole boolean;
begin
  if jsonb_typeof(spec->'wholeDay') is distinct from 'boolean'
    or coalesce(spec->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    then raise exception 'invalid_window'; end if;
  day := (spec->>'date')::date;
  whole := (spec->>'wholeDay')::boolean;
  if whole then start_local := day; end_local := day + 1;
  else
    if coalesce(spec->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or coalesce(spec->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or spec->>'start' = spec->>'end' then raise exception 'invalid_window'; end if;
    start_local := day + (spec->>'start')::time;
    end_local := day + (spec->>'end')::time;
    if end_local < start_local then end_local := end_local + interval '1 day'; end if;
  end if;
  starts_at := start_local at time zone 'Asia/Amman';
  ends_at := end_local at time zone 'Asia/Amman';
  if starts_at at time zone 'Asia/Amman' <> start_local or ends_at at time zone 'Asia/Amman' <> end_local
    then raise exception 'invalid_window'; end if;
  return next;
end $$;

create function public.radio_workspace() returns jsonb
language plpgsql security definer stable set search_path = '' as $$
begin
  perform radio_private.require_admin();
  return jsonb_build_object(
    'dailyId',(select daily_draft_id from radio_private.station_settings),
    'playlists',coalesce((select jsonb_agg(to_jsonb(p) order by title,id) from radio_private.playlist_drafts p),'[]'),
    'programs',coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,'title',title,'window',window_spec,'startsAt',starts_at,'endsAt',ends_at,
      'playback',playback,'endPolicy',end_policy,'transition',transition,'status',status,'revision',revision,
      'tracks',(select jsonb_agg(media_id order by position) from radio_private.program_items where program_id=p.id)
    ) order by starts_at,id) from radio_private.programs p),'[]')
  );
end $$;

create function public.radio_preview_window(p_window jsonb, p_id uuid) returns jsonb
language plpgsql security definer stable set search_path = '' as $$
declare w record;
begin
  perform radio_private.require_admin();
  select * into strict w from radio_private.program_window(p_window);
  return jsonb_build_object('startsAt',w.starts_at,'endsAt',w.ends_at,'conflicts',coalesce((
    select jsonb_agg(jsonb_build_object('title',title,'status',status) order by starts_at,id)
    from radio_private.programs where id is distinct from p_id and status <> 'cancelled'
      and starts_at < w.ends_at and w.starts_at < ends_at
  ),'[]'));
end $$;

create function public.radio_save_draft(p_kind text, p_id uuid, p_revision integer, p_doc jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := radio_private.require_admin(); name text := btrim(p_doc->>'title');
  ids text[]; next_revision integer; w record; spec jsonb; day_default boolean;
begin
  if p_id is null or p_revision is null or p_revision < 0 or coalesce(length(name),0) not between 1 and 150
    or jsonb_typeof(p_doc->'title') is distinct from 'string' then raise exception 'invalid_draft'; end if;
  ids := radio_private.track_ids(p_doc->'tracks');
  if p_kind = 'playlist' then
    if jsonb_typeof(p_doc->'daily') is distinct from 'boolean' then raise exception 'invalid_draft'; end if;
    day_default := (p_doc->>'daily')::boolean;
    if p_revision = 0 then
      insert into radio_private.playlist_drafts values(p_id,name,ids,1)
        on conflict do nothing returning revision into next_revision;
    else
      update radio_private.playlist_drafts set title=name, tracks=ids, revision=revision+1
        where id=p_id and revision=p_revision returning revision into next_revision;
    end if;
    if next_revision is not null then
      update radio_private.station_settings set daily_draft_id=case when day_default then p_id else null end
        where day_default or daily_draft_id=p_id;
    end if;
  elsif p_kind = 'program' then
    spec := p_doc->'window';
    select * into strict w from radio_private.program_window(spec);
    if coalesce(p_doc->>'playback','') not in ('repeat','once') or coalesce(p_doc->>'endPolicy','') not in ('daily','stop')
      or coalesce(p_doc->>'transition','') not in ('finish','interrupt') then raise exception 'invalid_draft'; end if;
    spec := jsonb_build_object('date',spec->>'date','wholeDay',spec->'wholeDay','start',spec->>'start','end',spec->>'end');
    if p_revision = 0 then
      insert into radio_private.programs(id,title,window_spec,starts_at,ends_at,playback,end_policy,transition)
        values(p_id,name,spec,w.starts_at,w.ends_at,p_doc->>'playback',p_doc->>'endPolicy',p_doc->>'transition')
        on conflict (id) do nothing returning revision into next_revision;
    else
      update radio_private.programs set title=name,window_spec=spec,starts_at=w.starts_at,ends_at=w.ends_at,
        playback=p_doc->>'playback',end_policy=p_doc->>'endPolicy',transition=p_doc->>'transition',
        revision=revision+1,updated_at=now() where id=p_id and status='draft' and revision=p_revision
        returning revision into next_revision;
    end if;
    if next_revision is not null then
      delete from radio_private.program_items where program_id=p_id;
      insert into radio_private.program_items select p_id, pos, media from unnest(ids) with ordinality as t(media,pos);
    end if;
  else raise exception 'invalid_draft'; end if;
  if next_revision is null then raise exception 'revision_conflict'; end if;
  insert into radio_private.audit_events(actor,action,entity_id,outcome) values(actor,'save_'||p_kind,p_id,'saved');
  return next_revision;
end $$;

create function public.radio_delete_program_draft(p_id uuid, p_revision integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare actor uuid := radio_private.require_admin();
begin
  delete from radio_private.programs where id=p_id and revision=p_revision and status='draft';
  if not found then raise exception 'revision_conflict'; end if;
  insert into radio_private.audit_events(actor,action,entity_id,outcome) values(actor,'delete_draft',p_id,'deleted');
  return true;
end $$;

revoke all on all functions in schema radio_private from public, anon, authenticated;
revoke all on function public.radio_workspace(), public.radio_preview_window(jsonb,uuid),
  public.radio_save_draft(text,uuid,integer,jsonb), public.radio_delete_program_draft(uuid,integer) from public, anon, authenticated;
grant execute on function public.radio_workspace(), public.radio_preview_window(jsonb,uuid),
  public.radio_save_draft(text,uuid,integer,jsonb), public.radio_delete_program_draft(uuid,integer) to authenticated;
commit;
