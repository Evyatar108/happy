import Constants from 'expo-constants';
import { apiSocket, getHappyClientId } from '@/sync/apiSocket';
import { AuthCredentials, TokenStorage } from '@/auth/tokenStorage';
import { tunnelFetch, registerDeviceCodeExpiredHandler } from '@/auth/machineAuth';
import { storage } from './storage';
import { ApiEphemeralUpdateSchema, ApiMessage, ApiUpdateContainerSchema } from './apiTypes';
import type { ApiEphemeralActivityUpdate } from './apiTypes';
import { Session, Machine } from './storageTypes';
import { InvalidateSync } from '@/utils/sync';
import { ActivityUpdateAccumulator } from './reducer/activityUpdateAccumulator';
import { randomUUID } from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import { syncCurrentPushToken } from './pushRegistration';
import { Platform, AppState, type AppStateStatus } from 'react-native';
import { isRunningOnMac } from '@/utils/platform';
import { getRawRecordLifecycleState, NormalizedMessage, normalizeRawMessage, RawRecord } from './typesRaw';
import { applySettings, Settings, settingsDefaults, settingsParse, SUPPORTED_SCHEMA_VERSION } from './settings';
import { Profile, profileParse } from './profile';
import {
    initializeTracking,
    trackGitHubConnected,
    trackMessageSent,
    tracking,
    trackPaywallCancelled,
    trackPaywallError,
    trackPaywallPresented,
    trackPaywallPurchased,
    trackPaywallRestored,
} from '@/track';
import type { MessageSentSource } from '@/track';
import { RevenueCat, LogLevel, PaywallResult } from './revenueCat';
import { getServerUrl } from './serverConfig';
import { config } from '@/config';
import { log } from '@/log';
import { gitStatusSync } from './gitStatusSync';
import { projectManager } from './projectManager';
import { AsyncLock } from '@/utils/lock';
import { systemPrompt } from './prompt/systemPrompt';
import { resolveMessageModeMeta } from './messageMeta';
import { computeInitialAfterSeq, computeOlderPageAfterSeq } from './paginationMath';
import { PrefetchManager, type PrefetchManagerMessageAdapter, type PrefetchManagerTransport, type RunInSessionLock } from './prefetchManager';
import { computeRenderWindow, computePrefetchOlderRange, shouldPrefetchOlder } from './messageWindow';
import type { DecryptedMessage } from './storageTypes';
import { getSessionMode } from '@/utils/sessionUtils';
import { Modal } from '@/modal';
import { t } from '@/text';
import { compositeSessionId, parseCompositeSessionId } from './machineSessionId';

const SETTINGS_PAYLOAD_LIMIT = 1024 * 1024;

export class SettingsPayloadTooLargeError extends Error {
    readonly byteLength: number;
    readonly limit: number;

    constructor(byteLength: number, limit = SETTINGS_PAYLOAD_LIMIT) {
        super(`Settings payload is ${byteLength} bytes; limit is ${limit} bytes.`);
        this.name = 'SettingsPayloadTooLargeError';
        this.byteLength = byteLength;
        this.limit = limit;
    }
}

export class SettingsAuthError extends Error {
    readonly status: number;

    constructor(status: number) {
        super(`Settings request rejected with auth status ${status}.`);
        this.name = 'SettingsAuthError';
        this.status = status;
    }
}

export class SettingsSyncError extends Error {
    readonly status: number;

    constructor(status: number) {
        super(`Failed to persist settings: ${status}`);
        this.name = 'SettingsSyncError';
        this.status = status;
    }
}

type V3GetSessionMessagesResponse = {
    messages: ApiMessage[];
    hasMore: boolean;
};

type V3PostSessionMessagesResponse = {
    messages: Array<{
        id: string;
        seq: number;
        localId: string | null;
        createdAt: number;
        updatedAt: number;
    }>;
};

type OutboxMessage = {
    localId: string;
    content: string;
};

function parsePlainJson<T>(value: unknown, fallback: T): T {
    if (typeof value !== 'string') {
        return (value ?? fallback) as T;
    }
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}

function decodeApiMessage(message: ApiMessage): DecryptedMessage | null {
    const content = parsePlainJson<RawRecord | null>(message.content.c, null);
    if (!content) {
        return null;
    }
    return {
        id: message.id,
        localId: message.localId ?? null,
        createdAt: message.createdAt,
        seq: message.seq,
        content,
    };
}

function decodeApiMessages(messages: ApiMessage[]): (DecryptedMessage | null)[] {
    return messages.map(decodeApiMessage);
}

function encodeApiRecord(content: RawRecord): string {
    return JSON.stringify(content);
}

export type AttachmentRef = {
    remotePath: string;
    name: string;
    size: number;
};

export function generateLocalMessageId() {
    return randomUUID();
}

type UserMessageAttachment = {
    type: 'image';
    ref: string;
    mimeType?: string;
};

