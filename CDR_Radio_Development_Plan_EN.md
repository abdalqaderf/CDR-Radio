# CDR Branch Radio — Development Plan
Version 1.1 | Updated: 2026-11-23 | Submission deadline: 2026-11-26
Status: READY TO START PHASE 0. No hosting account, live stream, integration, or device test has been verified.

## Execution brief
Build a working recruitment-assessment demo: one centrally managed radio stream, a polished Arabic admin dashboard, and a simple branch player. Use this English file as the implementation reference; keep the product Arabic and RTL. Do not load both language versions as competing instructions.

Read existing AGENTS.md files and inspect the repository first. Preserve existing work. The stack below assumes a new project; if an established project already exists, document any material incompatibility before replacing its architecture.

Non-negotiable requirements:
- Zero out-of-pocket cost and no payment card or payment method. Expiring hosting is acceptable if the expiry is disclosed.
- One actual central stream, not independent browser playlists or a fake LIVE interface.
- Admins upload permitted test audio, manage ordered playlists, and create dated special programs from our own dashboard through real integration.
- Admins enter every occasion name, date, time window, selection, and track order manually. No preloaded holidays, automatic national-mood detection, or implied annual recurrence.
- The server executes schedules even when all admin pages and development tools are closed.
- Branch volume, mute, and stop affect that device only. Content selection remains central.
- Document AI assistance and verify generated work. Never report an unperformed test as passed.

Core scope: streaming, admin login, branch player, media/playlist management, manual date-based programming, verification, and handover.
Optional: timed mute, staff feedback, device reporting, and immediate admin overrides.
Out of scope: native apps, payments, a custom audio-streaming engine, complex user roles, and AI features inside the product.

## Architecture and ownership

| Component | Choice |
| --- | --- |
| Frontend | React, TypeScript, Vite, Tailwind CSS; one icon library |
| Frontend hosting | Cloudflare Workers Static Assets, free plan, default service hostname |
| Application backend | Supabase Edge Functions, TypeScript |
| Authentication | Supabase Auth; one explicitly authorized administrator |
| Application data | Supabase Postgres with RLS |
| Audio, media library, actual playout | AzuraCast on separate hosting |
| First hosting candidate | Caliber Node Cloud Apps; conditional on Phase 0 verification |
| Testing | Focused unit/integration tests, browser checks, and real-device listening |

The browser receives audio directly from AzuraCast. Our backend authorizes admin operations and calls its API; it must not relay the continuous audio stream.
Supabase stores program drafts, publishing state, provider identifiers, settings, and audit records—not duplicate audio files.
Use stable compatible dependencies, a lockfile, and current official documentation. Do not introduce additional infrastructure without a concrete need.

Hosting facts versus assumptions:
- Research on 2026-11-23 found an advertised USD 5 signup credit and an AzuraCast-compatible plan starting at USD 4/month, with 2 vCPU, 2 GB RAM, and 30 GB disk.
- The provider used both Small and Essential labels. Verify actual resources and checkout total rather than relying on the label.
- Applying the credit, activation without a card, capacity, deployment compatibility, and runtime reliability remain UNVERIFIED.
- This is minimum-size demo hosting, not a production-capacity guarantee.
- Supabase must remain on its free plan; check available project capacity and document inactivity/usage limitations.
- Stop before any paid activation or payment-method requirement. Keep AzuraCast as the engine and investigate another eligible host if necessary.
- Do not return to a read-only API provider merely to make the dashboard look complete.

## Product surfaces

| Route | Purpose |
| --- | --- |
| /listen | Branch player: station name, optional demo branch label, Play, local Stop, Mute, supported volume control, connection state, current track, last update |
| /admin/login | Administrator sign-in |
| /admin | Real station status, current/upcoming information, local preview, clear navigation |
| /admin/media | Media library and ordered playlists |
| /admin/programs | Special-program drafts, preview, publish, edit, and cancel |
| /demo | Short evaluation instructions and a QR code generated from the real listening URL |

Design: Arabic RTL, light background, dark green primary color, restrained warm accent, readable type, generous spacing, responsive layouts, labeled icons, keyboard support, and explicit loading/error/empty states. Temporary product name: “راديو الفروع”. Do not invent official company branding.
Show real data. Label stale information; track metadata or a heartbeat is not proof of audible playback or synchronization.
Use Windows with Edge/Chrome as the primary target, Android/Chrome as an additional target, and iPhone/Safari for tested listening capabilities. Do not block iPhones by default or display nonfunctional volume controls.

