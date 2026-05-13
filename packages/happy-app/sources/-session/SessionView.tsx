import { AgentContentView } from '@/components/AgentContentView';
import { AgentInput } from '@/components/AgentInput';
import {
    getAvailableModels,
    getAvailablePermissionModes,
    getDefaultModelKey,
    getEffortLevelsForModel,
    getDefaultEffortKeyForModel,
    resolveCurrentOption,
    resolvePermissionModeForPicker,
    EffortLevel,
} from '@/components/modelModeOptions';
import { getSuggestions } from '@/components/autocomplete/suggestions';
import { ChatHeaderView } from '@/components/ChatHeaderView';
import { ChatList } from '@/components/ChatList';
import { Deferred } from '@/components/Deferred';
import { EmptyMessages } from '@/components/EmptyMessages';
import { SessionActionsAnchor, SessionActionsPopover } from '@/components/SessionActionsPopover';
import { ResumeCommandCopyBlock, SessionContextDrawer } from '@/components/SessionContextDrawer';
import { useChatWidth } from '@/hooks/useChatWidth';
import { useDraft } from '@/hooks/useDraft';
import { usePreSendCommand } from '@/hooks/usePreSendCommand';
import { Modal } from '@/modal';
import { shouldShowBoundaryAdvisory, updateComposeStartAt } from './composeBoundaryAdvisory';
import { getActiveSessionPathSurfaces } from './SessionViewPathSurfaces';
import { emitActiveAgentConfigurationSelection } from './activeAgentConfiguration';
import { gitStatusSync } from '@/sync/gitStatusSync';
import { cancelPendingSwitch, requestSwitch, sessionAbort, sessionEmitAgentConfiguration, sessionWriteFile } from '@/sync/ops';
import { storage, useIsDataReady, useLatestBoundary, useLocalSetting, useLocalSettingMutable, useMachine, useSessionMessages, useSessionUsage, useSetting } from '@/sync/storage';
import { useSession } from '@/sync/storage';
import { Session } from '@/sync/storageTypes';
import { generateLocalMessageId, sync } from '@/sync/sync';
import { t } from '@/text';
import { tracking } from '@/track';
import { resolveTopicBrutalistAvatar } from '@/utils/avatarTopic';
import { isRunningOnMac } from '@/utils/platform';
import { useDeviceType, useHeaderHeight, useIsLandscape, useIsTablet } from '@/utils/responsive';
import { FilesSidebar } from '@/components/FilesSidebar';
import { prefetchPierreDiff } from '@/components/diff/PierreDiffView';
import { GitFileStatus } from '@/sync/gitStatusFiles';
import { getResumeCommandBlock, getSessionAvatarId, getSessionMode, getSessionName, useSessionStatus } from '@/utils/sessionUtils';
import { useSessionQuickActions } from '@/hooks/useSessionQuickActions';
import { isVersionSupported, MINIMUM_CLI_VERSION } from '@/utils/versionUtils';
import { encodeBase64Url } from '@/utils/base64url';
import { dedupeAttachmentNames, sanitizeAttachmentName } from '@/utils/attachmentName';
import { buildMessageWithAttachmentRefs } from '@/components/composer/AttachmentChip';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as React from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import type { ModelMode, PermissionMode } from '@/components/PermissionModeSelector';

export function getCanSendWhenIdle(session: Session): boolean {
    return session.metadata?.flavor === 'claude'
        && getSessionMode(session) === 'local'
        && session.agentState?.turnActive === true
        && session.agentState?.pendingSwitch == null;
}


