# Tunnel Transport Investigation: Provider-Agnostic, Possibly Bearer-Free

**Status:** superseded by `docs/research/tunnel-transport-recommendation.md`
**Created:** 2026-05-08
**Owner:** TBD (assignee fills in)
**Worktree:** main repo (`C:\harness-efforts\codexu`); this is a research deliverable, not a code change. The assignee should branch off `main` only if writing example code.

---

## The Question

**Transport is decided: Microsoft Dev Tunnels with Entra identity.** Cloudflare, Tailscale, ngrok, and other providers are out of scope — the operator is Entra-based and the tunnel must be Dev Tunnels.

The remaining open question is:

**Do we even need bearer tokens at the application layer?** Once Dev Tunnels is open (Entra-gated), it is a TCP/HTTP pipe between two endpoints. Why does Happy need a third-party-issued bearer on top of that? Can we pass data through the tunnel using only a pairing-time secret (or no shared secret at all if the tunnel ACL is the only gate)?

This investigation should produce a written recommendation that lets the team decide the **application-layer auth shape** — bearer vs pairing-secret-only — on top of Dev Tunnels + Entra as the fixed transport.

---

## Why This Matters

Transport is **decided**: Microsoft Dev Tunnels with Entra identity. The operator (`evmitran@microsoft.com`) is Entra-based; `devtunnel user login --entra` is already complete.

The remaining question is the **application-layer auth design on top of that tunnel**. Two options:

- **Path (b) — service principal bearer:** happy-server holds a Microsoft service principal and mints tunnel tokens for all users. App layer still exchanges bearer tokens.
- **Path (c) — bearer-free pairing secret:** tunnel ACL (Entra) is the only transport gate. App layer uses only the QR pairing secret. No third-party bearer at all above the tunnel.

This investigation determines which application-layer design is safer, simpler, and more maintainable — **given that Dev Tunnels + Entra is the fixed transport**.

---

## Background — Read First

The assignee should read these files before drafting recommendations. Paths are relative to repo root unless noted.

### Current architecture (relay-based, not tunnel-based)

- `docs/plans/github-auth-via-vscode-tunnels.md` — the parent plan that the Phase 0 spike feeds into. Read in full.
- `packages/happy-server/sources/app/api/socket.ts:83-87` — current Socket.IO `handshake.auth.token` contract that defines how an end-user bearer reaches the relay today.
- `docs/protocol.md` — current Happy wire protocol (relay between CLI and mobile).
- `docs/happy-wire.md` — wire format details.
- `docs/realtime-sync-and-rpc.md` — current realtime channel design.
- `docs/session-protocol.md` and `docs/session-protocol-claude.md` — session protocol.
- `docs/encryption.md` — end-to-end encryption layer (relevant: if E2E is already in place, the tunnel does not need to be secret-bearing; it is pure transport).
- `docs/user-identity.md` — current identity model on happy-server.

### Pairing flow

- Search the codebase for "pairing", "pair-code", "qr", and "session-secret" patterns (likely in `packages/happy-cli/` and `packages/happy-mobile/`). The pairing flow already exchanges a session secret out-of-band (QR code on the desktop, scanned by the mobile). This is the **key prior art** for a bearer-free design.

### Phase 0 spike artifacts (the work-in-progress this investigation feeds back into)

- `.ralph/jobs/phase-0-devtunnel-auth-spike/plan.md` — full plan for the current Dev Tunnels-only spike.
- `.ralph/jobs/phase-0-devtunnel-auth-spike/stories-outline.md` — 5-story decomposition.
- `.ralph/jobs/phase-0-devtunnel-auth-spike/research-brief.md` — Codex+Copilot research from the planning phase.
- `.ralph/jobs/phase-0-devtunnel-auth-spike/codex-research.txt` and `copilot-research.txt` — raw research outputs.
- `.ralph/jobs/phase-0-devtunnel-auth-spike/notepad.md` — running notes; the iteration agent flagged that the local `devtunnel` CLI is logged in as Microsoft/Entra, which blocked path-(a) testing. The iteration is paused on this block at the time of writing.

### Adjacent docs that may inform tradeoffs

- `docs/3dparty.md` — current third-party dependencies (informs "do we want to add another?" pressure).
- `docs/deployment.md` — how Happy is deployed today (informs whether a self-hosted relay is realistic).
- `docs/backend-architecture.md` — server-side architecture.
- `docs/dev-environments.md` — environments and how they pair with the CLI today.
- `docs/multi-process.md` — multi-process model on the CLI side.

