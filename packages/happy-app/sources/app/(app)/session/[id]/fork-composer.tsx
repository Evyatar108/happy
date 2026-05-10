import React from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons, Octicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { layout } from '@/components/layout';
import { PickerContent, type PickerItem } from '@/components/pickers';
import { Typography } from '@/constants/Typography';
import { useNavigateToSession } from '@/hooks/useNavigateToSession';
import { Modal } from '@/modal';
import { compositeSessionId, parseCompositeSessionId } from '@/sync/machineSessionId';
import { machineForkSession } from '@/sync/ops';
import { sync } from '@/sync/sync';
import { useAllMachines, useSession } from '@/sync/storage';
import type { Machine, Session } from '@/sync/storageTypes';
import { t } from '@/text';
import {
    findOptionByKey,
    getAvailableModels,
    getAvailablePermissionModes,
    getDefaultEffortKeyForModel,
    getEffortLevelsForModel,
    resolveCurrentOption,
    resolvePermissionModeForPicker,
    type EffortLevel,
    type ModelMode,
    type PermissionMode,
} from '@/components/modelModeOptions';
import { formatPathRelativeToHome, getSessionName } from '@/utils/sessionUtils';
import { forkAvailability } from '@/utils/forkAvailability';
import { createWorktree, getRepoPath, listWorktrees } from '@/utils/worktree';

type PickerType = 'worktree' | 'model' | 'permission' | 'effort';

const CREATE_WORKTREE_KEY = '__create_worktree__';

function getMachineName(machine: Machine | null): string {
    return machine?.metadata?.displayName || machine?.metadata?.host || 'unknown';
}

function optionItems(options: Array<ModelMode | PermissionMode | EffortLevel>): PickerItem[] {
    return options.map((option) => ({
        key: option.key,
        label: option.name,
        subtitle: option.description ?? undefined,
    }));
}

function resolveMachine(sessionId: string, session: Session | null, machines: Machine[]): { machineId: string; machine: Machine | null } {
    const fallbackMachineId = session?.metadata?.machineId ?? '';
    const { machineId } = parseCompositeSessionId(sessionId, fallbackMachineId);
    return {
        machineId,
        machine: machines.find((candidate) => candidate.id === machineId) ?? null,
    };
}

