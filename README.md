# CDR-Radio
Centralized branch radio for غماس بلدي with an Arabic playlist editor, scheduled programs and a live audio player.

## Current state

The Arabic RTL app uses Cloudflare Workers Free. Managers sign in to **البث اليومي**, with **البرامج الخاصة** and **الصوتيات** alongside it. The daily editor shows the confirmed station order and the saved working copy. It can update the order of existing tracks when the configured daily target is active. Membership changes and fallback selection go through Quintastream. The shared **إضافة صوتيات** picker adds saved collections as ordered snapshots, individual files, or uploads. [Manager sign-in](https://cdr-branch-radio.abdalqaderfroukh1.workers.dev/admin/login) · [Branch player](https://cdr-branch-radio.abdalqaderfroukh1.workers.dev/listen) · [Readiness](docs/READINESS.md)

The Arabic submission brief includes the verified public links, listener instructions, central management, architecture, AI usage, test evidence, limitations and a three-minute demo script. [Assessment handover](docs/HANDOVER_AR.md) · [Submission index](output/submission/اقرأني.md)

The demo library includes licensed instrumentals, original spoken greetings and a separate recitation collection. [Permissions and program](docs/DEMO_AUDIO.md) · [Release screenshots](output/submission/screenshots/README.md) · [Rollback procedures](docs/OPERATIONS.md#scheduled-content-and-retention)

## Run locally

Use Node 22.13+ and npm. From the repository directory:

```sh
npm ci
npm run dev
```

Open `/listen`. The default dev server and production build show the disconnected state.

### Build and deploy the connected frontend

Configure the existing Supabase publishable key and the final public HTTPS origin as described in [operations](docs/OPERATIONS.md#deploy-the-frontend). Run `npm run build:hosted` for a connected SPA with a listener QR generated from that origin. The included Wrangler config targets Cloudflare Workers Static Assets. See [architecture](docs/ARCHITECTURE.md) for the frontend, Edge and radio connections.

### Try the local fixture

Run `npm run dev:fixture`, open the printed loopback URL at `/admin/login`, and select **فتح المعاينة المحلية**. The daily editor opens with two test clips. Use **إضافة صوتيات** to upload a test MP3, then reorder, save and reload. To prepare a program, open **البرامج الخاصة** and select **إنشاء برنامج خاص**. Sample clips are under **ملفات التحقق** in the category filter. **مشغّل الفرع** plays a six-second local marker. Station updates, publication and cancellation use the hosted admin. [Dashboard operations](docs/OPERATIONS.md#dashboard-publication-editing-and-cancellation)

The fixture uses a local preview session and a file-backed PGlite database in the ignored `.verification/radio-preview/` directory. Test uploads and drafts stay on this machine. Browser verification uses a separate in-memory database.

### Sign in to the hosted draft backend

For the **hosted** draft backend, run `npm run dev:hosted` and open `http://127.0.0.1:5173/admin/login`. The ignored `.env.supabase-hosted.local` supplies the project's browser publishable key in `RADIO_HOSTED_PUBLISHABLE_KEY`. The designated administrator signs in privately with their provisioned account. Use the credential store outside the repository.

### Run against a local Supabase stack

On a machine with the local Supabase stack, start it from this repository with `supabase start`. Use its **local** Studio to create one confirmed Auth user. In the local SQL editor, register that user's UUID with the following statement. The singleton constraint protects an existing administrator.

```sql
insert into radio_private.admin (user_id) values ('<local-auth-user-uuid>'::uuid);
```

Put the local project's public `sb_publishable_` key in `RADIO_LOCAL_PUBLISHABLE_KEY` in `.env.supabase-local.local`. Set `RADIO_WEB_ORIGIN=http://127.0.0.1:5173` in an ignored `.env.edge.local` and run `supabase functions serve --env-file .env.edge.local`. Start the UI with `npm run dev:supabase -- --port 5173 --strictPort` and open `http://127.0.0.1:5173/admin/login`. This mode targets the local gateway on port 54321. Drafts can contain manually entered station media IDs while library read-back is pending. The fixture and Supabase modes use separate databases and sign-in paths.

### Verification

Run `npm test`, `npm run lint`, `npm run build`, `npm run test:shell`, and `npm run test:fixture`. Browser checks use installed Chrome. The [test report](docs/TEST_REPORT.md) includes the native PostgreSQL concurrency check and its setup. Run `npm run verify:provider` for the read-only station preflight. The [installed contract](docs/PROVIDER_CONTRACT.md) records live writes, read-backs and schedule checks.