---

## Research Questions

Each must be answered with a concrete yes/no or short-prose conclusion plus the evidence that grounds it.

### Q1 — Dev Tunnels + Entra: access model

**Transport is fixed: Microsoft Dev Tunnels with Entra identity.** Document:

1. How Dev Tunnels Entra ACL works — what does `devtunnel user login --entra` give the operator? Can the tunnel be restricted to specific Entra tenants/users, or is it open to all Entra accounts?
2. What does the connecting mobile/web client need to present to the tunnel? (Dev Tunnels access token, anonymous, or Entra token from the client side?)
3. Does `--allow-anonymous` change the security posture in a way that is acceptable given Happy's E2E encryption layer?
4. What is the operator UX? (Does the CLI operator need to keep a logged-in devtunnel session? What happens on token expiry?)
5. Can the tunnel URL be kept secret (unlisted), or is it discoverable?

This replaces the 10-candidate comparison matrix. Only Dev Tunnels rows are needed in the deliverable.

### Q2 — Is the bearer token actually load-bearing?

Trace today's bearer end-to-end:

1. Where does the bearer originate? (GitHub OAuth? Happy login flow? Pairing handshake?)
2. What does happy-server do with it? (Identify the user? Authorize a session? Rate-limit?)
3. What does the mobile/CLI do with it on disk? (Long-lived storage? Refresh flow?)
4. **What breaks if it is removed?** Specifically: if the CLI emits a session-scoped pairing secret over QR, and the mobile presents that secret on connection, what user-facing or security capability is lost?

Be specific. The answer must reference the actual code paths in `packages/happy-server/`, `packages/happy-cli/`, and the mobile package, not abstract reasoning.

### Q3 — Pairing-token-only design (the user's hypothesis)

Design a candidate **bearer-free** architecture and stress-test it:

- CLI starts, opens a tunnel (any candidate from Q1), generates a fresh per-session secret, displays a QR encoding `{tunnelURL, pairingSecret, ttl}`.
- Mobile scans QR, connects to `tunnelURL`, presents `pairingSecret` in the Socket.IO handshake (or in the WebSocket `Sec-WebSocket-Protocol` subprotocol — RN-compatible).
- happy-server (if still in the loop) does **not** issue or validate any third-party bearer; the pairing secret is the only credential.
- Tunnel stays open for the session lifetime; secret is single-use or short-TTL.

Answer:

- Does this work end-to-end? Where does it fail?
- What is the threat model? (Tunnel URL leak, network observer on the mobile side, compromised mobile device, replay after pairing, etc.)
- Can it coexist with Happy's existing E2E encryption layer (`docs/encryption.md`) such that the tunnel really is a dumb pipe?
- What changes are required in `packages/happy-server/sources/app/api/socket.ts` and the mobile/CLI session-establishment code? (Sketch, not implementation.)
- What's the rollback story if pairing is botched (lost QR, expired secret, mobile re-installed)?

### Q4 — SKIPPED (private overlay not in scope)

Transport is fixed as Dev Tunnels public tunnel. Private overlays (Tailscale, ZeroTier, WireGuard) are out of scope per operator constraint.

### Q5 — SKIPPED (hybrid architectures not in scope)

Single transport (Dev Tunnels + Entra) is decided. No hybrid needed.

### Q6 — Compliance and legal

Especially for enterprise:

- Cloudflare/ngrok/Tailscale/Microsoft each have different data-residency and SOC-2 stories. Tabulate.
- Self-hosted relay is the only option that puts data flow entirely under the customer's control. Is that worth offering as a tier?

---

## Threat Model — Required For Any Bearer-Free Recommendation

Any answer to Q3 must be checked against this list. The deliverable should explicitly state how the proposed design defeats or accepts each threat.

