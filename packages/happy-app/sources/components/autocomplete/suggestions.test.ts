import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommandItem } from '@/sync/suggestionCommands';

const mockSearchCommands = vi.fn<(...args: unknown[]) => Promise<CommandItem[]>>();

vi.mock('@/sync/suggestionCommands', async () => {
    return {
        searchCommands: mockSearchCommands,
    };
});

vi.mock('@/components/AgentInputSuggestionView', () => ({
    CommandSuggestion: (props: Record<string, unknown>) => React.createElement('CommandSuggestion', props),
    FileMentionSuggestion: (props: Record<string, unknown>) => React.createElement('FileMentionSuggestion', props),
}));

vi.mock('@/sync/suggestionFile', () => ({
    searchFiles: vi.fn(),
}));

const { getCommandSuggestions } = await import('./suggestions');

afterEach(() => {
    mockSearchCommands.mockReset();
});

describe('getCommandSuggestions', () => {
    it('passes every command source through to CommandSuggestion', async () => {
        const commands: CommandItem[] = [
            { command: 'init', description: 'Prompt command', source: 'native-prompt' },
            { command: 'context', description: 'Local command', source: 'native-local' },
            { command: 'skill-command', description: 'Skill command', source: 'skill' },
            { command: 'plugin:deploy', description: 'Plugin command', source: 'plugin' },
            { command: 'help', description: 'Synthetic command', source: 'app-synthetic' },
        ];

        mockSearchCommands.mockResolvedValue(commands);

        const suggestions = await getCommandSuggestions('session-id', '/');

        expect(mockSearchCommands).toHaveBeenCalledWith('session-id', '', { limit: 5 });
        expect(suggestions).toHaveLength(commands.length);

        for (const [index, suggestion] of suggestions.entries()) {
            const rendered = (suggestion.component as () => React.ReactElement)();

            expect(rendered.props).toMatchObject({
                command: commands[index].command,
                description: commands[index].description,
                source: commands[index].source,
            });
        }
    });
});
