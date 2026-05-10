import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MMKV } from 'react-native-mmkv';
import { saveNewSessionDraft } from '@/sync/persistence';

const mocks = vi.hoisted(() => ({
    manipulateAsync: vi.fn(),
}));

vi.mock('expo-image-manipulator', () => ({
    manipulateAsync: mocks.manipulateAsync,
    SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
}));

vi.mock('expo-image-picker', () => ({
    launchImageLibraryAsync: vi.fn(),
}));

const {
    prepareNewSessionImageAttachment,
    useNewSessionAttachments,
} = await import('./useNewSessionAttachments');

const draftStorage = new MMKV();

describe('useNewSessionAttachments', () => {
    beforeEach(() => {
        draftStorage.clearAll();
        useNewSessionAttachments.getState().clearAttachments();
        vi.clearAllMocks();
    });

    it('stages a 3 MB raw attachment without changing the persisted new-session draft payload', () => {
        saveNewSessionDraft({
            input: 'hello',
            selectedMachineId: 'machine-1',
            selectedPath: '/repo',
            agentType: 'claude',
            permissionMode: 'default',
            modelMode: 'default',
            sessionType: 'simple',
            worktreeKey: null,
            updatedAt: 100,
        });
        const before = draftStorage.getString('new-session-draft-v1');

        useNewSessionAttachments.getState().setAttachment({
            id: 'attachment-1',
            type: 'image',
            ref: `data:image/png;base64,${'a'.repeat(4 * 1024 * 1024)}`,
            mimeType: 'image/png',
            encodedBytes: 4 * 1024 * 1024,
        });

        expect(useNewSessionAttachments.getState().attachments).toHaveLength(1);
        expect(draftStorage.getString('new-session-draft-v1')).toBe(before);
    });

    it('rejects non-JPEG/PNG images before staging', async () => {
        await expect(prepareNewSessionImageAttachment({
            uri: 'data:image/gif;base64,abc123',
            mimeType: 'image/gif',
            base64: 'abc123',
        })).rejects.toThrow('unsupported-type');
    });

    it('compresses oversized selected images into a base64 JPEG attachment', async () => {
        mocks.manipulateAsync.mockResolvedValue({
            uri: 'file://compressed.jpg',
            width: 800,
            height: 600,
            base64: 'b'.repeat(1024),
        });

        const attachment = await prepareNewSessionImageAttachment({
            uri: 'file://selected.png',
            mimeType: 'image/png',
            base64: 'a'.repeat(4 * 1024 * 1024 + 1),
            width: 4000,
            height: 3000,
            fileName: 'selected.png',
        });

        expect(mocks.manipulateAsync).toHaveBeenCalledWith(
            'file://selected.png',
            [{ resize: { width: 4000, height: 3000 } }],
            { base64: true, compress: 0.85, format: 'jpeg' },
        );
        expect(attachment.mimeType).toBe('image/jpeg');
        expect(attachment.ref).toBe(`data:image/jpeg;base64,${'b'.repeat(1024)}`);
        expect(attachment.name).toBe('selected.png');
    });
});
