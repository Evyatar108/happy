import React from 'react';
import {
    View,
    Text,
    Platform,
    Pressable,
    Modal as RNModal,
    TouchableWithoutFeedback,
    Animated,
    LayoutAnimation,
    ActivityIndicator,
    Image as RNImage,
} from 'react-native';
import { Ionicons, Octicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Typography } from '@/constants/Typography';
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
import { useAllMachines, useSessions, useSetting, storage } from '@/sync/storage';
import type { NewSessionAgentType } from '@/sync/persistence';
import { generateLocalMessageId, sync } from '@/sync/sync';
import { isMachineOnline } from '@/utils/machineUtils';
import { machineSpawnNewSession, sessionWriteFile } from '@/sync/ops';
import { createWorktree, listWorktrees } from '@/utils/worktree';
import { resolveAbsolutePath } from '@/utils/pathUtils';
import { formatPathRelativeToHome, formatLastSeen } from '@/utils/sessionUtils';
import { useNavigateToSession } from '@/hooks/useNavigateToSession';
import { useNewSessionDraft } from '@/hooks/useNewSessionDraft';
import { usePreSendCommand } from '@/hooks/usePreSendCommand';
import { Modal } from '@/modal';
import { useFileAttachment } from '@/hooks/useFileAttachment';
import { AttachmentChip, buildMessageWithAttachmentRefs } from '@/components/composer/AttachmentChip';
import { PickerContent, PathPickerContent, type PickerItem } from '@/components/pickers';
import type { Machine, Session } from '@/sync/storageTypes';
import {
    getHardcodedPermissionModes,
    getHardcodedModelModes,
    getEffortLevelsForModel,
    getDefaultEffortKeyForModel,
    getDefaultPermissionModeKey,
    getDefaultModelKey,
    getSupportsWorktree,
    type PermissionMode,
    type ModelMode,
    type EffortLevel,
} from '@/components/modelModeOptions';
import { isRunningOnMac } from '@/utils/platform';
import { dedupeAttachmentNames, sanitizeAttachmentName } from '@/utils/attachmentName';

// Agent icon assets
const agentIcons = {
    claude: require('@/assets/images/icon-claude.png'),
    codex: require('@/assets/images/icon-gpt.png'),
    openclaw: require('@/assets/images/icon-openclaw.png'),
    gemini: require('@/assets/images/icon-gemini.png'),
};

type AgentKey = NewSessionAgentType;
const ALL_AGENTS: { key: AgentKey; label: string }[] = [
    { key: 'claude', label: 'claude code' },
    { key: 'codex', label: 'codex' },
    { key: 'openclaw', label: 'openclaw' },
    { key: 'gemini', label: 'gemini' },
];

type PickerType = 'machine' | 'path' | 'worktree';

type PermissionStyle = { color: string; icon: 'play-forward' | 'pause' };

const COMPOSER_INPUT_VERTICAL_PADDING = Platform.OS === 'web' ? 10 : 8;
const COMPOSER_SEND_BUTTON_SIZE = 32;
const COMPOSER_SEND_BUTTON_MARGIN_BOTTOM = Math.max(
    0,
    Math.round((MULTI_TEXT_INPUT_LINE_HEIGHT + COMPOSER_INPUT_VERTICAL_PADDING * 2 - COMPOSER_SEND_BUTTON_SIZE) / 2),
);
const WORKTREE_PATH_DEBOUNCE_MS = 300;

function trimPathInput(path: string | null | undefined): string {
    return path?.trim() ?? '';
}

function trimTrailingPathSeparator(path: string): string {
    if (path === '/' || /^[A-Za-z]:[\\/]?$/.test(path)) {
        return path;
    }
    return path.replace(/[\\/]+$/, '');
}

function normalizePathForComparison(path: string | null | undefined, homeDir?: string): string | null {
    const trimmed = trimPathInput(path);
    if (!trimmed) {
        return null;
    }
    return trimTrailingPathSeparator(resolveAbsolutePath(trimmed, homeDir));
}