export const SessionView = React.memo((props: { id: string }) => {
    const sessionId = props.id;
    const router = useRouter();
    const session = useSession(sessionId);
    const isDataReady = useIsDataReady();
    const { theme } = useUnistyles();
    const safeArea = useSafeAreaInsets();
    const isLandscape = useIsLandscape();
    const deviceType = useDeviceType();
    const headerHeight = useHeaderHeight();
    const isTablet = useIsTablet();
    const { width: windowWidth } = useWindowDimensions();
    const unifiedNewSessionComposer = useLocalSetting('unifiedNewSessionComposer');
    const [sessionActionsAnchor, setSessionActionsAnchor] = React.useState<SessionActionsAnchor | null>(null);
    const fileDiffsSidebarEnabled = useSetting('fileDiffsSidebar');

    const showSidebar = fileDiffsSidebarEnabled
        && (isRunningOnMac() || Platform.OS === 'web')
        && windowWidth >= SIDEBAR_MIN_WINDOW_WIDTH
        && isDataReady && !!session;

    // Match left sidebar width: 30% of window, clamped to 250–360px
    const sidebarWidth = Math.min(Math.max(Math.floor(windowWidth * 0.3), 250), 360);

    const [sidebarCollapsed, setSidebarCollapsed] = useLocalSettingMutable('sidebarCollapsed');
    const sidebarAnim = useSharedValue(sidebarCollapsed ? 0 : 1);

    React.useEffect(() => {
        sidebarAnim.value = withTiming(sidebarCollapsed ? 0 : 1, {
            duration: 250,
            easing: Easing.out(Easing.cubic),
        });
    }, [sidebarCollapsed]);

    const animatedSidebarStyle = useAnimatedStyle(() => ({
        width: sidebarAnim.value * sidebarWidth,
        opacity: sidebarAnim.value,
        overflow: 'hidden' as const,
    }));

    const toggleSidebar = React.useCallback(() => {
        setSidebarCollapsed(!sidebarCollapsed);
    }, [sidebarCollapsed, setSidebarCollapsed]);

    const handleSidebarFilePress = React.useCallback((file: GitFileStatus) => {
        router.push(`/session/${sessionId}/file?path=${encodeBase64Url(file.fullPath)}&refresh=1&view=diff`);
    }, [router, sessionId]);

    // Warm Pierre's lazy web chunks while the user is still reading chat.
    React.useEffect(() => {
        prefetchPierreDiff();
    }, []);

    // Compute header props based on session state
    const pathSurfaces = React.useMemo(() => getActiveSessionPathSurfaces({
        session,
        unifiedNewSessionComposer,
        projectPathHeaderMaxChars: windowWidth < 420 ? 28 : 48,
    }), [session, unifiedNewSessionComposer, windowWidth]);

    const headerProps = React.useMemo(() => {
        if (!isDataReady) {
            return {
                title: '',
                subtitle: undefined,
                avatarId: undefined,
                onAvatarPress: undefined,
                isConnected: false,
                flavor: null,
            };
        }

        if (!session) {
            return {
                title: t('errors.sessionDeleted'),
                subtitle: undefined,
                avatarId: undefined,
                onAvatarPress: undefined,
                isConnected: false,
                flavor: null,
            };
        }

        const isConnected = session.presence === 'online';
        return {
            title: getSessionName(session),
            subtitle: pathSurfaces.chatHeaderSubtitle,
            avatarId: getSessionAvatarId(session),
            onAvatarPress: () => router.push(`/session/${sessionId}/info`),
            isConnected: isConnected,
            flavor: session.metadata?.flavor || null,
            summaryText: session.metadata?.summary?.text,
            metadataName: session.metadata?.name,
            pinnedAvatarImageIndex: session.pinnedAvatarImageIndex,
            pinnedAvatarColorIndex: session.pinnedAvatarColorIndex,
            tintColor: isConnected ? '#000' : '#8E8E93'
        };
    }, [session, isDataReady, sessionId, router, pathSurfaces.chatHeaderSubtitle]);

    const mainContent = (
        <>
            {/* Status bar shadow for landscape mode */}
            {isLandscape && deviceType === 'phone' && (
                <View style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: safeArea.top,
                    backgroundColor: theme.colors.surface,
                    zIndex: 1000,
                    shadowColor: theme.colors.shadow.color,
                    shadowOffset: {
                        width: 0,
                        height: 2,
                    },
                    shadowOpacity: theme.colors.shadow.opacity,
                    shadowRadius: 3,
                    elevation: 5,
                }} />
            )}

            {/* Header - always shown on desktop/Mac, hidden in landscape mode only on actual phones */}
            {!(isLandscape && deviceType === 'phone' && Platform.OS !== 'web') && (
                <View style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    zIndex: 1000
                }}>
                    <ChatHeaderView
                        {...headerProps}
                        onBackPress={() => router.back()}
                        avatarMenuExpanded={Platform.OS === 'web' && !!sessionActionsAnchor}
                        avatarMenuSession={session}
                        onAfterAvatarArchive={() => {
                            setSessionActionsAnchor(null);
                            router.replace('/');
                        }}
                        onAfterAvatarDelete={() => {
                            setSessionActionsAnchor(null);
                            router.replace('/');
                        }}
                        onAvatarMenuRequest={Platform.OS === 'web' && session ? setSessionActionsAnchor : undefined}
                        onSidebarTogglePress={showSidebar ? toggleSidebar : undefined}
                        sidebarCollapsed={sidebarCollapsed}
                    />
                </View>
            )}

            {/* Content based on state */}
            <View style={{ flex: 1, paddingTop: !(isLandscape && deviceType === 'phone' && Platform.OS !== 'web') ? safeArea.top + headerHeight : 0 }}>
                {!isDataReady ? (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                    </View>
                ) : !session ? (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <Ionicons name="trash-outline" size={48} color={theme.colors.textSecondary} />
                        <Text style={{ color: theme.colors.text, fontSize: 20, marginTop: 16, fontWeight: '600' }}>{t('errors.sessionDeleted')}</Text>
                        <Text style={{ color: theme.colors.textSecondary, fontSize: 15, marginTop: 8, textAlign: 'center', paddingHorizontal: 32 }}>{t('errors.sessionDeletedDescription')}</Text>
                    </View>
                ) : (
                    <SessionViewLoaded
                        key={sessionId}
                        sessionId={sessionId}
                        session={session}
                        projectPathHeader={pathSurfaces.agentInputProjectPathHeader}
                    />
                )}
            </View>
            {Platform.OS === 'web' && session && (
                <SessionActionsPopover
                    anchor={sessionActionsAnchor}
                    onAfterArchive={() => {
                        setSessionActionsAnchor(null);
                        router.replace('/');
                    }}
                    onAfterDelete={() => {
                        setSessionActionsAnchor(null);
                        router.replace('/');
                    }}
                    onClose={() => setSessionActionsAnchor(null)}
                    sessionId={session.id}
                    visible={!!sessionActionsAnchor}
                />
            )}
        </>
    );

    if (!showSidebar) {
        return mainContent;
    }

    // Desktop layout: chat + sidebar at the same level (full height).
    return (
        <View style={{ flex: 1, flexDirection: 'row' }}>
            <View style={{ flex: 1 }}>
                {mainContent}
            </View>
            <Animated.View style={[{ minWidth: 0, alignSelf: 'stretch' }, animatedSidebarStyle]}>
                <View style={{ width: sidebarWidth, flex: 1 }}>
                    <FilesSidebar
                        sessionId={sessionId}
                        onFilePress={handleSidebarFilePress}
                    />
                </View>
            </Animated.View>
        </View>
    );
});

