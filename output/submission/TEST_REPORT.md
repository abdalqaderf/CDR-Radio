# Verification summary · 25 November 2026

The final release is deployed. Cloudflare serves Worker `43fd7404-ba29-42ce-a9d1-a40d643a2932` at 100%. Supabase migration `202611250006` is applied, with `admin-drafts` v12, `admin-media` v13 and `station` v5 active.

## Final hosted verification

- All ten local and remote migration versions matched after applying the sole pending migration. Existing drafts, programs, program items, settings and admin membership matched the baseline. The new table copied two reusable drafts with matching titles and track order. RLS is enabled with no direct client table grants.
- The public HTML, QR, CSS and JS matched the verified build byte for byte. The public routes open. Admin sign-in, signed-out access protection, the configured CORS origin and rejection of an unrelated origin passed. A temporary non-admin received denials for hosted admin reads and collection writes and was removed. Anonymous direct collection writes were denied.
- Hosted Chrome checked daily binding, library and collections, selected insertion and an overnight Amman review at 1440 and 390 CSS px. The picker also fit 320 CSS px. These were browser viewport checks. [Screenshots](screenshots/README.md)
- In the deployed browser, a labeled collection saved and reloaded in its revised order. A whole copy became an unpublished program draft. A reverse-checked partial selection was appended to a daily working copy in saved collection order. The daily save and reload used the dedicated pointer and preserved the legacy selection. Renaming and reordering the collection left both saved snapshots unchanged. The labeled fixtures were removed and the hosted workspace and daily pointers matched their baseline. The station received only read requests.

## Local tests and simulated provider responses

- 27 Node tests passed. They cover authorization, revision and lease enforcement, Amman windows and overlap, upload and preview limits, player recovery, daily stale-order and membership safeguards, and program publication reconciliation. The simulated provider accepted eligible recitation and rejected recording-specific rights restrictions, protected daily media and unprocessed items. A simulated changed-order write was independently read back, including lost-response and unchanged-order cases.
- TypeScript, ESLint and the disconnected and connected Vite builds passed. Chrome 158 checked the shell at 360, 768 and 1440 CSS px. The isolated browser suite checked desktop pointer, touch and keyboard sorting, undo and restore, standalone upload-and-append with lost-response recovery, collection rename and saved order, whole and partial collection insertion in saved order, shared membership, saved-program snapshot independence after collection edit, stale collection and daily edits, direct daily binding across navigation and reload, overnight fields, program draft removal and player control/recovery. The fixture ran against an isolated database.

## Real-provider evidence

- Station reads before and after deployment found playlist 188 enabled with `[1381, 1382, 1383, 1384, 1385]`. Recovery 176 and recitation 189 remained disabled in orders `[1350, 1351]` and `[1386, 1387, 1388]`. All three are sequential and unscheduled. The MP3 mount returned audio bytes.
- Hosted media read-back showed all three recitations ready in the library with positive durations. Daily and recovery tracks were flagged as protected after adding the two missing documented playlist settings. Playlist 189 stayed disabled.
- An earlier deployed daily-order check returned already-current and wrote nothing. An actual changed-order operation on 188 and its audible result remain unperformed. Application supports order-only updates to the configured active daily target. Membership and fallback activation use the Quintastream dashboard.
- In a previous isolated hosted exercise, the dashboard scheduled a two-track program, changed its time and order, and independently read the revised provider configuration. A separate check rejected a live overlap. It verified removal of the future schedule and preserved daily audio through its former window. Overnight schedules were read back and cancelled before playout.

## Captured audio and physical devices

| Evidence | Observation |
| --- | --- |
| Existing one-hour public MP3 capture | 3,600.056 s on one connection, 958 ms maximum receive gap, zero gaps of 3 s or more, and full audio decode. |
| Earlier audio captures | Two-track program order and return to daily were confirmed with the management page closed. The first spoken test began about 10 seconds early. Removing fades preserved spoken tails and both starts in the follow-up came after the boundary, with one new special track still starting after the closing boundary. |
| Single recording | Daily tracks entered the window under both provider configurations tested with one recording identity. Publication requires at least two distinct eligible recordings. |
| Active cancellation | The provider confirmed disabled configuration with no schedule and no track memberships. Two further special tracks started, followed by daily about 14 seconds after confirmation in that capture. |
| Physical observations supplied by the owner | Windows 11 and iPhone 11 sounded synchronized. A separate Windows/iOS observation heard daily → special → daily. Numerical skew is unmeasured. Post-fix iPhone volume on a second network, audible recovery timing, paired hour and whole branch-hours listening remain unperformed. |

Configuration read-back establishes saved station state. Prior audio recordings and physical observations establish what played during their own intervals. No final-release listening session was started.
