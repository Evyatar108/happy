import { describe, expect, it, vi } from 'vitest';
import { Session } from './session';

describe('Session deferred switch state', () => {
    function createSession() {
        let agentState: Record<string, unknown> = {};
        const updateAgentState = vi.fn((updater: (state: Record<string, unknown>) => Record<string, unknown>) => {
            agentState = updater(agentState);
        });
        const session = new Session({
            api: {} as any,
            client: {
                keepAlive: vi.fn(),
                updateAgentState,
                updateMetadata: vi.fn(),
            } as any,
            path: '/workspace/project',
            logPath: '/tmp/happy.log',
            sessionId: null,
            mcpServers: {},
            messageQueue: {} as any,
            onModeChange: vi.fn(),
            hookSettingsPath: '/tmp/hook-settings.json',
        });

        return { session, updateAgentState, getAgentState: () => agentState };
    }

    it('mirrors pendingSwitch and turnActive into AgentState', () => {
        const { session, updateAgentState, getAgentState } = createSession();

        session.setPendingSwitch({ requestedAt: 1234, messagePreview: 'hello' });
        session.setTurnActive(true);

        expect(session.pendingSwitch).toEqual({ requestedAt: 1234, messagePreview: 'hello' });
        expect(session.turnActive).toBe(true);
        expect(getAgentState()).toEqual({
            pendingSwitch: { requestedAt: 1234, messagePreview: 'hello' },
            turnActive: true,
        });
        expect(updateAgentState).toHaveBeenCalledTimes(2);

        session.clearDeferredSwitchState();

        expect(session.pendingSwitch).toBeUndefined();
        expect(session.turnActive).toBe(false);
        expect(getAgentState()).toEqual({
            pendingSwitch: null,
            turnActive: false,
        });

        session.cleanup();
    });

    it('clears deferredSwitchCompleting on local→remote mode transition', () => {
        const { session } = createSession();

        session.deferredSwitchCompleting = true;

        session.onModeChange('remote');

        expect(session.deferredSwitchCompleting).toBe(false);
        expect(session.mode).toBe('remote');

        session.cleanup();
    });

    it('does not clear deferredSwitchCompleting on remote→local mode transition', () => {
        const { session } = createSession();

        session.deferredSwitchCompleting = true;

        session.onModeChange('local');

        expect(session.deferredSwitchCompleting).toBe(true);
        expect(session.mode).toBe('local');

        session.cleanup();
    });

    it('routes hook-driven turn lifecycle through subscriptions', async () => {
        const { session, getAgentState } = createSession();
        const onTurnStart = vi.fn();
        const onTurnComplete = vi.fn();

        session.addTurnStartCallback(onTurnStart);
        session.addTurnCompleteCallback(onTurnComplete);

        await session.onTurnStarted();

        expect(session.turnActive).toBe(true);
        expect(getAgentState().turnActive).toBe(true);
        expect(onTurnStart).toHaveBeenCalledTimes(1);

        await session.onTurnCompleted();

        expect(session.turnActive).toBe(false);
        expect(getAgentState().turnActive).toBe(false);
        expect(onTurnComplete).toHaveBeenCalledTimes(1);

        session.removeTurnStartCallback(onTurnStart);
        session.removeTurnCompleteCallback(onTurnComplete);
        await session.onTurnStarted();
        await session.onTurnCompleted();

        expect(onTurnStart).toHaveBeenCalledTimes(1);
        expect(onTurnComplete).toHaveBeenCalledTimes(1);

        session.cleanup();
    });

    it('routes Notification through subscriptions (without affecting turnActive)', async () => {
        const { session, getAgentState } = createSession();
        const onNotification = vi.fn();

        session.addNotificationCallback(onNotification);
        session.setTurnActive(true);

        await session.onNotification();

        // Notification must NOT clear turnActive — turn is still streaming, just paused.
        // Only Stop/onTurnCompleted may flip turnActive false.
        expect(session.turnActive).toBe(true);
        expect(getAgentState().turnActive).toBe(true);
        expect(onNotification).toHaveBeenCalledTimes(1);

        session.removeNotificationCallback(onNotification);
        await session.onNotification();
        expect(onNotification).toHaveBeenCalledTimes(1);

        session.cleanup();
    });
});