const SIDEBAR_MIN_WINDOW_WIDTH = 1100;

function SessionViewLoaded({ sessionId, session, projectPathHeader }: { sessionId: string, session: Session, projectPathHeader?: string }) {
    const { theme } = useUnistyles();
    const router = useRouter();
    const safeArea = useSafeAreaInsets();
    const isLandscape = useIsLandscape();
    const deviceType = useDeviceType();
    const isTablet = useIsTablet();
    const [message, setMessage] = React.useState('');
    const messageRef = React.useRef('');
    const composeStartAtRef = React.useRef<number | null>(null);
    const { messages, isLoaded } = useSessionMessages(sessionId);
    const latestBoundary = useLatestBoundary(sessionId);
    const acknowledgedCliVersions = useLocalSetting('acknowledgedCliVersions');
    const sessionInputHorizontalPadding = Platform.OS === 'web' || isRunningOnMac() || isTablet ? 12 : 8;
    const preSendCommand = usePreSendCommand(sessionId);

    // Check if CLI version is outdated and not already acknowledged
    const cliVersion = session.metadata?.version;
    const machineId = session.metadata?.machineId;
    const isCliOutdated = cliVersion && !isVersionSupported(cliVersion, MINIMUM_CLI_VERSION);
    const isAcknowledged = machineId && acknowledgedCliVersions[machineId] === cliVersion;
    const shouldShowCliWarning = isCliOutdated && !isAcknowledged;
    const flavor = session.metadata?.flavor;
    const availableModels = React.useMemo(() => (
        getAvailableModels(flavor, session.metadata, t)
    ), [flavor, session.metadata]);
    const availableModes = React.useMemo(() => (
        getAvailablePermissionModes(flavor, session.metadata, t)
    ), [flavor, session.metadata]);

    const permissionMode = React.useMemo<PermissionMode | null>(() => (
        resolvePermissionModeForPicker(availableModes, {
            userChosen: session.permissionModeUserChosen,
            sessionPermissionMode: session.permissionMode,
            metadataCurrentPermissionModeCode: session.metadata?.currentPermissionModeCode,
            metadataDangerouslySkipPermissions: session.metadata?.dangerouslySkipPermissions,
            flavor,
        })
    ), [availableModes, session.permissionModeUserChosen, session.permissionMode, session.metadata?.currentPermissionModeCode, session.metadata?.dangerouslySkipPermissions, flavor]);

    const modelMode = React.useMemo<ModelMode | null>(() => (
        resolveCurrentOption(availableModels, [
            session.modelMode,
            session.metadata?.currentModelCode,
            getDefaultModelKey(flavor),
        ])
    ), [availableModels, session.modelMode, session.metadata?.currentModelCode, flavor]);

    // Effort level state
    const modelKey = modelMode?.key ?? 'default';
    const availableEffortLevels = React.useMemo<EffortLevel[]>(() => (
        getEffortLevelsForModel(flavor, modelKey)
    ), [flavor, modelKey]);
    const effortLevel = React.useMemo<EffortLevel | null>(() => (
        resolveCurrentOption(availableEffortLevels, [
            session.effortLevel,
            getDefaultEffortKeyForModel(flavor, modelKey),
        ])
    ), [availableEffortLevels, session.effortLevel, flavor, modelKey]);

    const drawerPermissionMode = React.useMemo<PermissionMode | null>(() => (
        resolvePermissionModeForPicker(availableModes, {
            userChosen: false,
            sessionPermissionMode: null,
            metadataCurrentPermissionModeCode: session.metadata?.currentPermissionModeCode,
            metadataDangerouslySkipPermissions: session.metadata?.dangerouslySkipPermissions,
            flavor,
        })
    ), [availableModes, session.metadata?.currentPermissionModeCode, session.metadata?.dangerouslySkipPermissions, flavor]);
    const drawerModelMode = React.useMemo<ModelMode | null>(() => (
        resolveCurrentOption(availableModels, [
            session.metadata?.currentModelCode,
            getDefaultModelKey(flavor),
        ])
    ), [availableModels, session.metadata?.currentModelCode, flavor]);
    const sessionStatus = useSessionStatus(session);
    const sessionUsage = useSessionUsage(sessionId);
    const alwaysShowContextSize = useSetting('alwaysShowContextSize');
    const experiments = useSetting('experiments');
    const { canResume, resumeAvailability, resumeSession, resumeSessionInline, resumingSession } = useSessionQuickActions(session);
    const isArchivedSession = session.metadata?.lifecycleState === 'archived';
    const isDisconnected = !sessionStatus.isConnected;
    const isInactiveArchivedSession = isArchivedSession && isDisconnected;
    const resumeCommandBlock = getResumeCommandBlock(session);

    // Use draft hook for auto-saving message drafts
    const { clearDraft } = useDraft(sessionId, message, setMessage);
    const canSendWhenIdle = getCanSendWhenIdle(session);
    const pendingSwitch = session.agentState?.pendingSwitch;

    const handleRequestSwitchNow = React.useCallback(async () => {
        try {
            await requestSwitch(sessionId, 'now');
        } catch (error) {
            console.error('Failed to request switch:', error);
            Modal.alert(t('common.error'), t('errors.requestSwitchFailed'));
        }
    }, [sessionId]);

    const handleCancelPendingSwitch = React.useCallback(async () => {
        try {
            await cancelPendingSwitch(sessionId);
        } catch (error) {
            console.error('Failed to cancel pending switch:', error);
            Modal.alert(t('common.error'), t('errors.requestSwitchFailed'));
        }
    }, [sessionId]);

    const handleAbortPress = React.useCallback(() => {
        const isLocalClaudeTurn =
            session.metadata?.flavor === 'claude'
            && getSessionMode(session) === 'local'
            && session.agentState?.turnActive === true
            && session.agentState?.pendingSwitch == null;
        if (!isLocalClaudeTurn) {
            void sessionAbort(sessionId);
            return;
        }
        Modal.alert(
            t('abortPrompt.title'),
            t('abortPrompt.message'),
            [
                {
                    text: t('abortPrompt.switchWhenIdle'),
                    onPress: () => {
                        void requestSwitch(sessionId, 'when-idle').catch((error) => {
                            console.error('Failed to request switch:', error);
                            Modal.alert(t('common.error'), t('errors.requestSwitchFailed'));
                        });
                    },
                },
                {
                    text: t('abortPrompt.switchNow'),
                    style: 'destructive',
                    onPress: () => {
                        void sessionAbort(sessionId);
                    },
                },
                { text: t('abortPrompt.cancel'), style: 'cancel' },
            ],
        );
    }, [session, sessionId]);

    // Handle dismissing CLI version warning
    const handleDismissCliWarning = React.useCallback(() => {
        if (machineId && cliVersion) {
            storage.getState().applyLocalSettings({
                acknowledgedCliVersions: {
                    ...acknowledgedCliVersions,
                    [machineId]: cliVersion
                }
            });
        }
    }, [machineId, cliVersion, acknowledgedCliVersions]);

    const handleChangeMessage = React.useCallback((nextMessage: string) => {
        messageRef.current = nextMessage;
        setMessage((previousMessage) => {
            composeStartAtRef.current = updateComposeStartAt(
                composeStartAtRef.current,
                previousMessage,
                nextMessage,
                Date.now(),
            );
            return nextMessage;
        });
    }, []);

    // Function to update permission mode
    const updatePermissionMode = React.useCallback((mode: PermissionMode) => {
        storage.getState().updateSessionPermissionMode(sessionId, mode.key, true);
        void emitActiveAgentConfigurationSelection({ sessionId, emitAgentConfiguration: sessionEmitAgentConfiguration }, { kind: 'permissionMode', option: mode })
            .catch(() => Modal.alert(t('common.error'), t('drawer.applyFailed')));
    }, [sessionId]);

    const updateModelMode = React.useCallback((mode: ModelMode) => {
        storage.getState().updateSessionModelMode(sessionId, mode.key);
        void emitActiveAgentConfigurationSelection({ sessionId, emitAgentConfiguration: sessionEmitAgentConfiguration }, { kind: 'model', option: mode })
            .catch(() => Modal.alert(t('common.error'), t('drawer.applyFailed')));
    }, [sessionId]);

    const updateEffortLevel = React.useCallback((level: EffortLevel) => {
        storage.getState().updateSessionEffortLevel(sessionId, level.key);
        void emitActiveAgentConfigurationSelection({ sessionId, emitAgentConfiguration: sessionEmitAgentConfiguration }, { kind: 'effortLevel', option: level })
            .catch(() => Modal.alert(t('common.error'), t('drawer.applyFailed')));
    }, [sessionId]);
    const handleForkPress = React.useCallback(() => {
        router.push(`/session/${sessionId}/fork-composer`);
    }, [router, sessionId]);
    const iconPinned = session.pinnedAvatarImageIndex !== undefined && session.pinnedAvatarColorIndex !== undefined;
    const handleIconPinnedToggle = React.useCallback(() => {
        if (session.pinnedAvatarImageIndex !== undefined && session.pinnedAvatarColorIndex !== undefined) {
            storage.getState().sessionClearPinnedAvatar(sessionId);
            return;
        }

        const tuple = resolveTopicBrutalistAvatar({
            id: getSessionAvatarId(session),
            summaryText: session.metadata?.summary?.text,
            name: session.metadata?.name,
            flavor: session.metadata?.flavor,
        });
        storage.getState().sessionSetPinnedAvatar(sessionId, tuple);
    }, [session, sessionId]);

    const sessionMachineId = session.metadata?.machineId ?? '';
    const sessionMachine = useMachine(sessionMachineId);
    const machineName = sessionMachine?.metadata?.displayName
        ?? sessionMachine?.metadata?.host
        ?? session.metadata?.host
        ?? session.metadata?.machineId
        ?? null;

    // Memoize header-dependent styles to prevent re-renders
    const headerDependentStyles = React.useMemo(() => ({
        contentContainer: {
            flex: 1
        },
        flatListStyle: {
            marginTop: 0 // No marginTop needed since header is handled by parent
        },
    }), []);

    // Trigger session visibility and initialize git status sync
    React.useLayoutEffect(() => {

        // Trigger session sync
        sync.onSessionVisible(sessionId);


        // Initialize git status sync for this session
        gitStatusSync.getSync(sessionId);
    }, [sessionId]);

    React.useEffect(() => {
        sync.onActiveSessionChanged(sessionId);
    }, [sessionId]);

    let content = (
        <>
            <Deferred>
                {messages.length > 0 && (
                    <ChatList session={session} />
                )}
            </Deferred>
        </>
    );
    const placeholder = messages.length === 0 ? (
        <>
            {isLoaded ? (
                <EmptyMessages session={session} />
            ) : (
                <ActivityIndicator size="small" color={theme.colors.textSecondary} />
            )}
        </>
    ) : null;

    const showBoundaryAdvisory = shouldShowBoundaryAdvisory(latestBoundary, composeStartAtRef.current);
    const boundaryAdvisory = showBoundaryAdvisory ? (
        <CenteredInputWidth horizontalPadding={sessionInputHorizontalPadding}>
            <CrossDeviceBoundaryAdvisory />
        </CenteredInputWidth>
    ) : null;

    const composer = (
        <AgentInput
            mode="active"
            projectPathHeader={projectPathHeader}
            placeholder={t('session.inputPlaceholder')}
            value={message}
            onChangeText={handleChangeMessage}
            sessionId={sessionId}
            permissionMode={permissionMode}
            onPermissionModeChange={updatePermissionMode}
            availableModes={availableModes}
            modelMode={modelMode}
            availableModels={availableModels}
            onModelModeChange={updateModelMode}
            effortLevel={effortLevel}
            availableEffortLevels={availableEffortLevels}
            onEffortLevelChange={updateEffortLevel}
            metadata={session.metadata}
            connectionStatus={{
                text: sessionStatus.statusText,
                color: sessionStatus.statusColor,
                dotColor: sessionStatus.statusDotColor,
                isPulsing: sessionStatus.isPulsing
            }}
            blockSend={false}
            canSendWhenIdle={canSendWhenIdle}
            onSend={async (switchMode, attachments) => {
                const trimmedMessage = message.trim();
                if (trimmedMessage || attachments.length > 0) {
                    const intercept = preSendCommand(trimmedMessage);
                    composeStartAtRef.current = null;
                    if (trimmedMessage && intercept.intercepted) {
                        setMessage('');
                        clearDraft();
                        intercept.execute();
                        return false;
                    }

                    const localId = attachments.length > 0 ? generateLocalMessageId() : undefined;
                    const dedupedNames = dedupeAttachmentNames(attachments.map(file => sanitizeAttachmentName(file.name)));
                    const attachmentRefs = attachments.map((file, index) => ({
                        remotePath: `.happy/attachments/${localId}/${dedupedNames[index]}`,
                        name: dedupedNames[index],
                        size: file.size,
                    }));

                    for (const [index, attachment] of attachments.entries()) {
                        const result = await sessionWriteFile(
                            sessionId,
                            attachmentRefs[index].remotePath,
                            attachment.base64,
                            { createParents: true }
                        );

                        if (!result.success) {
                            Modal.alert(t('common.error'), result.error || t('errors.attachmentUploadFailed'), [{ text: t('common.ok') }]);
                            return false;
                        }
                    }

                    const body = buildMessageWithAttachmentRefs(message, attachmentRefs);
                    const sendOptions = {
                        source: 'chat' as const,
                        switchMode,
                        ...(localId ? { localId, attachmentRefs, displayText: message } : {}),
                    };

                    if (switchMode === 'when-idle') {
                        const snapshot = message;
                        messageRef.current = '';
                        setMessage('');
                        clearDraft();
                        try {
                            await sync.sendMessage(sessionId, body, sendOptions);
                        } catch {
                            if (messageRef.current === '') {
                                messageRef.current = snapshot;
                                setMessage(snapshot);
                            }
                            return false;
                        }
                    } else {
                        const snapshot = message;
                        messageRef.current = '';
                        setMessage('');
                        clearDraft();
                        try {
                            await sync.sendMessage(sessionId, body, sendOptions);
                        } catch {
                            if (messageRef.current === '') {
                                messageRef.current = snapshot;
                                setMessage(snapshot);
                            }
                            return false;
                        }
                    }
                    return true;
                }
            }}
            onAbort={isDisconnected ? undefined : handleAbortPress}
            showAbortButton={sessionStatus.state === 'thinking' || sessionStatus.state === 'waiting'}
            onFileViewerPress={experiments ? () => router.push(`/session/${sessionId}/files`) : undefined}
            autocompletePrefixes={['@', '/']}
            autocompleteSuggestions={(query) => getSuggestions(sessionId, query)}
            usageData={sessionUsage ? {
                inputTokens: sessionUsage.inputTokens,
                outputTokens: sessionUsage.outputTokens,
                cacheCreation: sessionUsage.cacheCreation,
                cacheRead: sessionUsage.cacheRead,
                contextSize: sessionUsage.contextSize
            } : session.latestUsage ? {
                inputTokens: session.latestUsage.inputTokens,
                outputTokens: session.latestUsage.outputTokens,
                cacheCreation: session.latestUsage.cacheCreation,
                cacheRead: session.latestUsage.cacheRead,
                contextSize: session.latestUsage.contextSize
            } : undefined}
            alwaysShowContextSize={alwaysShowContextSize}
        />
    );

    const archivedHint = isInactiveArchivedSession ? (
        <CenteredInputWidth horizontalPadding={sessionInputHorizontalPadding}>
            <InactiveArchivedHint
                resumeCommandBlock={resumeCommandBlock}
                canResume={canResume}
                resuming={resumingSession}
                onResume={resumeSession}
            />
        </CenteredInputWidth>
    ) : null;

    const pendingSwitchBanner = pendingSwitch ? (
        <CenteredInputWidth horizontalPadding={sessionInputHorizontalPadding}>
            <PendingSwitchBanner
                messagePreview={pendingSwitch.messagePreview}
                onCancel={handleCancelPendingSwitch}
                onTakeOverNow={handleRequestSwitchNow}
            />
        </CenteredInputWidth>
    ) : null;

    const contextDrawer = (
        <CenteredInputWidth horizontalPadding={sessionInputHorizontalPadding}>
            <SessionContextDrawer
                machineName={machineName}
                workdirPath={session.metadata?.path}
                modelMode={drawerModelMode}
                permissionMode={drawerPermissionMode}
                canResume={canResume}
                resumeAvailability={resumeAvailability}
                resumeCommandBlock={resumeCommandBlock}
                session={session}
                machine={sessionMachine}
                onForkPress={handleForkPress}
                resumeSessionInline={resumeSessionInline}
            />
        </CenteredInputWidth>
    );

    const input = isInactiveArchivedSession ? (
        <>
            {archivedHint}
            {boundaryAdvisory}
            {pendingSwitchBanner}
            {contextDrawer}
            {composer}
        </>
    ) : (
        <>
            {boundaryAdvisory}
            {pendingSwitchBanner}
            {contextDrawer}
            {composer}
        </>
    );


    return (
        <>
            {/* CLI Version Warning Overlay - Subtle centered pill */}
            {shouldShowCliWarning && !(isLandscape && deviceType === 'phone') && (
                <Pressable
                    onPress={handleDismissCliWarning}
                    style={{
                        position: 'absolute',
                        top: 8, // Position at top of content area (padding handled by parent)
                        alignSelf: 'center',
                        backgroundColor: '#FFF3CD',
                        borderRadius: 100, // Fully rounded pill
                        paddingHorizontal: 14,
                        paddingVertical: 7,
                        flexDirection: 'row',
                        alignItems: 'center',
                        zIndex: 998,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.15,
                        shadowRadius: 4,
                        elevation: 4,
                    }}
                >
                    <Ionicons name="warning-outline" size={14} color="#FF9500" style={{ marginRight: 6 }} />
                    <Text style={{
                        fontSize: 12,
                        color: '#856404',
                        fontWeight: '600'
                    }}>
                        {t('sessionInfo.cliVersionOutdated')}
                    </Text>
                    <Ionicons name="close" size={14} color="#856404" style={{ marginLeft: 8 }} />
                </Pressable>
            )}

            {/* Main content area - no padding since header is overlay */}
            <View style={{ flexBasis: 0, flexGrow: 1, paddingBottom: safeArea.bottom + ((isRunningOnMac() || Platform.OS === 'web') ? 8 : 0) }}>
                <AgentContentView
                    content={content}
                    input={input}
                    placeholder={placeholder}
                />
            </View >

            {/* Back button for landscape phone mode when header is hidden */}
            {
                isLandscape && deviceType === 'phone' && (
                    <Pressable
                        onPress={() => router.back()}
                        style={{
                            position: 'absolute',
                            top: safeArea.top + 8,
                            left: 16,
                            width: 44,
                            height: 44,
                            borderRadius: 22,
                            backgroundColor: `rgba(${theme.dark ? '28, 23, 28' : '255, 255, 255'}, 0.9)`,
                            alignItems: 'center',
                            justifyContent: 'center',
                            ...Platform.select({
                                ios: {
                                    shadowColor: '#000',
                                    shadowOffset: { width: 0, height: 2 },
                                    shadowOpacity: 0.1,
                                    shadowRadius: 4,
                                },
                                android: {
                                    elevation: 2,
                                }
                            }),
                        }}
                        hitSlop={15}
                    >
                        <Ionicons
                            name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'}
                            size={Platform.select({ ios: 28, default: 24 })}
                            color="#000"
                        />
                    </Pressable>
                )
            }
        </>
    )
}