function getPermissionStyle(key: string): PermissionStyle | null {
    switch (key) {
        case 'acceptEdits':
        case 'auto_edit':
            return { color: '#A78BFA', icon: 'play-forward' };
        case 'plan':
            return { color: '#5EABA4', icon: 'pause' };
        case 'dontAsk':
        case 'safe-yolo':
            return { color: '#FBBF24', icon: 'play-forward' };
        case 'bypassPermissions':
        case 'yolo':
            return { color: '#F87171', icon: 'play-forward' };
        case 'read-only':
            return { color: '#60A5FA', icon: 'pause' };
        default:
            return null;
    }
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

// Helper: get machine display name
function getMachineName(machine: Machine): string {
    return machine.metadata?.displayName || machine.metadata?.host || 'unknown';
}

function NewSessionScreen() {
    const { theme } = useUnistyles();
    const safeArea = useSafeAreaInsets();
    const headerHeight = useHeaderHeight();
    const router = useRouter();
    const navigateToSession = useNavigateToSession();
    const preSendCommand = usePreSendCommand(undefined);
    const fileAttachment = useFileAttachment();
    const attachmentWeb = fileAttachment as typeof fileAttachment & {
        inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
        rootProps?: Record<string, unknown>;
        openFilePicker?: () => void;
        isDragActive?: boolean;
    };

    // Real data sources
    const allMachines = useAllMachines({ includeOffline: true });
    const sessions = useSessions();
    const agentInputEnterToSend = useSetting('agentInputEnterToSend');

    // Persisted draft state (survives navigation)
    const draft = useNewSessionDraft();
    const prompt = draft.input;
    const setPrompt = draft.setInput;
    const selectedAgent = draft.agentType;
    const setSelectedAgent = draft.setAgentType;
    const selectedMachineId = draft.selectedMachineId;
    const setSelectedMachineId = draft.setMachineId;
    const selectedPath = draft.selectedPath;
    const setSelectedPath = draft.setPath;
    const [worktreeKey, setWorktreeKey] = React.useState<string>(
        draft.worktreeKey ?? (draft.sessionType === 'worktree' ? '__new__' : '__none__')
    );
    React.useEffect(() => {
        draft.setSessionType(worktreeKey !== '__none__' ? 'worktree' : 'simple');
        draft.setWorktreeKey(worktreeKey === '__none__' || worktreeKey === '__new__' ? null : worktreeKey);
    }, [worktreeKey]);

    // Local-only UI state (not persisted)
    const [permissionIndex, setPermissionIndex] = React.useState(0);
    const [modelIndex, setModelIndex] = React.useState(0);
    const [effortIndex, setEffortIndex] = React.useState(0);
    const [isSpawning, setIsSpawning] = React.useState(false);
    const [activePicker, setActivePicker] = React.useState<PickerType | null>(null);

    // Config collapse — auto-collapses when typing, expands when empty
    const [isConfigExpanded, setIsConfigExpanded] = React.useState(true);

    // Auto-select first machine when none selected (first-ever use, no draft)
    React.useEffect(() => {
        if (selectedMachineId) return;
        if (allMachines.length > 0) {
            setSelectedMachineId(allMachines[0].id);
        }
    }, [allMachines, selectedMachineId]);

    const selectedMachine = React.useMemo(
        () => allMachines.find(m => m.id === selectedMachineId) ?? null,
        [allMachines, selectedMachineId],
    );
    const selectedHomeDir = selectedMachine?.metadata?.homeDir;

    // Build machine picker items: online first, then offline
    const machineItems = React.useMemo<PickerItem[]>(() => {
        const sorted = [...allMachines].sort((a, b) => {
            const aOnline = isMachineOnline(a) ? 0 : 1;
            const bOnline = isMachineOnline(b) ? 0 : 1;
            return aOnline - bOnline;
        });
        return sorted.map(m => ({
            key: m.id,
            label: getMachineName(m),
            subtitle: isMachineOnline(m) ? t('status.online') : t('status.lastSeen', { time: formatLastSeen(m.activeAt, false) }),
            dimmed: !isMachineOnline(m),
        }));
    }, [allMachines]);

    // Build path items from session history for selected machine
    const pathItems = React.useMemo<PickerItem[]>(() => {
        if (!selectedMachineId || !sessions) return [];
        const paths = new Set<string>();
        for (const s of sessions) {
            if (typeof s === 'string') continue;
            const session = s as Session;
            if (session.metadata?.machineId === selectedMachineId && session.metadata?.path) {
                paths.add(session.metadata.path);
            }
        }
        const homeDir = selectedMachine?.metadata?.homeDir;
        return Array.from(paths).sort().map(p => ({
            key: p,
            label: formatPathRelativeToHome(p, homeDir),
        }));
    }, [selectedMachineId, sessions, selectedMachine]);

    // Auto-select first path when machine changes
    React.useEffect(() => {
        if (!selectedMachineId || selectedPath !== null) {
            return;
        }

        setSelectedPath(pathItems[0]?.label ?? '~');
    }, [selectedMachineId, pathItems, selectedPath, setSelectedPath]);

    const resolvedSelectedPath = React.useMemo(() => {
        return normalizePathForComparison(selectedPath, selectedHomeDir);
    }, [selectedHomeDir, selectedPath]);

    const [debouncedResolvedSelectedPath, setDebouncedResolvedSelectedPath] = React.useState<string | null>(resolvedSelectedPath);

    React.useEffect(() => {
        if (!resolvedSelectedPath) {
            setDebouncedResolvedSelectedPath(null);
            return;
        }

        const timeout = setTimeout(() => {
            setDebouncedResolvedSelectedPath(resolvedSelectedPath);
        }, WORKTREE_PATH_DEBOUNCE_MS);

        return () => clearTimeout(timeout);
    }, [resolvedSelectedPath]);

    // Fetch existing worktrees from the selected machine/path
    const [worktreeItems, setWorktreeItems] = React.useState<PickerItem[]>([]);
    React.useEffect(() => {
        if (!selectedMachineId || !debouncedResolvedSelectedPath) {
            setWorktreeItems([]);
            return;
        }
        if (!selectedMachine || !isMachineOnline(selectedMachine)) {
            setWorktreeItems([]);
            return;
        }
        let cancelled = false;
        listWorktrees(selectedMachineId, debouncedResolvedSelectedPath).then(worktrees => {
            if (cancelled) return;
            setWorktreeItems(worktrees.map(wt => ({
                key: wt.path,
                label: wt.branch,
                subtitle: wt.path,
            })));
        });
        return () => { cancelled = true; };
    }, [debouncedResolvedSelectedPath, selectedMachineId, selectedMachine]);

    React.useEffect(() => {
        if (worktreeKey === '__none__' || worktreeKey === '__new__') {
            return;
        }

        if (!worktreeItems.some((item) => item.key === worktreeKey)) {
            setWorktreeKey('__none__');
        }
    }, [worktreeItems, worktreeKey]);

    // Filter available agents based on CLI availability from machine metadata
    const availableAgents = React.useMemo(() => {
        const availability = selectedMachine?.metadata?.cliAvailability;
        if (!availability) return ALL_AGENTS;
        return ALL_AGENTS.filter(a => availability[a.key]);
    }, [selectedMachine]);

    // If current agent not available on this machine, switch to first available
    React.useEffect(() => {
        if (availableAgents.length > 0 && !availableAgents.find(a => a.key === selectedAgent)) {
            setSelectedAgent(availableAgents[0].key);
        }
    }, [availableAgents, selectedAgent, setSelectedAgent]);

    // Derive options from agent type
    const permissionModes = React.useMemo<PermissionMode[]>(
        () => getHardcodedPermissionModes(selectedAgent, t),
        [selectedAgent],
    );
    const modelModes = React.useMemo<ModelMode[]>(
        () => getHardcodedModelModes(selectedAgent, t),
        [selectedAgent],
    );

    const currentModel = modelModes[modelIndex] ?? modelModes[0];
    const currentModelKey = currentModel?.key ?? 'default';

    const effortLevels = React.useMemo<EffortLevel[]>(
        () => getEffortLevelsForModel(selectedAgent, currentModelKey),
        [selectedAgent, currentModelKey],
    );

    const supportsWorktree = getSupportsWorktree(selectedAgent);
    const showModel = modelModes.length > 1;
    const showEffort = effortLevels.length > 0;
    const showPermission = permissionModes.length > 1;

    // Reset indices when agent changes — try draft keys first, then defaults
    React.useEffect(() => {
        const draftPermIdx = permissionModes.findIndex(m => m.key === draft.permissionMode);
        const defaultPermIdx = permissionModes.findIndex(m => m.key === getDefaultPermissionModeKey(selectedAgent));
        setPermissionIndex(draftPermIdx >= 0 ? draftPermIdx : (defaultPermIdx >= 0 ? defaultPermIdx : 0));

        const draftModelIdx = modelModes.findIndex(m => m.key === draft.modelMode);
        const defaultModelIdx = modelModes.findIndex(m => m.key === getDefaultModelKey(selectedAgent));
        setModelIndex(draftModelIdx >= 0 ? draftModelIdx : (defaultModelIdx >= 0 ? defaultModelIdx : 0));

        if (!supportsWorktree) setWorktreeKey('__none__');
    }, [selectedAgent, permissionModes, modelModes, supportsWorktree]);

    // Reset effort when model changes
    React.useEffect(() => {
        const defaultEffort = getDefaultEffortKeyForModel(selectedAgent, currentModelKey);
        if (defaultEffort && effortLevels.length > 0) {
            const idx = effortLevels.findIndex(e => e.key === defaultEffort);
            setEffortIndex(idx >= 0 ? idx : effortLevels.length - 1);
        } else {
            setEffortIndex(0);
        }
    }, [selectedAgent, currentModelKey, effortLevels]);

    const hasText = prompt.trim().length > 0;

    // Auto collapse config once when user starts typing (mobile only)
    // On desktop (web / Mac Catalyst) the panel stays expanded
    // Also skip collapsing on the initial render when draft text is restored
    const hasCollapsedOnceRef = React.useRef(false);
    const isInitialRef = React.useRef(true);
    const isDesktop = Platform.OS === 'web' || isRunningOnMac();
    React.useEffect(() => {
        if (isInitialRef.current) {
            isInitialRef.current = false;
            return;
        }
        if (isDesktop) return;
        if (hasText && !hasCollapsedOnceRef.current) {
            hasCollapsedOnceRef.current = true;
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setIsConfigExpanded(false);
        }
    }, [hasText]);


    const toggleConfig = React.useCallback(() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setIsConfigExpanded(v => !v);
    }, []);

    const togglePicker = React.useCallback((type: PickerType) => {
        setActivePicker(v => v === type ? null : type);
    }, []);

    const cyclePermission = React.useCallback(() => {
        setPermissionIndex(i => {
            const next = (i + 1) % permissionModes.length;
            draft.setPermissionMode(permissionModes[next]?.key ?? 'default');
            return next;
        });
    }, [permissionModes, draft.setPermissionMode]);

    const cycleModel = React.useCallback(() => {
        setModelIndex(i => {
            const next = (i + 1) % modelModes.length;
            draft.setModelMode(modelModes[next]?.key ?? 'default');
            return next;
        });
    }, [modelModes, draft.setModelMode]);

    const cycleEffort = React.useCallback(() => {
        setEffortIndex(i => (i + 1) % effortLevels.length);
    }, [effortLevels.length]);

    const cycleAgent = React.useCallback(() => {
        const idx = availableAgents.findIndex(a => a.key === selectedAgent);
        const next = availableAgents[(idx + 1) % availableAgents.length].key;
        setSelectedAgent(next);
    }, [availableAgents, selectedAgent, setSelectedAgent]);

    const isOffline = selectedMachine ? !isMachineOnline(selectedMachine) : false;
    const agent = availableAgents.find(a => a.key === selectedAgent) ?? ALL_AGENTS[0];
    const currentPermission = permissionModes[permissionIndex] ?? permissionModes[0];
    const currentEffort = effortLevels[effortIndex] ?? effortLevels[0];
    const permissionStyle = currentPermission?.key !== 'default' ? getPermissionStyle(currentPermission.key) : null;

    // Display values
    const machineName = selectedMachine ? getMachineName(selectedMachine) : 'Select machine';
    const pathName = trimPathInput(selectedPath)
        ? formatPathRelativeToHome(trimPathInput(selectedPath), selectedHomeDir)
        : '~';
    const worktreeLabel = worktreeKey === '__none__'
        ? 'no worktree'
        : worktreeKey === '__new__'
            ? 'new worktree'
            : worktreeItems.find(wt => wt.key === worktreeKey)?.label || worktreeKey;

    // Flash label for collapsed icon taps — shows label briefly above the icon
    const flashOpacity = React.useRef(new Animated.Value(0)).current;
    const [flashText, setFlashText] = React.useState('');
    const flashTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const showFlash = React.useCallback((text: string) => {
        if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
        setFlashText(text);
        flashOpacity.setValue(0);
        Animated.timing(flashOpacity, { toValue: 1, duration: 120, useNativeDriver: true }).start();
        flashTimerRef.current = setTimeout(() => {
            Animated.timing(flashOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start();
        }, 800);
    }, [flashOpacity]);

    // Picker data derived from active picker type
    const pickerData = React.useMemo(() => {
        switch (activePicker) {
            case 'machine':
                return { title: 'Machine', items: machineItems, selectedKey: selectedMachineId, searchPlaceholder: 'search machines...' };
            case 'worktree':
                return { title: 'Worktree', fixedItems: WORKTREE_FIXED_ITEMS, items: worktreeItems, selectedKey: worktreeKey, searchPlaceholder: 'search worktrees...' };
            default:
                return null;
        }
    }, [activePicker, machineItems, selectedMachineId, worktreeKey, worktreeItems]);

    const handlePickerSelect = React.useCallback((key: string) => {
        switch (activePicker) {
            case 'machine':
                setSelectedMachineId(key);
                break;
            case 'worktree':
                setWorktreeKey(key);
                break;
        }
        setActivePicker(null);
    }, [activePicker, setSelectedMachineId, setWorktreeKey]);

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

                    const attachments = fileAttachment.attachments;
                    const localId = attachments.length > 0 ? generateLocalMessageId() : undefined;
                    const dedupedNames = dedupeAttachmentNames(attachments.map(file => sanitizeAttachmentName(file.name)));
                    const attachmentRefs = attachments.map((file, index) => ({
                        remotePath: `.happy/attachments/${localId}/${dedupedNames[index]}`,
                        name: dedupedNames[index],
                        size: file.size,
                    }));

                    for (const [index, attachment] of attachments.entries()) {
                        const writeResult = await sessionWriteFile(
                            result.sessionId,
                            attachmentRefs[index].remotePath,
                            attachment.base64,
                            { createParents: true }
                        );

                        if (!writeResult.success) {
                            Modal.alert(t('common.error'), writeResult.error || t('errors.attachmentUploadFailed'), [{ text: t('common.ok') }]);
                            return;
                        }
                    }

                    // Send initial message if provided
                    if (trimmedPrompt || attachmentRefs.length > 0) {
                        const body = buildMessageWithAttachmentRefs(trimmedPrompt, attachmentRefs);
                        await sync.sendMessage(result.sessionId, body, {
                            source: 'new_session',
                            ...(localId ? { localId, attachmentRefs, displayText: trimmedPrompt } : {}),
                        });
                    }

                    // Clear input text only after sendMessage succeeds
                    setPrompt('');
                    fileAttachment.clear();

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
    }, [selectedMachineId, selectedMachine, selectedPath, selectedAgent, prompt, preSendCommand, router, navigateToSession, currentPermission.key, currentModelKey, worktreeKey, setPrompt, fileAttachment]);

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

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? Constants.statusBarHeight + headerHeight : 0}
            style={styles.container}
        >
            <View style={styles.inner}>
                <View style={{ maxWidth: layout.maxWidth, width: '100%', alignSelf: 'center', paddingHorizontal: 12, gap: 8, paddingTop: 12 }}>

                    {/* Config box */}
                    <View style={styles.configBox}>
                        {isConfigExpanded ? (
                            <>
                                {/* Machine row */}
                                <View style={styles.configRowWithToggle}>
                                    <Pressable
                                        style={(p) => [styles.configRow, { flex: 1 }, p.pressed && styles.configRowPressed]}
                                        onPress={() => togglePicker('machine')}
                                    >
                                        <Ionicons name="desktop-outline" size={15} color={theme.colors.textSecondary} />
                                        <Text style={styles.configLabel} numberOfLines={1}>
                                            {machineName}
                                        </Text>
                                    </Pressable>
                                    <Pressable
                                        onPress={toggleConfig}
                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                        style={(p) => [styles.collapseToggle, p.pressed && styles.configRowPressed]}
                                    >
                                        <Ionicons name="chevron-up" size={16} color={theme.colors.textSecondary} />
                                    </Pressable>
                                </View>

                                {/* Offline help section — right under machine */}
                                {isOffline && (
                                    <View style={styles.offlineHelp}>
                                        <Ionicons name="cloud-offline-outline" size={14} color={theme.colors.status.disconnected} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.offlineHelpTitle, { color: theme.colors.status.disconnected }]}>
                                                {t('newSession.machineOffline')}
                                            </Text>
                                            <Text style={[styles.offlineHelpText, { color: theme.colors.textSecondary }]}>
                                                {t('machine.offlineHelp')}
                                                {'\n'}{t('newSession.switchMachinesHint')}
                                            </Text>
                                        </View>
                                    </View>
                                )}

                                {/* Config rows below machine — grayed out when offline */}
                                <View style={{ opacity: isOffline ? 0.4 : 1 }} pointerEvents={isOffline ? 'none' : 'auto'}>
                                    {/* Path row */}
                                    <Pressable
                                        style={(p) => [styles.configRow, p.pressed && styles.configRowPressed]}
                                        onPress={() => togglePicker('path')}
                                    >
                                        <Ionicons name="folder-outline" size={15} color={theme.colors.textSecondary} />
                                        <Text style={styles.configLabel} numberOfLines={1}>
                                            {pathName}
                                        </Text>
                                    </Pressable>

                                    {/* Agent + model + effort row */}
                                    <View style={styles.configRow}>
                                        <Pressable
                                            onPress={cycleAgent}
                                            style={(p) => [{ flexDirection: 'row', alignItems: 'center', gap: 8 }, p.pressed && styles.configRowPressed]}
                                        >
                                            <RNImage
                                                source={agentIcons[agent.key]}
                                                style={[styles.agentIcon, { tintColor: theme.colors.textSecondary }]}
                                                resizeMode="contain"
                                            />
                                            <Text style={styles.configLabel} numberOfLines={1}>
                                                {agent.label}
                                            </Text>
                                        </Pressable>

                                        {showModel && (
                                            <>
                                                <Text style={[styles.configLabel, { color: theme.colors.textSecondary }]}>·</Text>
                                                <Pressable onPress={cycleModel} style={(p) => [p.pressed && styles.configRowPressed]}>
                                                    <Text style={[styles.configLabel, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                                                        {currentModel.name}
                                                    </Text>
                                                </Pressable>
                                            </>
                                        )}

                                        {showEffort && (
                                            <>
                                                <Text style={[styles.configLabel, { color: theme.colors.textSecondary }]}>·</Text>
                                                <Pressable onPress={cycleEffort} style={(p) => [p.pressed && styles.configRowPressed]}>
                                                    <Text style={[styles.configLabel, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                                                        {currentEffort?.name}
                                                    </Text>
                                                </Pressable>
                                            </>
                                        )}
                                    </View>

                                    {/* Permission row */}
                                    {showPermission && (
                                        <Pressable
                                            style={(p) => [styles.configRow, p.pressed && styles.configRowPressed]}
                                            onPress={cyclePermission}
                                        >
                                            <Ionicons
                                                name={permissionStyle?.icon ?? 'shield-outline'}
                                                size={15}
                                                color={theme.colors.textSecondary}
                                            />
                                            <Text style={styles.configLabel} numberOfLines={1}>
                                                {currentPermission?.name}
                                            </Text>
                                        </Pressable>
                                    )}

                                    {/* Worktree row */}
                                    {supportsWorktree && (
                                        <Pressable
                                            style={(p) => [styles.configRow, p.pressed && styles.configRowPressed]}
                                            onPress={() => togglePicker('worktree')}
                                        >
                                            <MaterialCommunityIcons name="tree" size={15} color={theme.colors.textSecondary} />
                                            <Text style={styles.configLabel} numberOfLines={1}>
                                                {worktreeLabel}
                                            </Text>
                                        </Pressable>
                                    )}
                                </View>

                            </>
                        ) : (
                            /* Collapsed: path row + icons row + optional offline warning */
                            <>
                                {/* Path row with expand chevron */}
                                <View style={styles.configRowWithToggle}>
                                    <Pressable
                                        style={(p) => [styles.collapsedRow, { flex: 1 }, p.pressed && styles.configRowPressed]}
                                        onPress={() => togglePicker('path')}
                                    >
                                        <Ionicons name="folder-outline" size={15} color={theme.colors.textSecondary} />
                                        <Text style={[styles.configLabel, { flex: 1 }]} numberOfLines={1}>
                                            {pathName}
                                        </Text>
                                    </Pressable>
                                    <Pressable
                                        onPress={toggleConfig}
                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                        style={(p) => [styles.collapseToggle, p.pressed && styles.configRowPressed]}
                                    >
                                        <Ionicons name="chevron-down" size={16} color={theme.colors.textSecondary} />
                                    </Pressable>
                                </View>

                                {/* Tappable icons row: machine, agent, permission, worktree */}
                                <View style={styles.collapsedIconsRow}>
                                    {/* Machine */}
                                    <Pressable
                                        onPress={() => togglePicker('machine')}
                                        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                                        style={(p) => [styles.collapsedIconButton, p.pressed && styles.configRowPressed]}
                                    >
                                        <Ionicons name="desktop-outline" size={14} color={isOffline ? theme.colors.status.disconnected : theme.colors.textSecondary} />
                                    </Pressable>

                                    {/* Agent */}
                                    <Pressable
                                        onPress={() => { cycleAgent(); showFlash(availableAgents[(availableAgents.findIndex(a => a.key === selectedAgent) + 1) % availableAgents.length].label); }}
                                        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                                        style={(p) => [styles.collapsedIconButton, p.pressed && styles.configRowPressed]}
                                    >
                                        <RNImage
                                            source={agentIcons[agent.key]}
                                            style={[styles.collapsedAgentIcon, { tintColor: theme.colors.textSecondary }]}
                                            resizeMode="contain"
                                        />
                                    </Pressable>

                                    {/* Permission */}
                                    {showPermission && (
                                        <Pressable
                                            onPress={() => { cyclePermission(); showFlash(permissionModes[(permissionIndex + 1) % permissionModes.length]?.name ?? 'default'); }}
                                            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                                            style={(p) => [styles.collapsedIconButton, p.pressed && styles.configRowPressed]}
                                        >
                                            <Ionicons
                                                name={permissionStyle?.icon ?? 'shield-outline'}
                                                size={14}
                                                color={permissionStyle?.color ?? theme.colors.textSecondary}
                                            />
                                        </Pressable>
                                    )}

                                    {/* Worktree */}
                                    {supportsWorktree && (
                                        <Pressable
                                            onPress={() => togglePicker('worktree')}
                                            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                                            style={(p) => [styles.collapsedIconButton, p.pressed && styles.configRowPressed]}
                                        >
                                            <MaterialCommunityIcons name="tree" size={14} color={theme.colors.textSecondary} />
                                        </Pressable>
                                    )}
                                </View>

                                {/* Offline warning in collapsed state */}
                                {isOffline && (
                                    <View style={styles.offlineHelp}>
                                        <Ionicons name="cloud-offline-outline" size={14} color={theme.colors.status.disconnected} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.offlineHelpTitle, { color: theme.colors.status.disconnected }]}>
                                                {t('newSession.machineOffline')}
                                            </Text>
                                            <Text style={[styles.offlineHelpText, { color: theme.colors.textSecondary }]}>
                                                {t('machine.offlineHelp')}
                                                {'\n'}{t('newSession.switchMachinesHint')}
                                            </Text>
                                        </View>
                                    </View>
                                )}
                            </>
                        )}
                    </View>

                    {/* Flash label — centered below config box, hidden when picker is open */}
                    {flashText !== '' && !activePicker && (
                        <Animated.View style={[styles.flashLabel, { opacity: flashOpacity }]} pointerEvents="none">
                            <Text style={[styles.flashLabelText, { color: theme.colors.textSecondary }]}>{flashText}</Text>
                        </Animated.View>
                    )}

                    {/* Web: inline popover */}
                    {Platform.OS === 'web' && activePicker && (
                        <View style={[styles.popover, { backgroundColor: theme.colors.header.background }]}>
                            {activePicker === 'path' ? (
                                <PathPickerContent
                                    title="Project"
                                    items={pathItems}
                                    value={selectedPath}
                                    homeDir={selectedHomeDir}
                                    onChangeValue={setSelectedPath}
                                    onDone={() => setActivePicker(null)}
                                />
                            ) : pickerData ? (
                                <PickerContent {...pickerData} onSelect={handlePickerSelect} />
                            ) : null}
                        </View>
                    )}
                </View>

                {/* Web: click-away backdrop */}
                {Platform.OS === 'web' && activePicker && (
                    <Pressable
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: -1 }}
                        onPress={() => setActivePicker(null)}
                    />
                )}

                {/* Spacer */}
                <View style={{ flex: 1 }} />

                <View style={{ maxWidth: layout.maxWidth, width: '100%', alignSelf: 'center', paddingHorizontal: 12, gap: 8 }}>
                    {/* Input box */}
                    <View style={styles.inputBox} testID="new-session-attachment-root" {...(attachmentWeb.rootProps ?? {})}>
                        {Platform.OS === 'web' && attachmentWeb.inputProps
                            ? React.createElement('input', {
                                ...attachmentWeb.inputProps,
                                'aria-label': t('agentInput.attachments.attachButton'),
                                style: { display: 'none' },
                            })
                            : null}
                        <View style={styles.attachmentDropHint}>
                            <Octicons
                                name="paperclip"
                                size={13}
                                color={attachmentWeb.isDragActive ? theme.colors.button.secondary.tint : theme.colors.textSecondary}
                            />
                            <Text style={[
                                styles.attachmentDropHintText,
                                attachmentWeb.isDragActive ? styles.attachmentDropHintActiveText : undefined,
                            ]}>
                                {attachmentWeb.isDragActive ? t('agentInput.attachments.dropActive') : t('agentInput.attachments.dropIdle')}
                            </Text>
                            {Platform.OS === 'web' ? (
                                <Text style={styles.attachmentDropHintText}>{t('agentInput.attachments.pasteHint')}</Text>
                            ) : null}
                        </View>
                        {fileAttachment.attachments.length > 0 && (
                            <View style={styles.attachmentChips}>
                                {fileAttachment.attachments.map((attachment) => (
                                    <AttachmentChip
                                        key={attachment.id}
                                        attachment={attachment}
                                        onRemove={() => fileAttachment.removeAttachment(attachment.id)}
                                        chipStyles={{
                                            chip: styles.attachmentChip,
                                            chipText: styles.attachmentChipText,
                                            chipSize: styles.attachmentChipSize,
                                            chipRemove: styles.attachmentChipRemove,
                                            chipRemovePressed: styles.configRowPressed,
                                        }}
                                    />
                                ))}
                            </View>
                        )}
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
                            <Pressable
                                onPress={() => {
                                    if (attachmentWeb.openFilePicker) {
                                        attachmentWeb.openFilePicker();
                                    } else {
                                        void attachmentWeb.pickFiles?.();
                                    }
                                }}
                                hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
                                accessibilityLabel={t('agentInput.attachments.attachButton')}
                                style={({ pressed }) => [styles.attachButton, pressed ? styles.configRowPressed : undefined]}
                                testID="attachment-open-picker"
                            >
                                <Octicons name="paperclip" size={16} color={theme.colors.textSecondary} />
                            </Pressable>
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
                                    testID="new-session-send"
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

                <View style={{ height: Math.max(16, safeArea.bottom) }} />
            </View>

            {/* Native: picker bottom sheet */}
            {Platform.OS !== 'web' && (
                <BottomSheet
                    visible={!!activePicker}
                    onClose={() => setActivePicker(null)}
                >
                    {activePicker === 'path' ? (
                        <PathPickerContent
                            title="Project"
                            items={pathItems}
                            value={selectedPath}
                            homeDir={selectedHomeDir}
                            onChangeValue={setSelectedPath}
                            onDone={() => setActivePicker(null)}
                        />
                    ) : pickerData ? (
                        <PickerContent {...pickerData} onSelect={handlePickerSelect} />
                    ) : null}
                </BottomSheet>
            )}
        </KeyboardAvoidingView>
    );
}

