begin;

-- An HTTP timeout does not prove that the provider stopped processing a write.
-- Preserve the reservation's grace period before a retry can create or cancel.
create function radio_private.retain_program_sync_lease() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.sync_lease_until := old.sync_lease_until;
  return new;
end $$;

create trigger retain_program_sync_lease before update of status on radio_private.programs
for each row when (old.status = 'publishing' and new.status = 'sync_failed')
execute function radio_private.retain_program_sync_lease();

revoke all on function radio_private.retain_program_sync_lease() from public, anon, authenticated;
commit;