export function PendingSwitchBanner(props: {
    messagePreview?: string;
    onCancel: () => void;
    onTakeOverNow: () => void;
}) {
    const { theme } = useUnistyles();

    return (
        <View style={styles.pendingSwitchBanner}>
            <View style={styles.pendingSwitchTextColumn}>
                <Text style={styles.pendingSwitchTitle}>{t('pendingSwitch.banner')}</Text>
                {!!props.messagePreview && (
                    <Text style={styles.pendingSwitchPreview} numberOfLines={1}>{props.messagePreview}</Text>
                )}
            </View>
            <View style={styles.pendingSwitchActions}>
                <Pressable
                    onPress={props.onTakeOverNow}
                    accessibilityLabel={t('requestSwitch.now')}
                    style={({ pressed }) => [
                        styles.pendingSwitchButton,
                        styles.pendingSwitchPrimaryButton,
                        pressed && styles.pendingSwitchButtonPressed,
                    ]}
                >
                    <Ionicons name="flash-outline" size={14} color={theme.colors.button.primary.tint} />
                    <Text style={styles.pendingSwitchPrimaryText}>{t('requestSwitch.now')}</Text>
                </Pressable>
                <Pressable
                    onPress={props.onCancel}
                    accessibilityLabel={t('cancelPendingSwitch.label')}
                    style={({ pressed }) => [
                        styles.pendingSwitchButton,
                        styles.pendingSwitchSecondaryButton,
                        pressed && styles.pendingSwitchButtonPressed,
                    ]}
                >
                    <Ionicons name="close" size={14} color={theme.colors.text} />
                    <View style={styles.pendingSwitchSecondaryCopyColumn}>
                        <Text style={styles.pendingSwitchSecondaryText}>{t('cancelPendingSwitch.label')}</Text>
                        <Text style={styles.pendingSwitchSecondaryNote}>{t('cancelPendingSwitch.note')}</Text>
                    </View>
                </Pressable>
            </View>
        </View>
    );
}

