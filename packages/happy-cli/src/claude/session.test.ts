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
});
