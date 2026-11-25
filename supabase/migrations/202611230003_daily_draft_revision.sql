begin;

-- A playlist editor reads its revision together with the daily selection.
-- Take the singleton lock first so concurrent editors acquire locks in the same order.
create function radio_private.lock_daily_selection() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform 1 from radio_private.station_settings where singleton for update;
  return null;
end $$;
create trigger lock_daily_selection before insert or update on radio_private.playlist_drafts
for each statement execute function radio_private.lock_daily_selection();

-- The save RPC already increments the edited playlist's revision. When the
-- selection moves to another playlist, invalidate open editors of the old one too.
create function radio_private.revise_previous_daily() returns trigger
language plpgsql set search_path = '' as $$
begin
  update radio_private.playlist_drafts set revision = revision + 1 where id = old.daily_draft_id;
  return null;
end $$;
create trigger revise_previous_daily after update of daily_draft_id on radio_private.station_settings
for each row when (old.daily_draft_id is not null and new.daily_draft_id is not null
                   and old.daily_draft_id <> new.daily_draft_id)
execute function radio_private.revise_previous_daily();

revoke all on function radio_private.lock_daily_selection(), radio_private.revise_previous_daily()
  from public, anon, authenticated;
commit;
