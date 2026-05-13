---
name: run-tests
description: >
  Run vitest / typecheck for one or more packages with output persisted to
  .test-output/<package>.{typecheck,test}.log so subsequent agents can read
  cached results instead of waiting through another 7-minute run. Use when
  the user types /run-tests, asks to "run tests", "run typecheck", verify a
  change, or check the test baseline before/after a refactor. ALSO use
  proactively before re-running tests yourself — check .test-output/ first
  to avoid 7+ minute rebuilds.
---

# Run Tests

You are the test runner for the codexu monorepo. Tests are slow (happy-cli is ~7 min, happy-app is ~1 min, happy-server is ~20 s, happy-agent is ~35 s — typecheck is ~10–60 s each). The whole point of this skill is to **persist output to disk so you, and any future agent, can read the result instead of re-running**.

## Output location contract

All output goes to `<repo-root>/.test-output/` (already in `.gitignore` — add if missing). One file per (package, mode):

| File | Contents |
|---|---|
| `.test-output/<package>.typecheck.log` | full stdout+stderr of `pnpm --filter '{packages/<package>}' typecheck` |
| `.test-output/<package>.test.log` | full stdout+stderr of `pnpm --filter '{packages/<package>}' test` |
| `.test-output/<package>.meta.json` | metadata (git HEAD, dirty status, timestamp, exit code, duration) |
| `.test-output/all.summary.log` | one-line PASS/FAIL summary per package, appended every run |

Each `.test.log` and `.typecheck.log` is **overwritten** on every run — you only ever need the latest output, and these can be huge. The `.meta.json` is also overwritten.

## Before running anything

1. **Check for cached output first.** For each (package, mode) the user is asking about, read `.test-output/<package>.<mode>.meta.json` if it exists.
2. **Decide if the cache is valid:**
   - Read current `git rev-parse HEAD` and `git status --short` (count of dirty files).
   - Compare to `meta.json.head` and `meta.json.dirtyFiles`.
   - If HEAD matches AND dirty-file list matches (same set, same paths), the cache is **valid** — read the log file, summarize it, and report to the user. **Do not re-run.**
   - If HEAD changed OR any file in the package's directory has been modified since `meta.json.timestamp`, the cache is **stale** — re-run.
   - If `meta.json.timestamp` is older than 24 h, treat as stale even if HEAD matches (defensive).
3. If multiple packages are requested, **check each independently** — you may end up reading cache for some and re-running others.

## Running

Use this exact pattern (Bash on Windows, run from repo root). Substitute `<package>` and `<mode>`:

```bash
mkdir -p .test-output
PKG=happy-server   # one of: happy-server, happy-app, happy-cli, happy-agent
MODE=test          # one of: test, typecheck
START=$(date +%s)
HEAD=$(git rev-parse HEAD)
DIRTY=$(git status --short | sort)
OUT=".test-output/$PKG.$MODE.log"
META=".test-output/$PKG.$MODE.meta.json"

pnpm --filter "{packages/$PKG}" "$MODE" > "$OUT" 2>&1
EXIT=$?
END=$(date +%s)
DURATION=$((END - START))

jq -n \
  --arg pkg "$PKG" --arg mode "$MODE" --arg head "$HEAD" \
  --arg dirty "$DIRTY" --argjson exit "$EXIT" \
  --argjson durationSec "$DURATION" --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{package: $pkg, mode: $mode, head: $head, dirty: ($dirty | split("\n") | map(select(length > 0))),
    exitCode: $exit, durationSec: $durationSec, timestamp: $timestamp}' \
  > "$META"

# Append one-line summary
STATUS=$([ "$EXIT" = "0" ] && echo PASS || echo FAIL)
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $PKG/$MODE $STATUS exit=$EXIT duration=${DURATION}s head=$HEAD" >> .test-output/all.summary.log

echo "--- Wrote $OUT (exit=$EXIT, ${DURATION}s) ---"
tail -30 "$OUT"
```

Run **one** package+mode invocation in the foreground so the user sees the tail. If the user asked for multiple, run them in **parallel via `run_in_background: true`** Bash calls — each writes to its own file, so there's no contention. When all backgrounds complete, summarize.

**Important: never pipe the full test output into your context** — only `tail -30` (or grep for FAIL lines) into your summary. The full output stays on disk for cache reads.

## Summarizing for the user

After a run (or after reading from cache), report concisely. **Do NOT dump the full log.** Match the format below; replace bracketed values:

```
[package] [mode]: [PASS|FAIL] — N/M tests ([failed-count] fail), [duration]s
[if FAIL: 3–5 line excerpt of the first failure, with file:line]
[full output: .test-output/<package>.<mode>.log]
```

If using cache: prefix with `(cached, head=<sha7>, age=<minutes>m)` so the user knows you didn't actually re-run.

## Filtering further (for triage)

If the user asks about a specific test or file, grep the existing log instead of re-running:

```bash
grep -nE "FAIL|✗|Error:" .test-output/<package>.test.log | head -40
# or pinpoint a specific test:
grep -B 2 -A 20 "test name fragment" .test-output/<package>.test.log
```

This is much faster than vitest's `--reporter=verbose` for triage.

## Known baseline failures (happy-cli)

happy-cli has 50ish pre-existing baseline failures in the test suite as of 2026-05-13 (tunnelManager Dev Tunnels URL parsing, `runClaude` mock missing `setLedgerIdleReachedHandler`, Windows flakies). These are environmental / test-fixture issues, **not** regressions. When a happy-cli test run produces 50 fails and the previous baseline log shows the same 50, treat the run as a no-regression PASS. Use:

```bash
diff <(grep "FAIL" .test-output/happy-cli.test.log | sort) \
     <(grep "FAIL" .test-output/happy-cli.test.log.baseline | sort)
```

(Copy the current log to `.baseline` after a known-good main run to seed the comparison.)

## When NOT to use this skill

- Tests are < 5 s (e.g. one file with a focused `vitest run path/to/test.ts`) — just run directly.
- User wants to debug interactively or attach a debugger — vitest watch mode in their own terminal.
- Tests are running in CI — defer to CI logs, don't re-run locally.

## Output dir hygiene

`.test-output/` should be in `.gitignore`. Check on first invocation; add the entry if missing:

```bash
grep -qxF '.test-output/' .gitignore || echo '.test-output/' >> .gitignore
```

Do **not** commit `.test-output/` contents — logs are large and machine-specific.
