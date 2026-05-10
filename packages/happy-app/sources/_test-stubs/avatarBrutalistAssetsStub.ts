// Minimal stub for `@/components/avatarBrutalistAssets` used only by the Vitest
// node runner. The real module `require()`s 420 PNG files via the `@/assets/...`
// alias, which Node cannot resolve without Metro's image transformer. Any test
// that transitively imports `sources/sync/persistence.ts` (which validates
// `pinnedAvatarImageIndex` / `pinnedAvatarColorIndex` against the asset bounds
// at lines 277-280) would otherwise crash at collection time.
//
// This stub replicates the public surface of the real module
// (`allImages: any[]`, `colorPairs: Array<{ tint, background }>`, `hashCode`)
// using cheap placeholders. The counts (420 images, 6 colorPairs) match the
// real module so that bound-checks against `.length` behave identically.
//
// Specs that want to assert on the real asset shape or test deterministic
// hashing against actual images can still call `vi.mock('@/components/avatarBrutalistAssets', ...)`
// with their own implementation; per-test mocks override aliases.

export const allImages: number[] = Array.from({ length: 420 }, (_, index) => index);

export const colorPairs: Array<{ tint: string; background: string }> = Array.from(
    { length: 6 },
    (_, index) => ({ tint: `${index}`, background: `${index}` })
);

export function hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash);
}

export default {
    allImages,
    colorPairs,
    hashCode,
};