## Data and integration contract

Minimum tables:
- programs: id, title, start/end timestamps, timezone, playback/end policies, publishing status, provider playlist ID, revision, last verification, timestamps.
- program_items: program ID, provider media ID, ordered position.
- station_settings: station identity, timezone, default playlist ID, essential display settings.
- audit_events: actor, action, entity, timestamp, outcome, correlation ID; redact secrets.

Program states: draft -> publishing -> scheduled; sync_failed on uncertain/failed publication. Mark cancelled only after confirming the provider-side effect. “Time window ended” is derived display information, not listening evidence.
The app owns the intended program/draft and its publishing state. AzuraCast owns actual media and execution.

Implement one AzuraCastAdapter for station information, now-playing data, media upload/listing, ordered playlists, scheduling, and enable/disable operations.
Confirm exact endpoint methods, payloads, permissions, and response semantics against the INSTALLED version. These capability names are not invented provider routes.
Write docs/PROVIDER_CONTRACT.md before full integration.

Publishing requirements:
1. Validate input, authorization, revision, and scheduling conflicts server-side; protect against concurrent publication.
2. Use a stable program/operation identifier to prevent duplicate playlists on double-clicks, retries, or lost responses.
3. Prefer creating a disabled provider playlist; save tracks, order, and schedule; read everything back; enable only after verification.
4. On uncertain outcomes, inspect provider state before retrying. If partial work fails, disable/revert the new effect where safe and report unresolved state.
5. Separate Save draft from Publish. A successful HTTP response alone is not successful publication.

Default demo upload policy: MP3, one file at a time, initially up to 5 MiB. Validate actual size, safe name/type, and successful provider processing. Confirm this size/path works within backend limits in Phase 0.
Keep provider and service-role/secret keys server-side. Only deliberately public configuration belongs in Vite variables.

## Scheduling rules
- A program uses an explicitly entered date and start/end time in Asia/Amman.
- “Whole day” means local midnight to the following local midnight.
- Support overnight windows with a correct next-day end date.
- Store UTC instants and retain the timezone; never use the admin device timezone or a hardcoded UTC offset.
- Use half-open intervals [start, end): adjacent programs are allowed; overlapping special programs are rejected, including concurrent requests.
- A special program overrides the daily playlist. Preserve explicit track order.
- Default: repeat the ordered list within the window. Play once is an explicit alternative.
- At the end, return to the daily playlist or stop, according to the saved policy.
- Default transition preference: finish the current track. Explain any resulting delay. Immediate interruption must be an explicit choice.
- Verify supported transition behavior, particularly for recitations; avoid unintended truncation or overlapping audio.
- Do not schedule from client-side timers or require a browser, laptop, or application API process to remain running.

## Phase map
All phases initially NOT_STARTED. Dates are planning targets, not promises.

| Phase | Deliverable | Dependency | Target |
| --- | --- | --- | --- |
| 0 | Free hosting + live provider capability proof | Account access | Nov 23 |
| 1 | Project scaffold, design foundations, progress log | Repository inspection | Nov 23 |
| 2 | Auth, data, secure backend, provider adapter | 0 + 1 | Nov 23–24 |
| 3 | Working branch player | 2 | Nov 24 |
| 4 | Admin dashboard, media, ordered playlists | 2 | Nov 24 |
| 5 | Manual occasion programming | 4 | Nov 24–25 |
| 6 | Reliability, security, real-device evidence | 3 + 5 | Nov 25 |
| 7 | Deployment, documentation, assessment handover | 6 | Nov 25–26 |
| 8 | Optional improvements | Core complete + time remains | Before submission |

