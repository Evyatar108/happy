import * as React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Opt out of the global `vi.mock('@/hooks/useFileAttachment', ...)` from
// `_test-stubs/setup.ts` — this spec exercises the real web hook.
vi.unmock('@/hooks/useFileAttachment');

const reactActEnvironment = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
};

const shared = vi.hoisted(() => ({
    alertMock: vi.fn(),
    latestHook: null as null | ReturnType<typeof import('./useFileAttachment.web').useFileAttachment>,
}));

vi.mock('@/modal', () => ({
    Modal: {
        alert: shared.alertMock,
    },
}));

vi.mock('@/text', () => ({
    t: (key: string) => key,
}));

const { useFileAttachment } = await import('./useFileAttachment.web');

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

function dataTransferItems(items: Array<{ kind: string; file?: File }>) {
    return Object.assign(items.map(item => ({
        kind: item.kind,
        getAsFile: () => item.file ?? null,
    })), { length: items.length }) as unknown as DataTransferItemList;
}

describe('useFileAttachment web', () => {
    beforeEach(() => {
        reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
        shared.alertMock.mockReset();
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

    it('adds files from DOM drop and paste while ignoring non-file items', async () => {
        const hook = await renderHook();
        const droppedFile = new File(['drop-body'], 'drop.txt', { type: 'text/plain' });
        const pastedFile = new File(['paste-body'], 'paste.txt', { type: 'text/plain' });
        const dropPreventDefault = vi.fn();
        const pastePreventDefault = vi.fn();

        await act(async () => {
            await hook.rootProps.onDrop({
                preventDefault: dropPreventDefault,
                dataTransfer: { items: dataTransferItems([{ kind: 'string' }, { kind: 'file', file: droppedFile }]) },
            } as unknown as React.DragEvent<HTMLElement>);
        });

        await act(async () => {
            await shared.latestHook!.rootProps.onPaste({
                preventDefault: pastePreventDefault,
                clipboardData: { items: dataTransferItems([{ kind: 'file', file: pastedFile }]) },
            } as unknown as React.ClipboardEvent<HTMLElement>);
        });

        expect(dropPreventDefault).toHaveBeenCalledOnce();
        expect(pastePreventDefault).toHaveBeenCalledOnce();
        expect(shared.latestHook?.attachments.map(file => ({ name: file.name, base64: file.base64 }))).toEqual([
            { name: 'drop.txt', base64: 'ZHJvcC1ib2R5' },
            { name: 'paste.txt', base64: 'cGFzdGUtYm9keQ==' },
        ]);
    });

    it('lets non-file drags fall through', async () => {
        const hook = await renderHook();
        const preventDefault = vi.fn();

        hook.rootProps.onDragOver({
            preventDefault,
            dataTransfer: { items: dataTransferItems([{ kind: 'string' }]) },
        } as unknown as React.DragEvent<HTMLElement>);

        expect(preventDefault).not.toHaveBeenCalled();
    });
});
