# CDR Radio operations

## Deploy the frontend

Use a Cloudflare Workers Free account and a stable `workers.dev` hostname for this project. The supplied Wrangler configuration publishes static assets and falls back to the app for browser navigation. The existing Supabase project supplies Auth and Edge Functions. [Cloudflare SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/) · [Static asset billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)

1. From the repository on Windows, use `npx.cmd wrangler@4.168.0 login` and approve Wrangler in the browser. Use `npx.cmd wrangler@4.168.0 whoami` to confirm the destination Workers Free account. Find its hostname in Workers & Pages under **Your subdomain**. Keep credentials in the browser or local credential store. Use the project's exact HTTPS origin as `RADIO_DEPLOYED_ORIGIN`, without a trailing slash. Keep `RADIO_HOSTED_PUBLISHABLE_KEY` in the ignored `.env.supabase-hosted.local`. [Wrangler OAuth](https://developers.cloudflare.com/workers/wrangler/commands/general/#login)
2. Run `npm run build:hosted`. Inspect `dist` for the production HTML, hashed assets and `listen-qr.svg`, and scan it against the configured provider key. Provision only the public origin in the Supabase `RADIO_DEPLOYED_ORIGIN` secret. Keep `RADIO_WEB_ORIGIN` for the existing development client. Set Supabase Auth's Site URL to the final hostname and limit redirect allowlist entries to the intended URLs. Preserve existing approved development entries.
3. Apply the repository migrations to the existing linked Supabase project before deploying the changed Edge Functions. With the final origin, verify station GET, authenticated function preflight, anonymous admin denial and rejection of an unrelated origin. Then deploy the static build with Wrangler 4.168.0 in the destination account.
4. Run `node scripts/check-public-player.mjs <origin>` for direct navigation and reload on six public routes, listener QR, signed-out route protection and live play/stop. In an isolated browser verify admin sign-in and logout. Test the link on a second physical device or network and report how it was tested. Keep assessment accounts and passwords out of public artifacts.

The Cloudflare Workers Free release supports the limited schedule workflow described below. [Public application](https://cdr-branch-radio.abdalqaderfroukh1.workers.dev/) · [Branch player](https://cdr-branch-radio.abdalqaderfroukh1.workers.dev/listen) · [Readiness checklist](READINESS.md)

## Dashboard publication, editing and cancellation

1. Sign in as the designated administrator. Save an ordered two-track or longer playlist draft, or add the tracks directly in **البرامج المجدولة**. Use separate, permitted media with distinct song identities. Daily playlist 176 and its media are protected.
2. Set a dated Amman window more than a minute in the future. Select ordered repeat, finish current track and return to daily. Preview overlaps, save, then select **نشر البرنامج**. Reload and check the scheduled status, provider playlist ID and last verification timestamp. Provider verification confirms the saved configuration. Listen and check history for playout.
3. For a future scheduled program more than a minute before its start, select **تحرير البرنامج المنشور**, adjust the date, time or track order, and save. Reload the program to confirm the edited state. The existing provider playlist is reused.
4. Select **إلغاء البرنامج في المحطة**, confirm, then reload. The app verifies that the provider object is disabled, has an empty schedule and no media members, and retains it as a cancellation receipt. In the active-cancellation test two more special tracks started after confirmation. Check actual audio and current daily playout separately. Use pre-start cancellation for the default walkthrough.
5. If verification is pending, reload and use **إعادة التحقق من المحطة** to reconcile the same provider object while the start is still more than a minute away. You can also cancel it. An uncertain provider write reserves the station for up to 75 seconds while the previous request settles. Keep the provider playlist ID and timestamp for investigation if the error persists. [Scheduling exceptions](PROVIDER_CONTRACT.md#provider-trace-request)

## Phone test and two-device verification

The owner reported that Windows 11 and iPhone 11 sounded synchronized and declined the extra recording. Numerical skew is **unmeasured**. The one-hour public-mount capture and earlier device observations already cover the reported sequence and transport interval. Use daily 176 as-is for the outstanding device spot check. [Public branch player](https://cdr-branch-radio.abdalqaderfroukh1.workers.dev/listen) · [Prior evidence](TEST_REPORT.md)

1. **Second network and iPhone volume.** Leave the Windows listener on Wi-Fi. On the iPhone, turn Wi-Fi off and open the public listener over cellular. Start playback, look for the device-volume instruction and use the hardware volume buttons. Record the visible control and audible result.
2. **Timed recovery.** Interrupt iPhone connectivity until its buffered audio runs out, then restore cellular. Record the time from restoration to audible playback, the player status, whether Play was needed, and whether Windows stayed audible.

If this check is performed, log the Amman time, browser versions, network types and results in the [test report](TEST_REPORT.md). Paired 60-minute playback, a full branch operating day, third-device coverage and background or lock-screen behavior remain unverified. The demo handover proceeds with these disclosed gaps.

## Scheduled content and retention

Keep daily playlist 176 available. Use a labeled dashboard program and separate media for schedule testing, then cancel it and verify cleanup. A November 24 backup of 176 and both markers is in the ignored `.verification/station-backup/daily-176/` directory. Keep credentials separate from backups. The owner confirmed the free term and renewal and cancellation arrangements. Before the confirmed cutoff in the provider account, retain the export and use the account's verified cancellation process if ending service. [Service record](FEASIBILITY.md)

For date-bound retests, save the exact provider schedule read-back and log a fresh clock sample on the recorder host before and after. Save both wall-clock UTC and monotonic chunk timing. Use distinguishable audio and save its full tail along with the provider's cue, feedback and queue events. The public history API includes a built-in estimate. Preserve all captured timestamps and compare them with their original semantics. [Station trace request](PROVIDER_CONTRACT.md#provider-trace-request)

## Assessment handover

- Open the demo guide and use its QR to launch the same branch player on a second device. Play on both, then stop and restart on one device while the other continues. [Demo guide](https://cdr-branch-radio.abdalqaderfroukh1.workers.dev/demo)
- For the admin walkthrough, have the designated administrator sign in privately. Show the media library, a permitted MP3, ordered drafts, an Amman program date, overlap preview and the saved state after reload. Use the dashboard workflow for a separate dated program when a live schedule demonstration is agreed. Show the verified provider ID and how to cancel. The default public walkthrough uses daily 176. [Admin sign-in](https://cdr-branch-radio.abdalqaderfroukh1.workers.dev/admin/login)
- Use the recorded runs to explain schedule-boundary failures, daily intrusion during single-track repeat and extra starts after active cancellation. Present the owner's Windows and iPhone listening observation and the unmeasured numerical skew. [Verification record](TEST_REPORT.md)

The Arabic assessment brief includes the committee-facing demo walkthrough and evidence links. [Assessment handover](HANDOVER_AR.md)