function CrossDeviceBoundaryAdvisory() {
    const { theme } = useUnistyles();

    return (
        <View style={styles.boundaryAdvisory}>
            <Ionicons name="warning-outline" size={16} color={theme.colors.text} />
            <Text style={styles.boundaryAdvisoryText}>{t('chat.boundaryDivider.crossDeviceAdvisory')}</Text>
        </View>
    );
}

function InactiveArchivedHint(props: {
    resumeCommandBlock: NonNullable<ReturnType<typeof getResumeCommandBlock>> | null;
    canResume: boolean;
    resuming: boolean;
    onResume: () => void;
}) {
    const { theme } = useUnistyles();
    const hintTextStyle = {
        color: theme.colors.agentEventText,
        fontSize: 13,
        lineHeight: 18,
        textAlign: 'left' as const,
    };

    return (
        <View style={{
            paddingTop: 12,
            paddingBottom: 10,
            gap: 10,
            alignItems: 'stretch',
        }}>
            <View style={{ paddingHorizontal: 8, gap: 4 }}>
                <Text style={hintTextStyle}>
                    {t('session.inactiveArchived')}
                </Text>
                {props.canResume ? null : props.resumeCommandBlock && (
                    <Text style={hintTextStyle}>
                        {t('session.resumeFromTerminal')}
                    </Text>
                )}
            </View>
            {props.canResume ? (
                <Pressable
                    onPress={props.onResume}
                    disabled={props.resuming}
                    style={({ pressed }) => ({
                        height: 40,
                        borderRadius: 10,
                        backgroundColor: theme.colors.button.primary.background,
                        opacity: props.resuming ? 0.6 : pressed ? 0.8 : 1,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginHorizontal: 8,
                    })}
                >
                    {props.resuming ? (
                        <ActivityIndicator size="small" color={theme.colors.button.primary.tint} />
                    ) : (
                        <Text style={{ color: theme.colors.button.primary.tint, fontSize: 15, fontWeight: '600' }}>
                            {t('sessionInfo.resumeSession')}
                        </Text>
                    )}
                </Pressable>
            ) : props.resumeCommandBlock && (
                <ResumeCommandCopyBlock resumeCommandBlock={props.resumeCommandBlock} />
            )}
        </View>
    );
}