const WORKTREE_FIXED_ITEMS: PickerItem[] = [
    { key: '__none__', label: 'no worktree' },
    { key: '__new__', label: 'new worktree' },
];

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.header.background,
    },
    inner: {
        flex: 1,
    },
    configBox: {
        backgroundColor: theme.colors.input.background,
        borderRadius: Platform.select({ default: 16, android: 20 }),
        paddingVertical: 4,
        paddingHorizontal: 4,
        overflow: 'hidden',
    },
    popover: {
        borderRadius: 12,
        paddingVertical: 4,
        marginTop: 4,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        ...Platform.select({
            web: {
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.12)',
            },
            default: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.12,
                shadowRadius: 10,
                elevation: 8,
            },
        }),
    },
    configRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 12,
    },
    configRowWithToggle: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    collapseToggle: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    collapsedRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 12,
    },
    collapsedIconsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        paddingHorizontal: 4,
        paddingBottom: 8,
    },
    collapsedIconButton: {
        width: 34,
        height: 28,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    flashLabel: {
        alignSelf: 'center',
        paddingVertical: 4,
    },
    flashLabelText: {
        fontSize: 12,
        ...Typography.default(),
    },
    configRowPressed: {
        opacity: 0.6,
    },
    agentIcon: {
        width: 15,
        height: 15,
    },
    collapsedAgentIcon: {
        width: 14,
        height: 14,
    },
    configLabel: {
        fontSize: 14,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
        ...Platform.select({ web: { userSelect: 'none' } as any, default: {} }),
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
    attachmentDropHint: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 8,
        paddingTop: 6,
    },
    attachmentDropHintText: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        ...Typography.default(),
    },
    attachmentDropHintActiveText: {
        color: theme.colors.button.secondary.tint,
        ...Typography.default('semiBold'),
    },
    attachmentChips: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        paddingHorizontal: 8,
        paddingTop: 6,
    },
    attachmentChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        maxWidth: 220,
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 5,
        backgroundColor: theme.colors.input.background,
    },
    attachmentChipText: {
        flexShrink: 1,
        color: theme.colors.text,
        fontSize: 12,
        ...Typography.default('semiBold'),
    },
    attachmentChipSize: {
        color: theme.colors.textSecondary,
        fontSize: 11,
        ...Typography.default(),
    },
    attachmentChipRemove: {
        width: 18,
        height: 18,
        borderRadius: 9,
        justifyContent: 'center',
        alignItems: 'center',
    },
    attachButton: {
        width: COMPOSER_SEND_BUTTON_SIZE,
        height: COMPOSER_SEND_BUTTON_SIZE,
        borderRadius: COMPOSER_SEND_BUTTON_SIZE / 2,
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
        marginBottom: COMPOSER_SEND_BUTTON_MARGIN_BOTTOM,
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
    offlineHelp: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 12,
    },
    offlineHelpTitle: {
        fontSize: 13,
        ...Typography.default('semiBold'),
        marginBottom: 4,
    },
    offlineHelpText: {
        fontSize: 12,
        lineHeight: 18,
        ...Typography.default(),
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
