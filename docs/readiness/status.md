# Ten-item commercial readiness status

30 October 2026. Work proceeded in checklist order, with safe independent work on later items where physical verification was blocked. No item is treated as certified by source inspection alone.

| Step | Outcome | Remaining gate |
|---|---|---|
| 1 Reader/tag documentation | Complete: source-backed support sheet | Certification needs step 5 field results |
| 2 Scan data flow | Complete: fixed/handheld/database/alert paths mapped | Raw reader timestamps and replay semantics remain limitations |
| 3 Read quality | 31 automated checks pass, including draft isolation and safe retries; Stock Check says Not seen | Physical missed/cross-read testing; permissive parser and SGTIN identity validation remain |
| 4 Auth/customer separation | Live policy audit repeated; membership edits blocked by trigger; role/profile/company administration scoped; reviewed server actions require tenant scope and aal2; signup uses exact case-insensitive name | Two-company signed-in regression and successful aal2 admin workflows require test accounts/current authenticator; remaining admin/server/RLS paths and function privileges need review |
| 5 Hardware matrix | Matrix and acceptance protocol created | Devices, firmware/APK versions, tags and site operator required |
| 6 Event/reconciliation | Snapshot-change history, trusted settings/rule/handheld audit and atomic idempotent handheld submission implemented; movements validate current source inside transaction | Raw fixed-reader observation ledger, reader timestamps, stale-event rejection, end-to-end RPC tests and item-link transaction consistency remain |
| 7 Outages | Account/company/task/location-scoped local drafts with one-day expiry; browser scan input survived offline transition and reload; explicit clear verified; receipts support retry without double booking | Full offline app opening is not provided. Operator reselects location to recover location-specific drafts; real APK and interrupted-submit verification remain |
| 8 Demo | Synthetic fixtures and sales walkthrough created, isolated from customer data | Interactive demo workspace and live hardware walkthrough need secured test users/site |
| 9 Domain/product info | Both domains return 200; bare address redirects to www; preview claims corrected | Published site still has old exact-location claim; publication requires explicit approval |
| 10 Subscriptions/onboarding | Current signup company match tightened; company creation no longer implicit in user creation | Approved GBP prices, contract/trial/tax/support terms and payment connection required; no billing installed |

## Verification performed

- Latest automatic app checks passed after fixes; Vitest runs 31 tests across seven files.
- Database catalogue confirms protect_profile_membership and record_scan_event triggers plus tenant-scoped policies.
- Browser: revised public heading visible; no page errors; signed-in account reached `/mfa`, not an unprotected admin screen. No MFA bypass attempted.
- Authenticated Goods In complete-tag keyboard input survived offline transition and page reload, and explicit clear removed the draft. No scan was submitted to customer data. This is not native APK certification.
- Both production hostnames checked with HTTPS; new copy is preview-only.
- No real scans, user creation/deletion, reader-key rotation, retention job execution, or production publication was used as a test.

## Important rollout constraints

Database changes affect the shared Cloud backend immediately; frontend/server changes require publishing to reach the public app. Admins with aal1 can no longer manage roles/companies through changed policies. Global permissions and cross-company user/company actions are super-admin only. Normal own-profile name/email editing remains permitted; company membership uses the verified server action.

Reader shared-key fallback remains deliberately unretired to avoid silently disconnecting readers; its removal requires issuing/configuring per-company keys and a cutover. Old diagnostic logs may still contain exposed keys: future redaction does not erase those or replace credentials. The new history is snapshot-change history, not every raw RF observation, and uses existing application timestamps. Retention now checks failures, records company outcomes and applies scan periods to new history; the job was not run against real data here.

This is progress toward readiness, not a claim ScanLoc8 is ready for paying multi-company deployment. Open gates are tracked in roadmap.md.

## Continuation — 30 October, after 09:08 UTC

- Secured previously unauthenticated backfill; reader key access, global signup diagnostics and AI diagnostics now use tenant/super-admin guards and two-step checks.
- Ordinary single-scan and linking work now runs as the authenticated user under RLS; saved-tag validation and company-filtered item updates added.
- New tag/item and rule recipient validation triggers prevent new cross-company relationships. Settings/rule writes require verified company admins. Old rows were not rewritten.
- Database audit INSERT permission removed from authenticated clients. Public client reports are labelled `client.reported`, never trusted admin actions.
- Quick scan found public item images/floor plans; they remain public pending complete private-media migration, not silently disabled. Deep scan started against pre-continuation source and will report separately.
- Dependency scan could not read this project's bun.lockb format; dependency vulnerability status remains unverified.
- Paddle eligibility succeeded for software subscriptions. Payment setup/prices were not confirmed (questions skipped), so no provider was enabled and no prices were invented.
- New SQL RPC/receipt and validation trigger definitions were confirmed present through database metadata; successful live submission, source-conflict rollback and same-request replay still need an isolated test workspace.