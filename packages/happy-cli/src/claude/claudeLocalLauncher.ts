import { logger } from "@/ui/logger";
import { claudeLocal, ExitCodeError } from "./claudeLocal";
import { Session } from "./session";
import { Future } from "@/utils/future";
import { createSessionScanner } from "./utils/sessionScanner";
import { mergeSDKInitMetadata } from "./utils/sdkMetadata";
import { queryInitMetadata } from "./utils/queryInitMetadata";

export type LauncherResult = { type: 'switch' } | { type: 'exit', code: number };

type RequestSwitchParams = {
    mode: 'now' | 'when-idle';
    messagePreview?: string;
};

type RequestSwitchResponse = {
    deferred: boolean;
};

// Maps sessionId -> in-flight shadow-query promise.
// Presence in the map is the dedupe guard: once a sessionId is inserted, no
// subsequent handleSessionStart call will re-fire the query — even if the
// original promise is still pending (avoiding a rapid-re-entry race that a
// plain Set cleared in the outer finally could not prevent).
// Each entry is removed only after its own promise settles.
const shadowMetadataInFlight = new Map<string, Promise<void>>();

export async function claudeLocalLauncher(session: Session): Promise<LauncherResult> {
    session.switchFired = false;
    session.deferredSwitchCompleting = false;

    const shadowMetadataSessionIdsOwnedByLauncher = new Set<string>();

    // Create scanner
    const scanner = await createSessionScanner({
        sessionId: session.sessionId,
        workingDirectory: session.path,
        onMessage: (message) => {
            session.client.sendClaudeSessionMessage(message)
        }
    });
    
    // Register callback to notify scanner when session ID is found via hook
    // This is important for --continue/--resume where session ID is not known upfront
    const scannerSessionCallback = (sessionId: string) => {
        scanner.onNewSession(sessionId);
    };
    session.addSessionFoundCallback(scannerSessionCallback);


    // Handle abort
    let exitReason: LauncherResult | null = null;
    const processAbortController = new AbortController();
    let exutFuture = new Future<void>();
    let preserveDeferredSwitchCompleting = false;
    let pendingStopSwitchInFlight = false;
    let turnCompleteCallback: (() => Promise<void>) | null = null;
    let notificationCallback: (() => Promise<void>) | null = null;
    try {
        async function abort() {

            // Send abort signal
            if (!processAbortController.signal.aborted) {
                processAbortController.abort();
            }

            // Await full exit
            await exutFuture.promise;
        }

        async function doAbort() {
            logger.debug('[local]: doAbort');

            // Switching to remote mode
            if (!exitReason) {
                exitReason = { type: 'switch' };
            }

            session.client.closeClaudeSessionTurn('cancelled');

            // Reset sent messages
            session.queue.reset();

            // Abort
            await abort();
        }

        async function performSwitch(reason: 'cancelled' | 'completed') {
            logger.debug(`[local]: performSwitch ${reason}`);
            if (session.switchFired) {
                return;
            }

            session.switchFired = true;
            if (session.pendingSwitch) {
                session.deferredSwitchCompleting = true;
                preserveDeferredSwitchCompleting = true;
            }

            // Switching to remote mode
            if (!exitReason) {
                exitReason = { type: 'switch' };
            }

            session.setPendingSwitch(undefined);
            session.client.closeClaudeSessionTurn(reason);

            // Abort
            await abort();
        }

        async function doSwitch() {
            logger.debug('[local]: doSwitch');
            await performSwitch('cancelled');
        }

        turnCompleteCallback = async () => {
            if (!session.pendingSwitch || pendingStopSwitchInFlight) {
                return;
            }

            pendingStopSwitchInFlight = true;
            await performSwitch('completed');
        };

        // Notification hook fires when Claude is paused waiting for the user
        // (permission prompts, idle waits, plan-mode confirms). For deferred-switch
        // callers, this is the "needs attention" signal that Stop won't deliver
        // because the turn is paused mid-stream rather than ended. Treat it the
        // same as turn-complete: hand off to remote so the app can answer.
        //
        // Note on timing: an earlier revision added a 300ms flush delay before
        // performSwitch on the theory that letting the JSONL `tool_use` flush
        // would help `--resume` re-issue the permission via `canUseTool`. Codex
        // review found the opposite: the SDK does not replay orphaned tool_use
        // entries as live events, and a fully-flushed orphan is *less* likely to
        // make Claude retry the tool than a half-written one. Removed the delay;
        // the real fix is in-flight permission forwarding (planned follow-up,
        // see "Permission forwarding across local→remote" in CLAUDE.md).
        notificationCallback = async () => {
            if (!session.pendingSwitch || pendingStopSwitchInFlight) {
                return;
            }

            pendingStopSwitchInFlight = true;
            await performSwitch('completed');
        };

        async function requestSwitch(params: RequestSwitchParams): Promise<RequestSwitchResponse> {
            if (params.mode === 'now') {
                await doSwitch();
                return { deferred: false };
            }

            if (session.pendingSwitch) {
                throw new Error('already-pending');
            }

            if (!session.turnActive) {
                await performSwitch('completed');
                return { deferred: false };
            }

            session.setPendingSwitch({
                requestedAt: Date.now(),
                messagePreview: params.messagePreview,
            });
            return { deferred: true };
        }

        async function cancelPendingSwitch() {
            if (session.deferredSwitchCompleting) {
                return;
            }

            if (!session.pendingSwitch) {
                return;
            }

            session.setPendingSwitch(undefined);
            session.queue.reset();
        }

        // When to abort
        session.client.rpcHandlerManager.registerHandler('abort', doAbort); // Abort current process, clean queue and switch to remote mode
        session.client.rpcHandlerManager.registerHandler('switch', doSwitch); // When user wants to switch to remote mode
        session.client.rpcHandlerManager.registerHandler<RequestSwitchParams, RequestSwitchResponse>('request-switch', requestSwitch);
        session.client.rpcHandlerManager.registerHandler('cancel-pending-switch', cancelPendingSwitch);
        session.setNotifyLegacyMessageBeforeQueue(() => {
            void doSwitch();
        });
        session.addTurnCompleteCallback(turnCompleteCallback);
        session.addNotificationCallback(notificationCallback);
        session.queue.setOnMessage(null);

        // Exit if there are messages in the queue
        if (session.queue.size() > 0) {
            return { type: 'switch' };
        }

        // Handle session start
        const handleSessionStart = (sessionId: string) => {
            logger.debug(`[claudeLocalLauncher] handleSessionStart sessionId=${sessionId} path=${session.path} hookSettingsPath=${session.hookSettingsPath ?? '(none)'}`);
            session.onSessionFound(sessionId);
            scanner.onNewSession(sessionId);

            if (shadowMetadataInFlight.has(sessionId)) {
                logger.debug(`[claudeLocalLauncher] shadow already in flight for sessionId=${sessionId} — skipping dedupe`);
                return;
            }

            shadowMetadataSessionIdsOwnedByLauncher.add(sessionId);

            const promise = (async () => {
                logger.debug(`[claudeLocalLauncher] firing queryInitMetadata for sessionId=${sessionId}`);
                const metadata = await queryInitMetadata({
                    cwd: session.path,
                    settingsPath: session.hookSettingsPath,
                    mcpServers: session.mcpServers,
                    allowedTools: session.allowedTools,
                    claudeEnvVars: session.claudeEnvVars,
                    abort: processAbortController.signal,
                });

                const definedKeys = Object.entries(metadata).filter(([, v]) => v !== undefined).map(([k]) => k);
                logger.debug(`[claudeLocalLauncher] queryInitMetadata returned for sessionId=${sessionId}; defined fields = [${definedKeys.join(', ')}]`);

                if (!Object.values(metadata).some(v => v !== undefined)) {
                    logger.debug(`[claudeLocalLauncher] metadata empty — skipping updateMetadata for sessionId=${sessionId}`);
                    return;
                }

                logger.debug(`[claudeLocalLauncher] pushing updateMetadata for sessionId=${sessionId}`);
                session.client.updateMetadata((currentMetadata) =>
                    mergeSDKInitMetadata(currentMetadata, metadata),
                );
            })().finally(() => {
                shadowMetadataInFlight.delete(sessionId);
                shadowMetadataSessionIdsOwnedByLauncher.delete(sessionId);
            });

            shadowMetadataInFlight.set(sessionId, promise);
        }

        // Run local mode
        while (true) {
            // If we already have an exit reason, return it
            if (exitReason) {
                return exitReason;
            }

            // Launch
            logger.debug('[local]: launch');
            try {
                await claudeLocal({
                    path: session.path,
                    sessionId: session.sessionId,
                    onSessionFound: handleSessionStart,
                    onThinkingChange: session.onThinkingChange,
                    abort: processAbortController.signal,
                    claudeEnvVars: session.claudeEnvVars,
                    claudeArgs: session.claudeArgs,
                    mcpServers: session.mcpServers,
                    allowedTools: session.allowedTools,
                    hookSettingsPath: session.hookSettingsPath,
                    sandboxConfig: session.sandboxConfig,
                });

                // Consume one-time Claude flags after spawn
                // For example we don't want to pass --resume flag after first spawn
                session.consumeOneTimeFlags();

                // Normal exit
                if (!exitReason) {
                    session.client.closeClaudeSessionTurn('completed');
                    exitReason = { type: 'exit', code: 0 };
                    break;
                }
            } catch (e) {
                logger.debug('[local]: launch error', e);
                // If Claude exited with non-zero exit code, propagate it
                if (e instanceof ExitCodeError) {
                    if (exitReason) {
                        break; // preserve existing exit reason (e.g. switch intent) — SIGTERM is expected
                    }
                    session.client.closeClaudeSessionTurn('failed');
                    exitReason = { type: 'exit', code: e.exitCode };
                    break;
                }
                if (!exitReason) {
                    session.client.sendSessionEvent({ type: 'message', message: 'Process exited unexpectedly' });
                    continue;
                } else {
                    break;
                }
            }
            logger.debug('[local]: launch done');
        }
    } finally {

        // Resolve future
        exutFuture.resolve(undefined);

        // Set handlers to no-op
        session.client.rpcHandlerManager.registerHandler('abort', async () => { });
        session.client.rpcHandlerManager.registerHandler('switch', async () => { });
        session.client.rpcHandlerManager.registerHandler('request-switch', async () => ({ deferred: false }));
        session.client.rpcHandlerManager.registerHandler('cancel-pending-switch', async () => { });
        session.setNotifyLegacyMessageBeforeQueue(null);
        if (turnCompleteCallback) {
            session.removeTurnCompleteCallback(turnCompleteCallback);
        }
        if (notificationCallback) {
            session.removeNotificationCallback(notificationCallback);
        }
        if (!preserveDeferredSwitchCompleting) {
            session.clearDeferredSwitchState();
        } else {
            session.setTurnActive(false);
            session.setPendingSwitch(undefined);
        }
        session.queue.setOnMessage(null);
        
        // Remove session found callback
        session.removeSessionFoundCallback(scannerSessionCallback);

        // Cleanup
        await scanner.cleanup();
    }

    // Return
    return exitReason || { type: 'exit', code: 0 };
}
