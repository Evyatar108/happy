import React from 'react';
import {
    View,
    Text,
    Platform,
    Pressable,
    Modal as RNModal,
    TouchableWithoutFeedback,
    Animated,
    ActivityIndicator,
} from 'react-native';
import { Octicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { layout } from '@/components/layout';
import {
    MultiTextInput,
    MULTI_TEXT_INPUT_LINE_HEIGHT,
    type KeyPressEvent,
} from '@/components/MultiTextInput';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Constants from 'expo-constants';
import { useHeaderHeight } from '@/utils/responsive';
import { t } from '@/text';
import { useLocalSetting, useSetting, storage } from '@/sync/storage';
import { sync } from '@/sync/sync';
import { isMachineOnline } from '@/utils/machineUtils';
import { machineSpawnNewSession } from '@/sync/ops';
import { createWorktree } from '@/utils/worktree';
import { resolveAbsolutePath } from '@/utils/pathUtils';
import { useNavigateToSession } from '@/hooks/useNavigateToSession';
import { useNewSessionDraft } from '@/hooks/useNewSessionDraft';
import { usePreSendCommand } from '@/hooks/usePreSendCommand';
import { Modal } from '@/modal';
import { AgentInput } from '@/components/AgentInput';
import { NewSessionContextRow, useNewSessionContextRowController } from '@/components/NewSessionContextRow';
import type { SendMessageOptions } from '@/sync/sync';
import {
    pickNewSessionImageAttachment,
    useNewSessionAttachments,
    type NewSessionImageAttachment,
} from '@/hooks/useNewSessionAttachments';

const COMPOSER_INPUT_VERTICAL_PADDING = Platform.OS === 'web' ? 10 : 8;
const COMPOSER_SEND_BUTTON_SIZE = 32;
const COMPOSER_SEND_BUTTON_MARGIN_BOTTOM = Math.max(
    0,
    Math.round((MULTI_TEXT_INPUT_LINE_HEIGHT + COMPOSER_INPUT_VERTICAL_PADDING * 2 - COMPOSER_SEND_BUTTON_SIZE) / 2),
);

function trimPathInput(path: string | null | undefined): string {
    return path?.trim() ?? '';
}

// Bottom sheet modal — native formSheet on iOS, slide-up sheet on Android
function BottomSheet({
    visible,
    onClose,
    children,
}: {
    visible: boolean;
    onClose: () => void;
    children: React.ReactNode;
}) {
    const { theme } = useUnistyles();
    const safeArea = useSafeAreaInsets();

    if (Platform.OS === 'ios') {
        return (
            <RNModal
                visible={visible}
                animationType="slide"
                presentationStyle="formSheet"
                onRequestClose={onClose}
            >
                <View style={[sheetStyles.iosContainer, { backgroundColor: theme.colors.header.background }]}>
                    <View style={sheetStyles.handleRow}>
                        <View style={[sheetStyles.handle, { backgroundColor: theme.colors.textSecondary }]} />
                    </View>
                    {children}
                    <View style={{ height: safeArea.bottom }} />
                </View>
            </RNModal>
        );
    }

    // Android: slide-up sheet with backdrop
    const fadeAnim = React.useRef(new Animated.Value(0)).current;
    const slideAnim = React.useRef(new Animated.Value(300)).current;

    React.useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
                Animated.spring(slideAnim, { toValue: 0, damping: 25, stiffness: 300, useNativeDriver: true }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
                Animated.timing(slideAnim, { toValue: 300, duration: 200, useNativeDriver: true }),
            ]).start();
        }
    }, [visible, fadeAnim, slideAnim]);

    return (
        <RNModal
            visible={visible}
            transparent
            animationType="none"
            onRequestClose={onClose}
        >
            <View style={sheetStyles.overlay}>
                <TouchableWithoutFeedback onPress={onClose}>
                    <Animated.View style={[sheetStyles.backdrop, { opacity: fadeAnim }]} />
                </TouchableWithoutFeedback>
                <Animated.View
                    style={[
                        sheetStyles.sheet,
                        {
                            backgroundColor: theme.colors.header.background,
                            paddingBottom: Math.max(16, safeArea.bottom),
                            transform: [{ translateY: slideAnim }],
                        },
                    ]}
                >
                    <View style={sheetStyles.handleRow}>
                        <View style={[sheetStyles.handle, { backgroundColor: theme.colors.textSecondary }]} />
                    </View>
                    {children}
                </Animated.View>
            </View>
        </RNModal>
    );
}

