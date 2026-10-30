# Ten-item commercial readiness status

30 October 2026. Work proceeded in checklist order, with safe independent work on later items where physical verification was blocked. No item is treated as certified by source inspection alone.

| Step | Outcome | Remaining gate |
|---|---|---|
| 1 Reader/tag documentation | Complete: source-backed support sheet | Certification needs step 5 field results |
| 2 Scan data flow | Complete: fixed/handheld/database/alert paths mapped | Raw reader timestamps and replay semantics remain limitations |
| 3 Read quality | 20 automated parser/dedup/access/reconciliation/redaction checks pass; Stock Check now says Not seen | Physical missed/cross-read testing; permissive parser and SGTIN identity validation remain |
| 4 Auth/customer separation | Live policy audit repeated; membership edits blocked by trigger; role/profile/company administration scoped; reviewed server actions require tenant scope and aal2; signup uses exact case-insensitive name | Two-company signed-in regression and successful aal2 admin workflows require test accounts/current authenticator; remaining admin/server/RLS paths and function privileges need review |
| 5 Hardware matrix | Matrix and acceptance protocol created | Devices, firmware/APK versions, tags and site operator required |
| 6 Event/reconciliation | Tenant read-only scan-change history recorded by database trigger; History has Location changes view; reconciliation tested; credential headers/path/body redacted for future diagnostics | Raw observation ledger, reader timestamps, stale-event rejection, atomic counts/movements, trusted admin audit and idempotency still needed |
| 7 Outages | Browser offline/reconnect state tested; failure protocol documented | No durable session queue or interrupted-submit field verification; MFA prevented authenticated submission checks |
| 8 Demo | Synthetic fixtures and sales walkthrough created, isolated from customer data | Interactive demo workspace and live hardware walkthrough need secured test users/site |
| 9 Domain/product info | Both domains return 200; bare address redirects to www; preview claims corrected | Published site still has old exact-location claim; publication requires explicit approval |
| 10 Subscriptions/onboarding | Current signup company match tightened; company creation no longer implicit in user creation | Approved GBP prices, contract/trial/tax/support terms and payment connection required; no billing installed |

## Verification performed

- Latest automatic app checks passed after fixes; Vitest runs 20 tests across four files.
- Database catalogue confirms protect_profile_membership and record_scan_event triggers plus tenant-scoped policies.
- Browser: revised public heading visible; no page errors; signed-in account reached `/mfa`, not an unprotected admin screen. No MFA bypass attempted.
- Browser offline then online status verified; this does NOT prove unsent RFID reads survive a restart.
- Both production hostnames checked with HTTPS; new copy is preview-only.
- No real scans, user creation/deletion, reader-key rotation, retention job execution, or production publication was used as a test.

## Important rollout constraints

Database changes affect the shared Cloud backend immediately; frontend/server changes require publishing to reach the public app. Admins with aal1 can no longer manage roles/companies through changed policies. Global permissions and cross-company user/company actions are super-admin only. Normal own-profile name/email editing remains permitted; company membership uses the verified server action.

Reader shared-key fallback remains deliberately unretired to avoid silently disconnecting readers; its removal requires issuing/configuring per-company keys and a cutover. Old diagnostic logs may still contain exposed keys: future redaction does not erase those or replace credentials. The new history is snapshot-change history, not every raw RF observation, and uses existing application timestamps. Retention now checks failures, records company outcomes and applies scan periods to new history; the job was not run against real data here.

This is progress toward readiness, not a claim ScanLoc8 is ready for paying multi-company deployment. Open gates are tracked in roadmap.md.