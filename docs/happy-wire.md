# happy-wire

This document describes the shared wire package: `@slopus/happy-wire`.

## Why this package exists

Before `happy-wire`, wire-level message and session-protocol schemas were duplicated across packages (CLI, app, server, and agent). That caused drift risk and made protocol evolution harder.

`@slopus/happy-wire` centralizes those shared schemas and types so all clients and services agree on the same wire contract.

## Package identity

- npm name: `@slopus/happy-wire`
- workspace path: `packages/happy-wire`
- package type: publishable library (not private)
- versioned dependency in consumers: `^0.1.0`

## What is shared

### 1. Wire message schemas

Shared from `@slopus/happy-wire`:
- from `messages.ts`: `SessionMessageContentSchema`, `SessionMessageSchema`, `MessageMetaSchema`, `SessionProtocolMessageSchema`, `MessageContentSchema` (top-level `role` union: `user|agent|session`), `UpdateNewMessageBodySchema`, `UpdateSessionBodySchema`, `UpdateMachineBodySchema`, `CoreUpdateContainerSchema`
- from `legacyProtocol.ts`: `UserMessageSchema` (`role: 'user'`), `AgentMessageSchema` (`role: 'agent'`), `LegacyMessageContentSchema` (`role`-discriminated union for legacy only)

These are used for encrypted message/update contracts (`new-message`, `update-session`, `update-machine`).

### 2. Session protocol schema

Shared from `@slopus/happy-wire`:
- `sessionEventSchema`
- `sessionEnvelopeSchema`
- `createEnvelope(...)`
- `SessionEnvelope` and related types
- `sessionContextBoundaryEventSchema`, `sessionContextBoundaryKindSchema`, and related types

This is the canonical schema for the unified session protocol event stream.

Current role set in `sessionEnvelopeSchema`:
- `'user'` (user-originated envelope)
- `'agent'` (agent/system output envelopes)

Current session wire payload shape (decrypted message body):
- outer message `role` is always `'session'` for session-protocol records
- `content` is the session envelope object directly (not wrapped under `content.data`)
- envelope-level role remains inside `content.role` (`'user' | 'agent'`)
- envelope timestamp is required as `content.time` (Unix ms)

`context-boundary` is the shared lifecycle event for `/clear`, `/compact`, autocompact, plan-mode transitions, and `/resume` forks. Producers that need old-client compatibility follow the dual-emit contract: typed `context-boundary` envelope first, legacy fallback event second with `meta.contextBoundaryFallback: true`. New consumers suppress the flagged legacy event and use encrypted session metadata `latestBoundary` only as the cold-start side channel when the boundary row is outside the loaded page.

### 3. TOFU handshake schemas

Shared from `@slopus/happy-wire` (re-exported from `tofu.ts`):
- `MachineTunnelSchema` / `MachineTunnel`: the persisted Dev Tunnels machine descriptor used by app and agent code when discovering locally known machines.
- `TofuPublicKeysSchema` / `TofuPublicKeys`: the embedded server's pinned long-term keys (`ed25519PublicKey`, `x25519PublicKey`, optional `ed25519Fingerprint`)
- `TofuPubkeysEventSchema` / `TofuPubkeysEvent`: the `t: 'tofu-pubkeys'` socket event the server emits on connect so mobile can pin keys on first contact
- `TofuSessionKeyExchangeSchema` / `TofuSessionKeyExchange`: the `t: 'tofu-session-key'` record produced by the X25519 ECDH session-key exchange (`machineId`, `mobileX25519PublicKey`, `serverX25519PublicKey`, `sessionKey`, `firstSeenAt`)
- `TofuHandshakeMessageSchema` / `TofuHandshakeMessage`: the discriminated union of the two handshake events above, keyed on `t`

These schemas are the canonical wire contract for the per-machine TOFU pinning + ECDH session-key handshake between mobile clients and the embedded `happy-server`. The handshake replaces the deprecated cloud Bearer-token flow.

### 4. Non-renderable content registry

Shared from `@slopus/happy-wire` (re-exported from `nonRenderablePolicy.ts`):
- types: `NonRenderableEntry`, `RawClaudeMessageMatchInput`, `ReceiverRegexFactory`
- entries: `skillBodyEntry`, `localCommandCaveatEntry`, `systemReminderEntry`, `forkBoilerplateEntry`
- aggregate: `nonRenderableEntries`
- helpers: `makeWrappedTagEntry`, `findSenderDropEntry`