export function ForkComposerScreen() {
    const { theme } = useUnistyles();
    const router = useRouter();
    const navigateToSession = useNavigateToSession();
    const params = useLocalSearchParams<{ id?: string | string[] }>();
    const sessionId = Array.isArray(params.id) ? params.id[0] : params.id;
    const session = useSession(sessionId ?? '');
    const machines = useAllMachines({ includeOffline: true });
    const { machineId, machine } = React.useMemo(
        () => resolveMachine(sessionId ?? '', session, machines),
        [machines, session, sessionId],
    );

    const parentPath = session?.metadata?.path ?? '';
    const basePath = React.useMemo(() => parentPath ? getRepoPath(parentPath) : '', [parentPath]);
    const homeDir = machine?.metadata?.homeDir;
    const parentLabel = session ? getSessionName(session) : '';
    const [selectedWorktreeKey, setSelectedWorktreeKey] = React.useState<string | null>(null);
    const [selectedModelKey, setSelectedModelKey] = React.useState<string | null>(null);
    const [selectedPermissionKey, setSelectedPermissionKey] = React.useState<string | null>(null);
    const [selectedEffortKey, setSelectedEffortKey] = React.useState<string | null>(null);
    const [activePicker, setActivePicker] = React.useState<PickerType | null>(null);
    const [worktreeItems, setWorktreeItems] = React.useState<PickerItem[]>([]);
    const [isForking, setIsForking] = React.useState(false);

    React.useEffect(() => {
        setSelectedWorktreeKey(parentPath || null);
    }, [parentPath]);

    React.useEffect(() => {
        if (!machineId || !basePath) {
            setWorktreeItems([]);
            return;
        }

        let cancelled = false;
        listWorktrees(machineId, basePath)
            .then((worktrees) => {
                if (cancelled) return;
                setWorktreeItems(worktrees.map((worktree) => ({
                    key: worktree.path,
                    label: worktree.branch,
                    subtitle: worktree.path,
                })));
            })
            .catch(() => {
                if (!cancelled) setWorktreeItems([]);
            });

        return () => { cancelled = true; };
    }, [basePath, machineId]);

    const modelOptions = React.useMemo(() => getAvailableModels('codex', session?.metadata, t), [session?.metadata]);
    const currentModel = React.useMemo(() => {
        return resolveCurrentOption(modelOptions, [
            selectedModelKey,
            session?.modelMode,
            session?.metadata?.currentModelCode,
            'default',
        ]) ?? modelOptions[0] ?? null;
    }, [modelOptions, selectedModelKey, session?.metadata?.currentModelCode, session?.modelMode]);
    const permissionOptions = React.useMemo(() => getAvailablePermissionModes('codex', session?.metadata, t), [session?.metadata]);
    const currentPermission = React.useMemo(() => {
        return findOptionByKey(permissionOptions, selectedPermissionKey) ?? resolvePermissionModeForPicker(permissionOptions, {
            userChosen: session?.permissionModeUserChosen ?? false,
            sessionPermissionMode: session?.permissionMode,
            metadataCurrentPermissionModeCode: session?.metadata?.currentPermissionModeCode,
            metadataDangerouslySkipPermissions: session?.metadata?.dangerouslySkipPermissions,
            flavor: 'codex',
        }) ?? permissionOptions[0] ?? null;
    }, [permissionOptions, selectedPermissionKey, session?.metadata?.currentPermissionModeCode, session?.metadata?.dangerouslySkipPermissions, session?.permissionMode, session?.permissionModeUserChosen]);
    const effortOptions = React.useMemo(() => getEffortLevelsForModel('codex', currentModel?.key ?? 'default'), [currentModel?.key]);
    const currentEffort = React.useMemo(() => {
        return resolveCurrentOption(effortOptions, [
            selectedEffortKey,
            session?.effortLevel,
            session?.metadata?.currentThoughtLevelCode,
            getDefaultEffortKeyForModel('codex', currentModel?.key ?? 'default'),
        ]) ?? effortOptions[0] ?? null;
    }, [currentModel?.key, effortOptions, selectedEffortKey, session?.effortLevel, session?.metadata?.currentThoughtLevelCode]);

    const selectedWorktreeLabel = selectedWorktreeKey === CREATE_WORKTREE_KEY
        ? t('forkComposer.createNew')
        : formatPathRelativeToHome(selectedWorktreeKey ?? parentPath, homeDir);

    const pickerData = React.useMemo(() => {
        switch (activePicker) {
            case 'worktree':
                return {
                    title: t('forkComposer.worktree'),
                    fixedItems: [
                        { key: parentPath, label: t('forkComposer.currentCheckout'), subtitle: parentPath },
                        { key: CREATE_WORKTREE_KEY, label: t('forkComposer.createNew'), subtitle: basePath },
                    ].filter((item) => item.key),
                    items: worktreeItems.filter((item) => item.key !== parentPath),
                    selectedKey: selectedWorktreeKey,
                    searchPlaceholder: t('forkComposer.searchWorktrees'),
                };
            case 'model':
                return { title: t('agentInput.model.title'), items: optionItems(modelOptions), selectedKey: currentModel?.key ?? null, searchPlaceholder: t('forkComposer.searchModels') };
            case 'permission':
                return { title: t('agentInput.permissionMode.title'), items: optionItems(permissionOptions), selectedKey: currentPermission?.key ?? null, searchPlaceholder: t('forkComposer.searchPermissions') };
            case 'effort':
                return { title: t('agentInput.effort.title'), items: optionItems(effortOptions), selectedKey: currentEffort?.key ?? null, searchPlaceholder: t('forkComposer.searchEffort') };
            default:
                return null;
        }
    }, [activePicker, basePath, currentEffort?.key, currentModel?.key, currentPermission?.key, effortOptions, modelOptions, parentPath, permissionOptions, selectedWorktreeKey, worktreeItems]);

    const handlePickerSelect = React.useCallback((key: string) => {
        switch (activePicker) {
            case 'worktree':
                setSelectedWorktreeKey(key);
                break;
            case 'model':
                setSelectedModelKey(key);
                setSelectedEffortKey(null);
                break;
            case 'permission':
                setSelectedPermissionKey(key);
                break;
            case 'effort':
                setSelectedEffortKey(key);
                break;
        }
        setActivePicker(null);
    }, [activePicker]);

    const handleSubmit = React.useCallback(async () => {
        if (!sessionId || !session || !machineId || !parentPath) {
            Modal.alert(t('common.error'), t('forkComposer.errors.parentMissing'));
            return;
        }

        if (!forkAvailability(session, machine)) {
            Modal.alert(t('common.error'), t('forkComposer.errors.flavorUnsupported'));
            return;
        }

        setIsForking(true);
        try {
            let worktreePath = selectedWorktreeKey ?? parentPath;
            if (worktreePath === CREATE_WORKTREE_KEY) {
                const worktreeResult = await createWorktree(machineId, basePath);
                if (!worktreeResult.success) {
                    Modal.alert(t('common.error'), worktreeResult.error || t('forkComposer.errors.createWorktreeFailed'));
                    return;
                }
                worktreePath = worktreeResult.worktreePath;
            }

            const result = await machineForkSession({
                machineId,
                parentSessionId: sessionId,
                worktreePath,
                model: currentModel?.key,
                permissionMode: currentPermission?.key,
                effortLevel: currentEffort?.key,
            });

            switch (result.type) {
                case 'success':
                    await sync.refreshSessions();
                    router.back();
                    navigateToSession(compositeSessionId(machineId, result.sessionId));
                    break;
                case 'requestToApproveDirectoryCreation':
                    Modal.alert(t('common.error'), t('forkComposer.errors.worktreeMissing', { directory: result.directory }));
                    break;
                case 'error':
                    Modal.alert(t('common.error'), result.errorMessage);
                    break;
            }
        } catch (error) {
            Modal.alert(t('common.error'), error instanceof Error ? error.message : t('forkComposer.errors.forkFailed'));
        } finally {
            setIsForking(false);
        }
    }, [basePath, currentEffort?.key, currentModel?.key, currentPermission?.key, machine, machineId, navigateToSession, parentPath, router, selectedWorktreeKey, session, sessionId]);

    const canSubmit = !!session && !!machineId && !!parentPath && !isForking;

    return (
        <View style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                <View style={styles.content}>
                    <Text style={styles.title}>{t('forkComposer.title')}</Text>

                    {/* Reuse the compact ContextChip shape instead of adding a separate pill component. */}
                    <View style={styles.parentPill}>
                        <Ionicons name="git-branch-outline" size={16} color={theme.colors.textSecondary} />
                        <Text style={styles.parentPillText} numberOfLines={1}>{t('forkComposer.parentLabel', { name: parentLabel })}</Text>
                    </View>

                    <View style={styles.panel}>
                        <InfoRow icon="desktop-outline" label={t('forkComposer.machine')} value={getMachineName(machine)} />
                        <InfoRow icon="code-slash-outline" label={t('forkComposer.agent')} value={t('forkComposer.codex')} />
                        <PickerRow icon="folder-open-outline" label={t('forkComposer.worktree')} value={selectedWorktreeLabel} onPress={() => setActivePicker('worktree')} />
                        <PickerRow icon="cube-outline" label={t('agentInput.model.title')} value={currentModel?.name ?? t('forkComposer.defaultModel')} onPress={() => setActivePicker('model')} />
                        <PickerRow icon="shield-outline" label={t('agentInput.permissionMode.title')} value={currentPermission?.name ?? t('forkComposer.defaultPermission')} onPress={() => setActivePicker('permission')} />
                        {effortOptions.length > 0 && (
                            <PickerRow icon="speedometer-outline" label={t('agentInput.effort.title')} value={currentEffort?.name ?? t('forkComposer.defaultEffort')} onPress={() => setActivePicker('effort')} />
                        )}
                    </View>

                    {pickerData && (
                        <View style={styles.pickerPanel}>
                            <PickerContent {...pickerData} onSelect={handlePickerSelect} />
                        </View>
                    )}
                </View>
            </ScrollView>

            <View style={styles.footer}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={isForking ? t('forkComposer.creatingWorktree') : t('forkComposer.submit')}
                    disabled={!canSubmit}
                    onPress={handleSubmit}
                    style={({ pressed }) => [
                        styles.submitButton,
                        !canSubmit && styles.submitButtonDisabled,
                        pressed && styles.submitButtonPressed,
                    ]}
                >
                    {isForking ? (
                        <ActivityIndicator size="small" color={theme.colors.button.primary.tint} />
                    ) : (
                        <>
                            <Octicons name="git-branch" size={16} color={theme.colors.button.primary.tint} />
                            <Text style={styles.submitButtonText}>{t('forkComposer.submit')}</Text>
                        </>
                    )}
                </Pressable>
            </View>
        </View>
    );
}

