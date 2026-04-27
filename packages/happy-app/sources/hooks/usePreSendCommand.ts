import * as React from 'react';
import { Href, useRouter } from 'expo-router';
import { useHappyAction } from '@/hooks/useHappyAction';
import { Modal } from '@/modal';
import { sessionUpdateMetadata } from '@/sync/ops';
import { storage } from '@/sync/storage';
import { InterceptMessageKey, maybeIntercept } from '@/sync/slashCommandIntercept';
import { t } from '@/text';
import { HappyError } from '@/utils/errors';

const ALERT_MESSAGES = {
    pluginRequiresSession: 'Open /plugin from an existing session so Happy knows which plugins to show.',
    skillsRequiresSession: 'Open /skills from an existing session so Happy knows which skills are loaded.',
    agentsRequiresSession: 'Open /agents from an existing session so Happy knows which agents are available.',
    memoryTerminalOnly: 'Command runs only in the terminal. Use /memory from your Claude Code CLI.',
    modelTerminalOnly: 'Command runs only in the terminal. Use /model from your Claude Code CLI.',
    mcpTerminalOnly: 'Command runs only in the terminal. Use /mcp from your Claude Code CLI.',
    helpTerminalOnly: 'Command runs only in the terminal. Use /help from your Claude Code CLI.',
} satisfies Record<Exclude<InterceptMessageKey, 'renameEmptyName'>, string>;

const NOOP = () => {};

export interface PreSendCommandResult {
    intercepted: boolean;
    execute: () => void;
}

// Centralize local-only slash commands so both composers short-circuit before sending.
export function usePreSendCommand(sessionId: string | undefined) {
    const router = useRouter();
    const renameQueueRef = React.useRef<Array<{ sessionId: string; name: string }>>([]);
    const [, performRename] = useHappyAction(async () => {
        while (renameQueueRef.current.length > 0) {
            const renameRequest = renameQueueRef.current.shift()!;

            try {
                const session = storage.getState().sessions[renameRequest.sessionId];
                if (!session || !session.metadata) {
                    throw new Error('Session metadata unavailable for rename');
                }

                await sessionUpdateMetadata(
                    renameRequest.sessionId,
                    {
                        ...session.metadata,
                        summary: {
                            text: renameRequest.name,
                            updatedAt: Date.now(),
                        },
                    },
                    session.metadataVersion,
                );
            } catch {
                renameQueueRef.current = [];
                throw new HappyError(t('commands.rename.failure'), false);
            }
        }
    });

    return React.useCallback((command: string): PreSendCommandResult => {
        const result = maybeIntercept(command, sessionId);
        if (!result) {
            return { intercepted: false, execute: NOOP };
        }

        return {
            intercepted: true,
            execute: () => {
                if (result.type === 'route') {
                    // Path is constructed in slashCommandIntercept from a closed
                    // allowlist of catalog screens (plugins/skills/agents) with a
                    // regex-validated sessionId. Cast to Href to satisfy Expo
                    // Router's typed-routes (enforced once .expo/types/router.d.ts
                    // exists; silently absent on clones that haven't run Metro).
                    router.push(result.path as Href);
                    return;
                }

                if (result.type === 'rename') {
                    renameQueueRef.current.push({ sessionId: sessionId!, name: result.name });
                    performRename();
                    return;
                }

                if (result.messageKey === 'renameEmptyName') {
                    Modal.alert(t('common.rename'), t('commands.rename.emptyName'));
                    return;
                }

                Modal.alert('Command hint', ALERT_MESSAGES[result.messageKey]);
            },
        };
    }, [performRename, router, sessionId]);
}
