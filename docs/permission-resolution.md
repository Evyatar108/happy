# Permission Resolution (State-Based)

This document explains how permission mode is resolved for session messages, depending on current state in the app and CLI.

## Scope
- App-side state resolution (session defaults, persisted values, outbound message metadata)
- Claude CLI resolution (startup mode, per-message updates, sandbox policy)
- Final mode sent to Claude SDK

## Permission Modes
- Shared mode type: `default | acceptEdits | bypassPermissions | plan | read-only | safe-yolo | yolo`
- Claude SDK supports: `default | acceptEdits | bypassPermissions | plan`
- Mapping to Claude happens in `packages/happy-cli/src/claude/utils/permissionMode.ts`:
  - `yolo -> bypassPermissions`
  - `safe-yolo -> default`
  - `read-only -> default`

## App-Side Resolution

### 1) Session state load/merge
`packages/happy-app/sources/sync/storage.ts`

When sessions are merged, the app resolves `session.permissionMode` using this order:
1. Existing in-memory session mode (if non-`default`)
2. Persisted per-session mode from local storage (if non-`default`)
3. Mode from server session payload (if non-`default`)
4. Sandbox fallback:
   - If `session.metadata.sandbox.enabled === true`: `bypassPermissions`
   - Otherwise: `default`

### 2) New-session draft fallback
`packages/happy-app/sources/sync/persistence.ts`

If draft permission mode is missing:
- Draft default: `default`

### 3) New session UI defaults
`packages/happy-app/sources/app/(app)/new/index.tsx`
`packages/happy-app/sources/components/NewSessionWizard.tsx`

Default selection:
- `default`

If selected mode is invalid for the currently selected agent, UI resets to agent default above.

### 4) Outbound message mode
`packages/happy-app/sources/sync/messageMeta.ts`
`packages/happy-app/sources/sync/sync.ts`

On send, `resolveMessageModeMeta` decides whether to attach `permissionMode` to the outbound message:
- If `session.permissionModeUserChosen === true` and `session.permissionMode` is one of the wire modes (`default | acceptEdits | bypassPermissions | plan | read-only | safe-yolo | yolo`): send that mode.
- Else if `session.metadata.sandbox.enabled === true`: send `bypassPermissions` (sandbox forcing).
- Otherwise: omit `permissionMode` entirely — it is left out of both the encrypted `meta` and the socket envelope.
  - This preserves the CLI's startup mode (e.g., `claude --dangerously-skip-permissions`) when the user has not toggled the picker, so the app does not silently downgrade the running session to `default`.

When present, the value is sent in:
- encrypted message `meta.permissionMode`
- socket envelope `permissionMode`

### 5) Picker display resolution
`packages/happy-app/sources/components/modelModeOptions.ts` (`resolvePermissionModeForPicker`)

When the picker decides which mode to show as currently selected, it walks this priority chain:
1. Explicit user pick — when `session.permissionModeUserChosen === true`, use `session.permissionMode`.
2. CLI-published mode — `session.metadata.currentPermissionModeCode` (see "CLI → App metadata publishing" below).
3. Claude-only legacy fallback — when `flavor === 'claude'` and `session.metadata.dangerouslySkipPermissions === true`, fall back to `bypassPermissions`. This branch does not apply to Codex.
4. `getDefaultPermissionModeKey(flavor)` (currently `'default'` for all flavors).

`session.permissionModeUserChosen` is the boundary between an explicit picker/button choice (`true`) and a machine-derived mode such as `EnterPlanMode` (`false`). It is persisted per session so a CLI-owned mode is not overwritten by the picker until the user actually toggles it.

## Claude CLI Resolution

### 1) Startup resolution
`packages/happy-cli/src/claude/runClaude.ts`
`packages/happy-cli/src/claude/utils/permissionMode.ts`

Initial mode comes from:
1. `--dangerously-skip-permissions` (highest priority) -> `bypassPermissions`
2. `--permission-mode VALUE` or `--permission-mode=VALUE`
3. Provided `options.permissionMode`

Then sandbox policy is applied:
- If sandbox enabled: force `bypassPermissions`
- If sandbox disabled: keep resolved mode

### 2) Per-message updates in remote flow
`packages/happy-cli/src/claude/runClaude.ts`

When a user message includes `meta.permissionMode`:
- If sandbox enabled: forced to `bypassPermissions`
- If sandbox disabled: use incoming mode

### 3) Local Claude process
`packages/happy-cli/src/claude/claudeLocal.ts`

If sandbox is enabled, launcher appends `--dangerously-skip-permissions` before spawn.

## CLI → App metadata publishing
`packages/happy-cli/src/utils/publishPermissionMode.ts`
`packages/happy-cli/src/claude/runClaude.ts`
`packages/happy-cli/src/codex/runCodex.ts`
`packages/happy-cli/src/api/types.ts` (`Metadata.currentPermissionModeCode`)

Both Claude and Codex runners publish their effective permission mode into session `metadata.currentPermissionModeCode` so the app's picker can show the actual running mode without the user having to toggle anything.

### 1) Initial seed
- Claude seeds `currentPermissionModeCode = initialPermissionMode` directly on the metadata object passed to `api.getOrCreateSession(...)`, so the value is present from the very first server-side session record.
- Codex does not seed at session creation. Instead, after `client.connect()` resolves, if `client.sandboxEnabled === true` it publishes `'yolo'` once via `publishPermissionModeIfChanged(...)`. When sandbox is disabled, Codex starts with no `currentPermissionModeCode` until the user picks one.

### 2) Subsequent updates
Both runners publish later changes through `publishPermissionModeIfChanged(client, metadata, mode, lastRef)`. The helper:
1. Short-circuits when `lastRef.current === mode` (no-op for unchanged modes).
2. Updates `lastRef.current` and mutates the runner-local `metadata` object **in place** (sets or deletes `currentPermissionModeCode`) **before** awaiting `client.updateMetadata(...)`.
3. Awaits the server update last, swallowing/logging errors so a transient server failure does not crash the runner loop.

The in-place mutation before the awaited server call is intentional: `setupOfflineReconnection(...)` reuses the same metadata object by reference as its reconnect seed, so the optimistic write keeps the reconnect path's seed metadata current even while the server update is in flight.

### 3) Semantics of absence
A missing `currentPermissionModeCode` means "no opinion yet" — the CLI has not declared an effective mode. The app picker treats this as a signal to fall through to the legacy `dangerouslySkipPermissions` fallback (Claude only) and then to the agent default, rather than overwriting a CLI-owned mode prematurely.

## Effective Result Matrix

### Sandbox enabled
- App fallback mode is `bypassPermissions` when session mode is default/missing
- Claude CLI sandbox policy still forces `bypassPermissions` in remote flow

### Sandbox disabled
- If app/session mode is non-`default`: that mode is used
- If app/session mode is `default` or missing:
  - App sends `default`
  - CLI uses normal mode resolution (no sandbox forcing)

## Why this is stable now
- Client fallback only forces skip-permissions for sandboxed sessions.
- CLI sandbox policy guarantees sandboxed Claude sessions cannot re-enable permission prompts via message metadata.
