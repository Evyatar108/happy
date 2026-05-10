import * as React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reactActEnvironment = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
};

const shared = vi.hoisted(() => ({
    alertMock: vi.fn(),
    getDocumentAsyncMock: vi.fn(),
    base64Mock: vi.fn(),
    latestHook: null as null | ReturnType<typeof import('./useFileAttachment').useFileAttachment>,
}));

vi.mock('@/modal', () => ({
    Modal: {
        alert: shared.alertMock,
    },
}));

vi.mock('@/text', () => ({
    t: (key: string) => key,
}));

vi.mock('expo-document-picker', () => ({
    getDocumentAsync: shared.getDocumentAsyncMock,
}));

vi.mock('expo-file-system', () => ({
    File: class {
        uri: string;

        constructor(uri: string) {
            this.uri = uri;
        }

        base64() {
            return shared.base64Mock(this.uri);
        }
    },
}));

const { useFileAttachment } = await import('./useFileAttachment');

function Harness() {
    shared.latestHook = useFileAttachment();
    return null;
}

async function renderHook() {
    await act(async () => {
        TestRenderer.create(<Harness />);
    });

    if (!shared.latestHook) {
        throw new Error('Expected hook result');
    }

    return shared.latestHook;
}

function candidate(name: string, size: number, base64 = 'Ym9keQ==') {
    return {
        name,
        size,
        readBase64: vi.fn().mockResolvedValue(base64),
    };
}

describe('useFileAttachment native', () => {
    beforeEach(() => {
        reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
        shared.alertMock.mockReset();
        shared.getDocumentAsyncMock.mockReset();
        shared.base64Mock.mockReset();
        shared.latestHook = null;
    });

    afterEach(() => {
        delete reactActEnvironment.IS_REACT_ACT_ENVIRONMENT;
    });

    it('rejects oversize per-file and total-size additions with localized errors', async () => {
        let hook = await renderHook();

        await act(async () => {
            await hook.addFiles([candidate('huge.txt', 25 * 1024 * 1024 + 1)]);
        });
        expect(shared.alertMock).toHaveBeenCalledWith('common.error', 'errors.attachmentPerFileTooLarge', [{ text: 'common.ok' }]);
        expect(shared.latestHook?.attachments).toHaveLength(0);

        hook = shared.latestHook!;
        await act(async () => {
            await hook.addFiles(Array.from({ length: 5 }, (_, index) => candidate(`file-${index}.txt`, 21 * 1024 * 1024)));
        });
        expect(shared.alertMock).toHaveBeenLastCalledWith('common.error', 'errors.attachmentTotalTooLarge', [{ text: 'common.ok' }]);
        expect(shared.latestHook?.attachments).toHaveLength(0);
    });

    it('dedupes names and clears attachment state', async () => {
        const hook = await renderHook();

        await act(async () => {
            await hook.addFiles([candidate('name.ext', 1), candidate('NAME.ext', 1)]);
        });

        expect(shared.latestHook?.attachments.map(file => file.name)).toEqual(['name.ext', 'NAME (2).ext']);

        act(() => {
            shared.latestHook?.clear();
        });

        expect(shared.latestHook?.attachments).toEqual([]);
    });

    it('uses expo-document-picker for native selection', async () => {
        shared.getDocumentAsyncMock.mockResolvedValue({
            canceled: false,
            assets: [{ name: 'picked.txt', size: 4, uri: 'file:///picked.txt', mimeType: 'text/plain' }],
        });
        shared.base64Mock.mockResolvedValue('cGlja2Vk');
        const hook = await renderHook();

        await act(async () => {
            await hook.pickFiles();
        });

        expect(shared.getDocumentAsyncMock).toHaveBeenCalledWith({ multiple: true, copyToCacheDirectory: true });
        expect(shared.base64Mock).toHaveBeenCalledWith('file:///picked.txt');
        expect(shared.latestHook?.attachments).toMatchObject([
            { name: 'picked.txt', size: 4, base64: 'cGlja2Vk', mimeType: 'text/plain' },
        ]);
    });
});
