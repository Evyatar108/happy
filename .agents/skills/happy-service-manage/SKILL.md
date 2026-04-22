---
name: happy-service-manage
description: >
  Manage the HappyServer + cloudflared Windows services on the dev box.
  Common ops: restart after code changes, view logs, check status, update
  credentials/config, debug tunnel failures. Assumes both services are
  already installed via `scripts/fork-setup/setup-services.ps1`.
---

# /happy-service-manage -- Windows-service ops for happy-server + cloudflared

## Preconditions (verify before using this skill)

1. Both services are installed:
   ```powershell
   Get-Service HappyServer, cloudflared
   ```
   Expected: two rows, `StartType = Automatic`.
2. `nssm` on PATH (`command -v nssm`).
3. Elevated PowerShell for any `Restart-Service` / `Stop-Service` / `Start-Service`. Read-only probes (Get-Service, curl, log tailing) don't need elevation.

If any precondition fails, run `scripts/fork-setup/setup-services.ps1` from elevated PowerShell to re-create the services.

## Status at a glance

```powershell
Get-Service HappyServer, cloudflared | Format-Table Name, Status, StartType -AutoSize
```

```bash
# origin health
curl -s -o /dev/null -w "localhost:3005 HTTP %{http_code}\n" -m 5 http://localhost:3005
# tunnel end-to-end
curl -s -o /dev/null -w "tunnel HTTP %{http_code}\n"   -m 10 https://happy.evyatar.dev
```

Healthy = both `Running`, localhost `200`, tunnel `200`.

## Restart happy-server after editing server code

You changed `packages/happy-server/sources/...` in `D:\harness-efforts\happy`. The service runs `pnpm --filter happy-server standalone:dev` from that primary clone, so the edit is live on disk. Kick the service:

```powershell
Restart-Service HappyServer
```

Startup takes ~8 s (migrate phase + serve). Tail while it boots:

```powershell
Get-Content D:\harness-efforts\happy\packages\happy-server\logs\service-stdout.log -Tail 30 -Wait
```

Look for `API ready on port http://localhost:3005` -- service is up.

## Restart cloudflared after editing the tunnel config

**Critical:** editing `C:\Users\evmitran\.cloudflared\config.yml` alone does NOT affect the service. LocalSystem reads from `C:\Windows\System32\config\systemprofile\.cloudflared\config.yml`. Two-step update:

```powershell
Copy-Item "$env:USERPROFILE\.cloudflared\config.yml" `
          "C:\Windows\System32\config\systemprofile\.cloudflared\config.yml" -Force
Restart-Service cloudflared
```

Same protocol for rotating `cert.pem` or the credentials JSON file. Or re-run `scripts/fork-setup/setup-services.ps1` which copies + rewrites paths idempotently.

## View logs

| What | Path |
|---|---|
| HappyServer stdout (migrate output, pino bootstrap) | `D:\harness-efforts\happy\packages\happy-server\logs\service-stdout.log` |
| HappyServer stderr (ExperimentalWarnings etc.) | `D:\harness-efforts\happy\packages\happy-server\logs\service-stderr.log` |
| HappyServer rich pino log (per-request, per-auth) | `D:\harness-efforts\happy\packages\happy-server\.logs\<MM-DD-HH-MM-SS>.log` |
| cloudflared stdout (connection bring-up) | `D:\harness-efforts\happy\packages\happy-server\logs\cloudflared-stdout.log` |
| cloudflared stderr (tunnel errors) | `D:\harness-efforts\happy\packages\happy-server\logs\cloudflared-stderr.log` |

Tail live: `Get-Content <path> -Tail 30 -Wait` from any PowerShell (no elevation needed).

Rotation: all four log files auto-rotate at 10 MB (nssm config).

## Common failure modes

### Tunnel returns 1033 (Cloudflare edge error)

Means: `happy.evyatar.dev` resolves to a cloudflared tunnel that has no active connection to Cloudflare.

Check: `Get-Service cloudflared` -- if `Stopped`, `Start-Service cloudflared` and watch cloudflared-stderr.log.

If the service is Running but 1033 persists, check the event log:

```powershell
Get-EventLog -LogName Application -Source "cloudflared" -Newest 5 | Format-List Message, TimeGenerated
```

If you see `Cloudflared service arguments: [C:\...\cloudflared.exe]` with NO args, the native `cloudflared service install` replaced our nssm wrapper. Re-run `scripts/fork-setup/setup-services.ps1`.

### Tunnel returns 530 (no origin connected)

Same root cause as 1033 most of the time -- cloudflared service is down or misconfigured.

### Tunnel returns 502 Bad Gateway

cloudflared is up and connected, but happy-server isn't reachable on `http://localhost:3005`. Check:

```powershell
Get-Service HappyServer
```

If Stopped, `Start-Service HappyServer` and tail `service-stdout.log`. If Running but 502 persists, the migrate step may have crashed -- tail `service-stdout.log` + `.logs/<date>.log` for the trace.

### localhost:3005 refuses connections

happy-server crashed post-start. Common cause: corrupted PGlite data dir. Last resort:

```powershell
Stop-Service HappyServer
Remove-Item "D:\harness-efforts\happy\packages\happy-server\data\pglite" -Recurse -Force
Start-Service HappyServer
```

This wipes server-side state -- you'll lose sessions, machines, messages. Not for lightly.

### `Stop-Service cloudflared` hangs in an infinite "Waiting for service to stop" loop

cloudflared drains active tunnel connections before stopping, and the drain can wedge. Fire-and-forget pattern:

```powershell
& sc.exe stop cloudflared
Start-Sleep -Seconds 2
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
```

## Critical gotchas

- **LocalSystem profile, not user profile.** Both services run as LocalSystem. happy-server writes data under its `AppDirectory` (`D:\harness-efforts\happy\packages\happy-server\data\pglite\`), which is fine. cloudflared reads config from `C:\Windows\System32\config\systemprofile\.cloudflared\` -- changes to `~/.cloudflared/` don't reach the service without a copy step.
- **PowerShell 5.1 mangles `sc.exe config binPath=` quoted strings.** Never try to rewrite binPath via `sc.exe` from the default admin Terminal on Windows -- the quotes get stripped. Use nssm (which is what `scripts/fork-setup/setup-services.ps1` does) or `Set-Service -BinaryPathName` from PowerShell 7+.
- **Native `cloudflared service install` is buggy on Windows for locally-created named tunnels.** It registers binPath with no `tunnel run` subcommand, so cloudflared starts, sees no subcommand, prints help, exits. Event Viewer entry: `Cloudflared service arguments: [C:\...\cloudflared.exe]`. Use nssm instead.
- **PowerShell 5.1 reads scripts as CP-1252 (ANSI), not UTF-8, when there's no BOM.** Scripts with em-dashes or other non-ASCII characters will tokenize-error. Keep these scripts ASCII-only, or save with UTF-8 BOM.
- **happy-server migrate output goes to stdout, serve output goes to a separate pino file.** `service-stdout.log` will look "stuck" after migrate completes; the actual "listening on 3005" line is in `.logs/<MM-DD-HH-MM-SS>.log`. Don't panic.

## Uninstall everything

```powershell
& sc.exe stop cloudflared
& sc.exe stop HappyServer
Start-Sleep -Seconds 2
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
nssm remove cloudflared confirm
nssm remove HappyServer confirm
# (optional) clear LocalSystem config:
Remove-Item "C:\Windows\System32\config\systemprofile\.cloudflared" -Recurse -Force
```

## When to stop using this skill / escalate

- You're rotating / recreating the named tunnel itself (e.g. `cloudflared tunnel delete happy` + re-create with new UUID). This is a one-off setup task -- use the commands in `docs/fork-notes.md` under "Cloudflare tunnel", then re-run `scripts/fork-setup/setup-services.ps1` to point the service at the new credentials.
- You're migrating the happy-server to a different port / host / data dir. Edit `packages/happy-server/.env.dev` + re-run the setup script (which also updates the `ingress.service:` URL in the system-profile config.yml if you change the source `~/.cloudflared/config.yml`).
- Windows OS rebuild / fresh machine -- follow the setup script's prereq list from scratch, then run it.
