# Sprint E merge handoff (operator-run)

Sprint E lives on `ralph/devtunnels-E-cleanup`, which branches from
`ralph/devtunnels-A-foundation` (the merged Sprint A+B+C+D base, 111 commits
ahead of `ralph/fan-out-survivors` at the start of Sprint E).

## Prerequisites before merging

- [ ] US-005 (BOOX validation): `docs/validation/devtunnels-boox-result.md`
  records PASS (or all FAILs deferred with notepad entries) for phases 1–4
  and phase 6.
- [ ] US-002 (Prisma migration gate): operator has run
  `pnpm --filter happy-server exec prisma migrate dev --name drop_legacy_models_sprint_e`
  and committed the generated migration directory
  `packages/happy-server/prisma/migrations/*drop_legacy_models_sprint_e/`.
  `pnpm --filter happy-server typecheck` passes against the regenerated client.

## Merge command (operator)

```sh
git checkout ralph/fan-out-survivors
git pull
git merge --no-ff ralph/devtunnels-A-foundation \
    -m "Merge Sprint A+B+C+D: Dev Tunnels foundation + fan-out"
git merge --no-ff ralph/devtunnels-E-cleanup \
    -m "Merge Sprint E: legacy cleanup + R-D18 path (b) + final cutover"
```

`--no-ff` is required by `AGENTS.md` and the merge skill — preserves the
per-sprint commit boundary for git-bisect.

## Post-merge verification

```sh
pnpm --filter happy-server typecheck
pnpm --filter happy typecheck
pnpm --filter happy-agent typecheck
pnpm --filter happy-app typecheck
pnpm --filter happy-wire typecheck
pnpm --filter happy-server test
pnpm --filter happy test --project unit
pnpm --filter happy-agent test
pnpm --filter happy-app test
pnpm --filter happy-wire test
pnpm --filter happy-server exec prisma validate
pnpm --filter happy-server exec prisma generate
```

All must exit 0. Do NOT substitute `pnpm -r test` or bare
`pnpm --filter happy test` here: `packages/happy-cli/vitest.config.ts`
registers four integration projects (`integration-empty`,
`integration-claude-utils`, `integration-plan-mode`,
`integration-authenticated`) that require `HAPPY_INTEGRATION=1` plus
external/authenticated setup and would hang or fail this gate. The
scoped commands above mirror AC-E3.1 and are the day-to-day gate.

### Optional: authenticated integration gate

Run ONLY when the authenticated integration environment is available
(`HAPPY_INTEGRATION=1`, GitHub OAuth + Dev Tunnels reachable, the
fan-out integration harness from US-E3 wired up):

```sh
HAPPY_INTEGRATION=1 pnpm --filter happy test --project integration-authenticated
```

This is the same scoped command US-E3 AC-E3.8 uses to exercise the
new `Daemon Fan-Out Integration` describe block. Skip it on hosts
without the authenticated setup; the scoped unit-test block above is
the cutover gate.

## If `fan-out-survivors` has drifted

If commits land on `ralph/fan-out-survivors` between the start of Sprint A and
this merge, expect conflicts in `packages/happy-server/sources/app/api/api.ts`
and `socket.ts` (the route/handler registration files), `prisma/schema.prisma`,
and the deleted-doc files in `docs/`. Resolve in favor of the Sprint E side
for the deletion stories (US-E1, US-E2, US-E6) — the whole point of E is to
carry those deletions forward. Resolve in favor of the survivor's side only
if the survivor commit added a genuinely new feature that Sprint E did not
intend to drop.

Specific files most likely to conflict:

| File | Preferred resolution |
|------|----------------------|
| `packages/happy-server/sources/app/api/api.ts` | Sprint E side (deleted route imports removed) |
| `packages/happy-server/sources/app/api/socket.ts` | Sprint E side (deleted handler registrations removed) |
| `packages/happy-server/prisma/schema.prisma` | Sprint E side (reduced to 4 kept models) |
| `docs/` any updated file | Sprint E side for deleted-route references; survivor side for genuinely new content |

After conflict resolution, re-run the post-merge verification block. If any
step fails, abort the merge (`git merge --abort`) and re-plan.

## Optional: merge to main

If the operator wants to push the cutover to `main`:

```sh
git checkout main
git pull
git merge --no-ff ralph/fan-out-survivors \
    -m "Merge Sprint E cutover from fan-out-survivors"
```

Same conflict-resolution rules apply. Run the post-merge verification block
again after merging to `main`.
