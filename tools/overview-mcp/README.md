# Overview MCP Server

`@codexu/overview-mcp` exposes the Ralph overview state through Model Context Protocol tools. It reads the same configured artifacts used by `tools/overview-viewer/`: `plans/overview-snapshot.json`, `plans/overview-data.js`, `plans/overview-recommendations.json`, `plans/overview-ralph-state.json`, task journals, crew manifests, and crew transcripts.

Stdout is reserved for MCP JSON-RPC traffic. Server diagnostics and helper output must go to stderr.

## Install

Build the server and register it in the machine-local Claude settings:

```sh
pnpm overview-mcp:build
pnpm overview-mcp:install
```

The installer writes `<repoRoot>/.claude/settings.local.json`. That file is intentionally gitignored. To preview the merged settings without writing:

```sh
pnpm --filter @codexu/overview-mcp exec overview-mcp-install --print-only
```

Registration shape:

```json
{
  "mcpServers": {
    "codexu-overview": {
      "command": "node",
      "args": ["D:/harness-efforts/codexu/tools/overview-mcp/dist/index.js"]
    }
  }
}
```

The path is absolute and normalized to forward slashes so it works from Windows-hosted Claude Code settings.

## Verify

In Claude Code, run `/mcp` and confirm `codexu-overview` is connected, or inspect the tool list for names beginning with `overview.`.

PowerShell checks:

```powershell
pnpm overview-mcp:build
pnpm --filter @codexu/overview-mcp typecheck
pnpm --filter @codexu/overview-mcp test
pnpm --filter @codexu/overview-mcp exec overview-mcp-install --print-only | ConvertFrom-Json | Select-Object -ExpandProperty mcpServers
```

Startup stdout must stay empty:

```powershell
$out = New-TemporaryFile
$err = New-TemporaryFile
$p = Start-Process node -ArgumentList 'tools/overview-mcp/dist/index.js' -RedirectStandardOutput $out -RedirectStandardError $err -PassThru -WindowStyle Hidden
Start-Sleep -Milliseconds 500
$p.CloseMainWindow() | Out-Null
if (-not $p.HasExited) { $p.Kill() }
Get-Item $out | Select-Object Length
Get-Content $err
```

Expected: stdout length is `0`, stderr includes `connected`.

## Tool Contracts

Every tool returns one MCP text content item containing pretty-printed JSON. Read-only tools use `{ "ok": true, "data": ... }` or `{ "ok": false, "error": "..." }` unless noted.

| Tool | Inputs | Output | Mutation | Errors |
|---|---|---|---|---|
| `overview.list_tasks` | Optional `filter`: `stage`, `scope`, `workstream`, `hasDeferredQuestions`, `hasOpenFindings` | `{ ok, data: [{ taskId, title, stage?, jobSlug?, lastUpdatedAt? }] }` | None | `missing snapshot` |
| `overview.get_task` | `taskId` | `{ ok, data: SnapshotTask & { recentJournal: string[] } }`; journal is the last 3 non-empty lines | None | `missing snapshot`, `unknown task` |
| `overview.next_command` | `taskId` | `{ ok, data: NextCommand | null }` from `deriveNextCommand()` | None | `missing snapshot`, `unknown task` |
| `overview.invoke_next` | `taskId`, optional `viaCrewMember: { crewName, memberName? }` | Default mode returns `{ ok: true, command, invocationGuidance }`; crew mode returns `{ ok: true, sessionRef }` | Crew mode may spawn a crew member through `runWorkOnViaCrew()` | `missing snapshot`, `unknown task`, `missing task stage`, `requires plan 08` |
| `overview.list_recommendations` | Optional `limit`, `stageFilter` | `{ ok, data: Recommendation[] }` from snapshot, falling back to `plans/overview-recommendations.json` | None | `no recommendations available` |
| `overview.list_blockers` | None | `{ ok, data: SnapshotTask[] }` for blocked-stage tasks, tasks with open review findings, or tasks with deferred questions | None | `missing snapshot` |
| `overview.list_crew_sessions` | Optional `taskId` exact match | `{ ok, data: LiveCrewSession[] }`, where each row includes `taskId`, `stage`, `role`, `crewName`, `memberName`, optional `sessionId`, optional `transcriptPath`, and live manifest fields | None | `missing overview data`, `missing Ralph state` |
| `overview.get_transcript` | `sessionId`, optional `lastN` up to 100, optional `includeToolEvents` | `{ ok, data: TranscriptTurn[] }`; tool events are filtered unless requested | None | `session not found`, or the propagated crew-session read error |
| `overview.add_journal_entry` | `taskId`, `note`, optional `ts` | `{ ok, data: { taskId, ts } }` | Appends `- <ts>  note: <note>` to `tasks/<taskId>/journal.md`; multiline notes continue with `\n  ` | Invalid task id message from `assertSafeTaskId()` |
| `overview.set_override` | `slug`, `taskId` | `{ ok, data: { slug, taskId } }` | Sets `ralphOverrides[slug] = taskId` in `plans/overview-data.js` with AST-located source splicing and atomic write | Invalid task id, read failure, parse failure, or missing `window.OVERVIEW_DATA` assignment |

Mutation tools are deliberately narrow:

- `overview.add_journal_entry` creates `tasks/<taskId>/` if needed and appends duplicate notes when called repeatedly.
- `overview.set_override` validates the edited `overview-data.js` before writing and leaves the file untouched on parse or assignment errors.
- `overview.invoke_next` only mutates external state when `viaCrewMember` is supplied; the helper's confirmation output is redirected to stderr.

## Development

```sh
pnpm --filter @codexu/overview-mcp build
pnpm --filter @codexu/overview-mcp typecheck
pnpm --filter @codexu/overview-mcp test
```

Use `scripts/lib/resolve-config.mjs` for paths. Do not hardcode overview artifact locations in new tools.
