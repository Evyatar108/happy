// Plan 12 (codexu consumer migration): `scripts/lib/*.test.mjs` lived in
// codexu pre-extraction and was the only thing this root vitest config covered.
// Those tests moved to the @gim-home/ralph-overview plugin; nothing remains at
// the codexu root that vitest needs to run. Per-workspace vitest configs still
// run via `pnpm --filter <pkg> test`. This stub keeps `pnpm test` from
// erroring on a stale config — remove this file entirely if a future root-level
// test suite is added.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'codexu-root',
    environment: 'node',
    include: [],
    passWithNoTests: true,
  },
});
