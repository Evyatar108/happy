# Happy Roadmap

## Shipped

### Server-Per-Machine Architecture (D-003) — 2026-05-09
Happy redesigned from multi-tenant cloud relay to server-per-machine product. Each machine runs embedded `happy-server` inside `happy-cli`, exposed via Microsoft Dev Tunnel, paired via GitHub device flow + TOFU pubkey pinning, push notifications direct to Expo HTTP API. Cloud relay (`app.happy.engineering`) removed.

- `happy init` creates Dev Tunnel (no `--allow-anonymous`), generates Ed25519 + X25519 TOFU keypairs
- `happy daemon start` embeds happy-server in-process, starts tunnel host
- Mobile pairing: direct GitHub device flow (`Iv1.e7b89e013f801f03`) → Dev Tunnels API enumeration → real connect JWT → TOFU fingerprint dialog → X25519 ECDH session key
- Per-machine push: happy-server calls `exp.host/--/api/v2/push/send` directly
- Bearer auth removed from all Happy-relay call sites
- Machine discovery: mobile lists `happy-*` tunnels via Dev Tunnels API, shows 0/1/N picker
- Connect JWT: real Dev Tunnels JWT stored per machine, used for tunnel-level auth on all requests; refresh logic in `refreshConnectTokenIfNeeded()`

- Connect token refresh: wired into `syncInit` and AppState foreground handler

### Still remaining from tunnel research doc
- **`happy://` deep link handler** — Not needed for current GitHub device flow path, but required if Entra MSAL is added later.
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

- Wire `refreshConnectTokenIfNeeded()` into sync init and 401 handlers
- Poll on foreground resume (AppState listener, 30s interval)
- Auth transferring between devices

## Integrations (external services)

- remote machine ecosystem
  - exe.dev — tutorials, outreach
  - sprites — same
- Linear
- GitHub — PR reviews


