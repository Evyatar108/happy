// Global Vitest setup file, registered via `setupFiles` in `vitest.config.mts`.
//
// Each `vi.mock(...)` call below is hoisted to apply to every spec before its
// own setup runs. Specs that need different behavior can override with their
// own `vi.mock(...)` at the top of the file (per-spec mocks win).

import { vi } from 'vitest';

// `@/components/avatarBrutalistAssets` `require()`s 420 PNG files through the
// `@/assets/...` alias, which Vitest's node runner cannot resolve (no Metro
// image transformer). Any spec that transitively imports `sources/sync/persistence.ts`
// (which bound-checks pin tuples against `allImages.length` / `colorPairs.length`)
// or any AvatarBrutalist* component would otherwise crash at collection time.
//
// `vi.mock` here matches by resolved module ID, so both `@/components/avatarBrutalistAssets`
// (used by `avatarTopic.ts` and `persistence.ts`) AND `./avatarBrutalistAssets`
// (used by `AvatarBrutalist.tsx` and `AvatarTopicBrutalist.tsx`) hit the same mock.
//
// Specs that test avatar logic itself (`avatarTopic.test.ts`, `AvatarTopicBrutalist.test.tsx`)
// override this with their own `vi.mock` that provides deterministic image-index assertions.
vi.mock('@/components/avatarBrutalistAssets', async () => {
    const stub = await import('./avatarBrutalistAssetsStub');
    return stub;
});
