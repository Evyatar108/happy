# Server-Per-Machine Spike Record

Status: go for D-003

Date: 2026-05-08

## Verdict

D-003 is feasible enough to proceed. No spike item requires falling back to D-002.

## Spike Items

| Item | Verdict | Evidence |
| --- | --- | --- |
| `createHappyServer({ dataDir, port, machineKey })` API | Pass | `packages/happy-server/sources/index.ts` exposes a side-effect-free factory returning `{ app, start, stop }`; `packages/happy-cli/scripts/spike-create-happy-server.ts` starts it on a loopback port and verifies `GET /` returns 200. |
| PGlite runtime under pkgroll | Pass | `packages/happy-cli/scripts/spike-pglite-pkgroll-entry.ts` is bundled with `pkgroll --input`; `spike-copy-pglite-assets.ts` copies `pglite.wasm` and `pglite.data` next to the bundle; running the bundled output executes `SELECT 42 AS answer` through PGlite. |
| Bearer-free REST threat model | Pass | `docs/decisions/bearer-free-rest-adr.md` records the replacement trust boundaries and bearer-removal scope. |
| Separate X25519 ECDH keypair | Pass | `packages/happy-cli/scripts/spike-x25519-ecdh.ts` uses `tweetnacl.box.keyPair()` for both sides and verifies matching `nacl.box.before(...)` shared secrets. |

## Build And Alias Strategy

The spike keeps `happy-server` as a workspace package dependency of `happy-cli`, exposes a minimal public source entrypoint from `packages/happy-server/package.json`, and adds explicit `happy-server` / `happy-server/pglite` paths to `packages/happy-cli/tsconfig.json`. That confirms option (a) for the public spike entrypoints without making `happy-cli` resolve `happy-server` internals through the ambiguous `@/*` alias.

For the full extraction, prefer moving from source exports to a pre-compiled `dist/` entry once the factory wraps the real server. That avoids the package-local `@/*` alias collision where both `happy-cli` and `happy-server` map `@/*` to different source roots. Do not make `happy-cli`'s `@/*` path point at both packages; that can silently resolve same-named utility modules to the wrong package.
