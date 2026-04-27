import * as React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePreSendCommand, type PreSendCommandResult } from './usePreSendCommand';
import { HappyError } from '@/utils/errors';

const reactActEnvironment = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
};

const shared = vi.hoisted(() => ({
    pushMock: vi.fn(),
    alertMock: vi.fn(),
    sessionUpdateMetadataMock: vi.fn(),
    performRenameMock: vi.fn(),
    latestAction: null as null | (() => Promise<void>),
    latestActionPromise: null as Promise<void> | null,
    latestResult: null as PreSendCommandResult | null,
    storageState: {
        sessions: {} as Record<string, any>,
    },
}));

vi.mock('expo-router', () => ({
    useRouter: () => ({
        push: shared.pushMock,
    }),
}));

vi.mock('@/modal', () => ({
    Modal: {
        alert: shared.alertMock,
    },
}));

vi.mock('@/text', () => ({
    t: (key: string) => `translated:${key}`,
}));

vi.mock('@/sync/ops', () => ({
    sessionUpdateMetadata: shared.sessionUpdateMetadataMock,
}));

vi.mock('@/sync/storage', () => ({
    storage: {
        getState: () => shared.storageState,
    },
}));

vi.mock('@/hooks/useHappyAction', () => ({
    useHappyAction: (action: () => Promise<void>) => {
        shared.latestAction = action;
        return [false, shared.performRenameMock] as const;
    },
}));

function HookHarness({
    sessionId,
    command,
}: {
    sessionId: string | undefined;
    command: string;
}) {
    const preSendCommand = usePreSendCommand(sessionId);
    shared.latestResult = preSendCommand(command);
    return null;
}

async function renderHook(command: string, sessionId: string | undefined = 'session-1') {
    await act(async () => {
        TestRenderer.create(<HookHarness sessionId={sessionId} command={command} />);
    });

    if (!shared.latestResult) {
        throw new Error('Expected a pre-send command result');
    }

    return shared.latestResult;
}

describe('usePreSendCommand', () => {
    beforeEach(() => {
        reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
        shared.pushMock.mockReset();
        shared.alertMock.mockReset();
        shared.sessionUpdateMetadataMock.mockReset();
        shared.performRenameMock.mockReset();
        shared.latestAction = null;
        shared.latestActionPromise = null;
        shared.latestResult = null;
        shared.storageState = {
            sessions: {
                'session-1': {
                    id: 'session-1',
                    metadataVersion: 7,
                    metadata: {
                        path: '/workspace/repo',
                        host: 'devbox',
                        summary: {
                            text: 'Old name',
                            updatedAt: 123,
                        },
                    },
                },
            },
        };
        shared.performRenameMock.mockImplementation(() => {
            shared.latestActionPromise = shared.latestAction?.() ?? Promise.resolve();
        });
    });

    afterEach(() => {
        delete reactActEnvironment.IS_REACT_ACT_ENVIRONMENT;
    });

    it('invokes sessionUpdateMetadata with the current metadata and version for /rename', async () => {
        shared.sessionUpdateMetadataMock.mockResolvedValue({ version: 8, metadata: 'encrypted' });

        const result = await renderHook('/rename Fresh Name');

        expect(result.intercepted).toBe(true);

        act(() => {
            result.execute();
        });

        expect(shared.performRenameMock).toHaveBeenCalledOnce();
        await shared.latestActionPromise;
        expect(shared.sessionUpdateMetadataMock).toHaveBeenCalledOnce();
        expect(shared.sessionUpdateMetadataMock).toHaveBeenCalledWith(
            'session-1',
            expect.objectContaining({
                path: '/workspace/repo',
                host: 'devbox',
                summary: expect.objectContaining({
                    text: 'Fresh Name',
                }),
            }),
            7,
        );
    });

    it('shows the localized empty-name alert without using the rename action', async () => {
        const result = await renderHook('/rename   ');

        expect(result.intercepted).toBe(true);

        act(() => {
            result.execute();
        });

        expect(shared.performRenameMock).not.toHaveBeenCalled();
        expect(shared.alertMock).toHaveBeenCalledOnce();
        expect(shared.alertMock).toHaveBeenCalledWith('translated:common.rename', 'translated:commands.rename.emptyName');
    });

    it('applies both names when /rename is executed twice in rapid succession', async () => {
        shared.sessionUpdateMetadataMock.mockResolvedValue({ version: 8, metadata: 'encrypted' });

        // Simulate useHappyAction's loadingRef gate: only the first call within
        // an in-flight action starts a new invocation; subsequent calls are no-ops
        // until the current promise settles.
        let inFlight = false;
        shared.performRenameMock.mockImplementation(() => {
            if (inFlight) return;
            inFlight = true;
            shared.latestActionPromise = (shared.latestAction?.() ?? Promise.resolve()).finally(() => {
                inFlight = false;
            });
        });

        // Capture the preSendCommand callback from a single hook instance so both
        // intercept results share the same renameQueueRef.
        let capturedCallback: ((cmd: string) => PreSendCommandResult) | null = null;
        function CallbackCapture() {
            const preSendCommand = usePreSendCommand('session-1');
            capturedCallback = preSendCommand;
            return null;
        }
        await act(async () => {
            TestRenderer.create(<CallbackCapture />);
        });

        const resultA = capturedCallback!('/rename Alpha');
        const resultB = capturedCallback!('/rename Beta');

        // Both executes push to the queue synchronously before performRename drains it.
        // The second performRename call is gated out (in-flight), so the action runs
        // once and drains the full queue of two items.
        act(() => {
            resultA.execute();
            resultB.execute();
        });

        await shared.latestActionPromise;

        expect(shared.sessionUpdateMetadataMock).toHaveBeenCalledTimes(2);
        const calls = shared.sessionUpdateMetadataMock.mock.calls;
        expect(calls[0][1]).toMatchObject({ summary: expect.objectContaining({ text: 'Alpha' }) });
        expect(calls[1][1]).toMatchObject({ summary: expect.objectContaining({ text: 'Beta' }) });
    });

    it('converts rename failures into a HappyError with the localized failure message', async () => {
        shared.sessionUpdateMetadataMock.mockRejectedValue(new Error('socket failed'));

        const result = await renderHook('/rename Broken');

        act(() => {
            result.execute();
        });

        await expect(shared.latestActionPromise).rejects.toBeInstanceOf(HappyError);
        await expect(shared.latestActionPromise).rejects.toMatchObject({
            message: 'translated:commands.rename.failure',
            canTryAgain: false,
        });
    });
});
