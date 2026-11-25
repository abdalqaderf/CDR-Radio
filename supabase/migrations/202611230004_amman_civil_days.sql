begin;

-- During historical clock changes Amman sometimes skipped or repeated midnight.
-- The first instant belonging to the date is the boundary of a whole-day program.
create function radio_private.amman_day_start(day date) returns timestamptz
language sql stable set search_path = '' as $$
  select case when (from_yesterday at time zone 'Asia/Amman')::date = day
    then least(midnight, from_yesterday) else midnight end
  from (select day::timestamp at time zone 'Asia/Amman' as midnight,
    ((day - 1)::timestamp at time zone 'Asia/Amman') + interval '24 hours' as from_yesterday) bounds;
$$;
revoke all on function radio_private.amman_day_start(date) from public, anon, authenticated;

create or replace function radio_private.program_window(spec jsonb)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql stable set search_path = '' as $$
declare
  day date; start_local timestamp; end_local timestamp;
begin
  if jsonb_typeof(spec->'wholeDay') is distinct from 'boolean'
    or coalesce(spec->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    then raise exception 'invalid_window'; end if;
  day := (spec->>'date')::date;
  if (spec->>'wholeDay')::boolean then
    starts_at := radio_private.amman_day_start(day);
    ends_at := radio_private.amman_day_start(day + 1);
  else
    if coalesce(spec->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or coalesce(spec->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or spec->>'start' = spec->>'end' then raise exception 'invalid_window'; end if;
    start_local := day + (spec->>'start')::time;
    end_local := day + (spec->>'end')::time;
    if end_local < start_local then end_local := end_local + interval '1 day'; end if;
    starts_at := start_local at time zone 'Asia/Amman';
    ends_at := end_local at time zone 'Asia/Amman';
    if starts_at at time zone 'Asia/Amman' <> start_local or ends_at at time zone 'Asia/Amman' <> end_local
      then raise exception 'invalid_window'; end if;
  end if;
  return next;
end $$;

with bounds as (
  select p.id, w.starts_at, w.ends_at from radio_private.programs p
  cross join lateral radio_private.program_window(p.window_spec) w
  where p.status = 'draft' and p.window_spec->'wholeDay' = 'true'::jsonb
)
update radio_private.programs p set starts_at=b.starts_at, ends_at=b.ends_at,
  revision=p.revision+1, updated_at=now() from bounds b
where p.id=b.id and (p.starts_at,p.ends_at) is distinct from (b.starts_at,b.ends_at);
commit;
