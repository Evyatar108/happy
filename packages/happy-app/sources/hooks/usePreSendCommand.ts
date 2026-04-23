import * as React from 'react';
import { useRouter } from 'expo-router';
import { Modal } from '@/modal';
import { InterceptMessageKey, maybeIntercept } from '@/sync/slashCommandIntercept';

const ALERT_MESSAGES: Record<InterceptMessageKey, string> = {
    pluginRequiresSession: 'Open /plugin from an existing session so Happy knows which plugins to show.',
    skillsRequiresSession: 'Open /skills from an existing session so Happy knows which skills are loaded.',
    agentsRequiresSession: 'Open /agents from an existing session so Happy knows which agents are available.',
    memoryTerminalOnly: 'Command runs only in the terminal. Use /memory from your Claude Code CLI.',
    modelTerminalOnly: 'Command runs only in the terminal. Use /model from your Claude Code CLI.',
    mcpTerminalOnly: 'Command runs only in the terminal. Use /mcp from your Claude Code CLI.',
    helpTerminalOnly: 'Command runs only in the terminal. Use /help from your Claude Code CLI.',
};

const NOOP = () => {};

export interface PreSendCommandResult {
    intercepted: boolean;
    execute: () => void;
}

// Centralize local-only slash commands so both composers short-circuit before sending.
export function usePreSendCommand(sessionId: string | undefined) {
    const router = useRouter();

    return React.useCallback((command: string): PreSendCommandResult => {
        const result = maybeIntercept(command, sessionId);
        if (!result) {
            return { intercepted: false, execute: NOOP };
        }

        return {
            intercepted: true,
            execute: () => {
                if (result.type === 'route') {
                    router.push(result.path);
                    return;
                }

                Modal.alert('Command hint', ALERT_MESSAGES[result.messageKey]);
            },
        };
    }, [router, sessionId]);
}
