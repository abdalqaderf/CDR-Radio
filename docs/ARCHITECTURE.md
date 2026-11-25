# CDR Radio architecture

## Broadcast and administration

The browser loads an Arabic React application from Cloudflare Workers Static Assets with SPA routing. Cloudflare serves HTML, CSS, JavaScript and the listener QR on Workers Free. The build points to the existing Supabase Free project and includes its publishable key and the public frontend origin.

- The branch player obtains the station name, audio URL and current metadata from the public Supabase `station` function. The browser connects directly to the provider's Icecast MP3 mount for audio. Stop, mute and reconnect affect that browser's audio element.
- Admin login uses Supabase Auth. `admin-drafts` validates the bearer with Auth, then passes the same identity to PostgREST. PostgreSQL checks the admin allowlist and enforces draft revisions and time-window rules. `admin-media` verifies the caller through PostgREST and sends uploads to AzuraCast using the Edge Function's private station credential.
- Mutable state lives in PostgreSQL. Drafts preserve the Amman civil date and UTC instants. A service-only reservation checks the verified admin, revision, overlap and station mutation lease. The Edge Function creates or reconciles the provider playlist by program UUID, verifies it while disabled, enables it and reads the resulting state back. A failed or uncertain mutation stays visible for reconciliation. Cancellation independently reads back disabled status, an empty schedule and no memberships before storing the receipt.
- AzuraCast manages media, ordered playlists, the upcoming queue and dated playout. Icecast distributes the stream. The provider owns execution once a schedule is enabled. Daily fallback uses playlist 176. Two-track tests showed exclusive special playout and eventual automatic fallback. They also showed extra special tracks at closing. Both one-track settings tested let daily audio into the special window.

The Edge Functions accept the configured development and deployment origins. Browser origin checks and bearer verification are separate controls. Provider and service credentials stay in server-side configuration. The public station response is limited to listener data. [Installed provider contract](PROVIDER_CONTRACT.md) · [Test evidence](TEST_REPORT.md)
