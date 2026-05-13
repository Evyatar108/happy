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

// `@/hooks/useFileAttachment` transitively imports `expo-document-picker` and
// `expo-file-system`, which call into `expo-modules-core` and require the
// `globalThis.expo` runtime that doesn't exist under Vitest's node runner.
// Stub it with an inert shape so any spec rendering `AgentInput` (which P4
// added the hook to) collects cleanly. Specs that exercise real attachment
// behavior (e.g. `AgentInput.attachments.test.tsx`) override this per-spec.
vi.mock('@/hooks/useFileAttachment', () => ({
    useFileAttachment: () => ({
        attachments: [],
        addFiles: vi.fn(),
        removeAttachment: vi.fn(),
        clear: vi.fn(),
        isDragActive: false,
        openFilePicker: vi.fn(),
        inputProps: { onChange: vi.fn() },
        rootProps: { onDrop: vi.fn(), onPaste: vi.fn() },
    }),
}));

// `@/hooks/useNewSessionAttachments` imports `expo-image-manipulator` and
// `expo-image-picker` at module load (for the picker / EXIF strip helpers),
// which also call into `expo-modules-core` and fail under Vitest's node
// runner. Stub the zustand store + helpers with inert shapes so any spec
// rendering `/new/index.tsx` (the new-session route from P2) collects
// cleanly. Specs that exercise real picker behavior override per-spec.
vi.mock('@/hooks/useNewSessionAttachments', () => ({
    useNewSessionAttachments: (selector?: (state: unknown) => unknown) => {
        const state = {
            attachments: [],
            setAttachment: vi.fn(),
            clearAttachment: vi.fn(),
            clearAttachments: vi.fn(),
        };
        return selector ? selector(state) : state;
    },
    getBase64Payload: (ref: string) => ref.replace(/^data:[^;]+;base64,/, ''),
    getRawByteEstimateFromBase64: (b64: string) => Math.floor((b64.length * 3) / 4),
    normalizeNewSessionImageMimeType: (m: string | null | undefined) => (m === 'image/png' || m === 'image/jpeg' || m === 'image/jpg' ? (m === 'image/jpg' ? 'image/jpeg' : m) : null),
    prepareNewSessionImageAttachment: vi.fn(async () => ({ id: 'stub', mimeType: 'image/png', ref: 'data:image/png;base64,AAA=', encodedBytes: 4 })),
    pickNewSessionImageAttachment: vi.fn(async () => null),
}));
