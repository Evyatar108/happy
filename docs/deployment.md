# Deployment

Happy now deploys as a server-per-machine product. Each operator machine runs `happy-cli`, which starts an embedded `happy-server` on loopback, hosts it through a Microsoft Dev Tunnel, and lets the mobile app pair directly to that machine. There is no Happy cloud relay in the normal path.

The target setup time for a new operator is under 30 minutes after Node, pnpm, and the Microsoft Dev Tunnels CLI are installed.

## Architecture

```
happy-cli daemon
  -> embedded happy-server on 127.0.0.1:<machine port>
  -> Microsoft Dev Tunnel host for https://<tunnel>.devtunnels.ms
  -> Expo push delivery directly from happy-server

happy mobile app
  -> GitHub device flow against the machine tunnel
  -> TOFU fingerprint confirmation
  -> Socket.IO + REST over the machine tunnel
```

Operator-owned state lives under `~/.happy/`:

- `machine.json`: machine id, embedded server port, and tunnel URL.
- `tunnel.json`: Microsoft Dev Tunnel id and URL.
- `server-key.pub` / `server-key.priv`: Ed25519 signing identity.
- `ecdh-key.pub` / `ecdh-key.priv`: separate X25519 keypair for ECDH.
- `happy-server/`: embedded server data directory.

## Prerequisites

- Node.js 20 or newer.
- pnpm 10 or newer.
- Microsoft Dev Tunnels CLI, available as `devtunnel`.
- A GitHub account for the Dev Tunnels login and mobile device-flow identity check.
- The Happy mobile app installed on the phone or tablet.

## 1. Clean Install

Install the CLI and verify `happy` plus `devtunnel` are on PATH.

### Windows PowerShell

```powershell
winget install Microsoft.DevTunnels
corepack enable
pnpm install -g happy
happy --version
devtunnel --version
```

Expected output:

```text
happy 0.x.y
devtunnel version 1.x.y
```

### macOS

```bash
brew install --cask devtunnel
corepack enable
pnpm install -g happy
happy --version
devtunnel --version
```

Expected output:

```text
happy 0.x.y
devtunnel version 1.x.y
```

### Linux

```bash
curl -fsSL https://aka.ms/TunnelsCliDownload/linux-x64 -o devtunnel.tar.gz
mkdir -p ~/.local/bin/devtunnel-cli
tar -xzf devtunnel.tar.gz -C ~/.local/bin/devtunnel-cli
ln -sf ~/.local/bin/devtunnel-cli/devtunnel ~/.local/bin/devtunnel
corepack enable
pnpm install -g happy
happy --version
devtunnel --version
```

Expected output:

```text
happy 0.x.y
devtunnel version 1.x.y
```

## 2. Initialize The Machine

Run `happy` once if this is a fresh profile so the CLI can create the local machine id, then run `happy init` (`happy-cli init` in package terms). The init command checks the Dev Tunnels CLI version, logs into Dev Tunnels with GitHub device flow if needed, creates or reuses a named tunnel, configures the tunnel port, and writes `~/.happy/tunnel.json`.

### Windows PowerShell

```powershell
happy
happy init
```

Expected output:

```text
To sign in, use a web browser to open https://github.com/login/device and enter code XXXX-XXXX
Dev Tunnel ready: https://happy-myhost-machine123.devtunnels.ms
Config written to C:\Users\you\.happy\tunnel.json
```

### macOS

```bash
happy
happy init
```

Expected output:

```text
To sign in, use a web browser to open https://github.com/login/device and enter code XXXX-XXXX
Dev Tunnel ready: https://happy-myhost-machine123.devtunnels.ms
Config written to /Users/you/.happy/tunnel.json
```

### Linux

```bash
happy
happy init
```

Expected output:

```text
To sign in, use a web browser to open https://github.com/login/device and enter code XXXX-XXXX
Dev Tunnel ready: https://happy-myhost-machine123.devtunnels.ms
Config written to /home/you/.happy/tunnel.json
```

## 3. Start The Daemon

Start the daemon after `happy init` succeeds. The daemon reuses the saved port from `machine.json`, starts embedded `happy-server`, starts the Dev Tunnel host, and renews the tunnel when it is near expiry.

