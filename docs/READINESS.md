# Assessment readiness

**The assessment demo and submission materials are ready to share with the limitations below. Full project acceptance remains open.** The assessment asks for a live link that evaluators can open on two or more devices, one centrally ordered broadcast, approximate synchronization, continuity during branch hours, central management, and an explanation of architecture, AI usage and challenges. The plan adds strict scheduling and a numerical synchronization target. [Original assessment](../CDR_Assessment.pdf) · [Development plan](../CDR_Radio_Development_Plan_EN.md) · [Arabic submission](HANDOVER_AR.md)

## Assessment evidence

| Original assessment requirement | Verified evidence and scope |
| --- | --- |
| A direct link evaluators can try on two or more devices | The public HTTPS listener, demo guide, sign-in page, QR and MP3 mount passed the final link check. Six routes and the listener QR passed the existing browser verification. The owner reported audible playback on Windows 11 and iPhone 11, and previously heard daily → special → daily on Windows and iOS. [Player](https://cdr-branch-radio.abdalqaderfroukh1.workers.dev/listen) · [Verification record](TEST_REPORT.md) |
| One centrally ordered stream | The branch player opens the same station 12 MP3 mount. Independent Chrome and Edge sessions joined the live program at different times and one continued when the other muted and stopped. The branded daily 188 is enabled, unscheduled and sequential. The prior list 176 is recoverable with its original order and matching backup hashes. [Architecture](ARCHITECTURE.md) · [Demo audio](DEMO_AUDIO.md) · [Verification record](TEST_REPORT.md) |
| Approximate synchronization | Playback sounded synchronized to the owner on Windows 11 and iPhone 11. Numerical skew is **unmeasured**. The owner declined the additional recording. The project target of ≤3 s remains unverified. [Verification record](TEST_REPORT.md) |
| Continuity without intervention at each branch | A public MP3 connection ran for 3,600.056 s with a 958 ms maximum intake gap and zero gaps of 3 s or longer. The full capture decoded twice. Evidence covers the recorded interval. [Capture record](TEST_REPORT.md#november-25--recovered-recording-and-release-verification) |
| Central content management | The authenticated app opens the daily editor, separates daily saves from station updates, and provides dedicated program and library screens. Program publication uses an Amman review and provider read-back. Earlier station tests verified two-track unattended playout and eventual fallback. Active-cancellation audio limitations are recorded below. [Operations](OPERATIONS.md) · [Dashboard evidence](TEST_REPORT.md#november-25--deployed-dashboard-lifecycle-on-station-12) |
| Cloud hosting, technical explanation, AI usage and challenges | The live app uses Cloudflare Workers Free and Supabase Free with the existing Quintastream service. The handover documents data flow, central operations, test findings, AI prompts and permitted test audio. [Arabic handover](HANDOVER_AR.md) · [Architecture](ARCHITECTURE.md) · [AI usage](AI_USAGE.md) |

## Remaining physical verification

One short physical check would close the material device gaps for the final release. Open the listener on the iPhone using cellular data, check the device-volume instruction and hardware buttons, then restore cellular connectivity after the audio runs out. Record time to audible recovery and whether Play was required while the Windows listener stayed on Wi-Fi. This remains **unperformed**. The disclosed submission can proceed. [Procedure](OPERATIONS.md#phone-test-and-two-device-verification)

Paired 60-minute listening and a full opening-to-closing run remain **unperformed**. The existing one-hour capture covers one public stream connection. Third-device, background and lock-screen behavior remain unverified.

All branches operate daily from 12:00 noon to 06:00 the following morning. Opening-hours scheduling and daily playlist resets are deferred. Managers enter special-program dates manually. Provider playlist 189 remains disabled and intact. The documented CC0 recitations are eligible under the same readiness, recording-rights and programme safeguards as other recordings; their live playout remains unverified. [Audio and operating-hours proposal](DEMO_AUDIO.md)

## Provider failures

| Project criterion | Observed result |
| --- | --- |
| Scheduled boundaries and finish-current policy | Two spoken handoffs arrived early in the original run. The no-fade retest preserved the spoken tails and started both handoffs after their saved boundaries. Extra tracks started after a saved close in multiple runs, including the no-fade retest. Strict start, an intact outgoing track and zero further special starts at close remain unresolved across queue states. |
| Exclusive repetition of one media identity | Both standard and merge let daily audio enter the special window. The criterion remains unmet. The demo requires at least two distinct eligible tracks for publication. |
| Audible behavior after active cancellation | Provider configuration was verified cleared. Two additional special tones started after the dashboard confirmed cancellation. Daily audio returned about 14 s after confirmation in that capture. Preventing additional starts after active cancellation remains unresolved. |

Provider DEBUG and Liquidsoap queue evidence remain pending. The station account receives HTTP 403 on the required queue, log and configuration endpoints. [Provider evidence](PROVIDER_CONTRACT.md#provider-trace-request) · [Support request](QUINTASTREAM_SUPPORT.md)

Live overnight and adjacent playout and recovery from a partial write inside Quintastream remain unverified. Local checks cover revisions, reservation and lost-provider-response reconciliation. Whole-day, play-once, immediate interrupt and end-of-period station stop remain draft-only. Daily saves prepare a working copy. A station operator applies membership or fallback changes in Quintastream. The hosted daily reorder check matched the existing order and skipped the write. A changed-order app write and subsequent playout on 188 remain unverified. [Operations](OPERATIONS.md) · [Verification record](TEST_REPORT.md#november-25--daily-editor-screenshot-investigation)

Daily playlist **188** is enabled and **176** is retained for recovery. Billing verification is resolved. Phase 8 is deferred. [Progress](PROGRESS.md)
