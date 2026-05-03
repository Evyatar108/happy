# codexu

> **Multi-device + multi-agent stack built around the codex engine.**
> CLI, app, server, and personal plugin — all consuming a patched
> [codex](https://github.com/Evyatar108/codex-patched) fork as the
> runtime.

## What this is

Codexu is the consumer-facing surface for a personal AI-coding stack:

- **codexu-cli** — terminal entry point + ink renderer; talks to a
  codex app-server over stdio/ws.
- **codexu-app** — mobile + web client (Expo / React Native) that
  attaches to the same app-server from any device.
- **codexu-server** — backend for cross-device sync, push, voice,
  artifacts.
- **codexu-agent** — remote agent control CLI (create, send, monitor
  sessions).
- **codexu-wire** — shared zod schemas + message types.
- **codexu-plugin** — personal codex plugin (skills, hooks, AskUserQuestion-using
  workflows). Installed via `codex plugin marketplace add`.

The codex engine itself lives in a separate repo
([Evyatar108/codex-patched](https://github.com/Evyatar108/codex-patched))
— this monorepo consumes it.

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
Claude Code wrapper as the primary runtime). Tracking upstream stopped
at the rename. Internal package symbols, schema field names, and user-
state directories (`~/.happy/`) still use `happy` — those carry runtime
+ wire-compat with existing installs and rename incrementally per the
roadmap.

## Status

Pre-release. Personal use first. Public catalog promotion deferred until
content stabilizes.

## License

MIT — see [LICENSE](LICENSE).