`nonRenderablePolicy.ts` ships a single shared registry of matchers that classify non-renderable Claude JSONL content (skill-body prefixes and well-formed wrapped tags such as `<local-command-caveat>`, `<system-reminder>`, `<fork-boilerplate>`). The same entries drive two sites:

- happy-cli sender-drop filter: `findSenderDropEntry` is applied at the top of `sendClaudeSessionMessage(...)` in `packages/happy-cli/src/api/apiSession.ts`, against the raw Claude JSONL `body` *before* `normalizeSessionLogMessage(...)` runs and before wire envelopes are built. Matching messages are dropped at the source and never reach the encrypted wire payload.
- happy-app receiver-side strip: `skillBody.ts` and `processClaudeMetaTags.ts` consume `skillBodyEntry.receiverPrefix` and the wrapped-tag entries' `receiverRegexes` factory as defense-in-depth so older senders that still emit these blocks render cleanly.

Notes on the registry shape:
- `RawClaudeMessageMatchInput` is intentionally narrow (`{ type, message: { content } }`) so happy-wire never imports CLI-side `RawJSONLines` types.
- `ReceiverRegexFactory.buildInlineRe()` / `buildStandaloneLineRe()` MUST return fresh `RegExp` instances per call because the receiver consumes `/gi`-flagged regexes whose `lastIndex` is stateful.
- Extended thinking blocks are renderable user value and MUST stay on the wire — there is an explicit no-op comment in `nonRenderablePolicy.ts` forbidding a thinking-block entry, paired with a unit test (see also `docs/plans/render-extended-thinking-optional.md`).

For consumer-side details see `packages/happy-cli/CLAUDE.md` and `packages/happy-wire/README.md`.

### 5. Ledger record schemas

Shared from `@slopus/happy-wire` (re-exported from `ledger.ts`):
- error code enum: `LedgerErrorCodeSchema` / `LedgerErrorCode` (`'spawn-failed' | 'wrong-account' | 'timeout' | 'crash' | 'ledger-write-failed' | 'monitor-failure'`)
- per-event record schemas, each extending a common `{ runId, sessionId, timestamp, seqWithinSession? }` base:
  - `SpawnLedgerRecordSchema` (`eventType: 'spawn'`)
  - `MessageSentLedgerRecordSchema` (`eventType: 'message-sent'`)
  - `IdleReachedLedgerRecordSchema` (`eventType: 'idle-reached'`)
  - `PendingPermissionLedgerRecordSchema` (`eventType: 'pending-permission'`)
  - `LastOutputSummaryLedgerRecordSchema` (`eventType: 'last-output-summary'`)
  - `ValidationAttachedLedgerRecordSchema` (`eventType: 'validation-attached'`)
  - `DoneLedgerRecordSchema` (`eventType: 'done'`)
  - `ErrorLedgerRecordSchema` (`eventType: 'error'`)
- discriminated union and inferred type: `LedgerRecordSchema` (discriminated on `eventType`) and `LedgerRecord`

The schema lives at `packages/happy-wire/src/ledger.ts` and is consumed by the happy-cli ledger writer (`packages/happy-cli/src/ledger/writer.ts`) and the happy-agent ledger writer (`packages/happy-agent/src/ledger/writer.ts`), so both producers stay structurally consistent for the on-disk `.ralph/state/<runId>/<sessionId>.jsonl` files. `runId` and `sessionId` are validated against `^[A-Za-z0-9_-]+$` so they remain safe path components for that file location.

For the deeper per-field schema reference see `packages/happy-wire/README.md` (`### ledger.ts exports`).

### 6. Agent tree wire schemas

Shared from `@slopus/happy-wire` (re-exported from `agentTree.ts`):
- queryable snapshot shape (returned by the `sessionGetAgentTree` RPC):
  - `AgentTreeNodeSchema` / `AgentTreeNode`: `{ threadId, agentRole, nickname (nullable), status, lastTaskMessage?, spawnedAt }`
  - `AgentTreeEdgeSchema` / `AgentTreeEdge`: `{ parent, child }`
  - `AgentTreeSnapshotSchema` / `AgentTreeSnapshot`: `{ nodes, edges, seq }`
