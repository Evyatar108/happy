# Prisma migrations - HUMAN-only

After Sprint E US-E2 lands the schema changes, run in the worktree against a scratch Postgres or PGlite database:

```bash
pnpm --filter happy-server exec prisma migrate dev --name drop_legacy_models_sprint_e
```

The generated SQL lands at `prisma/migrations/<timestamp>_drop_legacy_models_sprint_e/migration.sql`. Commit that file, and any updated `migration_lock.toml`, on the same branch.

Verification:

```bash
pnpm --filter happy-server exec prisma validate
pnpm --filter happy-server exec prisma generate
pnpm --filter happy-server typecheck
```
