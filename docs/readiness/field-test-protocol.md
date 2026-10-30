# Field acceptance and outage protocol

Use an isolated company, known tag manifest and authorised test operator. Never manufacture successful field results.

1. Count 100 known tags ten times with varied orientations and normal stock packing. Record expected, unique seen, unobserved and unexpected EPCs independently; repeated RF reads are not stock units.
2. Repeat with metal/liquid and tags in adjacent zones. Confirm antenna/location mappings against physical inspection. Record cross-read rates; strongest RSSI is not a reliable distance metric.
3. Deliver one fixed-reader batch twice, duplicate EPCs within a batch, reversed antenna strength, disabled/unknown hostname, antenna zero, malformed EPCs and late payloads. Compare accepted snapshots and event history. Exactly-once submission and stale-event suppression are not yet implemented.
4. Test Zebra native trigger press/release, retained locate reading and searching-before-sample. Test C75 wedge with Enter suffix and large bursts; native Chainway locationing is not available.
5. Disconnect internet before submit, during submit and after database response; restore it. Restart the APK/page with unsent reads. Current React-memory sessions are not durable across reload. Record failures rather than treating browser online/offline toggles as queue verification.
6. Run basic/admin/super-admin and two-company access tests using real signed-in users; try cross-company profile changes and administration. Do not use customer accounts for destructive tests.

Read-only browser check on 30 October: public page rendered, signed-in admin redirected to `/mfa`, browser offline/online state toggled correctly, no browser page errors. Admin action success could not be exercised without the user's authenticator code. No physical-device/outage-submission test has passed in this checklist.

Release acceptance must be agreed from the customer workflow and site requirements; no arbitrary detection-accuracy or sub-second-response guarantee is supplied here.