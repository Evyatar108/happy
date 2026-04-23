/**
 * Shadow SDK session — harvests init metadata (tools / skills / plugins /
 * agents / slashCommands / mcpServers / outputStyle) without running any
 * LLM inference, then aborts.
 *
 * Log-level convention: happy-path trace lines are `logger.debug` — they
 * still land in the per-session file under the configured logs dir, so the
 * existing grep workflow keeps working. `logger.warn` is reserved for
 * genuine anomalies (RPC threw, unexpected message type, stream ended
 * without system/init, timeout) so those stand out in user-facing console
 * output.
 */

import { logger } from '@/ui/logger';
import {
    query,
    type SDKControlInitializeResponse,
    type SDKControlReloadPluginsResponse,
    type SDKMessage,
    type SDKSystemMessage,
} from '@/claude/sdk';
import {
    mapSystemInitToMetadata,
    mergeControlApiResultsIntoInitMetadata,
    type SDKInitMetadata,
} from './sdkMetadata';

const DEFAULT_TIMEOUT_MS = 3_000;
const EMPTY_INITIALIZE_RESULT = {} as SDKControlInitializeResponse;
const EMPTY_RELOAD_RESULT = {} as SDKControlReloadPluginsResponse;

export type QueryInitMetadataOptions = {
    cwd: string;
    settingsPath: string;
    mcpServers?: Record<string, any>;
    allowedTools?: string[];
    claudeEnvVars?: Record<string, string>;
    abort?: AbortSignal;
    timeoutMs?: number;
};

function errorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}

function isInitMessage(message: SDKMessage): message is SDKSystemMessage {
    return message.type === 'system' && message.subtype === 'init';
}

function describeShadowMessage(message: SDKMessage): string {
    const subtype = 'subtype' in message && typeof message.subtype === 'string'
        ? `/${message.subtype}`
        : '';

    return `${message.type}${subtype}`;
}

export async function queryInitMetadata(opts: QueryInitMetadataOptions): Promise<SDKInitMetadata> {
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const shadowAbortController = new AbortController();
    let queryHandle: ReturnType<typeof query> | undefined;
    let closed = false;
    let hardTimedOut = false;

    const closeQuery = async () => {
        if (!queryHandle || closed) {
            return;
        }

        closed = true;

        try {
            await queryHandle.close();
        } catch (error) {
            logger.debug(`[queryInitMetadata] Failed to close shadow query: ${errorMessage(error)}`);
        }
    };

    const onAbort = () => {
        shadowAbortController.abort(opts.abort?.reason);
    };

    if (opts.abort?.aborted) {
        onAbort();
    } else if (opts.abort) {
        opts.abort.addEventListener('abort', onAbort, { once: true });
    }

    const timeoutHandle = setTimeout(() => {
        hardTimedOut = true;
        shadowAbortController.abort(new Error(`Timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    try {
        logger.debug(
            `[queryInitMetadata] starting shadow session cwd=${opts.cwd} settingsPath=${opts.settingsPath ?? '(none)'} timeoutMs=${timeoutMs}`,
        );
        queryHandle = query({
            prompt: '.',
            options: {
                cwd: opts.cwd,
                settingsPath: opts.settingsPath,
                mcpServers: opts.mcpServers,
                allowedTools: opts.allowedTools,
                env: opts.claudeEnvVars,
                abort: shadowAbortController.signal,
            },
        });

        for await (const message of queryHandle) {
            if (!isInitMessage(message)) {
                logger.warn(
                    `[queryInitMetadata] Unexpected shadow-session message: ${describeShadowMessage(message)}`,
                );
                continue;
            }

            const initFromStream = mapSystemInitToMetadata(message);
            logger.debug(
                `[queryInitMetadata] got system/init stream; tools=${initFromStream.tools?.length ?? 'nil'} skills=${initFromStream.skills?.length ?? 'nil'} plugins=${initFromStream.plugins?.length ?? 'nil'} agents=${initFromStream.agents?.length ?? 'nil'} slashCommands=${initFromStream.slashCommands?.length ?? 'nil'}`,
            );

            try {
                const [initResult, reloadResult] = await Promise.all([
                    queryHandle.initializationResult().catch((err) => {
                        logger.warn(`[queryInitMetadata] initializationResult() threw: ${errorMessage(err)} — falling back to empty`);
                        return EMPTY_INITIALIZE_RESULT;
                    }),
                    queryHandle.reloadPlugins().catch((err) => {
                        logger.warn(`[queryInitMetadata] reloadPlugins() threw: ${errorMessage(err)} — falling back to empty`);
                        return EMPTY_RELOAD_RESULT;
                    }),
                ]);

                logger.debug(
                    `[queryInitMetadata] control RPCs resolved; initResult.commands=${initResult.commands?.length ?? 'nil'} initResult.agents=${initResult.agents?.length ?? 'nil'} reloadResult.plugins=${reloadResult.plugins?.length ?? 'nil'} reloadResult.mcpServers=${reloadResult.mcpServers?.length ?? 'nil'} reloadResult.commands=${reloadResult.commands?.length ?? 'nil'}`,
                );

                // (1) got system/init, (2) got control RPC results, (3) abort to prevent LLM inference, (4) close as cleanup
                shadowAbortController.abort('shadow session metadata captured');

                const merged = mergeControlApiResultsIntoInitMetadata(
                    initFromStream,
                    initResult,
                    reloadResult,
                );
                const definedKeys = Object.entries(merged).filter(([, v]) => v !== undefined).map(([k]) => k);
                logger.debug(
                    `[queryInitMetadata] returning merged metadata; defined fields = [${definedKeys.join(', ')}]`,
                );
                return merged;
            } finally {
                await closeQuery();
            }
        }

        logger.warn(`[queryInitMetadata] stream ended without system/init — returning empty {}`);
        return {};
    } catch (error) {
        const failureKind = hardTimedOut ? 'Timed out' : 'Failed to query';
        logger.warn(`[queryInitMetadata] ${failureKind} init metadata: ${errorMessage(error)}`);
        return {};
    } finally {
        clearTimeout(timeoutHandle);
        if (opts.abort) {
            opts.abort.removeEventListener('abort', onAbort);
        }
        await closeQuery();
    }
}
