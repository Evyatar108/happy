# codexu

> **Multi-device + multi-agent stack built around the codex engine.**
> CLI, app, server, and personal plugin — all consuming a patched
> [codex](https://github.com/Evyatar108/codex-patched) fork as the
> runtime.

> **Rebrand status (2026-05-03):** package-level rebrand from
> `happy-*` → `codexu-*` was attempted then reverted to enable a clean
> upstream merge with `slopus/happy`. Internal package directories
> (`packages/happy-{cli,app,server,agent,wire,app-logs}`) are
> intentionally back to their `happy-*` names. Re-attempt deferred until
> upstream merge cadence stabilizes (or until tracking is dropped). The
> NEW `packages/codexu-plugin/` and the `codexu` repo name itself stay.

## What this is

Codexu is the consumer-facing surface for a personal AI-coding stack:

- **happy-cli** (npm: `happy`) — terminal entry point + ink renderer;
  talks to a codex app-server over stdio/ws.
- **happy-app** — mobile + web client (Expo / React Native) that
  attaches to the same app-server from any device.
- **happy-server** — backend for cross-device sync, push, voice,
  artifacts.
- **happy-agent** — remote agent control CLI (create, send, monitor
  sessions).
- **happy-wire** (npm: `@slopus/happy-wire`) — shared zod schemas +
  message types.
- **codexu-plugin** — personal codex plugin (skills, hooks,
  AskUserQuestion-using workflows). Installed via `codex plugin
  marketplace add`. NEW; not part of upstream slopus/happy.

The codex engine itself lives in a separate repo
([Evyatar108/codex-patched](https://github.com/Evyatar108/codex-patched))
— this monorepo consumes it.

> **Codex sync note (2026-05-03):** active codex patches currently live
> on a separate working fork; `codex-patched` is the canonical public
> mirror that periodic sync will keep up to date. Pinning happy-cli at a
> specific `codex-patched` revision (and the sync workflow itself) lands
> in roadmap Phase 1a.

## Roadmap

The big picture lives in
[`plans/codexu-roadmap.md`](plans/codexu-roadmap.md). It covers:

- multi-device session continuity (Phase 1b)
- personal codex plugin scaffolding (Phase 1c)
- codex divergences for `scope = "host"` plugins, AskUserQuestion, queueing
  (Phase 2)
- ralph + options-mode plugin migration to codex (Phase 3)
- coexistence verification (Phase 4)
- drop Claude Code (Phase 5)
- long-lived teammates (Phase 6)
- Claude-via-Copilot adapter (Phase 7, deferred)

## Heritage

Codexu is a fork of [slopus/happy](https://github.com/slopus/happy)
diverging toward a codex-only direction (GitHub-OAuth via Microsoft Dev
Tunnels replacing the encrypted relay; codex app-server replacing the
Claude Code wrapper as the primary runtime). Active upstream tracking
resumed 2026-05-03 to absorb upstream improvements (codium plugin
system, theme system, model adds, init-hang fix, etc.); long-term
divergence direction unchanged.

## Status

Pre-release. Personal use first. Public catalog promotion deferred until
content stabilizes.

## License

MIT — see [LICENSE](LICENSE).