function CenteredInputWidth(props: {
    children: React.ReactNode;
    horizontalPadding: number;
}) {
    const { body: bodyMaxWidth } = useChatWidth();
    const contentWidthStyle = React.useMemo(() => ({ width: '100%' as const, maxWidth: bodyMaxWidth }), [bodyMaxWidth]);

    return (
        <View style={{
            width: '100%',
            paddingHorizontal: props.horizontalPadding,
            alignItems: 'center',
        }}>
            <View style={contentWidthStyle}>
                {props.children}
            </View>
        </View>
    );
}

const styles = StyleSheet.create((theme) => ({
    pendingSwitchBanner: {
        marginHorizontal: 8,
        marginTop: 8,
        marginBottom: 4,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: theme.colors.textSecondary,
        backgroundColor: theme.colors.userMessageBackground,
        gap: 10,
    },
    pendingSwitchTextColumn: {
        gap: 2,
    },
    pendingSwitchTitle: {
        color: theme.colors.text,
        fontSize: 13,
        lineHeight: 18,
        fontWeight: '600',
    },
    pendingSwitchPreview: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 16,
    },
    pendingSwitchActions: {
        flexDirection: 'row',
        gap: 8,
        flexWrap: 'wrap',
    },
    pendingSwitchButton: {
        minHeight: 32,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 6,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    pendingSwitchPrimaryButton: {
        backgroundColor: theme.colors.button.primary.background,
    },
    pendingSwitchSecondaryButton: {
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.textSecondary,
    },
    pendingSwitchSecondaryCopyColumn: {
        gap: 1,
    },
    pendingSwitchButtonPressed: {
        opacity: 0.7,
    },
    pendingSwitchPrimaryText: {
        color: theme.colors.button.primary.tint,
        fontSize: 12,
        lineHeight: 16,
        fontWeight: '600',
    },
    pendingSwitchSecondaryText: {
        color: theme.colors.text,
        fontSize: 12,
        lineHeight: 16,
        fontWeight: '600',
    },
    pendingSwitchSecondaryNote: {
        color: theme.colors.textSecondary,
        fontSize: 11,
        lineHeight: 14,
    },
    boundaryAdvisory: {
        marginHorizontal: 8,
        marginTop: 8,
        marginBottom: 4,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: theme.colors.textSecondary,
        backgroundColor: theme.colors.surface,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    boundaryAdvisoryText: {
        color: theme.colors.text,
        fontSize: 13,
        lineHeight: 18,
        flex: 1,
    },
}));