function NewSessionScreen() {
    const { theme } = useUnistyles();
    const safeArea = useSafeAreaInsets();
    const headerHeight = useHeaderHeight();
    const router = useRouter();
    const navigateToSession = useNavigateToSession();
    const preSendCommand = usePreSendCommand(undefined);

    const agentInputEnterToSend = useSetting('agentInputEnterToSend');
    const unifiedNewSessionComposer = useLocalSetting('unifiedNewSessionComposer');
    const contextRow = useNewSessionContextRowController();
    const stagedAttachments = useNewSessionAttachments((state) => state.attachments);
    const setStagedAttachment = useNewSessionAttachments((state) => state.setAttachment);
    const clearStagedAttachment = useNewSessionAttachments((state) => state.clearAttachment);
    const clearStagedAttachments = useNewSessionAttachments((state) => state.clearAttachments);

    // Persisted draft state (survives navigation)
    const draft = useNewSessionDraft();
    const prompt = draft.input;
    const setPrompt = draft.setInput;
    const {
        selectedMachineId,
        selectedMachine,
        selectedPath,
        selectedAgent,
        currentPermission,
        currentModelKey,
        worktreeKey,
    } = contextRow;

    // Local-only UI state (not persisted)
    const [isSpawning, setIsSpawning] = React.useState(false);
    const attachments = React.useMemo<NonNullable<SendMessageOptions['attachments']>>(
        () => stagedAttachments.map((attachment) => ({
            type: attachment.type,
            ref: attachment.ref,
            mimeType: attachment.mimeType,
        })),
        [stagedAttachments],
    );

    React.useEffect(() => () => {
        clearStagedAttachments();
    }, [clearStagedAttachments]);

    React.useEffect(() => {
        clearStagedAttachments();
    }, [selectedMachineId, selectedPath, worktreeKey, selectedAgent, clearStagedAttachments]);

    const handleAttachmentPress = React.useCallback(async () => {
        try {
            const attachment = await pickNewSessionImageAttachment();
            if (attachment) {
                setStagedAttachment(attachment);
            }
        } catch (error) {
            const message = error instanceof Error && error.message === 'unsupported-type'
                ? t('errors.attachmentUnsupportedType')
                : error instanceof Error && error.message === 'too-large'
                    ? t('errors.attachmentTooLarge')
                    : t('errors.attachmentPickFailed');
            Modal.alert(t('common.error'), message);
        }
    }, [setStagedAttachment]);

    const attachmentsPreview = stagedAttachments.length > 0 ? (
        <NewSessionAttachmentsPreview
            attachments={stagedAttachments}
            onClear={clearStagedAttachment}
        />
    ) : null;
    // Spawn session handler
    const handleSend = React.useCallback(async (approvedNewDirectoryCreation: boolean = false) => {
        const trimmedPrompt = prompt.trim();
        if (trimmedPrompt) {
            const intercept = preSendCommand(trimmedPrompt);
            if (intercept.intercepted) {
                setPrompt('');
                intercept.execute();
                return;
            }
        }

        if (!selectedMachineId || !selectedMachine) {
            Modal.alert(t('common.error'), t('newSession.selectMachineRequired'));
            return;
        }
        if (!isMachineOnline(selectedMachine)) {
            Modal.alert(t('common.error'), t('newSession.machineOffline'));
            return;
        }

        setIsSpawning(true);
        try {
            const pathToUse = trimPathInput(selectedPath) || '~';
            const absolutePath = resolveAbsolutePath(pathToUse, selectedMachine.metadata?.homeDir);

            // Handle worktree selection
            let spawnDirectory = absolutePath;
            if (worktreeKey === '__new__') {
                const worktreeResult = await createWorktree(selectedMachineId, absolutePath);
                if (!worktreeResult.success) {
                    Modal.alert(t('common.error'), worktreeResult.error || 'Failed to create worktree');
                    return;
                }
                spawnDirectory = worktreeResult.worktreePath;
            } else if (worktreeKey !== '__none__') {
                // Existing worktree — use its path directly
                spawnDirectory = worktreeKey;
            }

            // Persist last used settings
            sync.applySettings({
                lastUsedAgent: selectedAgent,
                lastUsedPermissionMode: currentPermission.key,
                lastUsedModelMode: currentModelKey,
            });

            const result = await machineSpawnNewSession({
                machineId: selectedMachineId,
                directory: spawnDirectory,
                approvedNewDirectoryCreation,
                agent: selectedAgent,
            });

            switch (result.type) {
                case 'success':
                    await sync.refreshSessions();

                    // Set permission mode and model on the session before sending
                    storage.getState().updateSessionPermissionMode(result.sessionId, currentPermission.key, true);
                    storage.getState().updateSessionModelMode(result.sessionId, currentModelKey);

                    // Clear input text so draft doesn't repeat the sent message
                    setPrompt('');

                    // Send initial message if provided
                    if (trimmedPrompt) {
                        await sync.sendMessage(result.sessionId, trimmedPrompt, { source: 'new_session', attachments });
                        clearStagedAttachments();
                    }

                    router.back();
                    navigateToSession(result.sessionId);
                    break;
                case 'requestToApproveDirectoryCreation': {
                    const approved = await Modal.confirm(
                        'Create Directory?',
                        `The directory '${result.directory}' does not exist. Would you like to create it?`,
                        { cancelText: t('common.cancel'), confirmText: t('common.create') },
                    );
                    if (approved) {
                        await handleSend(true);
                    }
                    break;
                }
                case 'error':
                    Modal.alert(t('common.error'), result.errorMessage);
                    break;
            }
        } catch (error) {
            const errorMessage = error instanceof Error
                ? error.message
                : 'Failed to start session';
            Modal.alert(t('common.error'), errorMessage);
        } finally {
            setIsSpawning(false);
        }
    }, [attachments, selectedMachineId, selectedMachine, selectedPath, selectedAgent, prompt, preSendCommand, router, navigateToSession, currentPermission.key, currentModelKey, worktreeKey, setPrompt, clearStagedAttachments]);

    const canSend = selectedMachineId && selectedMachine && isMachineOnline(selectedMachine) && !isSpawning;

    // Handle Enter/Cmd+Enter to send on web
    const handleKeyPress = React.useCallback((event: KeyPressEvent): boolean => {
        if (Platform.OS === 'web' && event.key === 'Enter' && !event.shiftKey && agentInputEnterToSend) {
            if (canSend) {
                handleSend();
                return true;
            }
        }
        return false;
    }, [agentInputEnterToSend, canSend, handleSend]);

    // Auto-focus the text input when the composer mounts
    const composerInputRef = React.useRef<import('@/components/MultiTextInput').MultiTextInputHandle>(null);
    React.useEffect(() => {
        const timeout = setTimeout(() => {
            composerInputRef.current?.focus();
        }, 100);
        return () => clearTimeout(timeout);
    }, []);

    const unifiedComposer = (
        <AgentInput
            ref={composerInputRef}
            mode="new"
            value={prompt}
            onChangeText={setPrompt}
            placeholder="What would you like to work on?"
            onSend={() => handleSend()}
            isSendDisabled={!canSend}
            isSending={isSpawning}
            permissionMode={contextRow.currentPermission}
            availableModes={contextRow.renderState.permissionModes}
            onPermissionModeChange={contextRow.renderState.selectPermission}
            modelMode={contextRow.currentModel ?? null}
            availableModels={contextRow.renderState.modelModes}
            onModelModeChange={contextRow.renderState.selectModel}
            effortLevel={contextRow.currentEffort ?? null}
            availableEffortLevels={contextRow.renderState.effortLevels}
            onEffortLevelChange={contextRow.renderState.selectEffort}
            agentType={selectedAgent}
            autocompletePrefixes={[]}
            autocompleteSuggestions={async () => []}
            newSessionSlots={contextRow.slots}
            onAttachmentPress={handleAttachmentPress}
            attachmentsPreview={attachmentsPreview}
        />
    );

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? Constants.statusBarHeight + headerHeight : 0}
            style={styles.container}
        >
            <View style={styles.inner}>
                {!unifiedNewSessionComposer && (
                    <View style={{ maxWidth: layout.maxWidth, width: '100%', alignSelf: 'center', paddingHorizontal: 12, gap: 8, paddingTop: 12 }}>

                        <NewSessionContextRow controller={contextRow} />
                    </View>
                )}

                {/* Web: click-away backdrop */}
                {Platform.OS === 'web' && contextRow.activePicker && (
                    <Pressable
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: -1 }}
                        onPress={contextRow.closePicker}
                    />
                )}

                {/* Spacer */}
                <View style={{ flex: 1 }} />

                {unifiedNewSessionComposer ? (
                    <>
                        {Platform.OS === 'web' && contextRow.activePicker && (
                            <View style={[styles.unifiedPickerPopover, { backgroundColor: theme.colors.header.background }]}>
                                {contextRow.renderPickerContent(true)}
                            </View>
                        )}
                        {unifiedComposer}
                    </>
                ) : (
                    <View style={{ maxWidth: layout.maxWidth, width: '100%', alignSelf: 'center', paddingHorizontal: 12, gap: 8 }}>
                        {/* Input box */}
                        <View style={styles.inputBox}>
                            <View style={styles.inputField}>
                                <View style={{ flex: 1 }}>
                                    <MultiTextInput
                                        ref={composerInputRef}
                                        value={prompt}
                                        onChangeText={setPrompt}
                                        placeholder="What would you like to work on?"
                                        lineHeight={MULTI_TEXT_INPUT_LINE_HEIGHT}
                                        paddingTop={COMPOSER_INPUT_VERTICAL_PADDING}
                                        paddingBottom={COMPOSER_INPUT_VERTICAL_PADDING}
                                        maxHeight={240}
                                        onKeyPress={handleKeyPress}
                                    />
                                </View>
                                <View style={[
                                    styles.sendButton,
                                    canSend ? styles.sendButtonActive : styles.sendButtonInactive,
                                ]}>
                                    <Pressable
                                        style={(p) => ({
                                            width: '100%',
                                            height: '100%',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            opacity: p.pressed ? 0.7 : 1,
                                        })}
                                        disabled={!canSend}
                                        onPress={() => handleSend()}
                                    >
                                        {isSpawning ? (
                                            <ActivityIndicator
                                                size="small"
                                                color={theme.colors.button.primary.tint}
                                            />
                                        ) : (
                                            <Octicons
                                                name="arrow-up"
                                                size={16}
                                                color={theme.colors.button.primary.tint}
                                                style={{ marginTop: Platform.OS === 'web' ? 2 : 0 }}
                                            />
                                        )}
                                    </Pressable>
                                </View>
                            </View>
                        </View>
                    </View>
                )}

                <View style={{ height: Math.max(16, safeArea.bottom) }} />
            </View>

            {/* Native: picker bottom sheet */}
            {Platform.OS !== 'web' && (
                <BottomSheet
                    visible={!!contextRow.activePicker}
                    onClose={contextRow.closePicker}
                >
                    {contextRow.renderPickerContent(false)}
                </BottomSheet>
            )}
        </KeyboardAvoidingView>
    );
}

