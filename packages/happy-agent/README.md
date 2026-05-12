# Happy Agent

CLI client for controlling Happy Coder agents remotely.

Unlike `happy-cli` which both runs and controls agents, `happy-agent` only controls them — listing machines, spawning sessions on a machine, creating sessions, sending messages, reading history, monitoring state, and stopping sessions.

## Installation

From the monorepo:

```bash
yarn workspace happy-agent build
```

Or link globally:

```bash
cd packages/happy-agent && npm link
```

## Authentication

Happy Agent authenticates with GitHub device flow and stores per-machine Dev Tunnel pairing data for daemon RPC. REST and session commands still need legacy account credentials until the session transport migration is complete, so first-time installs that do not have a legacy `agent.key` can log in but cannot use those legacy-backed commands yet.

```bash
# Authenticate with GitHub device flow
happy-agent auth login

# Check authentication status
happy-agent auth status

# Clear stored credentials
happy-agent auth logout
```

Credentials are stored at `~/.happy-agent/credentials.json` by default. During login, Happy Agent also looks for a legacy key at `${HAPPY_HOME_DIR:-~/.happy}/agent.key` and copies its token material into the new credentials file when present.

## Commands

### List sessions

```bash
# List all sessions
happy-agent list

# List only active sessions
happy-agent list --active

# Output as JSON
happy-agent list --json
```

### List machines

```bash
# List all machines
happy-agent machines

# List only active machines
happy-agent machines --active

# Output as JSON
happy-agent machines --json
```

### Spawn on a machine

```bash
# Spawn a session on a specific machine
happy-agent spawn --machine <machine-id> --path ~/project

# Let the daemon create the directory if needed
happy-agent spawn --machine <machine-id> --path ~/new-project --create-dir

# Choose a specific agent
happy-agent spawn --machine <machine-id> --path ~/project --agent codex

# Output as JSON
happy-agent spawn --machine <machine-id> --path ~/project --json

# Create a fresh git worktree through the daemon and spawn into it
happy-agent spawn --machine <machine-id> --new-worktree --repo ~/project --agent codex

# Same, but pin the worktree path and group the spawn under a fan-out run ID
happy-agent spawn --machine <machine-id> --new-worktree --repo ~/project \
    --worktree ~/project/.worktrees/feature --run-id run-123 --agent codex
```

The `--new-worktree` flow creates the worktree atomically on the daemon side and is the recommended path for fan-out runs. When you pass `--new-worktree`:

- `--repo <path>` is required and points at the repository root on the target machine.
- `--worktree <path>` is optional; omit it to let the daemon pick a UUID-named worktree path.
- `--agent <agent>` is required and must be one of the supported agents.
- `--run-id <id>` is optional and groups concurrent spawns under one fan-out run for monitoring and rendering.
- `--path` and `--create-dir` are the legacy spawn flags and cannot be combined with `--new-worktree`.

### Monitor a fan-out run

```bash
# Snapshot every active session belonging to a run
happy-agent monitor --runId <run-id>

# Keep polling and subscribe to state-change events; Ctrl+C to stop
happy-agent monitor --runId <run-id> --watch

# Output as JSON
happy-agent monitor --runId <run-id> --json
```

For each session in the run, the monitor returns a snapshot containing:

- `sessionId` — the session whose state is being reported.
- `state.active`, `state.pendingPermission`, `state.hasValidationEvidence` — the three classification signals derived from session metadata, agent state, and the per-session ledger.
- `requestIds` — IDs of pending permission requests on the agent.
- `lastOutputSummary` — a short summary of the most recent assistant output (selected by the locked output heuristic).

`--watch` polls active sessions every two seconds and additionally subscribes to per-session `state-change` events through a `SessionClient` for each session in the run, writing fresh snapshots whenever the agent state changes. The command runs until interrupted; `SIGINT` and `SIGTERM` tear down the polling timer and close all subscribed session clients before exiting.

### Session status

```bash
# Get live session state (supports ID prefix matching)
happy-agent status <session-id>

# Output as JSON
happy-agent status <session-id> --json
```

### Create a session

```bash
# Create a new session with a tag
happy-agent create --tag my-project

# Specify a working directory
happy-agent create --tag my-project --path /home/user/project

# Output as JSON
happy-agent create --tag my-project --json
```

### Send a message

```bash
# Send a message to a session
happy-agent send <session-id> "Fix the login bug"

# Send with yolo permissions
happy-agent send <session-id> "Ship it" --yolo

# Send and wait for the agent to finish
happy-agent send <session-id> "Run the tests" --wait

# Output as JSON
happy-agent send <session-id> "Hello" --json
```

### Message history

```bash
# View message history
happy-agent history <session-id>

# Limit to last N messages
happy-agent history <session-id> --limit 10

# Output as JSON
happy-agent history <session-id> --json
```

### Stop a session

```bash
happy-agent stop <session-id>
```

### Wait for idle

```bash
# Wait for agent to become idle (default 300s timeout)
happy-agent wait <session-id>

# Custom timeout
happy-agent wait <session-id> --timeout 60
```

Exit code 0 when agent becomes idle, 1 on timeout.

## Environment Variables

- `HAPPY_SERVER_URL` - legacy API server URL for REST and session traffic (default: `https://api.cluster-fluster.com`)
- `HAPPY_PAIRING_URL` - pairing API URL for `auth login` (defaults to `HAPPY_SERVER_URL`)
- `HAPPY_AGENT_HOME_DIR` - Happy Agent credential directory (default: `~/.happy-agent`; credentials file is `credentials.json` inside this directory)
- `HAPPY_HOME_DIR` - legacy Happy home used only to find `agent.key` during login (default: `~/.happy`)

## Session ID Matching

All commands that accept a `<session-id>` support prefix matching. You can provide the first few characters of a session ID and the CLI will resolve the full ID.

Machine-aware commands such as `spawn --machine <machine-id>` also support ID prefix matching.

## Encryption

All machine and session data is end-to-end encrypted. New records use AES-256-GCM with per-record keys. Existing records created by other clients are decrypted using the appropriate key scheme (AES-256-GCM or legacy NaCl secretbox).

## Development

The `test`, `test:integration`, and `prepublishOnly` scripts invoke `pnpm` by name rather than `$npm_execpath`. This is intentional: on Windows, `$npm_execpath` resolves to a cmd shim that pnpm cannot exec under Git Bash, causing the build to fail. Contributors must invoke these scripts via `pnpm` (e.g. `pnpm test`) or from a pnpm workspace context; running them through `npm run` or `yarn run` directly is not supported.

## Requirements

- Node.js >= 20.0.0
- pnpm >= 10 (npm and yarn are not supported as script runners; see Development note above)
- A Happy mobile app account for authentication

## Publishing to npm

Maintainers can publish a new version:

```bash
yarn release               # From repo root: choose library to release
# or directly:
yarn workspace happy-agent release
```

This flow:
- runs tests/build checks via `prepublishOnly`
- creates a release commit and `happy-agent-vX.Y.Z` tag
- creates a GitHub release with generated notes
- publishes `happy-agent` to npm

## License

MIT
