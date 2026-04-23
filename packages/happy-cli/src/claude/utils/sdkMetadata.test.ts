import { describe, expect, it } from 'vitest';
import type { Metadata } from '@/api/types';
import type {
    SDKControlInitializeResponse,
    SDKControlReloadPluginsResponse,
    SDKSystemMessage,
} from '@/claude/sdk';
import {
    mapSystemInitToMetadata,
    mergeControlApiResultsIntoInitMetadata,
    mergeSDKInitMetadata,
} from './sdkMetadata';

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

function createControlInitializeResponse(
    overrides: Partial<SDKControlInitializeResponse> = {},
): SDKControlInitializeResponse {
    return {
        commands: [],
        agents: [],
        output_style: 'concise',
        available_output_styles: ['concise'],
        models: [],
        account: {} as SDKControlInitializeResponse['account'],
        ...overrides,
    };
}

function createReloadPluginsResponse(
    overrides: Partial<SDKControlReloadPluginsResponse> = {},
): SDKControlReloadPluginsResponse {
    return {
        commands: [],
        agents: [],
        plugins: [],
        mcpServers: [],
        error_count: 0,
        ...overrides,
    };
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

    it('preserves stream-only tools, skills, and slash commands when control APIs omit them', () => {
        const merged = mergeControlApiResultsIntoInitMetadata(
            {
                tools: ['Read'],
                slashCommands: ['stream:command'],
                skills: ['review'],
                agents: ['stream-agent'],
                plugins: [{ name: 'stream-plugin', path: '/tmp/stream-plugin' }],
                outputStyle: 'stream-style',
                mcpServers: [{ name: 'stream', status: 'connected' }],
            },
            {} as SDKControlInitializeResponse,
            {} as SDKControlReloadPluginsResponse,
        );

        expect(merged).toEqual({
            tools: ['Read'],
            slashCommands: ['stream:command'],
            skills: ['review'],
            agents: ['stream-agent'],
            plugins: [{ name: 'stream-plugin', path: '/tmp/stream-plugin' }],
            outputStyle: 'stream-style',
            mcpServers: [{ name: 'stream', status: 'connected' }],
        });
    });

    it('preserves control-only metadata when the stream init is empty', () => {
        const merged = mergeControlApiResultsIntoInitMetadata(
            {},
            createControlInitializeResponse({
                commands: [
                    { name: 'plugin:run', description: 'Run plugin', argumentHint: '<id>' },
                ],
                agents: [{ name: 'worker', description: 'Does work' }],
                output_style: 'verbose',
            }),
            createReloadPluginsResponse({
                plugins: [{ name: 'plugin', path: '/tmp/plugin', source: 'marketplace' }],
                mcpServers: [{ name: 'happy', status: 'connected' }],
            }),
        );

        expect(merged).toEqual({
            tools: undefined,
            slashCommands: ['plugin:run'],
            skills: undefined,
            agents: ['worker'],
            plugins: [{ name: 'plugin', path: '/tmp/plugin', source: 'marketplace' }],
            outputStyle: 'verbose',
            mcpServers: [{ name: 'happy', status: 'connected' }],
        });
    });

    it('prefers fresher control results while keeping streamed tools and skills', () => {
        const merged = mergeControlApiResultsIntoInitMetadata(
            {
                tools: ['Read'],
                slashCommands: ['stream:command'],
                skills: ['review'],
                agents: ['stream-agent'],
                plugins: [{ name: 'stream-plugin', path: '/tmp/stream-plugin' }],
                outputStyle: 'stream-style',
                mcpServers: [{ name: 'stream', status: 'connected' }],
            },
            createControlInitializeResponse({
                commands: [
                    { name: 'fresh:command', description: 'Fresh command', argumentHint: '' },
                ],
                agents: [{ name: 'fresh-agent', description: 'Fresh agent' }],
                output_style: 'verbose',
            }),
            createReloadPluginsResponse({
                plugins: [{ name: 'fresh-plugin', path: '/tmp/fresh-plugin', source: 'builtin' }],
                mcpServers: [{ name: 'fresh', status: 'connected' }],
            }),
        );

        expect(merged).toEqual({
            tools: ['Read'],
            slashCommands: ['fresh:command'],
            skills: ['review'],
            agents: ['fresh-agent'],
            plugins: [{ name: 'fresh-plugin', path: '/tmp/fresh-plugin', source: 'builtin' }],
            outputStyle: 'verbose',
            mcpServers: [{ name: 'fresh', status: 'connected' }],
        });
    });

    it('returns empty metadata when both stream and control inputs are empty', () => {
        expect(
            mergeControlApiResultsIntoInitMetadata(
                {},
                {} as SDKControlInitializeResponse,
                {} as SDKControlReloadPluginsResponse,
            ),
        ).toEqual({
            tools: undefined,
            slashCommands: undefined,
            skills: undefined,
            agents: undefined,
            plugins: undefined,
            outputStyle: undefined,
            mcpServers: undefined,
        });
    });
});
