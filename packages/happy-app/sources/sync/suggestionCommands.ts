/**
 * Suggestion commands functionality for slash commands
 * Reads commands directly from session metadata storage
 */

import Fuse from 'fuse.js';
import { storage } from './storage';
import type { Metadata } from './storageTypes';

export type CommandSource =
    | 'native-prompt'
    | 'native-local'
    | 'skill'
    | 'plugin'
    | 'app-synthetic';

export interface CommandItem {
    command: string;
    description?: string;
    source: CommandSource;
}

interface SearchOptions {
    limit?: number;
    threshold?: number;
}

export const NATIVE_PROMPT_COMMANDS = new Set([
    'init',
    'insights',
    'review',
    'security-review',
    'team-onboarding',
    'commit',
    'commit-push-pr',
]);

const DEFAULT_COMMANDS: CommandItem[] = [
    { command: 'clear', description: 'Clear the conversation.', source: 'native-local' },
    { command: 'compact', description: 'Compact the conversation history.', source: 'native-local' },
];

export const COMMAND_DESCRIPTIONS: Record<string, string> = {
    agents: 'Open the session agents catalog.',
    clear: 'Clear the conversation.',
    compact: 'Compact the conversation history.',
    context: 'Show project and session context.',
    cost: 'Show token and usage cost details.',
    heapdump: 'Capture a diagnostic heap dump.',
    help: 'Show command help and guidance.',
    init: 'Initialize Claude Code in this project.',
    insights: 'Show workspace insights and suggestions.',
    mcp: 'Explain how to manage MCP servers from the terminal.',
    memory: 'Explain how to use Claude Code memory from the terminal.',
    model: 'Explain how to switch models from the terminal.',
    plugin: 'Open the session plugin catalog.',
    rename: 'Rename the current chat.',
    review: 'Review recent changes for issues.',
    'security-review': 'Review changes for security risks.',
    skills: 'Open the session skills catalog.',
    'team-onboarding': 'Generate onboarding guidance for this codebase.',
    'commit': 'Generate a git commit for the current changes.',
    'commit-push-pr': 'Commit, push, and open a pull request.',
};

const APP_SYNTHETIC_COMMANDS: CommandItem[] = [
    { command: 'plugin', description: COMMAND_DESCRIPTIONS.plugin, source: 'app-synthetic' },
    { command: 'skills', description: COMMAND_DESCRIPTIONS.skills, source: 'app-synthetic' },
    { command: 'agents', description: COMMAND_DESCRIPTIONS.agents, source: 'app-synthetic' },
    { command: 'memory', description: COMMAND_DESCRIPTIONS.memory, source: 'app-synthetic' },
    { command: 'model', description: COMMAND_DESCRIPTIONS.model, source: 'app-synthetic' },
    { command: 'mcp', description: COMMAND_DESCRIPTIONS.mcp, source: 'app-synthetic' },
    { command: 'help', description: COMMAND_DESCRIPTIONS.help, source: 'app-synthetic' },
    { command: 'rename', description: COMMAND_DESCRIPTIONS.rename, source: 'app-synthetic' },
];

function getMetadata(sessionId: string): Metadata | null {
    const session = storage.getState().sessions[sessionId];
    return session?.metadata ?? null;
}

function classifyCommand(
    command: string,
    pluginNames: Set<string>,
    skills: Set<string>,
): CommandSource {
    if (command.includes(':')) {
        const prefix = command.split(':', 1)[0];
        if (pluginNames.has(prefix)) {
            return 'plugin';
        }
    }

    if (skills.has(command)) {
        return 'skill';
    }

    if (NATIVE_PROMPT_COMMANDS.has(command)) {
        return 'native-prompt';
    }

    return 'native-local';
}

function buildCommandItem(
    command: string,
    pluginNames: Set<string>,
    skills: Set<string>,
): CommandItem {
    return {
        command,
        description: COMMAND_DESCRIPTIONS[command],
        source: classifyCommand(command, pluginNames, skills),
    };
}

function getCommandsFromSession(sessionId: string): CommandItem[] {
    const metadata = getMetadata(sessionId);
    const commands = new Map<string, CommandItem>();
    const pluginNames = new Set((metadata?.plugins ?? []).map((plugin) => plugin.name));
    const skills = new Set(metadata?.skills ?? []);

    for (const command of DEFAULT_COMMANDS) {
        commands.set(command.command, command);
    }

    for (const command of APP_SYNTHETIC_COMMANDS) {
        commands.set(command.command, command);
    }

    for (const command of metadata?.slashCommands ?? []) {
        if (!commands.has(command)) {
            commands.set(command, buildCommandItem(command, pluginNames, skills));
        }
    }

    return Array.from(commands.values());
}

export async function searchCommands(
    sessionId: string,
    query: string,
    options: SearchOptions = {},
): Promise<CommandItem[]> {
    const { limit, threshold = 0.3 } = options;
    const commands = getCommandsFromSession(sessionId);

    if (!query || query.trim().length === 0) {
        return typeof limit === 'number' ? commands.slice(0, limit) : commands;
    }

    const fuse = new Fuse(commands, {
        keys: [
            { name: 'command', weight: 0.7 },
            { name: 'description', weight: 0.3 },
        ],
        threshold,
        includeScore: true,
        shouldSort: true,
        minMatchCharLength: 1,
        ignoreLocation: true,
        useExtendedSearch: true,
    });

    return fuse.search(query, { limit: limit ?? 15 }).map((result) => result.item);
}

export function getAllCommands(sessionId: string): CommandItem[] {
    return getCommandsFromSession(sessionId);
}