function NewSessionAttachmentsPreview({
    attachments,
    onClear,
}: {
    attachments: NewSessionImageAttachment[];
    onClear: (id: string) => void;
}) {
    const { theme } = useUnistyles();

    return (
        <View style={styles.attachmentPreviewRow}>
            {attachments.map((attachment) => (
                <View key={attachment.id} style={styles.attachmentChip} testID="new-session-attachment-chip">
                    <Octicons name="image" size={14} color={theme.colors.textSecondary} />
                    <Text style={styles.attachmentChipText} numberOfLines={1}>
                        {attachment.name || t('newSession.imageAttachment')}
                    </Text>
                    <Pressable
                        onPress={() => onClear(attachment.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        testID="new-session-attachment-clear"
                    >
                        <Octicons name="x" size={14} color={theme.colors.textSecondary} />
                    </Pressable>
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.header.background,
    },
    inner: {
        flex: 1,
    },
    inputBox: {
        backgroundColor: theme.colors.input.background,
        borderRadius: Platform.select({ default: 16, android: 20 }),
        overflow: 'hidden',
        paddingVertical: 2,
        paddingHorizontal: 8,
    },
    inputField: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingLeft: 8,
        paddingRight: 4,
        paddingVertical: 4,
        minHeight: 40,
        gap: 8,
    },
    sendButton: {
        width: COMPOSER_SEND_BUTTON_SIZE,
        height: COMPOSER_SEND_BUTTON_SIZE,
        borderRadius: COMPOSER_SEND_BUTTON_SIZE / 2,
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
        marginBottom: COMPOSER_SEND_BUTTON_MARGIN_BOTTOM,
    },
    sendButtonActive: {
        backgroundColor: theme.colors.button.primary.background,
    },
    sendButtonInactive: {
        backgroundColor: theme.colors.button.primary.disabled,
    },
    unifiedPickerPopover: {
        width: '100%',
        maxWidth: layout.maxWidth,
        alignSelf: 'center',
        marginBottom: 8,
        paddingVertical: 4,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        ...Platform.select({
            web: {
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.12)',
            },
            default: {},
        }),
    },
    attachmentPreviewRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        paddingHorizontal: 8,
        paddingTop: 8,
    },
    attachmentChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        maxWidth: '100%',
        height: 30,
        paddingHorizontal: 8,
        borderRadius: 8,
        backgroundColor: theme.colors.surfacePressed,
    },
    attachmentChipText: {
        maxWidth: 220,
        color: theme.colors.text,
        fontSize: 12,
    },
}));

// Bottom sheet styles
const sheetStyles = {
    iosContainer: {
        flex: 1,
    } as const,
    handleRow: {
        alignItems: 'center' as const,
        paddingTop: 10,
        paddingBottom: 6,
    },
    handle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        opacity: 0.3,
    },
    overlay: {
        flex: 1,
        justifyContent: 'flex-end' as const,
    },
    backdrop: {
        position: 'absolute' as const,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'black',
        opacity: 0.4,
    },
    sheet: {
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        maxHeight: '70%' as const,
    },
};

export default React.memo(NewSessionScreen);
