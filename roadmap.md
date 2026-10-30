# Roadmap
- [x] Per-company tag records
- [x] Admin two-step sign-in
- [x] Privacy policy page + contact consent line
- [x] Security scan, leaked-password check, 10-char passwords
- [x] Retention clean-up (nightly job), edit my details, Terms + DPA page
- [x] Download my data / delete my account / audit log (implemented; production audit identifies hardening needed)

## Commercial readiness — ten-item checklist
- [x] 1. Document supported RFID readers and tag types
- [x] 2. Map RFID scan flow to application and database
- [ ] 3. Automated checks pass; physical duplicate/missed/cross-read results require readers and operator
- [ ] 4. Audit and initial tenant hardening done; successful admin checks need user's aal2 session, remaining paths require review
- [x] 5. Hardware compatibility/testing matrix created; field results explicitly unverified
- [ ] 6. Snapshot-change logging and reconciliation implemented; raw-event timestamps/idempotency and atomic writes remain
- [ ] 7. Browser offline/reconnect tested; durable unsent-session queue and authenticated interruption test remain
- [x] 8. Isolated synthetic fixtures and sales demonstration script created; no live demo tenant seeded
- [ ] 9. Both domains verified, preview claims corrected; publish awaits explicit request
- [ ] 10. Subscriptions and onboarding — commercial prices and payment approval required