### Windows PowerShell

```powershell
happy daemon start
```

Expected output on first server-key creation:

```text
Happy server Ed25519 fingerprint: SHA256:abc123...
```

Expected debug log entries:

```text
Embedded happy-server started on 127.0.0.1:62003
Dev Tunnel host started for https://happy-myhost-machine123.devtunnels.ms
```

### macOS

```bash
happy daemon start
```

Expected output on first server-key creation:

```text
Happy server Ed25519 fingerprint: SHA256:abc123...
```

Expected debug log entries:

```text
Embedded happy-server started on 127.0.0.1:62003
Dev Tunnel host started for https://happy-myhost-machine123.devtunnels.ms
```

### Linux

```bash
happy daemon start
```

Expected output on first server-key creation:

```text
Happy server Ed25519 fingerprint: SHA256:abc123...
```

Expected debug log entries:

```text
Embedded happy-server started on 127.0.0.1:62003
Dev Tunnel host started for https://happy-myhost-machine123.devtunnels.ms
```

## 4. Pair The First Mobile Device

This is the first mobile pair step.

Open the Happy mobile app and start pairing. The app calls the machine tunnel's `/pair/start`, asks GitHub for device-flow authorization, polls `/pair/status`, then shows the machine Ed25519 fingerprint before saving credentials.

### Windows Operator

Expected terminal state:

```text
Dev Tunnel host started for https://happy-myhost-machine123.devtunnels.ms
TOFU handshake accepted: machine123, clientType: user-scoped, client: android/0.x.y
```

Expected mobile state:

```text
GitHub device flow authorized
Trust this machine
Ed25519 fingerprint SHA256:abc123...
```

### macOS Operator

Expected terminal state:

```text
Dev Tunnel host started for https://happy-macbook-machine123.devtunnels.ms
TOFU handshake accepted: machine123, clientType: user-scoped, client: ios/0.x.y
```

Expected mobile state:

```text
GitHub device flow authorized
Trust this machine
Ed25519 fingerprint SHA256:abc123...
```

### Linux Operator

Expected terminal state:

```text
Dev Tunnel host started for https://happy-linuxbox-machine123.devtunnels.ms
TOFU handshake accepted: machine123, clientType: user-scoped, client: android/0.x.y
```

Expected mobile state:

```text
GitHub device flow authorized
Trust this machine
Ed25519 fingerprint SHA256:abc123...
```

After trust is accepted, mobile stores `{ machineId, tunnelUrl, tunnelClaim, tunnelId, deviceCode, deviceCodeExpiresAt, login, avatarUrl, firstSeenAt }` per machine in SecureStore and uses the saved machine list for future multi-machine sync. The `tunnelClaim` is a server-signed envelope that mobile refreshes per request; there is no client-side X25519 session-key derivation. The persisted `deviceCode` has a 15-minute TTL (`deviceCodeExpiresAt`), and its expiry is the re-pair UX boundary — once it lapses, mobile must run the GitHub device flow again to mint a fresh claim.

## Web And Desktop Tunnel Clients Deferred To V2

This is the browser WebSocket `extraHeaders` limitation.

The current tunnel transport depends on `X-Tunnel-Authorization: tunnel <JWT>` being set on Socket.IO WebSocket connections. React Native can pass that header through `extraHeaders`; browser WebSocket clients cannot set arbitrary WebSocket headers, and desktop wrappers that use browser networking inherit the same limitation.

For v1, tunnel-backed pairing and sync are supported by the mobile app and machine-local daemon. Web and desktop tunnel clients are deferred to v2, where the transport can use a browser-compatible authorization channel such as a short-lived query token, cookie-bound upgrade, or a Dev Tunnels-specific browser auth flow.

## Operations

- Re-run `happy init` to recreate or reuse the named tunnel.
- Delete `~/.happy/tunnel.json` only when intentionally rotating the Dev Tunnel id.
- Delete `~/.happy/server-key.*` only when intentionally forcing mobile devices to see a new machine identity.
- Delete `~/.happy/ecdh-key.*` only when intentionally rotating the ECDH identity.
- Do not run a separate `happy-server` deployment for normal operator use; the daemon owns the embedded server lifecycle.
