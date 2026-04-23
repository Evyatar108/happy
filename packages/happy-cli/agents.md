# Happy CLI Agent Tests

## Layer 1 Rules

- one primary integration test file per agent
- keep that file next to the agent code
- use 2-3 long integration tests per agent
- mocked tests do not count as acceptance
- do not build a generic layer-1 framework directory
- test the real agent surface directly

## Primary Files

- `packages/happy-cli/src/codex/codex.integration.test.ts`
- `packages/happy-cli/src/claude/claude.integration.test.ts`
- `packages/happy-cli/src/gemini/gemini.integration.test.ts`
- `packages/happy-cli/src/openclaw/openclaw.integration.test.ts`

If an agent has extra integration-style files, only one file is the primary
acceptance test. The rest are support checks.

Per-utility integration tests may live colocated with the utility
(e.g., `src/claude/utils/<helper>.integration.test.ts`) when their scope is
narrow and independent of agent-level integration. These are not primary
acceptance tests and do not replace the primary files listed above.

## What Each Primary Test Must Cover

Every primary agent integration file must cover:

1. basic turn + multi-turn context
2. permissions + model switching + sandboxing
3. interrupt + stop + failure handling

If an agent does not support part of that surface, the test should assert the
real limitation directly.

## Test Shape

Keep it simple:

- one file per agent
- a few long tests
- real CLI
- real auth
- real permission flow
- real interruption

No mocks as the main proof.

## Release Checklist

- Before each `cli-v` release, manually verify shadow-session behavior against a dev account and confirm zero tokens were consumed in the usage dashboard during a local-mode happy session.
