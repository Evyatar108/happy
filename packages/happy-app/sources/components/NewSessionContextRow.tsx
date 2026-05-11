import React from 'react';
import { Animated, Image as RNImage, LayoutAnimation, Platform, Pressable, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { t } from '@/text';
import { useAllMachines, useSessions } from '@/sync/storage';
import type { NewSessionAgentType } from '@/sync/persistence';
import type { Machine, Session } from '@/sync/storageTypes';
import { useNewSessionDraft } from '@/hooks/useNewSessionDraft';
import { formatLastSeen, formatPathRelativeToHome } from '@/utils/sessionUtils';
import { resolveAbsolutePath } from '@/utils/pathUtils';
import { isRunningOnMac } from '@/utils/platform';
import { getRepoPath, listWorktrees, type WorktreeInfo } from '@/utils/worktree';
import { isMachineOnline } from '@/utils/machineUtils';
import { newSessionAgentIcons } from './NewSessionAgentIcons';
import {
    getDefaultEffortKeyForModel,
    getDefaultModelKey,
    getDefaultPermissionModeKey,
    getEffortLevelsForModel,
    getSupportsWorktree,
    getHardcodedModelModes,
    getHardcodedPermissionModes,
    type EffortLevel,
    type ModelMode,
    type PermissionMode,
} from '@/components/modelModeOptions';
import { PathPickerContent, PickerContent, type PickerItem } from '@/components/pickers';

type AgentKey = NewSessionAgentType;

const ALL_AGENTS: { key: AgentKey; label: string }[] = [
    { key: 'claude', label: 'claude code' },
    { key: 'codex', label: 'codex' },
    { key: 'openclaw', label: 'openclaw' },
    { key: 'gemini', label: 'gemini' },
];

type PickerType = 'machine' | 'path' | 'worktree';
type PermissionStyle = { color: string; icon: 'play-forward' | 'pause' };

const WORKTREE_PATH_DEBOUNCE_MS = 300;

const WORKTREE_FIXED_ITEMS: PickerItem[] = [
    { key: '__none__', label: 'no worktree' },
    { key: '__new__', label: 'new worktree' },
];

export type NewSessionContextSlots = {
    machineChip: React.ReactNode;
    pathChip: React.ReactNode;
    worktreeSelector: React.ReactNode;
    agentPicker: React.ReactNode;
};

type NewSessionContextRowRenderState = {
    activePicker: PickerType | null;
    agent: { key: AgentKey; label: string };
    availableAgents: { key: AgentKey; label: string }[];
    currentEffort: EffortLevel | undefined;
    currentModel: ModelMode | undefined;
    currentPermission: PermissionMode;
    effortLevels: EffortLevel[];
    modelModes: ModelMode[];
    cycleAgent: () => void;
    cycleEffort: () => void;
    cycleModel: () => void;
    cyclePermission: () => void;
    flashOpacity: Animated.Value;
    flashText: string;
    isConfigExpanded: boolean;
    isOffline: boolean;
    permissionIndex: number;
    permissionModes: PermissionMode[];
    permissionStyle: PermissionStyle | null;
    renderPickerContent: (autoFocusSearch?: boolean) => React.ReactNode;
    selectEffort: (level: EffortLevel) => void;
    selectModel: (mode: ModelMode) => void;
    selectPermission: (mode: PermissionMode) => void;
    showEffort: boolean;
    showFlash: (text: string) => void;
    showModel: boolean;
    showPermission: boolean;
    slots: NewSessionContextSlots;
    supportsWorktree: boolean;
    theme: ReturnType<typeof useUnistyles>['theme'];
    toggleConfig: () => void;
    togglePicker: (type: PickerType) => void;
};

export type NewSessionContextRowController = {
    selectedMachineId: string | null;
    selectedMachine: Machine | null;
    selectedPath: string | null;
    selectedAgent: NewSessionAgentType;
    currentPermission: PermissionMode;
    currentModel: ModelMode | undefined;
    currentModelKey: string;
    currentEffort: EffortLevel | undefined;
    worktreeKey: string;
    activePicker: PickerType | null;
    closePicker: () => void;
    renderPickerContent: (autoFocusSearch?: boolean) => React.ReactNode;
    slots: NewSessionContextSlots;
    renderState: NewSessionContextRowRenderState;
};

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

function getMachineName(machine: Machine): string {
    return machine.metadata?.displayName || machine.metadata?.host || 'unknown';
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

export function buildWorktreePickerItems(worktrees: WorktreeInfo[], homeDir?: string): PickerItem[] {
    const groups = new Map<string, WorktreeInfo[]>();
    for (const worktree of worktrees) {
        const repoPath = getRepoPath(worktree.path);
        const group = groups.get(repoPath) ?? [];
        group.push(worktree);
        groups.set(repoPath, group);
    }

    return Array.from(groups.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .flatMap(([repoPath, items]) => [
            {
                key: `repo:${repoPath}`,
                label: formatPathRelativeToHome(repoPath, homeDir),
                dimmed: true,
                disabled: true,
            },
            ...items
                .slice()
                .sort((a, b) => a.branch.localeCompare(b.branch))
                .map((worktree) => ({
                    key: worktree.path,
                    label: worktree.branch,
                    subtitle: worktree.path,
                })),
        ]);
}

export function useNewSessionContextRowController({
    onOpenPicker,
    onClosePicker,
}: {
    onOpenPicker?: (picker: PickerType) => void;
    onClosePicker?: () => void;
} = {}): NewSessionContextRowController {
    const { theme } = useUnistyles();
    const allMachines = useAllMachines({ includeOffline: true });
    const sessions = useSessions();
    const draft = useNewSessionDraft();

    const selectedAgent = draft.agentType;
    const setSelectedAgent = draft.setAgentType;
    const selectedMachineId = draft.selectedMachineId;
    const setSelectedMachineId = draft.setMachineId;
    const selectedPath = draft.selectedPath;
    const setSelectedPath = draft.setPath;
    const [worktreeKey, setWorktreeKey] = React.useState<string>(
        draft.worktreeKey ?? (draft.sessionType === 'worktree' ? '__new__' : '__none__')
    );
    const [permissionIndex, setPermissionIndex] = React.useState(0);
    const [modelIndex, setModelIndex] = React.useState(0);
    const [effortIndex, setEffortIndex] = React.useState(0);
    const [activePicker, setActivePicker] = React.useState<PickerType | null>(null);
    const [isConfigExpanded, setIsConfigExpanded] = React.useState(true);
    const flashOpacity = React.useRef(new Animated.Value(0)).current;
    const [flashText, setFlashText] = React.useState('');
    const flashTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    React.useEffect(() => {
        draft.setSessionType(worktreeKey !== '__none__' ? 'worktree' : 'simple');
        draft.setWorktreeKey(worktreeKey === '__none__' || worktreeKey === '__new__' ? null : worktreeKey);
    }, [draft, worktreeKey]);

    React.useEffect(() => {
        if (selectedMachineId) return;
        if (allMachines.length > 0) {
            setSelectedMachineId(allMachines[0].id);
        }
    }, [allMachines, selectedMachineId, setSelectedMachineId]);

    const selectedMachine = React.useMemo(
        () => allMachines.find(m => m.id === selectedMachineId) ?? null,
        [allMachines, selectedMachineId],
    );
    const selectedHomeDir = selectedMachine?.metadata?.homeDir;

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
        return Array.from(paths).sort().map(p => ({
            key: p,
            label: formatPathRelativeToHome(p, selectedHomeDir),
        }));
    }, [selectedMachineId, sessions, selectedHomeDir]);

    React.useEffect(() => {
        if (!selectedMachineId || selectedPath !== null) {
            return;
        }

        setSelectedPath(pathItems[0]?.label ?? '~');
    }, [pathItems, selectedMachineId, selectedPath, setSelectedPath]);

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
            setWorktreeItems(buildWorktreePickerItems(worktrees, selectedHomeDir));
        });
        return () => { cancelled = true; };
    }, [debouncedResolvedSelectedPath, selectedHomeDir, selectedMachineId, selectedMachine]);

    React.useEffect(() => {
        if (worktreeKey === '__none__' || worktreeKey === '__new__') {
            return;
        }

        if (!worktreeItems.some((item) => !item.disabled && item.key === worktreeKey)) {
            setWorktreeKey('__none__');
        }
    }, [worktreeItems, worktreeKey]);

    const availableAgents = React.useMemo(() => {
        const availability = selectedMachine?.metadata?.cliAvailability;
        if (!availability) return ALL_AGENTS;
        return ALL_AGENTS.filter(a => availability[a.key]);
    }, [selectedMachine]);

    React.useEffect(() => {
        if (availableAgents.length > 0 && !availableAgents.find(a => a.key === selectedAgent)) {
            setSelectedAgent(availableAgents[0].key);
        }
    }, [availableAgents, selectedAgent, setSelectedAgent]);

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

    React.useEffect(() => {
        const draftPermIdx = permissionModes.findIndex(m => m.key === draft.permissionMode);
        const defaultPermIdx = permissionModes.findIndex(m => m.key === getDefaultPermissionModeKey(selectedAgent));
        setPermissionIndex(draftPermIdx >= 0 ? draftPermIdx : (defaultPermIdx >= 0 ? defaultPermIdx : 0));

        const draftModelIdx = modelModes.findIndex(m => m.key === draft.modelMode);
        const defaultModelIdx = modelModes.findIndex(m => m.key === getDefaultModelKey(selectedAgent));
        setModelIndex(draftModelIdx >= 0 ? draftModelIdx : (defaultModelIdx >= 0 ? defaultModelIdx : 0));

        if (!supportsWorktree) setWorktreeKey('__none__');
    }, [draft.modelMode, draft.permissionMode, modelModes, permissionModes, selectedAgent, supportsWorktree]);

    React.useEffect(() => {
        const defaultEffort = getDefaultEffortKeyForModel(selectedAgent, currentModelKey);
        if (defaultEffort && effortLevels.length > 0) {
            const idx = effortLevels.findIndex(e => e.key === defaultEffort);
            setEffortIndex(idx >= 0 ? idx : effortLevels.length - 1);
        } else {
            setEffortIndex(0);
        }
    }, [selectedAgent, currentModelKey, effortLevels]);

    const hasCollapsedOnceRef = React.useRef(false);
    const isInitialRef = React.useRef(true);
    const isDesktop = Platform.OS === 'web' || isRunningOnMac();
    React.useEffect(() => {
        if (isInitialRef.current) {
            isInitialRef.current = false;
            return;
        }
        if (isDesktop) return;
        if (draft.input.trim().length > 0 && !hasCollapsedOnceRef.current) {
            hasCollapsedOnceRef.current = true;
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setIsConfigExpanded(false);
        }
    }, [draft.input, isDesktop]);

    const toggleConfig = React.useCallback(() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setIsConfigExpanded(v => !v);
    }, []);

    const closePicker = React.useCallback(() => {
        setActivePicker(null);
        onClosePicker?.();
    }, [onClosePicker]);

    const togglePicker = React.useCallback((type: PickerType) => {
        setActivePicker(v => {
            const next = v === type ? null : type;
            if (next) {
                onOpenPicker?.(next);
            } else {
                onClosePicker?.();
            }
            return next;
        });
    }, [onClosePicker, onOpenPicker]);

    const cyclePermission = React.useCallback(() => {
        setPermissionIndex(i => {
            const next = (i + 1) % permissionModes.length;
            draft.setPermissionMode(permissionModes[next]?.key ?? 'default');
            return next;
        });
    }, [draft, permissionModes]);

    const cycleModel = React.useCallback(() => {
        setModelIndex(i => {
            const next = (i + 1) % modelModes.length;
            draft.setModelMode(modelModes[next]?.key ?? 'default');
            return next;
        });
    }, [draft, modelModes]);

    const cycleEffort = React.useCallback(() => {
        setEffortIndex(i => (i + 1) % effortLevels.length);
    }, [effortLevels.length]);

    const cycleAgent = React.useCallback(() => {
        const idx = availableAgents.findIndex(a => a.key === selectedAgent);
        const next = availableAgents[(idx + 1) % availableAgents.length].key;
        setSelectedAgent(next);
    }, [availableAgents, selectedAgent, setSelectedAgent]);

    const selectPermission = React.useCallback((mode: PermissionMode) => {
        const nextIndex = permissionModes.findIndex(candidate => candidate.key === mode.key);
        setPermissionIndex(nextIndex >= 0 ? nextIndex : 0);
        draft.setPermissionMode(mode.key ?? 'default');
    }, [draft, permissionModes]);

    const selectModel = React.useCallback((mode: ModelMode) => {
        const nextIndex = modelModes.findIndex(candidate => candidate.key === mode.key);
        setModelIndex(nextIndex >= 0 ? nextIndex : 0);
        draft.setModelMode(mode.key ?? 'default');
    }, [draft, modelModes]);

    const selectEffort = React.useCallback((level: EffortLevel) => {
        const nextIndex = effortLevels.findIndex(candidate => candidate.key === level.key);
        setEffortIndex(nextIndex >= 0 ? nextIndex : 0);
    }, [effortLevels]);

    const isOffline = selectedMachine ? !isMachineOnline(selectedMachine) : false;
    const agent = availableAgents.find(a => a.key === selectedAgent) ?? ALL_AGENTS[0];
    const currentPermission = permissionModes[permissionIndex] ?? permissionModes[0];
    const currentEffort = effortLevels[effortIndex] ?? effortLevels[0];
    const permissionStyle = currentPermission?.key !== 'default' ? getPermissionStyle(currentPermission.key) : null;
    const machineName = selectedMachine ? getMachineName(selectedMachine) : 'Select machine';
    const pathName = trimPathInput(selectedPath)
        ? formatPathRelativeToHome(trimPathInput(selectedPath), selectedHomeDir)
        : '~';
    const worktreeLabel = worktreeKey === '__none__'
        ? 'no worktree'
        : worktreeKey === '__new__'
            ? 'new worktree'
            : worktreeItems.find(wt => wt.key === worktreeKey)?.label || worktreeKey;

    const showFlash = React.useCallback((text: string) => {
        if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
        setFlashText(text);
        flashOpacity.setValue(0);
        Animated.timing(flashOpacity, { toValue: 1, duration: 120, useNativeDriver: true }).start();
        flashTimerRef.current = setTimeout(() => {
            Animated.timing(flashOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start();
        }, 800);
    }, [flashOpacity]);

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
        closePicker();
    }, [activePicker, closePicker, setSelectedMachineId]);

    const renderPickerContent = React.useCallback((autoFocusSearch?: boolean) => {
        if (activePicker === 'path') {
            return (
                <PathPickerContent
                    title="Project"
                    items={pathItems}
                    value={selectedPath}
                    homeDir={selectedHomeDir}
                    onChangeValue={setSelectedPath}
                    onDone={closePicker}
                />
            );
        }
        if (pickerData) {
            return <PickerContent {...pickerData} onSelect={handlePickerSelect} autoFocusSearch={autoFocusSearch} />;
        }
        return null;
    }, [activePicker, closePicker, handlePickerSelect, pathItems, pickerData, selectedHomeDir, selectedPath, setSelectedPath]);

    const slots = React.useMemo<NewSessionContextSlots>(() => ({
        machineChip: (
            <Pressable
                testID="newSession.row.machine"
                style={(p) => [styles.configRow, { flex: 1 }, p.pressed && styles.configRowPressed]}
                onPress={() => togglePicker('machine')}
            >
                <Ionicons name="desktop-outline" size={15} color={theme.colors.textSecondary} />
                <Text testID="composer.target.machine" style={styles.configLabel} numberOfLines={1}>{machineName}</Text>
            </Pressable>
        ),
        pathChip: (
            <Pressable
                testID="newSession.row.path"
                style={(p) => [styles.configRow, p.pressed && styles.configRowPressed]}
                onPress={() => togglePicker('path')}
            >
                <Ionicons name="folder-outline" size={15} color={theme.colors.textSecondary} />
                <Text testID="composer.target.project" style={styles.configLabel} numberOfLines={1}>{pathName}</Text>
            </Pressable>
        ),
        worktreeSelector: supportsWorktree ? (
            <Pressable
                testID="newSession.row.worktree"
                style={(p) => [styles.configRow, p.pressed && styles.configRowPressed]}
                onPress={() => togglePicker('worktree')}
            >
                <MaterialCommunityIcons name="tree" size={15} color={theme.colors.textSecondary} />
                <Text testID="composer.target.worktree" style={styles.configLabel} numberOfLines={1}>{worktreeLabel}</Text>
            </Pressable>
        ) : null,
        agentPicker: (
            <Pressable
                testID="newSession.row.agent"
                onPress={cycleAgent}
                style={(p) => [{ flexDirection: 'row', alignItems: 'center', gap: 8 }, p.pressed && styles.configRowPressed]}
            >
                <RNImage
                    source={newSessionAgentIcons[agent.key]}
                    style={[styles.agentIcon, { tintColor: theme.colors.textSecondary }]}
                    resizeMode="contain"
                />
                <Text style={styles.configLabel} numberOfLines={1}>{agent.label}</Text>
            </Pressable>
        ),
    }), [agent.key, agent.label, cycleAgent, machineName, pathName, supportsWorktree, theme.colors.textSecondary, togglePicker, worktreeLabel]);

    return React.useMemo<NewSessionContextRowController>(() => ({
        selectedMachineId,
        selectedMachine,
        selectedPath,
        selectedAgent,
        currentPermission,
        currentModel,
        currentModelKey,
        currentEffort,
        worktreeKey,
        activePicker,
        closePicker,
        renderPickerContent,
        slots,
        renderState: {
            activePicker,
            agent,
            availableAgents,
            currentEffort,
            currentModel,
            currentPermission,
            effortLevels,
            modelModes,
            cycleAgent,
            cycleEffort,
            cycleModel,
            cyclePermission,
            flashOpacity,
            flashText,
            isConfigExpanded,
            isOffline,
            permissionIndex,
            permissionModes,
            permissionStyle,
            renderPickerContent,
            selectEffort,
            selectModel,
            selectPermission,
            showEffort,
            showFlash,
            showModel,
            showPermission,
            slots,
            supportsWorktree,
            theme,
            toggleConfig,
            togglePicker,
        },
    }), [activePicker, agent, availableAgents, closePicker, currentEffort, currentModel, currentModelKey, currentPermission, cycleAgent, cycleEffort, cycleModel, cyclePermission, effortLevels, flashOpacity, flashText, isConfigExpanded, isOffline, modelModes, permissionIndex, permissionModes, permissionStyle, renderPickerContent, selectEffort, selectModel, selectPermission, selectedAgent, selectedMachine, selectedMachineId, selectedPath, showEffort, showFlash, showModel, showPermission, slots, supportsWorktree, theme, toggleConfig, togglePicker, worktreeKey]);
}

