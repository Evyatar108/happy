import { describe, expect, it } from 'vitest';
import type { Metadata } from '@/api/types';
import type { SDKSystemMessage } from '@/claude/sdk';
import { mapSystemInitToMetadata, mergeSDKInitMetadata } from './sdkMetadata';

function createMetadata(overrides: Partial<Metadata> = {}): Metadata {
    return {
        path: '/tmp/project',
        host: 'test-host',
        homeDir: '/home/tester',
        happyHomeDir: '/home/tester/.happy',
        happyLibDir: '/tmp/happy-lib',
        happyToolsDir: '/tmp/happy-tools',
        ...overrides,
    };
}

function createSystemInit(overrides: Partial<SDKSystemMessage> = {}): SDKSystemMessage {
    return {
        type: 'system',
        subtype: 'init',
        apiKeySource: 'user',
        claude_code_version: '1.0.0',
        cwd: '/tmp/project',
        model: 'claude-sonnet-4',
        permissionMode: 'default',
        session_id: 'session-123',
        uuid: '00000000-0000-0000-0000-000000000001',
        ...overrides,
    } as SDKSystemMessage;
}

describe('sdkMetadata', () => {
    it('maps an empty init payload to empty SDK metadata fields', () => {
        expect(mapSystemInitToMetadata({} as SDKSystemMessage)).toEqual({
            tools: undefined,
            slashCommands: undefined,
            skills: undefined,
            agents: undefined,
            plugins: undefined,
            outputStyle: undefined,
            mcpServers: undefined,
        });
    });

    it('maps a fully populated init payload', () => {
        const metadata = mapSystemInitToMetadata(createSystemInit({
            tools: ['Read', 'Write'],
            slash_commands: ['compact', 'plugin:run'],
            skills: ['review', 'plan'],
            agents: ['explorer', 'worker'],
            plugins: [{ name: 'plugin', path: '/tmp/plugin' }],
            output_style: 'verbose',
            mcp_servers: [{ name: 'happy', status: 'connected' }],
        }));

        expect(metadata).toEqual({
            tools: ['Read', 'Write'],
            slashCommands: ['compact', 'plugin:run'],
            skills: ['review', 'plan'],
            agents: ['explorer', 'worker'],
            plugins: [{ name: 'plugin', path: '/tmp/plugin' }],
            outputStyle: 'verbose',
            mcpServers: [{ name: 'happy', status: 'connected' }],
        });
    });

    it('maps a partial init payload without inventing missing fields', () => {
        const metadata = mapSystemInitToMetadata(createSystemInit({
            tools: ['Read'],
            output_style: 'concise',
        }));

        expect(metadata).toEqual({
            tools: ['Read'],
            slashCommands: undefined,
            skills: undefined,
            agents: undefined,
            plugins: undefined,
            outputStyle: 'concise',
            mcpServers: undefined,
        });
    });

    it('preserves unrelated current metadata fields and ignores undefined updates', () => {
        const current = createMetadata({
            name: 'session-name',
            tools: ['Read'],
            skills: ['review'],
        });

        const merged = mergeSDKInitMetadata(current, {
            slashCommands: ['plugin:run'],
            tools: undefined,
            skills: undefined,
            agents: undefined,
            plugins: undefined,
            outputStyle: undefined,
            mcpServers: undefined,
        });

        expect(merged).toEqual({
            ...current,
            slashCommands: ['plugin:run'],
        });
        expect(merged.tools).toEqual(['Read']);
        expect(merged.skills).toEqual(['review']);
    });

    it('overwrites each SDK metadata field when an update is provided', () => {
        const current = createMetadata({
            tools: ['Read'],
            slashCommands: ['old:command'],
            skills: ['review'],
            agents: ['explorer'],
            plugins: [{ name: 'old-plugin', path: '/tmp/old-plugin' }],
            outputStyle: 'concise',
            mcpServers: [{ name: 'old', status: 'connected' }],
        });

        const merged = mergeSDKInitMetadata(current, {
            tools: ['Write'],
            slashCommands: ['new:command'],
            skills: ['plan'],
            agents: ['worker'],
            plugins: [{ name: 'new-plugin', path: '/tmp/new-plugin' }],
            outputStyle: 'verbose',
            mcpServers: [{ name: 'new', status: 'connected' }],
        });

        expect(merged).toEqual({
            ...current,
            tools: ['Write'],
            slashCommands: ['new:command'],
            skills: ['plan'],
            agents: ['worker'],
            plugins: [{ name: 'new-plugin', path: '/tmp/new-plugin' }],
            outputStyle: 'verbose',
            mcpServers: [{ name: 'new', status: 'connected' }],
        });
    });
});