- streaming delta surface, a discriminated union keyed on `type`:
  - `AgentTreePendingSpawnStartedDeltaSchema` (`type: 'pending-spawn-started'`, `seq`, `callId`, `parentThreadId`, `agentRole`, `nickname`, optional `taskMessage`, `startedAt`)
  - `AgentTreeNodeAddedDeltaSchema` (`type: 'node-added'`, `seq`, `node`, `edge`)
  - `AgentTreeNodeStatusChangedDeltaSchema` (`type: 'node-status-changed'`, `seq`, `threadId`, `status`, optional `lastTaskMessage`)
  - `AgentTreeNodeRemovedDeltaSchema` (`type: 'node-removed'`, `seq`, `threadId`)
  - aggregate: `AgentTreeDeltaSchema` / `AgentTreeDelta`
- Socket.IO payload schemas for the `agent-tree-update` frame:
  - `AgentTreeUpdateInboundPayloadSchema` / `AgentTreeUpdateInboundPayload`: `{ delta }` (CLI → server)
  - `AgentTreeUpdateOutboundPayloadSchema` / `AgentTreeUpdateOutboundPayload`: `{ sessionId, delta }` (server → client)
- RPC envelope schemas for the `sessionGetAgentTree` request/response:
  - `SessionGetAgentTreeRequestSchema` / `SessionGetAgentTreeRequest`: `{ sessionId }`
  - `SessionGetAgentTreeResponseSchema` / `SessionGetAgentTreeResponse`: alias of `AgentTreeSnapshotSchema`

These schemas are the shared contract for exposing codex's in-process agent spawn tree as both a queryable snapshot (`sessionGetAgentTree` RPC) and a streaming surface (`agent-tree-update` Socket.IO frame). They are consumed by the happy-cli `runCodex` agent-tree bridge (emitter side) and by happy-server's `sessionUpdateHandler` + `eventRouter` fan-out (relay side), so producers and subscribers stay structurally aligned without touching the codex Rust submodule.

## Migration in this repository

### CLI (`packages/happy-cli`)

- Session protocol imports now reference `@slopus/happy-wire` directly.
- `src/sessionProtocol/types.ts` now re-exports from `@slopus/happy-wire` as compatibility shim.
- API wire schemas in `src/api/types.ts` now source shared message/update schemas from `@slopus/happy-wire`.

### App (`packages/happy-app`)

- Shared API message/update schemas in `sources/sync/apiTypes.ts` now import these from `@slopus/happy-wire`:
  - `ApiMessageSchema`
  - `ApiUpdateNewMessageSchema`
  - `ApiUpdateSessionStateSchema`
  - `ApiUpdateMachineStateSchema`

### Server (`packages/happy-server`)

- Prisma JSON message content type now references `SessionMessageContent` from `@slopus/happy-wire`.
- Event router uses shared `SessionMessageContent` type for `new-message` payload typing.

### Agent (`packages/happy-agent`)

- `RawMessage` now aliases `SessionMessage` from `@slopus/happy-wire`.

## Versioning model

All other workspace packages now declare a versioned dependency on `@slopus/happy-wire`.

This intentionally mirrors post-publish consumption and reduces hidden coupling to workspace-local files.

## Build and release

`@slopus/happy-wire` is configured the same way as existing publishable libraries in this repo:

- ESM/CJS/types outputs via `pkgroll`
- `build`: typecheck + bundle
- `test`: build + vitest
- `prepublishOnly`: build + test
- `release`: `release-it`
- npm publish registry configured via `publishConfig`

Use the same release entrypoint as other publishable packages:

```bash
yarn release
# choose happy-wire
```

or:

```bash
yarn workspace @slopus/happy-wire release
```

When building workspaces from a clean checkout, build `@slopus/happy-wire` first so dependent packages can resolve generated `dist` outputs.

## Publish checklist (maintainer)

1. Ensure all workspace builds/tests are green.
2. Confirm wire schema changes are backward-compatible or documented.
3. Bump and release `@slopus/happy-wire`.
4. Update downstream package versions if needed.
5. Publish dependent package updates only after the new `happy-wire` version is available.

## Notes

- `happy-wire` should stay focused on wire contracts only (types + Zod schemas + small helpers, plus small policy registries — like the non-renderable content registry — that are inherently shared between sender and receiver).
- Domain/business logic should remain in consumer packages.
- Keep schema additions additive where possible to minimize client breakage.