const MAX_ENCODED_ATTACHMENT_BYTES = 4 * 1024 * 1024;
const DATA_URL_BASE64_PREFIX = /^data:[a-zA-Z0-9!#$&^_+\-./]+;base64,/;

function getEncodedAttachmentSize(ref: string): number {
    const match = DATA_URL_BASE64_PREFIX.exec(ref);
    if (match) {
        return ref.length - match[0].length;
    }
    return ref.length;
}

function hasOversizeAttachment(attachments: UserMessageAttachment[] | undefined): boolean {
    return attachments?.some(attachment => getEncodedAttachmentSize(attachment.ref) > MAX_ENCODED_ATTACHMENT_BYTES) ?? false;
}

export type SendMessageOptions = {
    displayText?: string;
    localId?: string;
    attachmentRefs?: AttachmentRef[];
    source?: MessageSentSource;
    switchMode?: 'now' | 'when-idle' | 'none';
    attachments?: UserMessageAttachment[];
};

type RequestSwitchResponse = {
    deferred: boolean;
};

const INITIAL_MESSAGES_WINDOW_SIZE = 80;
const OLDER_MESSAGES_PAGE_SIZE = 80;

class Sync {
    private static readonly BACKGROUND_SEND_TIMEOUT_MS = 30_000;
    serverID!: string;
    anonID!: string;
    private credentials!: AuthCredentials;
    private credentialsList: AuthCredentials[] = [];
    private credentialsByMachineId = new Map<string, AuthCredentials>();
    private sessionsSync: InvalidateSync;
    private messagesSync = new Map<string, InvalidateSync>();
    private sendSync = new Map<string, InvalidateSync>();
    private sendAbortControllers = new Map<string, AbortController>();
    private sessionLastSeq = new Map<string, number>();
    private pendingOutbox = new Map<string, OutboxMessage[]>();
    private sessionMessageQueue = new Map<string, NormalizedMessage[]>();
    private sessionQueueProcessing = new Set<string>();
    // Queue of raw `new-message` socket events that arrived before the session row loaded.
    private pendingNewMessages = new Map<string, unknown[]>();
    private sessionInitInFlight = new Set<string>();
    private deferredSwitchRequests = new Set<string>();
    private sessionMessageLocks = new Map<string, AsyncLock>();
    private settingsSync: InvalidateSync;
    private profileSync: InvalidateSync;
    private purchasesSync: InvalidateSync;
    private machinesSync: InvalidateSync;
    private pushTokenSync: InvalidateSync;
    private nativeUpdateSync: InvalidateSync;
    private activityAccumulator: ActivityUpdateAccumulator;
    private appState: AppStateStatus = AppState.currentState;
    private backgroundSendTimeout: ReturnType<typeof setTimeout> | null = null;
    private backgroundSendNotificationId: string | null = null;
    private backgroundSendStartedAt: number | null = null;
    revenueCatInitialized = false;

    // Generic locking mechanism
    private recalculationLockCount = 0;
    private lastRecalculationTime = 0;

    // US-006: streaming-pagination prefetch manager. Owns the per-session
    // generation counter for socket-pushed older-page fetches. Wired here
    // (not at module scope) so the constructor can supply the per-session
    // AsyncLock closure and plaintext adapter for session range prefetches.
    private prefetchManager: PrefetchManager;
    // US-006: only `onActiveSessionChanged` writes this. Used to short-circuit
    // re-entries with the same active session id and to know which previous
    // session to bump generation for on a real transition.
    private lastActiveSessionId: string | null = null;
    // US-006: tracks per-request terminal Promise<void> from the manager so
    // the flag-on `loadOlder()` delegate can await the awaited-commit
    // contract (Plan AC #16, addresses auto-skipped F-038).
    private prefetchPendingPromises = new Map<string, Promise<void>>();

    constructor() {
        this.sessionsSync = new InvalidateSync(this.fetchSessions);
        this.settingsSync = new InvalidateSync(this.syncSettings);
        this.profileSync = new InvalidateSync(this.fetchProfile);
        this.purchasesSync = new InvalidateSync(this.syncPurchases);
        this.machinesSync = new InvalidateSync(this.fetchMachines);
        this.nativeUpdateSync = new InvalidateSync(this.fetchNativeUpdate);

        const registerPushToken = async () => {
            if (__DEV__) {
                return;
            }
            await this.registerPushToken();
        }
        this.pushTokenSync = new InvalidateSync(registerPushToken);
        this.activityAccumulator = new ActivityUpdateAccumulator(this.flushActivityUpdates.bind(this), 2000);

        // US-006: instantiate the per-session prefetch manager. The lock
        // closure routes the in-lock commit through the same per-session
        // AsyncLock that serializes loadOlder() and the live new-message queue.
        const prefetchMessageAdapter: PrefetchManagerMessageAdapter = {
            decodeMessages: async (sessionId, messages) => {
                return decodeApiMessages(messages);
            },
        };
        const prefetchTransport: PrefetchManagerTransport = {
            requestSessionMessageRange: (req) => apiSocket.requestSessionMessageRange(req),
            onReconnected: (listener) => apiSocket.onReconnected(listener),
        };
        const prefetchRunInSessionLock: RunInSessionLock = (sessionId, body) => {
            return this.getSessionMessageLock(sessionId).inLock(body);
        };
        this.prefetchManager = new PrefetchManager({
            storage: {
                setActivePrefetch: (sid, ap) => storage.getState().setActivePrefetch(sid, ap),
                applyPrefetchedRange: (sid, msgs, params) => storage.getState().applyPrefetchedRange(sid, msgs, params),
                clearActivePrefetch: (sid, requestId) => storage.getState().clearActivePrefetch(sid, requestId),
            },
            messages: prefetchMessageAdapter,
            transport: prefetchTransport,
            runInSessionLock: prefetchRunInSessionLock,
        });

        // Listen for app state changes to refresh purchases
        AppState.addEventListener('change', (nextAppState) => {
            this.appState = nextAppState;
            if (nextAppState === 'active') {
                const shouldFailAfterResume = this.backgroundSendStartedAt !== null
                    && this.hasPendingOutboxMessages()
                    && (Date.now() - this.backgroundSendStartedAt) >= Sync.BACKGROUND_SEND_TIMEOUT_MS;
                void this.cancelBackgroundSendTimeoutNotification();
                this.clearBackgroundSendWatchdog();
                if (shouldFailAfterResume) {
                    void this.notifyMessageSendFailed();
                    this.failPendingOutboxMessages('Message failed to send in background after 30s. Please retry.');
                }
                log.log('📱 App became active');
                void apiSocket.connect();
                this.purchasesSync.invalidate();
                this.profileSync.invalidate();
                this.machinesSync.invalidate();
                this.pushTokenSync.invalidate();
                this.sessionsSync.invalidate();
                this.nativeUpdateSync.invalidate();
            } else {
                log.log(`📱 App state changed to: ${nextAppState}`);
                this.maybeStartBackgroundSendWatchdog();
            }
        });
    }

    private configureMachines(credentialsList: AuthCredentials[]) {
        this.credentialsList = credentialsList;
        this.credentialsByMachineId = new Map(credentialsList.map(credentials => [credentials.machineId, credentials]));
        this.credentials = credentialsList[0];
        if (!this.credentials) {
            throw new Error('No machine credentials configured');
        }
        this.anonID = this.credentials.machineId;
        this.serverID = this.credentials.machineId;
    }

    private getCredentialsForMachine(machineId: string): AuthCredentials | null {
        return this.credentialsByMachineId.get(machineId) ?? null;
    }

    private resolveSessionRef(sessionId: string) {
        return parseCompositeSessionId(sessionId, this.credentials?.machineId ?? '');
    }

    private toCompositeSession(machineId: string, session: Omit<Session, 'presence' | 'permissionModeUserChosen'> & {
        presence?: "online" | number;
        permissionModeUserChosen?: boolean;
    }) {
        const id = compositeSessionId(machineId, session.id);
        return {
            ...session,
            id,
            metadata: session.metadata ? { ...session.metadata, machineId } : session.metadata,
        };
    }

    async create(credentials: AuthCredentials) {
        this.configureMachines([credentials]);
        await this.#init();

        // Await settings sync to have fresh settings
        await this.settingsSync.awaitQueue();

        // Await profile sync to have fresh profile
        await this.profileSync.awaitQueue();

        // Await purchases sync to have fresh purchases
        await this.purchasesSync.awaitQueue();
    }

    async restore(credentials: AuthCredentials) {
        // NOTE: No awaiting anything here, we're restoring from a disk (ie app restarted)
        // Purchases sync is invalidated in #init() and will complete asynchronously
        this.configureMachines([credentials]);
        await this.#init();
    }

    async createMany(credentialsList: AuthCredentials[]) {
        this.configureMachines(credentialsList);
        await this.#init();
        await this.settingsSync.awaitQueue();
        await this.profileSync.awaitQueue();
        await this.purchasesSync.awaitQueue();
    }

    async restoreMany(credentialsList: AuthCredentials[]) {
        this.configureMachines(credentialsList);
        await this.#init();
    }

    async #init() {

        // Centralized DeviceCodeExpired / ClaimExpired handler for all tunnelFetch call sites.
        // Registered once per init so every HTTP call through tunnelFetch (fetchSessions,
        // fetchMachines, syncSettings, fetchProfile, apiSocket.requestForMachine,
        // apiPush, etc.) triggers disconnect-and-notify without duplicating catch blocks.
        registerDeviceCodeExpiredHandler((machineId) => {
            storage.getState().markMachineDisconnected(machineId, Date.now());
            this.notifyDeviceCodeExpired(machineId);
        });

        // Subscribe to updates
        this.subscribeToUpdates();

        // Sync initial PostHog opt-out state with stored settings
        if (tracking) {
            const currentSettings = storage.getState().settings;
            if (currentSettings.analyticsOptOut) {
                tracking.optOut();
            } else {
                tracking.optIn();
            }
        }

        // Invalidate sync
        log.log('🔄 #init: Invalidating boot syncs');
        this.sessionsSync.invalidate();
        this.settingsSync.invalidate();
        this.profileSync.invalidate();
        this.purchasesSync.invalidate();
        this.machinesSync.invalidate();
        this.pushTokenSync.invalidate();
        this.nativeUpdateSync.invalidate();
        log.log('🔄 #init: Boot syncs invalidated');

        // Mark UI ready as soon as sessions load.
        this.sessionsSync.awaitQueue().then(() => {
            storage.getState().applyReady();
        }).catch((error) => {
            console.error('Failed to load sessions:', error);
            // Still mark ready so the UI doesn't stay on a blank screen forever
            storage.getState().applyReady();
        });
    }


    onSessionVisible = (sessionId: string) => {
        this.getMessagesSync(sessionId).invalidate();

        // Also invalidate git status sync for this session
        gitStatusSync.getSync(sessionId).invalidate();

    }

    /**
     * US-006: distinct from `onSessionVisible`. The ONLY entrypoint that:
     *   (i) writes `renderWindow: null` for the newly active session
     *  (ii) bumps the previous session's prefetch generation (skipped when
     *       there is no previous session)
     * Routing the renderWindow reset through `onSessionVisible` would
     * reintroduce the F-046 regression (the latter fires on new-message
     * pings and control-return — neither of which is an actual session switch.
     * actual session switches).
     */
    onActiveSessionChanged = (sessionId: string): void => {
        if (this.lastActiveSessionId === sessionId) {
            return;
        }
        const previousSessionId = this.lastActiveSessionId;
        storage.getState().setRenderWindow(sessionId, null);
        if (previousSessionId !== null) {
            // Full cleanup of the previous session's in-flight prefetch:
            // bumps generation, clears storage's durable activePrefetch,
            // settles the orphaned terminal Promise, and fires
            // `abandon-on-cleanup` so the failure-clear contract holds even
            // when the abandoned request body's transport ack never arrives.
            // Without this (the prior `bumpGeneration` only call) coming
            // back to the previous session would find shouldPrefetchOlder
            // permanently gated by stale activePrefetch and any flag-on
            // loadOlder() would await an orphaned promise indefinitely.
            this.prefetchManager.abandonInFlight(previousSessionId);
            // Manager owns its own state; sync owns the prefetchPendingPromises
            // map. Evict the orphaned reference so a later loadOlder() does
            // not await a settled promise (harmless but a leak) and re-issues
            // a fresh request under the bumped generation.
            this.prefetchPendingPromises.delete(previousSessionId);
        }
        this.lastActiveSessionId = sessionId;
    }

    /**
     * US-006: viewport-tick bridge from ChatList's onViewableItemsChanged.
     * Flag-off short-circuit returns immediately without touching
     * renderWindow, activePrefetch, or the manager. With the flag on:
     *   - null `computeRenderWindow` (synthetic-only or pending-only tick) →
     *     do NOT call setRenderWindow, do NOT call the manager, leave
     *     `renderWindow` unchanged from its prior value.
     *   - non-null computeRenderWindow → setRenderWindow then, when
     *     `shouldPrefetchOlder` is satisfied, issue exactly one
     *     `requestSessionMessageRange` per qualifying tick.
     */
    reportRenderWindow = (sessionId: string, visibleSeqs: number[]): void => {
        const flag = storage.getState().localSettings.enableSocketRangeFetch;
        if (!flag) {
            return;
        }
        const window = computeRenderWindow({ visibleSeqs });
        if (window === null) {
            return;
        }
        storage.getState().setRenderWindow(sessionId, window);
        const sessionMessages = storage.getState().sessionMessages[sessionId];
        if (!sessionMessages) {
            return;
        }
        const should = shouldPrefetchOlder({
            renderWindow: window,
            oldestLoadedSeq: sessionMessages.oldestLoadedSeq,
            activePrefetch: sessionMessages.activePrefetch,
            hasOlder: sessionMessages.hasOlder,
        });
        if (!should) {
            return;
        }
        const range = computePrefetchOlderRange({
            oldestLoadedSeq: sessionMessages.oldestLoadedSeq,
            pageSize: OLDER_MESSAGES_PAGE_SIZE,
        });
        if (!range) {
            return;
        }
        const promise = this.prefetchManager.requestSessionMessageRange({
            sessionId,
            fromSeq: range.fromSeq,
            toSeq: range.toSeq,
            limit: range.limit,
            direction: 'older',
        });
        // Track for the awaited-commit contract used by the flag-on
        // `loadOlder()` delegate. Cleared after terminal resolution.
        this.prefetchPendingPromises.set(sessionId, promise);
        void promise.finally(() => {
            if (this.prefetchPendingPromises.get(sessionId) === promise) {
                this.prefetchPendingPromises.delete(sessionId);
            }
        });
    }

    loadOlder = async (sessionId: string): Promise<void> => {
        const sessionMessages = storage.getState().sessionMessages[sessionId];
        if (!sessionMessages || !sessionMessages.hasOlder || sessionMessages.loadingOlder) {
            return;
        }

        // US-006: when the local-only flag is on, delegate to the prefetch
        // manager and AWAIT the per-request terminal Promise<void> before
        // resolving. The await is the entire awaited-commit contract (Plan
        // AC #16, addresses auto-skipped F-038): callers like
        // `handleShowPreBoundaryHistory` (ChatList.tsx:85-109) probe
        // `oldestLoadedSeq` after each await, so resolving before the commit
        // would cause the loop to spin or terminate wrong.
        const flag = storage.getState().localSettings.enableSocketRangeFetch;
        if (flag) {
            // If a viewport-tick request is already in-flight for this
            // session, await IT to honor the contract; otherwise issue an
            // older-page request through the manager.
            const inFlight = this.prefetchPendingPromises.get(sessionId);
            if (inFlight) {
                await inFlight;
                return;
            }
            const range = computePrefetchOlderRange({
                oldestLoadedSeq: sessionMessages.oldestLoadedSeq,
                pageSize: OLDER_MESSAGES_PAGE_SIZE,
            });
            if (!range) {
                // Nothing older to fetch — match the legacy semantics by
                // marking the session as having no older messages and
                // returning.
                storage.getState().applyOlderMessages(sessionId, [], {
                    newOldestLoadedSeq: sessionMessages.oldestLoadedSeq,
                    hasOlder: false,
                });
                return;
            }
            const promise = this.prefetchManager.requestSessionMessageRange({
                sessionId,
                fromSeq: range.fromSeq,
                toSeq: range.toSeq,
                limit: range.limit,
                direction: 'older',
            });
            this.prefetchPendingPromises.set(sessionId, promise);
            try {
                await promise;
            } finally {
                if (this.prefetchPendingPromises.get(sessionId) === promise) {
                    this.prefetchPendingPromises.delete(sessionId);
                }
            }
            return;
        }

        storage.getState().setLoadingOlder(sessionId, true);

        const lock = this.getSessionMessageLock(sessionId);
        await lock.inLock(async () => {
            let applied = false;
            try {
                const current = storage.getState().sessionMessages[sessionId];
                if (!current || !current.hasOlder) {
                    return;
                }

                const pagination = computeOlderPageAfterSeq(
                    current.oldestLoadedSeq,
                    OLDER_MESSAGES_PAGE_SIZE
                );

                if (!pagination.hasOlder) {
                    applied = true;
                    storage.getState().applyOlderMessages(sessionId, [], {
                        newOldestLoadedSeq: current.oldestLoadedSeq,
                        hasOlder: false,
                    });
                    return;
                }

                const scope = apiSocket.forSession(sessionId);
                const response = await scope.request(
                    `/v3/sessions/${scope.ref.localSessionId}/messages?after_seq=${pagination.afterSeq}&limit=${OLDER_MESSAGES_PAGE_SIZE}`
                );
                if (!response.ok) {
                    throw new Error(`Failed to fetch older messages for ${sessionId}: ${response.status}`);
                }

                const data = await response.json() as V3GetSessionMessagesResponse;
                const messages = Array.isArray(data.messages) ? data.messages : [];
                const decryptedMessages = decodeApiMessages(messages);
                const normalizedMessages: NormalizedMessage[] = [];

                for (let i = 0; i < decryptedMessages.length; i++) {
                    const decrypted = decryptedMessages[i];
                    if (!decrypted) {
                        continue;
                    }

                    const normalized = normalizeRawMessage(
                        decrypted.id,
                        decrypted.localId,
                        decrypted.createdAt,
                        decrypted.seq,
                        decrypted.content
                    );
                    if (normalized) {
                        normalizedMessages.push(normalized);
                    }
                }

                applied = true;
                const finalHasOlder = pagination.hasOlderAfterFetch ?? pagination.hasOlder;
                storage.getState().applyOlderMessages(sessionId, normalizedMessages, {
                    newOldestLoadedSeq: pagination.afterSeq + 1,
                    hasOlder: finalHasOlder,
                });
            } finally {
                if (!applied) {
                    storage.getState().setLoadingOlder(sessionId, false);
                }
            }
        });
    }

    private getMessagesSync(sessionId: string): InvalidateSync {
        let sync = this.messagesSync.get(sessionId);
        if (!sync) {
            sync = new InvalidateSync(() => this.fetchMessages(sessionId));
            this.messagesSync.set(sessionId, sync);
        }
        return sync;
    }

    private getSendSync(sessionId: string): InvalidateSync {
        let sync = this.sendSync.get(sessionId);
        if (!sync) {
            sync = new InvalidateSync(() => this.flushOutbox(sessionId));
            this.sendSync.set(sessionId, sync);
        }
        return sync;
    }

    private enqueueMessages(sessionId: string, messages: NormalizedMessage[]) {
        if (messages.length === 0) {
            return;
        }

        let queue = this.sessionMessageQueue.get(sessionId);
        if (!queue) {
            queue = [];
            this.sessionMessageQueue.set(sessionId, queue);
        }
        queue.push(...messages);

        this.scheduleQueuedMessagesProcessing(sessionId);
    }

    private getSessionMessageLock(sessionId: string): AsyncLock {
        let lock = this.sessionMessageLocks.get(sessionId);
        if (!lock) {
            lock = new AsyncLock();
            this.sessionMessageLocks.set(sessionId, lock);
        }
        return lock;
    }

    private scheduleQueuedMessagesProcessing(sessionId: string) {
        if (this.sessionQueueProcessing.has(sessionId)) {
            return;
        }

        this.sessionQueueProcessing.add(sessionId);
        const lock = this.getSessionMessageLock(sessionId);
        void lock.inLock(() => {
            while (true) {
                const pending = this.sessionMessageQueue.get(sessionId);
                if (!pending || pending.length === 0) {
                    break;
                }
                const batch = pending.splice(0, pending.length);
                this.applyMessages(sessionId, batch);
            }
        }).finally(() => {
            this.sessionQueueProcessing.delete(sessionId);
            const pending = this.sessionMessageQueue.get(sessionId);
            if (pending && pending.length > 0) {
                this.scheduleQueuedMessagesProcessing(sessionId);
            }
        });
    }

    private hasPendingOutboxMessages() {
        if (this.sendAbortControllers.size > 0) {
            return true;
        }
        for (const messages of this.pendingOutbox.values()) {
            if (messages.length > 0) {
                return true;
            }
        }
        return false;
    }

    private maybeStartBackgroundSendWatchdog() {
        if (Platform.OS === 'web' || this.appState === 'active') {
            return;
        }
        if (!this.hasPendingOutboxMessages() || this.backgroundSendTimeout) {
            return;
        }

        log.log('📨 Pending messages detected in background. Starting 30s send watchdog.');
        this.backgroundSendStartedAt = Date.now();
        this.backgroundSendTimeout = setTimeout(() => {
            this.backgroundSendTimeout = null;
            void this.handleBackgroundSendTimeout();
        }, Sync.BACKGROUND_SEND_TIMEOUT_MS);
        void this.scheduleBackgroundSendTimeoutNotification();
    }

    private clearBackgroundSendWatchdog() {
        if (this.backgroundSendTimeout) {
            clearTimeout(this.backgroundSendTimeout);
            this.backgroundSendTimeout = null;
        }
        this.backgroundSendStartedAt = null;
    }

    private async scheduleBackgroundSendTimeoutNotification() {
        if (Platform.OS === 'web' || this.backgroundSendNotificationId) {
            return;
        }
        try {
            this.backgroundSendNotificationId = await Notifications.scheduleNotificationAsync({
                content: {
                    title: 'Message not sent',
                    body: 'A message is still sending in the background. It will fail in 30 seconds if not delivered.',
                    sound: true
                },
                trigger: {
                    type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                    seconds: Math.ceil(Sync.BACKGROUND_SEND_TIMEOUT_MS / 1000)
                }
            });
        } catch (error) {
            log.log(`Failed to schedule background send timeout notification: ${error}`);
        }
    }

    private async cancelBackgroundSendTimeoutNotification() {
        if (!this.backgroundSendNotificationId) {
            return;
        }
        try {
            await Notifications.cancelScheduledNotificationAsync(this.backgroundSendNotificationId);
        } catch (error) {
            log.log(`Failed to cancel background send timeout notification: ${error}`);
        } finally {
            this.backgroundSendNotificationId = null;
        }
    }

    private async notifyMessageSendFailed() {
        if (Platform.OS === 'web') {
            return;
        }
        try {
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: 'Message failed',
                    body: 'A message failed to send while the app was in background. Open Happy and retry.',
                    sound: true
                },
                trigger: null
            });
        } catch (error) {
            log.log(`Failed to schedule message failure notification: ${error}`);
        }
    }

    private failPendingOutboxMessages(reasonText: string) {
        for (const controller of this.sendAbortControllers.values()) {
            controller.abort();
        }
        this.sendAbortControllers.clear();

        const now = Date.now();
        const sessionIds: string[] = [];
        for (const [sessionId, pending] of this.pendingOutbox) {
            if (pending.length === 0) {
                continue;
            }
            pending.length = 0;
            this.pendingOutbox.delete(sessionId);
            sessionIds.push(sessionId);
        }

        for (const sessionId of sessionIds) {
            this.enqueueMessages(sessionId, [{
                id: randomUUID(),
                localId: null,
                createdAt: now,
                seq: Number.MAX_SAFE_INTEGER,
                role: 'event',
                isSidechain: false,
                content: {
                    type: 'message',
                    message: reasonText
                }
            }]);
        }
    }

    private async handleBackgroundSendTimeout() {
        if (!this.hasPendingOutboxMessages()) {
            await this.cancelBackgroundSendTimeoutNotification();
            this.backgroundSendStartedAt = null;
            return;
        }

        await this.cancelBackgroundSendTimeoutNotification();
        await this.notifyMessageSendFailed();
        this.failPendingOutboxMessages('Message failed to send in background after 30s. Please retry.');
        this.backgroundSendStartedAt = null;
    }

    async sendMessage(sessionId: string, text: string, options?: SendMessageOptions) {
        const switchMode = options?.switchMode ?? 'now';
        const isWhenIdle = switchMode === 'when-idle';

        // Get session data from storage
        const session = storage.getState().sessions[sessionId];
        if (!session) {
            console.error(`Session ${sessionId} not found in storage`);
            if (isWhenIdle) {
                Modal.alert(t('common.error'), t('errors.sendFailed'));
                throw new Error(`Session ${sessionId} not found in storage`);
            }
            return;
        }

        const { permissionMode, model, thinkingLevel } = resolveMessageModeMeta(session);
        const { attachmentRefs, displayText, localId, source = 'chat' } = options ?? {};
        const attachments = session.metadata?.flavor === 'claude' ? options?.attachments : undefined;
        if (hasOversizeAttachment(attachments)) {
            Modal.alert(t('common.error'), t('errors.attachmentTooLarge'));
            return;
        }
        const shouldRequestDeferredSwitch = isWhenIdle
            && session.metadata?.flavor === 'claude'
            && getSessionMode(session) === 'local';
        let tagDeferredSwitch = false;

        if (shouldRequestDeferredSwitch) {
            if (this.deferredSwitchRequests.has(sessionId)) {
                Modal.alert(t('common.error'), t('errors.requestSwitchFailed'));
                throw new Error('request-switch already pending');
            }

            this.deferredSwitchRequests.add(sessionId);
            try {
                const rawPreview = text.replace(/\n/g, ' ').trimStart();
                const messagePreview = rawPreview.length > 80
                    ? rawPreview.slice(0, 80) + '…'
                    : rawPreview;
                const response = await apiSocket.forSession(sessionId).rpc<RequestSwitchResponse, { mode: 'when-idle'; messagePreview: string }>(
                    'request-switch',
                    { mode: 'when-idle', messagePreview },
                );
                tagDeferredSwitch = response.deferred === true;
            } catch (error) {
                Modal.alert(t('common.error'), t('errors.requestSwitchFailed'));
                throw error;
            } finally {
                this.deferredSwitchRequests.delete(sessionId);
            }
        }

        try {
            await this.enqueueUserMessage(sessionId, text, session, {
                displayText,
                localId,
                attachmentRefs,
                source,
                permissionMode,
                model,
                thinkingLevel,
                tagDeferredSwitch,
                attachments,
            });
        } catch (error) {
            if (isWhenIdle) {
                Modal.alert(t('common.error'), t('errors.sendFailed'));
                throw error;
            }
        }
    }

    private async enqueueUserMessage(
        sessionId: string,
        text: string,
        session: Session,
        options: {
            displayText?: string;
            localId?: string;
            attachmentRefs?: AttachmentRef[];
            source: MessageSentSource;
            permissionMode: string | undefined;
            model: string | null;
            thinkingLevel: string | undefined;
            tagDeferredSwitch: boolean;
            attachments?: UserMessageAttachment[];
        }
    ) {
        const localId = options.localId ?? generateLocalMessageId();

        // Determine sentFrom based on platform
        let sentFrom: string;
        if (Platform.OS === 'web') {
            sentFrom = 'web';
        } else if (Platform.OS === 'android') {
            sentFrom = 'android';
        } else if (Platform.OS === 'ios') {
            // Check if running on Mac (Catalyst or Designed for iPad on Mac)
            if (isRunningOnMac()) {
                sentFrom = 'mac';
            } else {
                sentFrom = 'ios';
            }
        } else {
            sentFrom = 'web'; // fallback
        }

        const fallbackModel: string | null = null;

        // Create user message content with metadata
        const content: RawRecord = {
            role: 'user',
            content: {
                type: 'text',
                text,
                ...(options.attachments !== undefined && { attachments: options.attachments })
            },
            meta: {
                sentFrom,
                ...(options.permissionMode !== undefined && { permissionMode: options.permissionMode }),
                model: options.model,
                ...(options.thinkingLevel !== undefined && { thinkingLevel: options.thinkingLevel }),
                fallbackModel,
                appendSystemPrompt: systemPrompt,
                ...(options.tagDeferredSwitch && { capabilities: { deferredSwitch: true } }),
                ...(options.attachmentRefs !== undefined && { attachmentRefs: options.attachmentRefs }),
                ...(options.displayText && { displayText: options.displayText }) // Add displayText if provided
            }
        };
        const rawRecord = encodeApiRecord(content);

        // Add to messages - normalize the raw record
        const createdAt = Date.now();
        const normalizedMessage = normalizeRawMessage(localId, localId, createdAt, Number.MAX_SAFE_INTEGER, content);
        if (normalizedMessage) {
            this.enqueueMessages(sessionId, [normalizedMessage]);
        }

        let pending = this.pendingOutbox.get(sessionId);
        if (!pending) {
            pending = [];
            this.pendingOutbox.set(sessionId, pending);
        }
        pending.push({
            localId,
            content: rawRecord
        });
        trackMessageSent(options.source, session.metadata);

        this.getSendSync(sessionId).invalidate();
        this.maybeStartBackgroundSendWatchdog();
    }

    private applyServerSettings = (serverSettings: Settings) => {
        storage.getState().applySettings(serverSettings);
    }

    applySettings = (delta: Partial<Settings>) => {
        storage.getState().applySettingsLocal(delta);

        // Sync PostHog opt-out state if it was changed
        if (tracking && 'analyticsOptOut' in delta) {
            const currentSettings = storage.getState().settings;
            if (currentSettings.analyticsOptOut) {
                tracking.optOut();
            } else {
                tracking.optIn();
            }
        }

        // Invalidate settings sync
        this.settingsSync.invalidate();
    }

    refreshPurchases = () => {
        this.purchasesSync.invalidate();
    }

    refreshProfile = async () => {
        await this.profileSync.invalidateAndAwait();
    }

    purchaseProduct = async (productId: string): Promise<{ success: boolean; error?: string }> => {
        try {
            // Check if RevenueCat is initialized
            if (!this.revenueCatInitialized) {
                return { success: false, error: 'RevenueCat not initialized' };
            }

            // Fetch the product
            const products = await RevenueCat.getProducts([productId]);
            if (products.length === 0) {
                return { success: false, error: `Product '${productId}' not found` };
            }

            // Purchase the product
            const product = products[0];
            const { customerInfo } = await RevenueCat.purchaseStoreProduct(product);

            // Update local purchases data
            storage.getState().applyPurchases(customerInfo);

            return { success: true };
        } catch (error: any) {
            // Check if user cancelled
            if (error.userCancelled) {
                return { success: false, error: 'Purchase cancelled' };
            }

            // Return the error message
            return { success: false, error: error.message || 'Purchase failed' };
        }
    }

    getOfferings = async (): Promise<{ success: boolean; offerings?: any; error?: string }> => {
        try {
            // Check if RevenueCat is initialized
            if (!this.revenueCatInitialized) {
                return { success: false, error: 'RevenueCat not initialized' };
            }

            // Fetch offerings
            const offerings = await RevenueCat.getOfferings();

            // Return the offerings data
            return {
                success: true,
                offerings: {
                    current: offerings.current,
                    all: offerings.all
                }
            };
        } catch (error: any) {
            return { success: false, error: error.message || 'Failed to fetch offerings' };
        }
    }

    presentPaywall = async (flow?: string): Promise<{ success: boolean; purchased?: boolean; error?: string }> => {
        try {
            // Check if RevenueCat is initialized
            if (!this.revenueCatInitialized) {
                const error = 'RevenueCat not initialized';
                trackPaywallError(error, flow);
                return { success: false, error };
            }

            // Track paywall presentation
            trackPaywallPresented(flow);

            // Present the paywall (with flow custom variable if specified)
            const result = await RevenueCat.presentPaywall(
                flow ? { customVariables: { flow } } : undefined
            );

            // Handle the result
            switch (result) {
                case PaywallResult.PURCHASED:
                    trackPaywallPurchased(flow);
                    // Refresh customer info after purchase
                    await this.syncPurchases();
                    return { success: true, purchased: true };
                case PaywallResult.RESTORED:
                    trackPaywallRestored(flow);
                    // Refresh customer info after restore
                    await this.syncPurchases();
                    return { success: true, purchased: true };
                case PaywallResult.CANCELLED:
                    trackPaywallCancelled(flow);
                    return { success: true, purchased: false };
                case PaywallResult.NOT_PRESENTED:
                    trackPaywallError('Paywall not presented', flow);
                    return { success: false, error: 'Paywall not available on this platform' };
                case PaywallResult.ERROR:
                default:
                    const errorMsg = 'Failed to present paywall';
                    trackPaywallError(errorMsg, flow);
                    return { success: false, error: errorMsg };
            }
        } catch (error: any) {
            const errorMessage = error.message || 'Failed to present paywall';
            trackPaywallError(errorMessage, flow);
            return { success: false, error: errorMessage };
        }
    }

    //
    // Private
    //

    private fetchSessions = async () => {
        if (this.credentialsList.length === 0) return;

        const decryptedSessions: (Omit<Session, 'presence' | 'permissionModeUserChosen'> & {
            presence?: "online" | number;
            permissionModeUserChosen?: boolean;
        })[] = [];

        await Promise.all(this.credentialsList.map(async (credentials) => {
            let response: Response;
            try {
                response = await tunnelFetch(`${credentials.tunnelUrl}/v1/sessions`, credentials, {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Happy-Client': getHappyClientId(),
                    }
                });
            } catch (error) {
                storage.getState().markMachineDisconnected(credentials.machineId, Date.now());
                console.error(`Failed to fetch sessions for ${credentials.machineId}:`, error);
                return;
            }

            if (!response.ok) {
                storage.getState().markMachineDisconnected(credentials.machineId, Date.now());
                console.error(`Failed to fetch sessions for ${credentials.machineId}: ${response.status}`);
                return;
            }

            const data = await response.json();
            const sessions = data.sessions as Array<{
                id: string;
                tag: string;
                seq: number;
                metadata: string;
                metadataVersion: number;
                agentState: string | null;
                agentStateVersion: number;
                active: boolean;
                activeAt: number;
                createdAt: number;
                updatedAt: number;
                lastMessage: ApiMessage | null;
            }>;

            for (const session of sessions) {
                const metadata = parsePlainJson(session.metadata, null);
                const agentState = parsePlainJson(session.agentState, null);

                decryptedSessions.push(this.toCompositeSession(credentials.machineId, {
                    ...session,
                    thinking: false,
                    thinkingAt: 0,
                    metadata,
                    agentState
                }));
            }
        }));

        this.applySessions(decryptedSessions);
        log.log(`📥 fetchSessions completed - processed ${decryptedSessions.length} sessions across ${this.credentialsList.length} machines`);

    }

    public refreshMachines = async () => {
        return this.fetchMachines();
    }

    public refreshSessions = async () => {
        return this.sessionsSync.invalidateAndAwait();
    }

    public getCredentials() {
        return this.credentials;
    }

    private fetchMachines = async () => {
        if (this.credentialsList.length === 0) return;

        console.log('📊 Sync: Fetching machines...');
        const decryptedMachines: Machine[] = [];

        await Promise.all(this.credentialsList.map(async (credentials) => {
            let response: Response;
            try {
                response = await tunnelFetch(`${credentials.tunnelUrl}/v2/me/machine`, credentials, {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Happy-Client': getHappyClientId(),
                    }
                });
            } catch (error) {
                console.error(`Failed to fetch machines from ${credentials.machineId}:`, error);
                return;
            }

            if (!response.ok) {
                console.error(`Failed to fetch machines from ${credentials.machineId}: ${response.status}`);
                return;
            }

            const machine = await response.json() as {
                machineId: string;
                hostname: string;
                tunnelUrl: string;
                lastSeenAt: number | string;
            };
            const activeAt = typeof machine.lastSeenAt === 'number' ? machine.lastSeenAt : Date.parse(machine.lastSeenAt);
            decryptedMachines.push({
                id: machine.machineId,
                seq: activeAt || Date.now(),
                createdAt: activeAt || Date.now(),
                updatedAt: activeAt || Date.now(),
                active: true,
                activeAt: activeAt || Date.now(),
                metadata: {
                    host: machine.hostname,
                    platform: '',
                    happyCliVersion: '',
                    happyHomeDir: '',
                    homeDir: '',
                    tunnelUrl: machine.tunnelUrl,
                },
            });
        }));

        storage.getState().applyMachines(decryptedMachines, true);
        log.log(`🖥️ fetchMachines completed - processed ${decryptedMachines.length} machines`);
    }

    private syncSettings = async () => {
        if (!this.credentials) return;

        const API_ENDPOINT = this.credentials.tunnelUrl;
        const payload = storage.getState().settings;
        const serialized = JSON.stringify(payload);
        const byteLength = new TextEncoder().encode(serialized).byteLength;
        if (byteLength > SETTINGS_PAYLOAD_LIMIT) {
            throw new SettingsPayloadTooLargeError(byteLength);
        }

        const putResponse = await tunnelFetch(`${API_ENDPOINT}/v2/me/settings`, this.credentials, {
            method: 'PUT',
            body: serialized,
            headers: {
                'Content-Type': 'application/json',
                'X-Happy-Client': getHappyClientId(),
            }
        });
        if (!putResponse.ok) {
            if (putResponse.status === 413) {
                throw new SettingsPayloadTooLargeError(byteLength);
            }
            if (putResponse.status === 401 || putResponse.status === 403) {
                throw new SettingsAuthError(putResponse.status);
            }
            throw new SettingsSyncError(putResponse.status);
        }

        // Run request
        const response = await tunnelFetch(`${API_ENDPOINT}/v2/me/settings`, this.credentials, {
            headers: {
                'Content-Type': 'application/json',
                'X-Happy-Client': getHappyClientId(),
            }
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch settings: ${response.status}`);
        }
        const data = await response.json();

        // Parse response
        let parsedSettings = settingsParse(data);

        // Log
        console.log('settings', JSON.stringify({
            settings: parsedSettings,
        }));

        // Apply settings to storage, re-layering any pending local changes on top
        this.applyServerSettings(parsedSettings);

        // Sync PostHog opt-out state with settings
        if (tracking) {
            if (parsedSettings.analyticsOptOut) {
                tracking.optOut();
            } else {
                tracking.optIn();
            }
        }
    }

    private fetchProfile = async () => {
        if (!this.credentials) return;

        const API_ENDPOINT = this.credentials.tunnelUrl;
        const response = await tunnelFetch(`${API_ENDPOINT}/v2/me/profile`, this.credentials, {
            headers: {
                'Content-Type': 'application/json',
                'X-Happy-Client': getHappyClientId(),
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch profile: ${response.status}`);
        }

        const data = await response.json();
        const parsedProfile = profileParse(data);

        // Log profile data for debugging
        console.log('profile', JSON.stringify({
            id: parsedProfile.id,
            timestamp: parsedProfile.timestamp,
            firstName: parsedProfile.firstName,
            lastName: parsedProfile.lastName,
            hasAvatar: !!parsedProfile.avatar,
            hasGitHub: !!parsedProfile.github
        }));

        // Apply profile to storage
        storage.getState().applyProfile(parsedProfile);
    }

    private fetchNativeUpdate = async () => {
        try {
            // Skip in development
            if ((Platform.OS !== 'android' && Platform.OS !== 'ios') || !Constants.expoConfig?.version) {
                return;
            }
            if (Platform.OS === 'ios' && !Constants.expoConfig?.ios?.bundleIdentifier) {
                return;
            }
            if (Platform.OS === 'android' && !Constants.expoConfig?.android?.package) {
                return;
            }

            const serverUrl = getServerUrl();

            // Get platform and app identifiers
            const platform = Platform.OS;
            const version = Constants.expoConfig?.version!;
            const appId = (Platform.OS === 'ios' ? Constants.expoConfig?.ios?.bundleIdentifier! : Constants.expoConfig?.android?.package!);

            const response = await fetch(`${serverUrl}/v1/version`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Happy-Client': getHappyClientId(),
                },
                body: JSON.stringify({
                    platform,
                    version,
                    app_id: appId,
                }),
            });

            if (!response.ok) {
                console.log(`[fetchNativeUpdate] Request failed: ${response.status}`);
                return;
            }

            const data = await response.json();
            console.log('[fetchNativeUpdate] Data:', data);

            // Apply update status to storage
            if (data.update_required && data.update_url) {
                storage.getState().applyNativeUpdateStatus({
                    available: true,
                    updateUrl: data.update_url
                });
            } else {
                storage.getState().applyNativeUpdateStatus({
                    available: false
                });
            }
        } catch (error) {
            console.log('[fetchNativeUpdate] Error:', error);
            storage.getState().applyNativeUpdateStatus(null);
        }
    }

    private syncPurchases = async () => {
        try {
            // Initialize RevenueCat if not already done
            if (!this.revenueCatInitialized) {
                // Get the appropriate API key based on platform
                let apiKey: string | undefined;

                if (Platform.OS === 'ios') {
                    apiKey = config.revenueCatAppleKey;
                } else if (Platform.OS === 'android') {
                    apiKey = config.revenueCatGoogleKey;
                } else if (Platform.OS === 'web') {
                    apiKey = config.revenueCatStripeKey;
                }

                if (!apiKey) {
                    console.log(`RevenueCat: No API key found for platform ${Platform.OS}`);
                    return;
                }

                // Configure RevenueCat
                if (__DEV__) {
                    RevenueCat.setLogLevel(LogLevel.DEBUG);
                }

                // Initialize with the public ID as user ID
                RevenueCat.configure({
                    apiKey,
                    appUserID: this.serverID, // In server this is a CUID, which we can assume is globaly unique even between servers
                    useAmazon: false,
                });

                this.revenueCatInitialized = true;
                console.log('RevenueCat initialized successfully');
            }

            // Sync purchases
            await RevenueCat.syncPurchases();

            // Fetch customer info
            const customerInfo = await RevenueCat.getCustomerInfo();

            // Apply to storage (storage handles the transformation)
            storage.getState().applyPurchases(customerInfo);

        } catch (error) {
            console.error('Failed to sync purchases:', error);
            // Don't throw - purchases are optional
        }
    }

    private flushOutbox = async (sessionId: string) => {
        const pending = this.pendingOutbox.get(sessionId);
        if (!pending || pending.length === 0) {
            if (!this.hasPendingOutboxMessages()) {
                this.clearBackgroundSendWatchdog();
                await this.cancelBackgroundSendTimeoutNotification();
                this.backgroundSendStartedAt = null;
            }
            return;
        }

        const batch = pending.slice();
        const controller = new AbortController();
        this.sendAbortControllers.set(sessionId, controller);
        try {
            const sendScope = apiSocket.forSession(sessionId);
            const response = await sendScope.request(`/v3/sessions/${sendScope.ref.localSessionId}/messages`, {
                method: 'POST',
                body: JSON.stringify({
                    messages: batch.map((message) => ({
                        localId: message.localId,
                        content: message.content
                    }))
                }),
                headers: {
                    'Content-Type': 'application/json'
                },
                signal: controller.signal
            });
            if (!response.ok) {
                throw new Error(`Failed to send messages for ${sessionId}: ${response.status}`);
            }

            const data = await response.json() as V3PostSessionMessagesResponse;
            pending.splice(0, batch.length);
            if (Array.isArray(data.messages) && data.messages.length > 0) {
                const currentLastSeq = this.sessionLastSeq.get(sessionId) ?? 0;
                let maxSeq = currentLastSeq;
                for (const message of data.messages) {
                    if (message.seq > maxSeq) {
                        maxSeq = message.seq;
                    }
                }
                this.sessionLastSeq.set(sessionId, maxSeq);
            }
        } catch (error) {
            this.maybeStartBackgroundSendWatchdog();
            throw error;
        } finally {
            this.sendAbortControllers.delete(sessionId);
        }

        if (pending.length === 0) {
            this.pendingOutbox.delete(sessionId);
        }
        if (!this.hasPendingOutboxMessages()) {
            this.clearBackgroundSendWatchdog();
            await this.cancelBackgroundSendTimeoutNotification();
            this.backgroundSendStartedAt = null;
        } else if (this.appState !== 'active') {
            this.maybeStartBackgroundSendWatchdog();
        }
    }

    private fetchMessages = async (sessionId: string) => {
        log.log(`💬 fetchMessages starting for session ${sessionId} - acquiring lock`);
        const lock = this.getSessionMessageLock(sessionId);
        await lock.inLock(async () => {
            const isColdStart = !this.sessionLastSeq.has(sessionId);
            let afterSeq = this.sessionLastSeq.get(sessionId) ?? 0;
            let hasOlder = false;
            let boundedSessionSeq: number | null = null;
            let oldestLoadedSeq = 0;

            if (isColdStart) {
                const sessionSeq = storage.getState().sessions[sessionId]?.seq;
                if (sessionSeq !== undefined) {
                    const boundedWindow = computeInitialAfterSeq(sessionSeq, INITIAL_MESSAGES_WINDOW_SIZE);
                    afterSeq = boundedWindow.afterSeq;
                    hasOlder = boundedWindow.hasOlder;
                    if (boundedWindow.hasOlder) {
                        boundedSessionSeq = sessionSeq;
                        oldestLoadedSeq = boundedWindow.afterSeq + 1;
                    }
                }
            }

            let hasMore = true;
            let totalNormalized = 0;

            while (hasMore) {
                const fetchScope = apiSocket.forSession(sessionId);
                const response = await fetchScope.request(`/v3/sessions/${fetchScope.ref.localSessionId}/messages?after_seq=${afterSeq}&limit=100`);
                if (!response.ok) {
                    throw new Error(`Failed to fetch messages for ${sessionId}: ${response.status}`);
                }
                const data = await response.json() as V3GetSessionMessagesResponse;
                const messages = Array.isArray(data.messages) ? data.messages : [];

                let maxSeq = afterSeq;
                for (const message of messages) {
                    if (message.seq > maxSeq) {
                        maxSeq = message.seq;
                    }
                }

                const decryptedMessages = decodeApiMessages(messages);
                const normalizedMessages: NormalizedMessage[] = [];
                for (let i = 0; i < decryptedMessages.length; i++) {
                    const decrypted = decryptedMessages[i];
                    if (!decrypted) {
                        continue;
                    }
                    const normalized = normalizeRawMessage(decrypted.id, decrypted.localId, decrypted.createdAt, decrypted.seq, decrypted.content);
                    if (normalized) {
                        normalizedMessages.push(normalized);
                    }
                }

                if (normalizedMessages.length > 0) {
                    totalNormalized += normalizedMessages.length;
                    this.enqueueMessages(sessionId, normalizedMessages);
                }

                this.sessionLastSeq.set(sessionId, maxSeq);
                hasMore = !!data.hasMore;
                if (hasOlder && boundedSessionSeq !== null && maxSeq >= boundedSessionSeq) {
                    hasMore = false;
                }
                if (hasMore && maxSeq === afterSeq) {
                    log.log(`💬 fetchMessages: pagination stalled for ${sessionId}, stopping to avoid infinite loop`);
                    break;
                }
                afterSeq = maxSeq;
            }

            storage.getState().applyMessagesLoaded(
                sessionId,
                hasOlder
                    ? {
                        hasOlder,
                        oldestLoadedSeq,
                    }
                    : undefined
            );
            log.log(`💬 fetchMessages completed for session ${sessionId} - processed ${totalNormalized} messages`);
        });
    }

    private registerPushToken = async () => {
        log.log('registerPushToken');
        try {
            const result = await syncCurrentPushToken(this.credentialsList);
            log.log('Push token sync result: ' + JSON.stringify({
                registered: result.registered,
                registeredMachines: result.registeredMachines,
                hasToken: !!result.token,
                permission: result.permission.status,
            }));
            if (!result.permission.granted) {
                console.log('Failed to get push token for push notification!');
            }
        } catch (error) {
            log.log('Failed to register push token: ' + JSON.stringify(error));
        }
    }

    private notifyDeviceCodeExpired = (machineId: string) => {
        Modal.alert(
            t('errors.deviceCodeExpiredTitle'),
            t('errors.deviceCodeExpiredMessage', { machineId }),
            [{ text: t('common.ok'), style: 'cancel' }],
        );
    };

    private subscribeToUpdates = () => {
        // Subscribe to message updates
        apiSocket.onMessage('update', (update, machineId) => this.handleUpdate(update, false, machineId));
        apiSocket.onMessage('replay-overflow', (data, machineId) => {
            if (
                data?.replayOverflow !== true
                || typeof data?.currentSeq !== 'number'
                || !Number.isFinite(data.currentSeq)
                || !Number.isInteger(data.currentSeq)
                || data.currentSeq < 0
            ) {
                return;
            }
            const currentSeq = data.currentSeq;
            void this.sessionsSync.invalidateAndAwait().then(() => {
                storage.getState().resetLastSeenUpdateSeq(machineId, currentSeq);
            }).catch((error) => {
                console.error('Failed to recover from replay overflow:', error);
            });
        });
        apiSocket.onMessage('ephemeral', (update, machineId) => this.handleEphemeralUpdate(update, machineId));
        apiSocket.onMachineDisconnected((machineId, lastSeenAt) => {
            storage.getState().markMachineDisconnected(machineId, lastSeenAt);
        });
        apiSocket.onDeviceCodeExpired((machineId) => {
            this.notifyDeviceCodeExpired(machineId);
        });

        // Subscribe to connection state changes
        apiSocket.onReconnected((machineId) => {
            log.log('🔌 Socket reconnected');
            this.machinesSync.invalidate();
            const lastSeenSeq = storage.getState().lastSeenUpdateSeqByMachineId[machineId];
            // WS3: first-connect has no replay cursor, so it still needs the HTTP refresh.
            // Resume reconnects rely on server replay and avoid re-fetching sessions here.
            if (lastSeenSeq === undefined || !Number.isFinite(lastSeenSeq)) {
                this.sessionsSync.invalidate();
            }
            // Messages are fetched lazily per-session via onSessionVisible. On resume,
            // session metadata and agentState arrive through replayed update events.
            for (const sync of this.sendSync.values()) {
                sync.invalidate();
            }
            // US-006: evict every entry in `prefetchPendingPromises`. The
            // PrefetchManager's own onReconnected listener already
            //   (i) bumped per-session generations,
            //   (ii) called storage.clearActivePrefetch for each in-flight,
            //   (iii) settled per-request terminal Promise<void>s with kind
            //        `abandon-on-reconnect`.
            // The references in prefetchPendingPromises are now stale. We
            // drop them so a subsequent loadOlder() does not await a settled
            // promise (which is harmless but a leak) and re-issues a fresh
            // request under the bumped generation.
            this.prefetchPendingPromises.clear();
        });
    }

    private persistLastSeenUpdateSeq = (sourceMachineId: string | undefined, seq: number) => {
        if (sourceMachineId && typeof seq === 'number') {
            storage.getState().setLastSeenUpdateSeq(sourceMachineId, seq);
        }
    }

    private handleUpdate = async (update: unknown, isReplay = false, sourceMachineId?: string) => {
        const validatedUpdate = ApiUpdateContainerSchema.safeParse(update);
        if (!validatedUpdate.success) {
            console.log('❌ Sync: Invalid update received:', validatedUpdate.error);
            console.error('❌ Sync: Invalid update data:', update);
            return;
        }
        const updateData = validatedUpdate.data;
        console.log(`🔄 Sync: Validated update type: ${updateData.body.t}`);
        let deferredInvalidate: Promise<void> | null = null;

        if (updateData.body.t === 'new-message') {

            const sid = sourceMachineId ? compositeSessionId(sourceMachineId, updateData.body.sid) : updateData.body.sid;
            if (!storage.getState().sessions[sid]) {
                if (isReplay) {
                    console.error(`Session ${sid} still missing after sessions refetch; dropping new-message event`);
                    return;
                }
                const queue = this.pendingNewMessages.get(sid) ?? [];
                queue.push(update);
                this.pendingNewMessages.set(sid, queue);
                if (!this.sessionInitInFlight.has(sid)) {
                    this.sessionInitInFlight.add(sid);
                    this.sessionsSync.invalidateAndAwait().then(() => {
                        this.sessionInitInFlight.delete(sid);
                        const pending = this.pendingNewMessages.get(sid) ?? [];
                        this.pendingNewMessages.delete(sid);
                        const sessionLoadedAfterRefetch = !!storage.getState().sessions[sid];
                        for (const evt of pending) {
                            void this.handleUpdate(evt, true, sourceMachineId);
                        }
                        if (sessionLoadedAfterRefetch) {
                            this.persistLastSeenUpdateSeq(sourceMachineId, updateData.seq);
                        }
                    }).catch(() => {
                        this.sessionInitInFlight.delete(sid);
                        this.pendingNewMessages.delete(sid);
                    });
                }
                return;
            }

            let lastMessage: NormalizedMessage | null = null;
            if (updateData.body.message) {
                const decrypted = decodeApiMessage(updateData.body.message);
                if (decrypted) {
                    lastMessage = normalizeRawMessage(decrypted.id, decrypted.localId, decrypted.createdAt, decrypted.seq, decrypted.content);

                    const { isTaskStarted, isTaskComplete } = getRawRecordLifecycleState(decrypted.content);

                    // Update session
                    const session = storage.getState().sessions[sid];
                    if (session) {
                        // NOTE: do not write `updateData.seq` into `session.seq`. `updateData.seq`
                        // is the account-global update sequence; `session.seq` is session-local
                        // (server-side `allocateSessionSeq` per session). Conflating them
                        // corrupts the value used by `computeInitialAfterSeq` in `fetchMessages`,
                        // which then misreads the session as having thousands of phantom older
                        // messages and breaks pagination/display until the next full
                        // `fetchSessions()` overwrites it with the authoritative value.
                        this.applySessions([{
                            ...session,
                            updatedAt: updateData.createdAt,
                            // Update thinking state based on task lifecycle events
                            ...(isTaskComplete ? { thinking: false } : {}),
                            ...(isTaskStarted ? { thinking: true } : {})
                        }])
                    } else {
                        // Fetch sessions again if we don't have this session
                        this.fetchSessions();
                    }

                    // Fast-path only on consecutive seq values, otherwise fetch from server.
                    const currentLastSeq = this.sessionLastSeq.get(sid);
                    const incomingSeq = updateData.body.message.seq;
                    if (lastMessage && currentLastSeq !== undefined && incomingSeq === currentLastSeq + 1) {
                        this.enqueueMessages(sid, [lastMessage]);
                        this.sessionLastSeq.set(sid, incomingSeq);
                        let hasMutableTool = false;
                        if (lastMessage.role === 'agent' && lastMessage.content[0] && lastMessage.content[0].type === 'tool-result') {
                            hasMutableTool = storage.getState().isMutableToolCall(sid, lastMessage.content[0].tool_use_id);
                        }
                        if (hasMutableTool) {
                            gitStatusSync.invalidate(sid);
                        }
                    } else {
                        this.getMessagesSync(sid).invalidate();
                    }
                }
            }

            // Ping session
            this.onSessionVisible(sid);

        } else if (updateData.body.t === 'new-session') {
            log.log('🆕 New session update received');
            deferredInvalidate = this.sessionsSync.invalidateAndAwait();
        } else if (updateData.body.t === 'delete-session') {
            log.log('🗑️ Delete session update received');
            const sessionId = sourceMachineId ? compositeSessionId(sourceMachineId, updateData.body.sid) : updateData.body.sid;

            // Remove session from storage
            storage.getState().deleteSession(sessionId);

            // Remove from project manager
            projectManager.removeSession(sessionId);

            // Clear any cached git status
            gitStatusSync.clearForSession(sessionId);
            this.messagesSync.delete(sessionId);
            this.sendSync.delete(sessionId);
            this.pendingOutbox.delete(sessionId);
            this.sessionLastSeq.delete(sessionId);
            this.sessionMessageLocks.delete(sessionId);
            this.sessionMessageQueue.delete(sessionId);
            this.sessionQueueProcessing.delete(sessionId);
            this.pendingNewMessages.delete(sessionId);
            this.sessionInitInFlight.delete(sessionId);
            // US-006: prefetch state cleanup, mirroring onActiveSessionChanged.
            // `abandonInFlight` performs the manager-side flush
            // (bump generation + clearActivePrefetch + settle orphaned
            // terminal Promise + fire `abandon-on-cleanup` event), and
            // `prefetchPendingPromises.delete` evicts the sync-side reference
            // so a subsequent flag-on loadOlder() doesn't await a settled
            // promise.
            this.prefetchManager.abandonInFlight(sessionId);
            this.prefetchPendingPromises.delete(sessionId);

            log.log(`🗑️ Session ${sessionId} deleted from local storage`);
            deferredInvalidate = this.sessionsSync.invalidateAndAwait();
        } else if (updateData.body.t === 'update-session') {
            const sessionId = sourceMachineId ? compositeSessionId(sourceMachineId, updateData.body.id) : updateData.body.id;
            const session = storage.getState().sessions[sessionId];
            if (session) {
                const agentState = updateData.body.agentState
                    ? parsePlainJson(updateData.body.agentState.value, null)
                    : session.agentState;
                const metadata = updateData.body.metadata
                    ? parsePlainJson(updateData.body.metadata.value, null)
                    : session.metadata;
                const metadataPathChanged = updateData.body.metadata
                    ? metadata?.path !== session.metadata?.path
                    : false;

                // NOTE: same corruption rule as in the `new-message` handler — do not
                // write `updateData.seq` (account-global) into `session.seq` (session-local).
                this.applySessions([{
                    ...session,
                    agentState,
                    agentStateVersion: updateData.body.agentState
                        ? updateData.body.agentState.version
                        : session.agentStateVersion,
                    metadata,
                    metadataVersion: updateData.body.metadata
                        ? updateData.body.metadata.version
                        : session.metadataVersion,
                    updatedAt: updateData.createdAt
                }]);

                // Invalidate git status when agent state changes (files may have been modified)
                // or when the working directory changes underneath the same session.
                if (updateData.body.agentState || metadataPathChanged) {
                    gitStatusSync.invalidate(sessionId);
                }

                if (updateData.body.agentState) {
                    // Re-fetch messages when control returns to mobile (local -> remote mode switch)
                    // This catches up on any messages that were exchanged while desktop had control
                    const wasControlledByUser = session.agentState?.controlledByUser;
                    const isNowControlledByUser = agentState?.controlledByUser;
                    if (!wasControlledByUser && isNowControlledByUser) {
                        log.log(`🔄 Control returned to mobile for session ${sessionId}, re-fetching messages`);
                        this.onSessionVisible(sessionId);
                    }
                }
            }
        } else if (updateData.body.t === 'update-account') {
            const accountUpdate = updateData.body;
            const currentProfile = storage.getState().profile;
            const hadGitHub = !!currentProfile.github?.login;

            // Build updated profile with new data
            const updatedProfile: Profile = {
                ...currentProfile,
                firstName: accountUpdate.firstName !== undefined ? accountUpdate.firstName : currentProfile.firstName,
                lastName: accountUpdate.lastName !== undefined ? accountUpdate.lastName : currentProfile.lastName,
                avatar: accountUpdate.avatar !== undefined ? accountUpdate.avatar : currentProfile.avatar,
                github: accountUpdate.github !== undefined ? accountUpdate.github : currentProfile.github,
                timestamp: updateData.createdAt // Update timestamp to latest
            };

            // Apply the updated profile to storage
            storage.getState().applyProfile(updatedProfile);

            if (!hadGitHub && updatedProfile.github?.login) {
                trackGitHubConnected();
            }

            // Handle settings updates (new for profile sync)
            if (accountUpdate.settings?.value) {
                try {
                    const parsedSettings = settingsParse(parsePlainJson(accountUpdate.settings.value, {}));

                    // Version compatibility check
                    const settingsSchemaVersion = parsedSettings.schemaVersion ?? 1;
                    if (settingsSchemaVersion > SUPPORTED_SCHEMA_VERSION) {
                        console.warn(
                            `⚠️ Received settings schema v${settingsSchemaVersion}, ` +
                            `we support v${SUPPORTED_SCHEMA_VERSION}. Update app for full functionality.`
                        );
                    }

                    this.applyServerSettings(parsedSettings);
                    log.log(`📋 Settings synced from server (schema v${settingsSchemaVersion}, version ${accountUpdate.settings.version})`);
                } catch (error) {
                    console.error('❌ Failed to process settings update:', error);
                    // Don't crash on settings sync errors, just log
                }
            }
        } else if (updateData.body.t === 'update-machine') {
            const machineUpdate = updateData.body;
            const machineId = machineUpdate.machineId;  // Changed from .id to .machineId
            const machine = storage.getState().machines[machineId];

            // Create or update machine with all required fields
            const updatedMachine: Machine = {
                id: machineId,
                seq: updateData.seq,
                createdAt: machine?.createdAt ?? updateData.createdAt,
                updatedAt: updateData.createdAt,
                active: machineUpdate.active ?? true,
                activeAt: machineUpdate.activeAt ?? updateData.createdAt,
                metadata: machine?.metadata ?? null,
                metadataVersion: machine?.metadataVersion ?? 0,
                daemonState: machine?.daemonState ?? null,
                daemonStateVersion: machine?.daemonStateVersion ?? 0
            };

            const metadataUpdate = machineUpdate.metadata;
            if (metadataUpdate) {
                try {
                    const metadata = parsePlainJson(metadataUpdate.value, null);
                    updatedMachine.metadata = metadata;
                    updatedMachine.metadataVersion = metadataUpdate.version;
                } catch (error) {
                    console.error(`Failed to parse machine metadata for ${machineId}:`, error);
                }
            }

            const daemonStateUpdate = machineUpdate.daemonState;
            if (daemonStateUpdate) {
                try {
                    const daemonState = parsePlainJson(daemonStateUpdate.value, null);
                    updatedMachine.daemonState = daemonState;
                    updatedMachine.daemonStateVersion = daemonStateUpdate.version;
                } catch (error) {
                    console.error(`Failed to parse machine daemonState for ${machineId}:`, error);
                }
            }

            // Update storage using applyMachines which rebuilds sessionListViewData
            storage.getState().applyMachines([updatedMachine]);
        } else if (updateData.body.t === 'delete-machine') {
            const machineId = updateData.body.machineId;
            log.log(`🗑️ Delete machine update received for ${machineId}`);
            if (!storage.getState().machines[machineId]) {
                log.log(`Machine ${machineId} not in storage, skipping delete`);
            } else {
                storage.getState().deleteMachine(machineId);
            }
        }

        if (deferredInvalidate) {
            void deferredInvalidate.then(() => this.persistLastSeenUpdateSeq(sourceMachineId, updateData.seq)).catch((err) => console.error('Deferred invalidate failed for update', err));
            return;
        }
        // Persist after branch effects commit; reconnect replay may skip this seq next time.
        this.persistLastSeenUpdateSeq(sourceMachineId, updateData.seq);
    }

    private flushActivityUpdates = (updates: Map<string, ApiEphemeralActivityUpdate>) => {
        // log.log(`🔄 Flushing activity updates for ${updates.size} sessions - acquiring lock`);


        const sessions: Session[] = [];

        for (const [sessionId, update] of updates) {
            const session = storage.getState().sessions[sessionId];
            if (session) {
                sessions.push({
                    ...session,
                    active: update.active,
                    activeAt: update.activeAt,
                    thinking: update.thinking ?? false,
                    thinkingAt: update.activeAt // Always use activeAt for consistency
                });
            }
        }

        if (sessions.length > 0) {
            // console.log('flushing activity updates ' + sessions.length);
            this.applySessions(sessions);
            // log.log(`🔄 Activity updates flushed - updated ${sessions.length} sessions`);
        }
    }

    private handleEphemeralUpdate = (update: unknown, sourceMachineId?: string) => {
        const validatedUpdate = ApiEphemeralUpdateSchema.safeParse(update);
        if (!validatedUpdate.success) {
            console.log('Invalid ephemeral update received:', validatedUpdate.error);
            console.error('Invalid ephemeral update received:', update);
            return;
        } else {
            // console.log('Ephemeral update received:', update);
        }
        const updateData = validatedUpdate.data;

        // Process activity updates through smart debounce accumulator
        if (updateData.type === 'activity') {
            // console.log('adding activity update ' + updateData.id);
            this.activityAccumulator.addUpdate(updateData);
        }

        // Handle machine activity updates
        if (updateData.type === 'machine-activity') {
            // Update machine's active status and lastActiveAt
            const machineId = updateData.id || sourceMachineId;
            const machine = machineId ? storage.getState().machines[machineId] : null;
            if (machine) {
                const updatedMachine: Machine = {
                    ...machine,
                    active: updateData.active,
                    activeAt: updateData.activeAt
                };
                storage.getState().applyMachines([updatedMachine]);
            }
        }

        // daemon-status ephemeral updates are deprecated, machine status is handled via machine-activity
    }

    //
    // Apply store
    //

    private applyMessages = (sessionId: string, messages: NormalizedMessage[]) => {
        const result = storage.getState().applyMessages(sessionId, messages);
    }

    private applySessions = (sessions: (Omit<Session, "presence" | "permissionModeUserChosen"> & {
        presence?: "online" | number;
        permissionModeUserChosen?: boolean;
    })[]) => {
        storage.getState().applySessions(sessions);
    }

    generateLocalMessageId = () => generateLocalMessageId();

}

