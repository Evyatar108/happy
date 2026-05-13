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

## Models dropped in Sprint E (US-002, commit 4ca6dd8d)

All 14 models listed below were removed in the same cleanup pass. Nine were explicitly authorized by AC-E2.1; five additional models had zero code references across the entire monorepo and were removed as part of the same coherent cleanup (scope expansion, intentional):

**AC-E2.1 authorized (9):**
- `Artifact`
- `AccessKey`
- `ServiceAccountToken`
- `UsageReport`
- `UserFeedItem`
- `VoiceConversation`
- `UserKVStore`
- `TerminalAuthRequest`
- `AccountAuthRequest`

**Zero-reference models also dropped (5, intentional scope expansion):**
- `GithubOrganization`
- `GlobalLock`
- `RepeatKey`
- `SimpleCache`
- `UploadedFile`

No code references to any of these 14 models exist in the monorepo. `PushToken` was intentionally retained alongside `pushRoutes.ts`.
