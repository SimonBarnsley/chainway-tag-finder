# Roadmap
- [x] Per-company tag records
- [x] Admin two-step sign-in
- [x] Privacy policy page + contact consent line
- [x] Security scan, leaked-password check, 10-char passwords
- [x] Retention clean-up (nightly job), edit my details, Terms + DPA page
- [x] Download my data / delete my account / audit log (implemented; production audit identifies hardening needed)

## Commercial readiness — ten-item checklist
- [x] Current continuation: secured unprotected server actions, added persistent drafts, atomic retry-safe handheld submissions and trusted audit records
- [x] 1. Document supported RFID readers and tag types
- [x] 2. Map RFID scan flow to application and database
- [ ] 3. Automated checks pass; physical duplicate/missed/cross-read results require readers and operator
- [ ] 4. Audit and initial tenant hardening done; successful admin checks need user's aal2 session, remaining paths require review
- [x] 5. Hardware compatibility/testing matrix created; field results explicitly unverified
- [ ] 6. Trusted settings/rule/handheld logs and atomic retry-safe submissions implemented; fixed-reader raw-event timestamps/replay handling and isolated RPC tests remain
- [ ] 7. Draft recovery and explicit clear verified signed-in; native-device interruption/full-offline loading and submit retry field tests remain
- [x] 8. Isolated synthetic fixtures and sales demonstration script created; no live demo tenant seeded
- [ ] 9. Both domains verified, preview claims corrected; publish awaits explicit request
- [ ] 10. Subscriptions and onboarding — commercial prices and payment approval required
- [ ] Security follow-up: deep scan running; public customer media migration and dependency audit remain; real devices/test workspace required for remaining operational verification
