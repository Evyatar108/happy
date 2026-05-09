# Happy Roadmap

## Shipped

### Server-Per-Machine Architecture (D-003) — 2026-05-09
Happy redesigned from multi-tenant cloud relay to server-per-machine product. Each machine runs embedded `happy-server` inside `happy-cli`, exposed via Microsoft Dev Tunnel, paired via GitHub device flow + TOFU pubkey pinning, push notifications direct to Expo HTTP API. Cloud relay (`app.happy.engineering`) removed.

- `happy init` creates Dev Tunnel, generates Ed25519 + X25519 TOFU keypairs
- `happy daemon start` embeds happy-server in-process, starts tunnel host
- Mobile pairing: GitHub device flow → TOFU fingerprint → Ed25519-signed tunnel claim → X25519 ECDH session key
- Per-machine push: happy-server calls `exp.host/--/api/v2/push/send` directly
- Bearer auth removed from all Happy-relay call sites
- Machine discovery: server queries Dev Tunnels API after GitHub auth, returns all `happy-*` tunnels for N-machine picker

### What's still missing from the tunnel research doc
These items from `docs/research/tunnel-transport-recommendation.md` were NOT implemented in D-003 and are required for production correctness:

- **Connect JWT (critical)** — Mobile must call `GET /tunnels/:id?tokenScopes=connect&api-version=2023-09-27-preview` to get a real Dev Tunnels JWT for `X-Tunnel-Authorization`. Currently we use a server-generated Ed25519-signed claim instead. Without `--allow-anonymous` on the tunnel, Dev Tunnels edge will reject mobile connections that lack a real connect JWT. Latent bug.
- **Tunnel transport layer** — All 15+ REST call sites in happy-app need `X-Tunnel-Authorization` injection via shared `happyFetch()` / `happyAxiosConfig()` helpers. Currently only Socket.IO handshake injects the header. See research doc "Centralized Tunnel Transport Layer" section for full call site list.
- **Connect token expiry handling** — JWT renewal on 401, GitHub re-auth flow on token expiry.
- **Poll on foreground resume** — Re-discover tunnels every 30s on app foreground.
- **devtunnel GitHub App client ID** — Research doc validated `Iv1.e7b89e013f801f03` for mobile-side device flow directly against Dev Tunnels API (no server proxy). Currently we use the server's `GITHUB_CLIENT_ID` instead.
- **`happy://` deep link handler** — OAuth callback from server GitHub proxy. `app.config.js` has `scheme: 'happy'` but `_layout.tsx` has no handler.
- **Entra MSAL** — Deferred. Requires `pnpm prebuild` (currently stubbed to error). GitHub device flow is the only mobile auth path for now.
- **Prisma migration** — Schema was rewritten but no migration file committed. Human must run `pnpm migrate` against production Postgres.

## Next Up

- Start using as the daily development driver
- Contributing guidelines — priority: bugs > ui touchups > new features > refactors > core refactors (sync engine, rpc, server changes). Get notified about all issue activity on github — just start using inbox?
- Start tweeting about changes with images / videos

## Table Stakes (catch conductor)

- Small UX touchups - too many to list
- Bundled distribution (needed to make my own daily driver)
- Forking a session - for example a session with triaging -> fork into multiple where we fix the specific groups of issues

- File preview / editing in session — see [layout-core.md](layout-core.md)
- Better diff viewer — see [layout-core.md](layout-core.md)

## Navigation Bugs

Back navigation is broken across the app in several places:
- Logout → restore from key doesn't pop enough screens (also errors out)
- General back navigation inconsistency across flows

## Workspaces & Checkouts

Missing the concept of **workspace** (aka project) that spans multiple machines, and **checkout** as a daemon-managed entity.

- Workspace = a logical project that can span multiple machines (e.g. my laptop + cloud dev box both working on the same repo)
- Checkout = a specific working copy on a specific machine, managed by the daemon
- Currently we have machines and paths but no first-class workspace grouping
- Daemon should manage checkout lifecycle: create worktree, switch branch, clean up stale checkouts
- Right panel context (changes, files) is per-checkout, but workspace groups checkouts across machines

[hard]
- Attachments in composer / in agent output [hard, encrypted attachments, extra storage - needs design]
- Terminal embedded in app

## Underlying Assistant Upkeep

- Bug fixes, especially with session lifecycle management
- Crons / scheduled agents
- Migrate to most up to date vendor sdks
- Better flags support

[nice to have]
- Memory viewing / editing
- Slash commands
- Codex review, other commands
- Tighter MCP / tool ecosystem hooks
- Keep up as vendors ship new features

- Cleaner protocol + unit tests

## Viral / Cool

- Multi-agent dispatch
  - Fan-out N agents across machines
  - Agents dispatching agents (you just watch)
  - Orchestration UI (progress, results, cost)
- Software factories / maintenance factory
  - Repeatable agent pipelines
  - Own repo as first customer — self-maintaining
- Voice
  - Dispatch agents by talking
  - Voice as the control layer

## Talk to Users & Community

- Reach out to 5 users directly
- Read app store / google play reviews
- In-app surveys / feedback chat
- Contribution guidelines + PR template
- Post about latest version
- Engage with open PRs / community contributions

## Growth

- Semi-autonomous posting
  - Nudge-tweet after each ship
  - Watch git activity → draft posts
- Semi-automated engagement
  - Find relevant people / conversations
  - Draft replies, human approves
- Twitter / HN / socials presence

## Session / Project Management

- Reorder / prioritize sessions in sidebar

## Customization

- UI self-customization ("change X" → happy obliges)
- Custom widgets per session / project
- Widgets on mobile (iOS/Android) + desktop

## Push Notification Routing

Current state (post D-003): happy-server calls Expo HTTP API directly per machine. Push tokens are stored per-machine/per-device. Smart routing still missing:

- Smart routing: suppress notification on originating device, prefer device user is currently active on
- Web push: missing entirely — needs service worker + web push registration
- Device metadata: store platform (ios/android/web), device name, last active timestamp

## Better Machine Management

- Connect JWT flow: get real Dev Tunnels JWT for tunnel-level auth (see "What's still missing" above — critical)
- Tunnel transport layer: inject `X-Tunnel-Authorization` on all 15+ REST call sites via `happyFetch()` helper
- Auth transferring between devices

## Integrations (external services)

- remote machine ecosystem
  - exe.dev — tutorials, outreach
  - sprites — same
- Linear
- GitHub — PR reviews