function InfoRow({ icon, label, value }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string }) {
    const { theme } = useUnistyles();
    return (
        <View style={styles.row}>
            <Ionicons name={icon} size={16} color={theme.colors.textSecondary} />
            <Text style={styles.rowLabel}>{label}</Text>
            <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
        </View>
    );
}

function PickerRow({ icon, label, value, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string; onPress: () => void }) {
    const { theme } = useUnistyles();
    return (
        <Pressable style={({ pressed }) => [styles.row, pressed && styles.rowPressed]} onPress={onPress}>
            <Ionicons name={icon} size={16} color={theme.colors.textSecondary} />
            <Text style={styles.rowLabel}>{label}</Text>
            <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.colors.textSecondary} />
        </Pressable>
    );
}

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.header.background,
    },
    scrollContent: {
        flexGrow: 1,
        paddingBottom: 96,
    },
    content: {
        width: '100%',
        maxWidth: layout.maxWidth,
        alignSelf: 'center',
        paddingHorizontal: 16,
        paddingTop: 16,
        gap: 12,
    },
    title: {
        fontSize: 24,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
        ...Platform.select({ web: { userSelect: 'none' } as any, default: {} }),
    },
    parentPill: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        maxWidth: '100%',
        gap: 8,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: theme.colors.input.background,
    },
    parentPillText: {
        flexShrink: 1,
        fontSize: 14,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    panel: {
        borderRadius: 8,
        overflow: 'hidden',
        backgroundColor: theme.colors.input.background,
    },
    pickerPanel: {
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        overflow: 'hidden',
        backgroundColor: theme.colors.header.background,
    },
    row: {
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    rowPressed: {
        opacity: 0.65,
    },
    rowLabel: {
        width: 86,
        fontSize: 14,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
    rowValue: {
        flex: 1,
        fontSize: 14,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    footer: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 20,
        backgroundColor: theme.colors.header.background,
        borderTopWidth: 1,
        borderTopColor: theme.colors.divider,
    },
    submitButton: {
        maxWidth: layout.maxWidth,
        width: '100%',
        alignSelf: 'center',
        minHeight: 46,
        borderRadius: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: theme.colors.button.primary.background,
    },
    submitButtonDisabled: {
        backgroundColor: theme.colors.button.primary.disabled,
    },
    submitButtonPressed: {
        opacity: 0.75,
    },
    submitButtonText: {
        color: theme.colors.button.primary.tint,
        fontSize: 15,
        ...Typography.default('semiBold'),
    },
}));

export default React.memo(ForkComposerScreen);
