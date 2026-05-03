/**
 * Integration test for claudeLocalLauncher with real claude binary.
 *
 * Covers:
 *   - Skip-if-claude-not-installed gate (via claude --version probe)
 *   - Happy-path: spawns real claude binary, verifies Stop hook fires
 *     turn-complete signal through the pendingSwitch + Stop hook plumbing
 *   - Confirms closeClaudeSessionTurn('completed') is called after a normal exit
 *
 * Runs as part of the integration-empty vitest project so it shares the
 * same timing budget and isolation characteristics as other empty-env tests.
 * Skips cleanly on machines without claude installed (e.g. CI).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { claudeLocalLauncher } from './claudeLocalLauncher';
import { startHookServer } from './utils/startHookServer';
import { generateHookSettingsFile, cleanupHookSettingsFile } from './utils/generateHookSettings';

function isClaudeInstalled(): boolean {
    try {
        const result = spawnSync('claude', ['--version'], {
            timeout: 5_000,
            stdio: 'pipe',
            windowsHide: true,
        });
        return result.status === 0;
    } catch {
        return false;
    }
}

const claudeInstalled = isClaudeInstalled();

describe.skipIf(!claudeInstalled)('claudeLocalLauncher integration (Stop hook plumbing)', { timeout: 60_000 }, () => {
    let tempDir: string;
    let hookSettingsPath: string | null;
    let hookServer: Awaited<ReturnType<typeof startHookServer>> | null;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), 'launcher-integration-'));
        hookSettingsPath = null;
        hookServer = null;
    });

    afterEach(async () => {
        if (hookSettingsPath) {
            cleanupHookSettingsFile(hookSettingsPath);
            hookSettingsPath = null;
        }
        hookServer?.stop();
        hookServer = null;
        try {
            rmSync(tempDir, { recursive: true, force: true });
        } catch {}
    });

    it('fires closeClaudeSessionTurn(completed) and routes the Stop hook through the turn-complete callback', async () => {
        const closeClaudeSessionTurn = vi.fn();
        const turnCompleteCallbacks: Array<() => Promise<void>> = [];

        // Minimal session mock — mirrors the shape expected by claudeLocalLauncher
        const session: Record<string, any> = {
            sessionId: null,
            path: tempDir,
            hookSettingsPath: '',          // set after hook server starts
            claudeEnvVars: { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
            claudeArgs: ['--print', 'Say exactly hi'],
            mcpServers: {},
            allowedTools: [],
            sandboxConfig: null,
            pendingSwitch: undefined,
            deferredSwitchCompleting: false,
            switchFired: false,
            turnActive: false,
            client: {
                sendClaudeSessionMessage: vi.fn(),
                closeClaudeSessionTurn,
                sendSessionEvent: vi.fn(),
                updateMetadata: vi.fn(),
                rpcHandlerManager: {
                    registerHandler: vi.fn(),
                },
            },
            queue: {
                setOnMessage: vi.fn(),
                size: vi.fn(() => 0),
                reset: vi.fn(),
            },
            setPendingSwitch: vi.fn((v: any) => { session.pendingSwitch = v; }),
            setTurnActive: vi.fn((v: boolean) => { session.turnActive = v; }),
            clearDeferredSwitchState: vi.fn(() => {
                session.pendingSwitch = undefined;
                session.deferredSwitchCompleting = false;
                session.turnActive = false;
            }),
            setNotifyLegacyMessageBeforeQueue: vi.fn(),
            addTurnCompleteCallback: vi.fn((cb: () => Promise<void>) => {
                turnCompleteCallbacks.push(cb);
            }),
            removeTurnCompleteCallback: vi.fn((cb: () => Promise<void>) => {
                const idx = turnCompleteCallbacks.indexOf(cb);
                if (idx !== -1) turnCompleteCallbacks.splice(idx, 1);
            }),
            onSessionFound: vi.fn((id: string) => { session.sessionId = id; }),
            onThinkingChange: vi.fn(),
            addSessionFoundCallback: vi.fn(),
            removeSessionFoundCallback: vi.fn(),
            consumeOneTimeFlags: vi.fn(),
            onTurnCompleted: async () => {
                session.setTurnActive(false);
                await Promise.all(turnCompleteCallbacks.map((cb) => cb()));
            },
        };

        // Start the hook server that mirrors runClaude.ts wiring
        hookServer = await startHookServer({
            onSessionHook: (sessionId) => {
                session.onSessionFound(sessionId);
            },
            onUserPromptSubmitHook: async () => {
                session.setTurnActive(true);
            },
            onStopHook: async () => {
                await session.onTurnCompleted();
            },
        });

        // Generate the settings file so Claude's Stop hook routes to our server
        hookSettingsPath = generateHookSettingsFile(hookServer.port);
        session.hookSettingsPath = hookSettingsPath;

        const result = await claudeLocalLauncher(session as any);

        expect(result).toEqual({ type: 'exit', code: 0 });
        expect(closeClaudeSessionTurn).toHaveBeenCalledWith('completed');
    });
});
