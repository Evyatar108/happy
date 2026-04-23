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

            try {
                const [initResult, reloadResult] = await Promise.all([
                    queryHandle.initializationResult().catch(() => EMPTY_INITIALIZE_RESULT),
                    queryHandle.reloadPlugins().catch(() => EMPTY_RELOAD_RESULT),
                ]);

                // (1) got system/init, (2) got control RPC results, (3) abort to prevent LLM inference, (4) close as cleanup
                shadowAbortController.abort('shadow session metadata captured');

                return mergeControlApiResultsIntoInitMetadata(
                    initFromStream,
                    initResult,
                    reloadResult,
                );
            } finally {
                await closeQuery();
            }
        }

        return {};
    } catch (error) {
        const failureKind = hardTimedOut ? 'Timed out' : 'Failed to query';
        logger.debug(`[queryInitMetadata] ${failureKind} init metadata: ${errorMessage(error)}`);
        return {};
    } finally {
        clearTimeout(timeoutHandle);
        if (opts.abort) {
            opts.abort.removeEventListener('abort', onAbort);
        }
        await closeQuery();
    }
}