export function NewSessionContextRow({ controller }: { controller: NewSessionContextRowController }) {
    const state = controller.renderState;
    const {
        activePicker,
        agent,
        availableAgents,
        currentEffort,
        currentModel,
        currentPermission,
        cycleEffort,
        cycleModel,
        cyclePermission,
        flashOpacity,
        flashText,
        isConfigExpanded,
        isOffline,
        permissionIndex,
        permissionModes,
        permissionStyle,
        renderPickerContent,
        showEffort,
        showFlash,
        showModel,
        showPermission,
        slots,
        supportsWorktree,
        theme,
        toggleConfig,
        togglePicker,
    } = state;

    return (
        <>
            <View style={styles.configBox}>
                {isConfigExpanded ? (
                    <>
                        <View style={styles.configRowWithToggle}>
                            {slots.machineChip}
                            <Pressable
                                onPress={toggleConfig}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                style={(p) => [styles.collapseToggle, p.pressed && styles.configRowPressed]}
                            >
                                <Ionicons name="chevron-up" size={16} color={theme.colors.textSecondary} />
                            </Pressable>
                        </View>

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

                        <View style={{ opacity: isOffline ? 0.4 : 1 }} pointerEvents={isOffline ? 'none' : 'auto'}>
                            {slots.pathChip}

                            <View style={styles.configRow}>
                                {slots.agentPicker}

                                {showModel && currentModel && (
                                    <>
                                        <Text style={[styles.configLabel, { color: theme.colors.textSecondary }]}>·</Text>
                                        <Pressable onPress={cycleModel} style={(p) => [p.pressed && styles.configRowPressed]}>
                                            <Text style={[styles.configLabel, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                                                {currentModel.name}
                                            </Text>
                                        </Pressable>
                                    </>
                                )}

                                {showEffort && currentEffort && (
                                    <>
                                        <Text style={[styles.configLabel, { color: theme.colors.textSecondary }]}>·</Text>
                                        <Pressable onPress={cycleEffort} style={(p) => [p.pressed && styles.configRowPressed]}>
                                            <Text style={[styles.configLabel, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                                                {currentEffort.name}
                                            </Text>
                                        </Pressable>
                                    </>
                                )}
                            </View>

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

                            {slots.worktreeSelector}
                        </View>
                    </>
                ) : (
                    <>
                        <View style={styles.configRowWithToggle}>
                            {React.isValidElement(slots.pathChip)
                                ? React.cloneElement(slots.pathChip, {
                                    style: (p: { pressed: boolean }) => [styles.collapsedRow, { flex: 1 }, p.pressed && styles.configRowPressed],
                                } as Record<string, unknown>)
                                : slots.pathChip}
                            <Pressable
                                onPress={toggleConfig}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                style={(p) => [styles.collapseToggle, p.pressed && styles.configRowPressed]}
                            >
                                <Ionicons name="chevron-down" size={16} color={theme.colors.textSecondary} />
                            </Pressable>
                        </View>

                        <View style={styles.collapsedIconsRow}>
                            <Pressable
                                onPress={() => togglePicker('machine')}
                                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                                style={(p) => [styles.collapsedIconButton, p.pressed && styles.configRowPressed]}
                            >
                                <Ionicons name="desktop-outline" size={14} color={isOffline ? theme.colors.status.disconnected : theme.colors.textSecondary} />
                            </Pressable>

                            <Pressable
                                onPress={() => { state.cycleAgent(); showFlash(availableAgents[(availableAgents.findIndex(a => a.key === agent.key) + 1) % availableAgents.length].label); }}
                                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                                style={(p) => [styles.collapsedIconButton, p.pressed && styles.configRowPressed]}
                            >
                                <RNImage
                                    source={newSessionAgentIcons[agent.key]}
                                    style={[styles.collapsedAgentIcon, { tintColor: theme.colors.textSecondary }]}
                                    resizeMode="contain"
                                />
                            </Pressable>

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

            {flashText !== '' && !activePicker && (
                <Animated.View style={[styles.flashLabel, { opacity: flashOpacity }]} pointerEvents="none">
                    <Text style={[styles.flashLabelText, { color: theme.colors.textSecondary }]}>{flashText}</Text>
                </Animated.View>
            )}

            {Platform.OS === 'web' && activePicker && (
                <View style={[styles.popover, { backgroundColor: theme.colors.header.background }]}>
                    {renderPickerContent(true)}
                </View>
            )}
        </>
    );
}

const styles = StyleSheet.create((theme) => ({
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
