/**
 * Tests for buildHookSettings
 *
 * Verifies that passing --settings <tmpfile> to Claude Code does not wipe the
 * user's plugin/MCP activation (notably `enabledPlugins`) or their existing
 * SessionStart hooks, and that sensitive / unrelated user settings are NOT
 * copied into the tmpfile.
 *
 * See https://github.com/slopus/happy/issues/779.
 */

import { describe, it, expect } from 'vitest';
import { buildHookSettings } from './generateHookSettings';

const HAPPY_HOOK_COMMAND = 'node "/tmp/session_hook_forwarder.cjs" 12345';

function expectHappySessionStartHook(entry: any) {
    expect(entry).toMatchObject({
        matcher: '*',
        hooks: [{ type: 'command', command: HAPPY_HOOK_COMMAND }],
    });
}

describe('buildHookSettings', () => {
    it('emits a standalone SessionStart hook when user has no settings', () => {
        const result = buildHookSettings(null, HAPPY_HOOK_COMMAND);

        expect(Object.keys(result)).toEqual(['hooks']);
        expect(result.hooks.SessionStart).toHaveLength(1);
        expectHappySessionStartHook(result.hooks.SessionStart[0]);
    });

    it('preserves enabledPlugins so plugin-provided skills keep loading', () => {
        const userSettings = {
            enabledPlugins: {
                'superpowers@claude-plugins-official': true,
                'frontend-design@claude-plugins-official': true,
            },
        };

        const result = buildHookSettings(userSettings, HAPPY_HOOK_COMMAND);

        expect(result.enabledPlugins).toEqual(userSettings.enabledPlugins);
    });

    it('preserves the MCP activation allowlist (mcpServers + enabled/disabledMcpjsonServers)', () => {
        const userSettings = {
            mcpServers: { foo: { command: 'node', args: ['foo.js'] } },
            enabledMcpjsonServers: ['foo'],
            disabledMcpjsonServers: ['bar'],
        };

        const result = buildHookSettings(userSettings, HAPPY_HOOK_COMMAND);

        expect(result.mcpServers).toEqual(userSettings.mcpServers);
        expect(result.enabledMcpjsonServers).toEqual(userSettings.enabledMcpjsonServers);
        expect(result.disabledMcpjsonServers).toEqual(userSettings.disabledMcpjsonServers);
    });

    it('does NOT forward fields outside the allowlist (env, apiKeyHelper, permissions, theme, model)', () => {
        const userSettings = {
            env: { ANTHROPIC_API_KEY: 'sk-secret' },
            apiKeyHelper: '/usr/local/bin/get-key.sh',
            permissions: { allow: ['Bash(git diff:*)'], deny: [] },
            theme: 'dark',
            model: 'claude-opus-4-7',
            includeCoAuthoredBy: false,
            enabledPlugins: { 'a@b': true },
        };

        const result = buildHookSettings(userSettings, HAPPY_HOOK_COMMAND);

        expect(result.env).toBeUndefined();
        expect(result.apiKeyHelper).toBeUndefined();
        expect(result.permissions).toBeUndefined();
        expect(result.theme).toBeUndefined();
        expect(result.model).toBeUndefined();
        expect(result.includeCoAuthoredBy).toBeUndefined();
        expect(result.enabledPlugins).toEqual(userSettings.enabledPlugins);
    });

    it("appends Happy's SessionStart hook after any existing user SessionStart entries", () => {
        const userHook = {
            matcher: 'resume',
            hooks: [{ type: 'command', command: 'echo user-hook' }],
        };
        const userSettings = { hooks: { SessionStart: [userHook] } };

        const result = buildHookSettings(userSettings, HAPPY_HOOK_COMMAND);

        expect(result.hooks.SessionStart).toHaveLength(2);
        expect(result.hooks.SessionStart[0]).toEqual(userHook);
        expectHappySessionStartHook(result.hooks.SessionStart[1]);
    });

    it('keeps non-SessionStart user hook types (PreToolUse, PostToolUse, Stop, ...) intact', () => {
        const preToolUse = [
            { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo pre' }] },
        ];
        const userSettings = { hooks: { PreToolUse: preToolUse } };

        const result = buildHookSettings(userSettings, HAPPY_HOOK_COMMAND);

        expect(result.hooks.PreToolUse).toEqual(preToolUse);
        expect(result.hooks.SessionStart).toHaveLength(1);
        expectHappySessionStartHook(result.hooks.SessionStart[0]);
    });

    it('tolerates a malformed hooks field (non-object) without throwing', () => {
        const userSettings = { hooks: 'oops' as unknown as Record<string, any[]> };

        const result = buildHookSettings(userSettings, HAPPY_HOOK_COMMAND);

        expect(result.hooks.SessionStart).toHaveLength(1);
        expectHappySessionStartHook(result.hooks.SessionStart[0]);
    });

    it('tolerates a SessionStart that is not an array', () => {
        const userSettings = {
            hooks: { SessionStart: { matcher: 'legacy' } as unknown as any[] },
        };

        const result = buildHookSettings(userSettings, HAPPY_HOOK_COMMAND);

        expect(result.hooks.SessionStart).toHaveLength(1);
        expectHappySessionStartHook(result.hooks.SessionStart[0]);
    });

    it('does not mutate the input user settings object', () => {
        const userSettings = {
            enabledPlugins: { 'a@b': true },
            hooks: {
                SessionStart: [{ matcher: 'x', hooks: [] }],
                PreToolUse: [{ matcher: 'Bash', hooks: [] }],
            },
        };
        const snapshot = JSON.parse(JSON.stringify(userSettings));

        buildHookSettings(userSettings, HAPPY_HOOK_COMMAND);

        expect(userSettings).toEqual(snapshot);
    });

    it('serializes to valid JSON (no circular refs, no functions)', () => {
        const userSettings = {
            enabledPlugins: { 'a@b': true },
            hooks: { SessionStart: [{ matcher: 'x', hooks: [] }] },
        };

        const result = buildHookSettings(userSettings, HAPPY_HOOK_COMMAND);

        expect(() => JSON.stringify(result)).not.toThrow();
        expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    });
});
