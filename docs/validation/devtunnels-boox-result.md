# Dev Tunnels Sprint E — BOOX Hardware Validation Result

**Operator:** <!-- name or initials -->
**Date:** <!-- YYYY-MM-DD -->
**Device(s):** <!-- e.g. BOOX Air5C, BOOX TabXC -->
**Build SHA / APK name:** <!-- e.g. happy-release-1.2.3.apk -->

---

## Overall Verdict

<!-- Replace with: PASS | FAIL | PARTIAL -->
**PENDING — operator must complete all phases and record verdict here**

> If any FAIL item is deferred, it MUST also be filed in
> `.ralph/jobs/devtunnels-E-cleanup/notepad.md` with an explicit
> operator deferral decision.

---

## Phase 1 — Pairing + machine discovery

**Result:** <!-- PASS | FAIL | SKIPPED -->

Steps:
1. Pair BOOX over GitHub device flow.
2. Verify private tunnel admits the app (no `devtunnel access create --anonymous` needed).
3. Machine picker displays current machine.

Evidence:
- happy-server startup log excerpt (must show zero `--allow-anonymous` occurrences):
  ```
  <!-- paste excerpt here -->
  ```
- Pair-success evidence (screenshot path or operator note):
  <!-- e.g. "Screenshot saved to ~/screenshots/phase1-pair.png" -->
- Confirmation that `devtunnel access create --anonymous` was NOT invoked:
  <!-- e.g. "Verified — no anonymous access step used" -->

Notes:
<!-- optional per-phase notes -->

---

## Phase 2 — Session start + chat round-trip

**Result:** <!-- PASS | FAIL | SKIPPED -->

Steps:
1. Pick Codex model.
2. Type "list files"; receive response.
3. Type a follow-up; verify chat history is readable on e-ink.
   - Expected: user-message bands display with `userMessageBackground: #d4d4d4` (light grey).

Evidence:
<!-- screenshot path or operator note -->

Notes:
<!-- optional -->

---

## Phase 3 — Refresh-per-request durability

**Result:** <!-- PASS | FAIL | SKIPPED -->

Steps:
1. Let session idle for 2 minutes.
2. Send a message.
3. Confirm app re-mints a claim (`fresh claim` entries in `.happy/logs/*` or app console).

Evidence:
<!-- log snippet or operator note confirming re-mint -->

Notes:
<!-- optional -->

---

## Phase 4 — Token revocation drill

**Result:** <!-- PASS | FAIL | SKIPPED -->

Steps:
1. Revoke the `ghu_*` token via GitHub Settings → Developer Settings → Tokens.
2. Send a message from the app.
3. Confirm app surfaces "session expired" + re-pair button.
4. Re-pair; verify session resumes.

Evidence:
<!-- screenshot path or operator note -->

Notes:
<!-- optional -->

---

## Phase 5 — Multi-device fan-out

**Result:** <!-- PASS | FAIL | SKIPPED (SKIP if only one BOOX available — does not block cutover) -->

Steps (requires 2 BOOX devices):
1. Pair both devices.
2. Verify distinct `jti` per device in server logs.
3. Send from device 1; receive Socket.IO event on device 2.

Evidence:
<!-- log excerpt or operator note -->

Notes:
<!-- optional; if SKIPPED record "only one BOOX available" -->

---

## Phase 6 — APK / Metro release procedure

**Result:** <!-- PASS | FAIL | SKIPPED -->

Steps:
1. Run `pnpm release:android` (or `--no-distribute` for local-only).
2. Verify the signed APK builds against `com.evyatar109.happy`.
3. Install on a tablet; sanity-check behaviour matches phase 1.
4. (If Firebase App Distribution is configured) Verify upload triggers tablet notification.

### `apksigner verify --print-certs` output

```
<!-- Paste full output here.
     Example command:
       apksigner verify --print-certs path/to/happy-release.apk
     This proves the APK is signed with the production keystore. -->
```

Evidence:
<!-- additional operator notes -->

Notes:
<!-- optional -->

---

## Follow-up items (failures deferred by operator)

| Phase | Issue | Deferred to notepad.md entry | Operator decision |
|-------|-------|-------------------------------|-------------------|
| <!-- e.g. 5 --> | <!-- description --> | <!-- notepad entry title --> | <!-- e.g. "defer to post-E hotfix" --> |