// Global singleton instance
export const sync = new Sync();

//
// Init sequence
//

let isInitialized = false;
export async function syncCreate(credentials: AuthCredentials) {
    if (isInitialized) {
        console.warn('Sync already initialized: ignoring');
        return;
    }
    isInitialized = true;
    await syncInit(credentials, false);
}

export async function syncRestore(credentials: AuthCredentials) {
    if (isInitialized) {
        console.warn('Sync already initialized: ignoring');
        return;
    }
    isInitialized = true;
    await syncInit(credentials, true);
}

export function isSyncInitialized(): boolean {
    return isInitialized;
}

export async function syncAppendMachine(credentials: AuthCredentials): Promise<void> {
    if (!isInitialized) {
        await syncCreate(credentials);
        return;
    }
    const saved = await TokenStorage.setCredentials(credentials);
    if (!saved) {
        throw new Error('Failed to save machine credentials');
    }
    await apiSocket.appendMachine({ endpoint: credentials.tunnelUrl, credentials });
    storage.getState().applyMachines([{
        id: credentials.machineId,
        seq: Date.now(),
        createdAt: credentials.firstSeenAt,
        updatedAt: Date.now(),
        active: true,
        activeAt: Date.now(),
        metadata: {
            host: credentials.login || credentials.machineId,
            platform: '',
            happyCliVersion: '',
            happyHomeDir: '',
            homeDir: '',
            displayName: credentials.login || credentials.machineId,
            tunnelUrl: credentials.tunnelUrl,
        },
    }]);
}

async function syncInit(credentials: AuthCredentials, restore: boolean) {
    const storedCredentials = await TokenStorage.getCredentialsList();
    const rawList = storedCredentials.length > 0 ? storedCredentials : [credentials];

    const credentialsList = rawList;
    const socketConfigs = credentialsList.map(machineCredentials => ({
        endpoint: machineCredentials.tunnelUrl,
        credentials: machineCredentials,
    }));

    // Initialize tracking
    initializeTracking(credentialsList[0].machineId);

    // Initialize socket connection
    await apiSocket.initializeMany(socketConfigs);

    // Wire socket status to storage
    apiSocket.onStatusChange((status) => {
        storage.getState().setSocketStatus(status);
    });

    // Initialize sessions engine
    if (restore) {
        await sync.restoreMany(credentialsList);
    } else {
        await sync.createMany(credentialsList);
    }
}