1. **Tunnel URL leak.** The QR code, system clipboard, screen recording, or shoulder-surfer captures the tunnel URL. With no auth, attacker connects directly.
2. **Pairing secret leak.** Same channels; attacker knows both URL and secret before legitimate mobile pairs.
3. **MITM on the mobile side.** Public WiFi, hostile DNS, malicious VPN. (Mitigated by HTTPS to the tunnel provider's edge in most candidates.)
4. **Replay after pairing.** Legitimate session ends; attacker replays the secret to re-pair.
5. **Tunnel-host impersonation.** Attacker stands up a tunnel with the same URL pattern and tricks the mobile into connecting.
6. **CLI-side compromise.** Attacker has shell on the CLI machine. Game over for that session, but does any secret leak across sessions?
7. **Server-side compromise.** Attacker owns happy-server. What is the blast radius if happy-server holds no per-user bearer?
8. **Provider compromise.** Attacker compromises the tunnel provider (Cloudflare, ngrok, Microsoft). What can they see? (E2E encryption per `docs/encryption.md` should make this a non-event for Happy session content; verify.)
9. **Long-lived secret stored on mobile.** What is the worst case if the mobile is stolen and unlocked?
10. **Auditability.** If a user reports unauthorized access, what evidence exists to investigate? Bearer flows leave provider audit logs; pairing-secret flows leave only happy-server logs.

---

## Deliverable

The assignee produces **one** of the following two artifacts, located at `docs/research/tunnel-transport-recommendation.md`:

### Option A — Single recommendation

If research clearly favors one architecture, produce:

1. **TL;DR** (3 lines, what to build).
2. **Comparison matrix** (Q1, all candidates, ~10 columns).
3. **Recommended architecture** (one pick), with sequence diagrams for: pair, connect, reconnect, revoke.
4. **Threat-model table** (10 rows from above, mitigation per row).
5. **Migration plan from current relay**: which files change, what stays, rough effort estimate.
6. **Effect on Phase 0 spike**: does the Phase 0 Dev Tunnels spike still need to run? Is it superseded? Or does it remain useful as a fallback validation?
7. **Open questions** the recommendation could not close.

### Option B — Decision matrix (when no clear winner)

If two or three architectures are viable for different deployment tiers (cloud SaaS, enterprise self-hosted, fully private), produce:

1. **TL;DR**.
2. **Comparison matrix** (same as A.2).
3. **Decision flowchart**: which architecture for which customer profile.
4. **Common abstraction**: the transport interface that Happy code should use so all viable architectures are pluggable.
5. **Threat-model table** per architecture.
6. **Phase 0 spike disposition** (run / supersede / repurpose).
7. **Recommended next spike** (if any) to settle the remaining unknowns.

The deliverable is a **document only**. No code changes. If the assignee wants to validate a candidate transport in practice, that becomes a follow-up spike (in the style of `.ralph/jobs/phase-0-devtunnel-auth-spike/`), not part of this investigation.

---

## Out of Scope

- End-to-end encryption design — covered by `docs/encryption.md`. Treat E2E as a fixed assumption (it is already in place).
- The mobile app's own login flow (how the mobile authenticates to happy-server *if* happy-server is still in the loop). That is a separate identity question; this investigation is about the **transport** between CLI and mobile.
- Concrete implementation of any chosen architecture. Implementation is a follow-up.
- Pricing negotiation with tunnel vendors. Document list prices; the team will negotiate later.

---

## Constraints The Recommendation Must Respect

1. **React Native compatibility.** The mobile uses RN's WebSocket implementation, which does **not** support arbitrary headers. Auth must travel via URL query, `Sec-WebSocket-Protocol` subprotocol, or Socket.IO `handshake.auth` payload (which is sent in the upgrade body).
2. **No `--allow-anonymous` on Dev Tunnels** if Dev Tunnels is one of the candidates. The Phase 0 plan already bans this; the same hygiene applies anywhere — never an open public endpoint without some form of access gate.
3. **Defense in depth.** Even if the recommendation is bearer-free, transport security (HTTPS to the provider, E2E inside the tunnel) is non-negotiable.
4. **No new third-party identity dependency** unless its absence makes a feature impossible. Adding a generic IdP just to mint short-lived tokens that go straight back to Happy is worse than no IdP at all.
5. **The Phase 0 spike block must be respected.** The current Phase 0 work is paused waiting on operator action (`devtunnel user login --github`). This investigation should not require the spike to unblock first; it can run independently.
6. **Entra/Microsoft identity must be a supported path.** Microsoft employees authenticate via Entra (`user@microsoft.com`). Any recommended architecture must work for Entra-identity operators, not just GitHub-account holders. `devtunnel user login --entra` is Dev Tunnels' default and is already the state of the local CLI — this path is unblocked and directly testable. Path (a) (GitHub bearer) is therefore **not** the compliant path for Microsoft-internal deployments; Entra-based paths (Dev Tunnels with Entra, or bearer-free with pairing secret) are.

---

## Common Mistakes / Confusion Points (read these before starting)

These are likely to trip up an agent working through this investigation. Add to this list as the assignee discovers more.

1. **Conflating "tunnel access auth" with "application auth."** A tunnel like Dev Tunnels has its own ACL (who can connect). The Happy app then layers `socket.handshake.auth.token` on top. These are two different auth surfaces. Many candidate architectures (Cloudflare Tunnel, Tailscale, mTLS) do exactly the opposite: tunnel ACL is the only auth, and the app layer is bearer-free. Be precise about which layer each piece of the design lives at.

2. **Assuming RN WebSocket can do what Node `ws` can do.** RN WebSocket has no `headers` option. Many tunnel SDK examples use Node `ws` with `Authorization` headers; those examples don't translate. Test any candidate that requires headers against the actual RN constraints before recommending it.

3. **Ignoring E2E.** Happy already encrypts payloads end-to-end inside the WebSocket. This means the tunnel provider sees only ciphertext, which radically lowers the bar for "tunnel provider trust." A recommendation that rejects a transport because "the provider could see traffic" is wrong if E2E is in place. Always state explicitly whether the threat being defended against survives E2E.

4. **Pairing secrets are bearer tokens, just locally minted.** A short-lived per-session secret displayed via QR is functionally a bearer token. The win is not "no bearer" but "no third-party-issued bearer, no IdP dependency, lifetime bounded to a session." Be precise about what is gained.

5. **Dev Tunnels' `--user` ACL is the GitHub login of the tunnel host operator, not the connecting client.** Several Phase 0 plan reviewers got this wrong. Read the Dev Tunnels docs carefully when filling in the comparison matrix.

6. **The current `devtunnel` CLI on the developer's local machine is logged in as Microsoft/Entra, not GitHub.** This blocks the Phase 0 spike. It does **not** block this investigation, but if the assignee wants to do empirical testing of Dev Tunnels as one of the candidates, they will hit the same block. Note it and route around it (use a GitHub-logged `devtunnel` on a different machine, or skip the empirical portion and rely on docs).

9. **The local devtunnel CLI is already Entra-logged — this unblocks Entra-path testing.** The Phase 0 spike was blocked because it was testing `devtunnel user login --github` but the machine is logged in as `evmitran@microsoft.com` via Entra. For any investigation work that tests the Entra path (Dev Tunnels with `--entra`, service principal, or bearer-free), the block does not apply. Only GitHub-path testing remains blocked.

7. **Cloudflare Tunnel Free has limits.** Free tier has bandwidth and connection caps; verify whether they fit Happy's per-session pattern (long-lived WS) before recommending the free tier as a default.

8. **WebRTC NAT traversal failure rate is non-trivial.** ~10–20% of consumer networks block STUN/TURN sufficiently to break direct WebRTC. Any recommendation that includes WebRTC must include a fallback path; do not propose WebRTC as the sole transport.

---

## Files To Reference / Update If The Recommendation Changes Plans

If the recommendation changes the architecture in `docs/plans/github-auth-via-vscode-tunnels.md`, the assignee should:

- Note the change in the recommendation doc itself (do not edit the plan file as part of this investigation).
- Flag whether the Phase 0 spike (`.ralph/jobs/phase-0-devtunnel-auth-spike/`) should be paused, repurposed, or canceled. The spike's `notepad.md` should record the recommendation's effect once the team accepts it.
- Update `docs/research/tunnel-transport-investigation.md` (this file) status from `open` to `superseded by docs/research/tunnel-transport-recommendation.md`.

---

## How To Run This As An Agent Job

The assignee can either work this as a free-form research task or convert it into a `/plan-with-ralph` brainstorm + plan cycle:

```
/brainstorm-with-ralph "Read docs/research/tunnel-transport-investigation.md and produce the deliverable described in the 'Deliverable' section."
```

Or, more directly:

```
/plan-with-ralph "Investigate provider-agnostic tunnel transport options for Happy per docs/research/tunnel-transport-investigation.md. Produce docs/research/tunnel-transport-recommendation.md per the Deliverable spec. No code changes."
```

Either path should converge on the same artifact.