### Phase 0 — Prove feasibility
- Verify the actual hosting credit, zero payable total, no payment method, resources, activation, expiry, renewal/cancellation, and API permissions.
- Verify the required Supabase free setup is available; keep account actions within the stated budget.
- Obtain the station URL/ID and an appropriately scoped API key through secure configuration.
- Upload two permitted test clips; create an ordered default playlist and obtain an HTTPS listening link.
- Through the real API, create/edit/read back a short dated program and verify that it runs and returns to default after the admin UI closes.
- Verify that the chosen backend can authenticate, reach the provider, and upload the test file.
- Request concise real-phone checks when a link exists; record them PENDING_MANUAL until actually performed.
Outputs: docs/FEASIBILITY.md, docs/PROVIDER_CONTRACT.md, a repeatable secret-safe verification script.
Gate: verified free activation, working audio, real media/playlist/schedule writes, and server-side schedule execution.
If blocked, record the exact missing account/access/condition and continue independent Phase 1 work. Explicit local fixtures may support UI development, but do not pass Phase 0 or count as a live demo.

### Phase 1 — Scaffold and design foundations
- Inspect and preserve the repository; configure stable dependencies, lockfile, types, linting, tests, and build.
- Create the RTL layout, design tokens, shared components, routes, and loading/error/empty states.
- Add safe configuration examples and ignore secret/local files.
- Start docs/PROGRESS.md and docs/AI_USAGE.md.
- Keep local fixture mode explicit and distinct from a real provider connection; never silently substitute fixtures in the submitted app.
Gate: successful build/type checks, responsive shell, and no embedded secrets.

### Phase 2 — Secure backend and persistence
- Provision the one administrator using managed Auth; authorize its verified user ID server-side.
- Add versioned database migrations and RLS; prevent unauthorized direct access.
- Separate authenticated admin functions from narrowly scoped public station information.
- Verify JWT signatures/claims using current supported Auth APIs—not decode-only checks.
- Implement the verified provider adapter, request validation, timeouts, safe errors, origin configuration, and conservative request limits.
- Test the real upload path and confirmed provider processing.
Gate: unauthorized/misprivileged mutations fail; admin operations succeed; data survives reloads; no server keys leak into frontend bundles or responses.

### Phase 3 — Branch player
- Join the real live stream; do not restart its playlist for each listener.
- Implement local play/stop/mute and supported volume control with visible state.
- Handle first-tap/autoplay rejection and iPhone volume limitations honestly.
- Rejoin the current broadcast after stopping/reconnecting; do not resume old buffered content intentionally.
- Use bounded reconnect attempts; prevent duplicate audio elements/connections.
- Refresh metadata at a modest interval and reduce unnecessary background requests; label stale updates.
Gate: two devices can listen to the same source; controls affect only their own device; reconnect behavior is observed. Real-device testing is distinct from browser emulation.

### Phase 4 — Dashboard, media, and playlists
- Build the dashboard with actual station information and a clearly local admin preview.
- List/search/upload media and surface processing errors.
- Create/edit playlists, add tracks, reorder, save, and verify the provider’s stored order.
- Configure a persistent daily fallback playlist.
- Confirm destructive actions that affect active content.
Gate: an admin uploads audio and saves an ordered playlist FROM OUR UI; reload and provider read-back confirm persistence. Opening the provider’s dashboard is not a substitute for these features.

### Phase 5 — Manual special programs
- Build name/date/window/timezone/ordered-track forms, draft saving, preview, publication, editing, and cancellation.
- Implement all scheduling rules and the verified publication state machine.
- Test arbitrary manually entered dates, local whole-day windows, overnight windows, adjacency, overlapping and concurrent publications, retries, and provider failures.
- Run a near-future short program using test material, close admin pages, observe start/end/return behavior.
Gate: a manually entered program executes centrally without a browser scheduler; the admin device clock/timezone does not determine execution.

### Phase 6 — Reliability and verification
Required evidence:
- Two actual different devices listen; a third broadens coverage. Late joiners receive the current broadcast.
- At least one hour of observed playback; document actual interruptions.
- Network interruption/recovery, local stop/restart, and mute behavior.
- Audible synchronization measurement using spoken counting or recognizable markers, not UI titles/timers.
- Initial engineering target: <=3 seconds relative difference in the measured test setup. This is NOT a requirement supplied by the company or a universal guarantee. Report actual results and address or disclose misses.
- Server-side timing, conflicts, concurrent writes, idempotency, failed publication, upload rejection, and unauthorized requests.
- Review deployed auth, frontend responses/bundles, and redacted logs for leaked secrets.
- Responsive and keyboard usability, readable Arabic, and understandable failure states.
Device matrix: Windows Edge/Chrome; Android Chrome; iPhone Safari. Test background/lock-screen behavior separately; do not promise it beforehand.
Output: docs/TEST_REPORT.md with actual commands, dates, environments, results, unresolved issues, and manual checks.
Gate: core automated checks pass; two real devices and measured audio/reconnect evidence exist. Third-device/background support may remain explicitly pending, never falsely supported.

