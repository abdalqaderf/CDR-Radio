# Phase 0 feasibility · updated 2026-11-24

**Quintastream has provisioned station 12.** On November 24 the station key authenticated, the existing Supabase project uploaded and verified both markers and the 5 MiB fixture, and AzuraCast stored the ordered daily playlist and dated takeover. See [installed operations](PROVIDER_CONTRACT.md) and [playout and boundary results](TEST_REPORT.md). Before the uploads, both radio services ran with zero playable tracks and the public status reported offline. Adding the daily fallback brought now-playing online.

**Provider billing resolved · user-confirmed November 24, 2026 (Asia/Amman).** The user confirmed that they verified all outstanding Quintastream billing details, including the free term and renewal/cancellation arrangements, and added no card or payment method. The earlier order confirmation showed CLP 0. The confirmation is the user's account-level evidence. Exact account dates and terms were kept in the account. The work uses the existing station and Supabase Free project. The Caliber Node quote was a historical alternative.

| Component | Public evidence inspected | Account check outstanding |
| --- | --- | --- |
| Caliber Node | AzuraCast is listed from USD 4 monthly on Small. The order form calls the same 2 vCPU, 2 GB RAM, 30 GB configuration Essential. An older indexed provider page advertised USD 5. Billing describes conditional promotional credit. [Catalog](https://calibernode.com/cloud-apps/azuracast) · [Order configuration](https://billing.calibernode.com/order/config/index/hosting/?group_id=6&pricing_id=12) · [Credit terms](https://calibernode.com/docs/guides/account/billing/) | Actual credit, zero total after tax, no method required or attached, term, renewal liability, capacity, active service and HTTPS station. |
| Supabase | The user checked the organization Billing page on November 23 and confirmed the Free plan and an empty payment-method list. The authenticated CLI matched the organization to the linked project. [Pricing](https://supabase.com/pricing) · [Runtime limits](https://supabase.com/docs/guides/functions/limits) | Real provider uploads and both sides of the 5 MiB boundary were verified on November 24. [Test report](TEST_REPORT.md) |
| Cloudflare | The existing Workers Free deployment serves static assets and SPA routes. Public route reloads, QR and player checks passed. [Static asset billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) | Verify the final URL from a second network for handover. |

AzuraCast lists 2 GB RAM, 20 GB disk and Docker as minimum requirements. A fallback host needs persistent media and externally reachable HTTPS audio. A free 192 MB VPS fails the memory requirement. No alternate host has passed account or runtime checks. [AzuraCast requirements](https://www.azuracast.com/docs/getting-started/requirements/) · [Fallback plan reviewed](https://vpsfree.io/)

**Exclusive two-track playout and eventual fallback verified.** The November 24 retest at 21:54 Amman showed 32 consecutive special markers on the public MP3 and in station history. Special audio began about two seconds after the start and daily returned about 14 seconds after the end. Standard and merge single-media tests both let daily audio into their windows. The extra tracks and repeat failures need AutoDJ decision evidence. The user's original listening was inconclusive because the beeps were hard to distinguish. [Test report](TEST_REPORT.md)

## Historical account and hosting checks · November 23

### Quintastream Comienza at order submission

This section records the state on November 23. The November 24 user confirmation above resolves the earlier account billing questions for the active station.

**Submitted order #886 · November 23, 2026 · processing.** The user manually submitted one Comienza plan outside the assistant session. The user reports that the checkout confirmation showed a total of CLP 0 and that Quintastream's email acknowledged receipt and processing. The confirmation screenshot described by the user contains no station credentials. Station activation, account-level payment-method status and API permissions remain unverified.

Earlier on November 23, the anonymous [cart](https://quintastream.quintacultura.cl/carrito/) and [checkout](https://quintastream.quintacultura.cl/finalizar-compra/) checks used product 458. Both routes returned HTTP 200. These guest checks preceded the user's manual order.

| Question | Observed evidence | Outstanding on November 23 |
| --- | --- | --- |
| Can someone in Jordan apply? | Checkout sets Jordan's billing-country flag to true. The store accepted country code JO on the populated guest cart and returned zero cart errors. The product describes community, school, church and entrepreneurial radio. [Product](https://quintastream.quintacultura.cl/producto/plan-comienza/) | Provider acceptance of this specific recruitment demo from Jordan. |
| Amount and payment method | The anonymous guest cart returned CLP 0 for one Comienza, with zero tax and fees and `needs_payment: false` for JO. The user subsequently reported a zero total on the confirmation for submitted order #886. [Radio offer](https://quintastream.quintacultura.cl/radio-online-chile/) · [WooCommerce cart semantics](https://developer.woocommerce.com/docs/apis/store-api/resources-endpoints/cart/) | Confirm the active station was provisioned without supplying or attaching a payment method. |
| Renewal and cancellation | The homepage gives November 30, 2026 as the six-month promotion cutoff, then advertises a 30-day trial. Comienza lists CLP 2,000/month including VAT from month seven and cancellation at any time. The FAQ says customers may decline continuation and the provider deletes the account, uploaded files and configuration on termination. [Offer dates](https://quintastream.quintacultura.cl/) · [Product](https://quintastream.quintacultura.cl/producto/plan-comienza/) · [FAQ](https://quintastream.quintacultura.cl/preguntas-frecuentes/) | Actual first bill date, automatic renewal or affirmative opt-in, and the cancellation channel and notice cutoff for this account. Export before termination. |
| API writes | Product includes AzuraCast and 1 GB of AutoDJ storage. The FAQ describes uploads, sequential playlists and scheduling. AzuraCast keys inherit the issuing user's permissions. [FAQ](https://quintastream.quintacultura.cl/preguntas-frecuentes/) · [API authentication](https://www.azuracast.com/docs/developers/apis/) | A dedicated station and key granting media upload, playlist membership/order and dated schedule writes. No station origin, ID or key was configured. No authenticated write was attempted. |

For live verification, configure the station origin, numeric station ID and a station-limited key in the ignored `.env.server.local`. Then run the [provider proof sequence](PROVIDER_CONTRACT.md), including upload through the backend, independent order/schedule read-back, audible playback and return to the daily playlist with the admin closed.

Hired Hosting's AzuraCast trial order page returned **Out of Stock**. [Trial order page](https://hiredhosting.com/account/index.php?rp=/store/azuracast/azuracast-free-trial)

## Caliber Node walkthrough

1. New customer: enter name, country, email and a unique password. Submit the account form and verify the email. Existing customer: sign in to the billing account and select **Open control panel**. Keep passwords and verification links private. [Register](https://billing.calibernode.com/order/signup/index/hosting/) · [Sign in](https://billing.calibernode.com/client/login/) · [Account guide](https://calibernode.com/docs/guides/account/create/)
2. In Billing, inspect the Cloud Apps promotional credit, its restrictions/expiry and saved payment methods. New money, top-ups, cards and wallets are outside this demo's budget. [Billing guide](https://calibernode.com/docs/guides/account/billing/)
3. Open Essential, choose **monthly**, and leave paid extras off. Proceed to **Review** and inspect the final checkout summary before submitting. Record the resources, term price, credit actually applied, tax, amount due today, renewal price/date and cancellation terms. Continue only with **USD 0.00 due**, no attached or required payment method, and a way to avoid future charges. An unclear field, paid balance, or payment-method request blocks activation. [Exact order form](https://billing.calibernode.com/order/config/index/hosting/?group_id=6&pricing_id=12)
4. A redacted quote establishes the offer. To verify activation, check the final confirmation again, place only an eligible zero-due order, then inspect **active subscription**, invoice covered entirely by promotional credit, empty payment-method list and exact term end. Record these separately from the quote. The documented **Cancel at term end** option ends the capacity subscription and deletes its apps then. Export before that date. [Cancellation guide](https://calibernode.com/docs/guides/account/cancellations/)
5. Within that active capacity, use **Open control panel**, choose AzuraCast, review the allocation/any extras and deploy only if fully covered. Use its HTTPS hostname to set up a dedicated demo station with AutoDJ and Asia/Amman timezone. Create a station-limited account with media and playlist/schedule management rights. Signed into that account, choose **My API Keys**. Keys inherit the issuing user's rights. Put the origin, numeric station ID and key in the ignored `.env.server.local` using `.env.example` as the template. [Deployment entry](https://portal.calibernode.com/apps/new) · [API authentication](https://www.azuracast.com/docs/developers/apis/)

## Supabase walkthrough

**User-confirmed organization billing, November 23, 2026 (Asia/Amman).** The user manually inspected Billing for **Abdalqader Froukh** and reported **Free Plan**, **“No payment methods”**, spend cap enabled, **$0.00** in credits, and no past invoices. In a separate identity check, authenticated CLI 2.122.1 returned organization ID and slug `xgqaxqppfymirnjibhay` for that name. Its project inventory returned the same organization ID for `krsnebibuqbldyirfzhi`, with `linked: true` and `ACTIVE_HEALTHY`. The repository link also contained that project ref. The billing values come from the user's observation.

1. Sign in. Select or create an organization on **Free**. In that organization's Billing page, verify **Free** and an empty payment-method list. Record the plan and payment-method status separately. A hidden billing panel requires someone with billing visibility. [Dashboard](https://supabase.com/dashboard) · [Billing](https://supabase.com/dashboard/org/_/billing) · [Organization billing model](https://supabase.com/docs/guides/platform/billing-on-supabase)
2. Select a dedicated existing project or choose **New project** in this Free organization. Name it `cdr-branch-radio`, save a generated database password in your password manager, and select an available nearby region. Create only when the Free slot is available without payment. If both slots are occupied, report the capacity blocker and preserve existing projects. [Create project](https://supabase.com/dashboard/new)
3. Wait for provisioning. Copy the non-secret project ref from the dashboard URL following `/project/`. From Windows PowerShell run the commands below. Complete the login in your browser and enter the verification code only in your terminal. Match the ref and organization in the list. CLI login grants access according to your Supabase account role. [CLI login](https://supabase.com/docs/reference/cli/supabase-login)

   ```powershell
   Set-Location 'C:\Users\abood\Desktop\CDR-Radio'
   npx.cmd --yes supabase@2 login
   npx.cmd --yes supabase@2 projects list
   ```

4. Share only the dedicated project ref and billing findings, or leave a redacted billing view for inspection. The CLI listing establishes access to the project. The organization dashboard establishes plan and payment-method status. Database passwords, API keys, CLI tokens and verification codes belong in local credential storage. Record account checks with the observer and date.

## Historical preflight · November 23

**Earlier November 23 preflight.** The authenticated organization listing returned identity fields only, and the station probe stopped on missing `AZURACAST_ORIGIN` before making a request. Work stayed local until the user supplied the organization billing evidence recorded above.

The November 24 [provider contract](PROVIDER_CONTRACT.md) and [test report](TEST_REPORT.md) supersede the earlier access and runtime status.