### Phase 7 — Deploy and hand over
- Deploy frontend and backend on eligible free tiers; keep admin protected.
- Verify final links from another network, direct navigation/reload of internal routes, Auth return URLs, allowed origins, and operation after dev tools close.
- Build /demo and its QR code from the actual URL.
- Complete README.md, docs/ARCHITECTURE.md, docs/OPERATIONS.md, and docs/AI_USAGE.md.
- Prepare a short handover: links, appropriate admin-access procedure, central content-management instructions, challenges/solutions, measured limitations, and hosting expiry.
- Record a short demo if tooling permits; otherwise provide a presentation script and do not claim a recording exists.
- Export available station configuration/content and document cancellation before renewal.
Gate: trace every original assessment requirement to real evidence and submit-ready material by Nov 26. Prepare the submission; do not contact/send it to the company on the user’s behalf.

### Phase 8 — Optional, only after core completion
Priority: (1) staff feedback linked to track/time/demo branch; (2) timed mute with visible countdown and cancellation on changed user intent; (3) device heartbeat/reported playback; (4) immediate admin override with explicit expiry/return.
A heartbeat is not audible-output proof. Test timers after backgrounding and bound request/storage usage.
Gate: selected features work without regressions and documentation is updated. Mark this phase DEFERRED if time runs out.

## Working rules and handoff
- Track each phase as NOT_STARTED, IN_PROGRESS, BLOCKED, PENDING_MANUAL, or DONE. DEFERRED applies only to optional work.
- Missing credentials/manual results require a precise request, not fabricated completion. Continue independent work when possible.
- Follow the user’s requested scope: execute one phase if asked; otherwise continue core phases as gates pass without repetitive approval requests.
- Keep one code repository and one active execution plan. Preserve existing changes; do not publish a public repository or expose credentials.
- Write tests for real business/security/integration risks, not to inflate counts or mirror implementation details.
- Rerun relevant checks after changes; do not repeatedly rerun everything without a new reason.
- Use concise progress updates. After initial reading, focus on the current phase, its dependencies, and changed requirements instead of repeatedly printing the whole plan.
- Record real AI tools/prompts/verification as work proceeds; do not manufacture a retrospective transcript.
- Never treat API metadata, UI success, mocks, or emulation as evidence of actual audio behavior.
- Keep implementation detail in developer docs; product users see clear operational controls and messages.

Maintain:

| File | Content |
| --- | --- |
| docs/PROGRESS.md | Current phase, concise completion/evidence, blockers, next step |
| docs/FEASIBILITY.md | Hosting/payment/access/runtime findings |
| docs/PROVIDER_CONTRACT.md | Installed version, verified API operations/payloads/permissions |
| docs/TEST_REPORT.md | Actual checks and real-device matrix |
| docs/AI_USAGE.md | Tools, prompt excerpts, corrections, verification |
| docs/ARCHITECTURE.md | Audio/admin/data paths and hosting |
| docs/OPERATIONS.md | Setup, content changes, recovery, exports, expiry/cancellation |

## Official references
Verify changing offers and installed-version behavior at execution time.
- Hosting candidate/credit: https://calibernode.com/cloud-apps/azuracast
- Hosting resources: https://calibernode.com/cloud-apps
- Credit eligibility/billing: https://calibernode.com/docs/guides/account/billing/
- Provider API: https://www.azuracast.com/docs/developers/apis/
- Provider scheduling: https://www.azuracast.com/docs/user-guide/playlists/
- Provider requirements: https://www.azuracast.com/docs/getting-started/requirements/
- Frontend hosting: https://developers.cloudflare.com/workers/static-assets/
- Free Auth/database/functions: https://supabase.com/pricing
- Backend limits/auth: https://supabase.com/docs/guides/functions/limits and https://supabase.com/docs/guides/functions/auth
