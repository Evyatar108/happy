import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as React from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { PickerContent, type PickerItem } from './pickers';
import type { ModelMode, PermissionMode } from './PermissionModeSelector';
import type { EffortLevel } from './modelModeOptions';
import type { ResumeCommandBlock } from '@/utils/resumeCommand';
import type { ResumeAvailability } from '@/utils/resumeAvailability';
import type { SpawnSessionResult } from '@/sync/ops';
import { t } from '@/text';

type AgentConfigurationUpdate = {
    permissionMode?: string;
    model?: string;
    thinkingLevel?: string;
};

type SessionContextDrawerProps = {
    machineName: string | null;
    modelMode: ModelMode | null;
    availableModels: ModelMode[];
    permissionMode: PermissionMode | null;
    availableModes: PermissionMode[];
    effortLevel: EffortLevel | null;
    availableEffortLevels: EffortLevel[];
    canResume: boolean;
    resumeAvailability: ResumeAvailability;
    resumeCommandBlock: ResumeCommandBlock | null;
    updatePermissionMode: (mode: PermissionMode) => void;
    updateModelMode: (mode: ModelMode) => void;
    updateEffortLevel: (level: EffortLevel) => void;
    resumeSessionInline: () => Promise<SpawnSessionResult>;
    sessionEmitAgentConfiguration: (config: AgentConfigurationUpdate) => Promise<unknown>;
};

export const SessionContextDrawer = React.memo((props: SessionContextDrawerProps) => {
    const { theme } = useUnistyles();
    const { canResume, resumeAvailability, resumeCommandBlock, resumeSessionInline, sessionEmitAgentConfiguration } = props;
    const [isExpanded, setIsExpanded] = React.useState(false);
    const [isResuming, setIsResuming] = React.useState(false);
    const [inlineResumeError, setInlineResumeError] = React.useState<string | null>(null);
    const expandedProgress = useSharedValue(0);

    React.useEffect(() => {
        expandedProgress.value = withTiming(isExpanded ? 1 : 0, {
            duration: 250,
            easing: Easing.out(Easing.cubic),
        });
    }, [expandedProgress, isExpanded]);

    const bodyAnimatedStyle = useAnimatedStyle(() => ({
        height: expandedProgress.value * 440,
        opacity: expandedProgress.value,
        overflow: 'hidden' as const,
    }));

    const modelItems = React.useMemo(() => toPickerItems(props.availableModels), [props.availableModels]);
    const permissionItems = React.useMemo(() => toPickerItems(props.availableModes), [props.availableModes]);
    const effortItems = React.useMemo(() => toPickerItems(props.availableEffortLevels), [props.availableEffortLevels]);

    const handleSelectModel = React.useCallback((key: string) => {
        void sessionEmitAgentConfiguration({ model: key });
    }, [sessionEmitAgentConfiguration]);

    const handleSelectPermissionMode = React.useCallback((key: string) => {
        void sessionEmitAgentConfiguration({ permissionMode: key });
    }, [sessionEmitAgentConfiguration]);

    const handleSelectEffortLevel = React.useCallback((key: string) => {
        void sessionEmitAgentConfiguration({ thinkingLevel: key });
    }, [sessionEmitAgentConfiguration]);

    const handleResume = React.useCallback(() => {
        if (!canResume || isResuming) {
            return;
        }

        setInlineResumeError(null);
        setIsResuming(true);
        void resumeSessionInline().then((result) => {
            if (result.type === 'error') {
                setInlineResumeError(result.errorMessage);
            } else if (result.type === 'requestToApproveDirectoryCreation') {
                setInlineResumeError(t('sessionInfo.resumeSessionUnexpectedDirectoryPrompt'));
            }
        }).finally(() => {
            setIsResuming(false);
        });
    }, [canResume, isResuming, resumeSessionInline]);

    const resumeSubtitle = inlineResumeError ?? resumeAvailability.subtitle;
    const shouldShowResume = resumeAvailability.canShowResume;
    const shownResumeCommandBlock = shouldShowResume && !canResume ? resumeCommandBlock : null;

    return (
        <View style={styles.container}>
            <View style={styles.collapsedBar}>
                <View style={styles.machineGroup}>
                    <Ionicons name="desktop-outline" size={14} color={theme.colors.textSecondary} />
                    <Text style={styles.machineText} numberOfLines={1}>
                        {props.machineName ?? t('status.unknown')}
                    </Text>
                </View>
                <View style={styles.chipGroup}>
                    <ContextChip label={props.modelMode?.name ?? t('agentInput.model.title')} />
                    <ContextChip label={props.permissionMode?.name ?? t('agentInput.permissionMode.title')} />
                </View>
                <Pressable
                    onPress={() => setIsExpanded((value) => !value)}
                    accessibilityRole="button"
                    accessibilityLabel={isExpanded ? t('sidebar.collapse') : t('sidebar.expand')}
                    accessibilityState={{ expanded: isExpanded }}
                    hitSlop={8}
                    style={({ pressed }) => [styles.chevronButton, pressed && styles.chevronButtonPressed]}
                >
                    <Ionicons
                        name={isExpanded ? 'chevron-down' : 'chevron-up'}
                        size={16}
                        color={theme.colors.textSecondary}
                    />
                </Pressable>
            </View>
            <Animated.View style={[styles.expandedBody, bodyAnimatedStyle]}>
                <View style={styles.pickerStack}>
                    <PickerContent
                        title={t('agentInput.model.title')}
                        items={modelItems}
                        selectedKey={props.modelMode?.key ?? null}
                        onSelect={handleSelectModel}
                        searchPlaceholder={t('commandPalette.placeholder')}
                    />
                    <PickerContent
                        title={t('agentInput.permissionMode.title')}
                        items={permissionItems}
                        selectedKey={props.permissionMode?.key ?? null}
                        onSelect={handleSelectPermissionMode}
                        searchPlaceholder={t('commandPalette.placeholder')}
                    />
                    {effortItems.length > 0 && (
                        <PickerContent
                            title={t('agentInput.effort.title')}
                            items={effortItems}
                            selectedKey={props.effortLevel?.key ?? null}
                            onSelect={handleSelectEffortLevel}
                            searchPlaceholder={t('commandPalette.placeholder')}
                        />
                    )}
                    {shouldShowResume && (
                        <View style={styles.resumeSection}>
                            <View style={styles.resumeCopyColumn}>
                                <Text style={styles.resumeTitle}>{t('sessionInfo.resumeSession')}</Text>
                                {!!resumeSubtitle && (
                                    <Text style={styles.resumeSubtitle}>{resumeSubtitle}</Text>
                                )}
                            </View>
                            <Pressable
                                onPress={handleResume}
                                disabled={!canResume || isResuming}
                                accessibilityRole="button"
                                accessibilityLabel={t('sessionInfo.resumeSession')}
                                accessibilityState={{ disabled: !canResume || isResuming, busy: isResuming }}
                                style={({ pressed }) => [
                                    styles.resumeButton,
                                    !canResume && styles.resumeButtonDisabled,
                                    pressed && canResume && styles.resumeButtonPressed,
                                ]}
                            >
                                {isResuming ? (
                                    <ActivityIndicator size="small" color={theme.colors.button.primary.tint} />
                                ) : (
                                    <Text style={styles.resumeButtonText}>{t('sessionInfo.resumeSession')}</Text>
                                )}
                            </Pressable>
                            {shownResumeCommandBlock && (
                                <View style={styles.resumeCommandArea}>
                                    <Text style={styles.resumeTerminalText}>{t('session.resumeFromTerminal')}</Text>
                                    <ResumeCommandCopyBlock resumeCommandBlock={shownResumeCommandBlock} />
                                </View>
                            )}
                        </View>
                    )}
                </View>
            </Animated.View>
        </View>
    );
});

function toPickerItems<T extends { key: string; name: string; description?: string | null }>(items: T[]): PickerItem[] {
    return items.map((item) => ({
        key: item.key,
        label: item.name,
        subtitle: item.description ?? undefined,
    }));
}

function ContextChip(props: { label: string }) {
    return (
        <View style={styles.chip}>
            <Text style={styles.chipText} numberOfLines={1}>{props.label}</Text>
        </View>
    );
}

export function ResumeCommandCopyBlock({ resumeCommandBlock }: {
    resumeCommandBlock: ResumeCommandBlock;
}) {
    const { theme } = useUnistyles();
    const [copied, setCopied] = React.useState(false);

    return (
        <Pressable
            onPress={async () => {
                await Clipboard.setStringAsync(resumeCommandBlock.copyText);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            }}
            style={styles.resumeCommandBlock}
        >
            <View style={{ flex: 1 }}>
                {resumeCommandBlock.lines.map((line, index) => (
                    <Text
                        key={`${line}-${index}`}
                        style={styles.resumeCommandLine}
                    >
                        {line}
                    </Text>
                ))}
            </View>
            <Ionicons
                name={copied ? 'checkmark' : 'copy-outline'}
                size={16}
                color={copied ? '#30D158' : theme.colors.textSecondary}
                style={{ marginTop: 1 }}
            />
        </Pressable>
    );
}

const styles = StyleSheet.create((theme) => ({
    container: {
        width: '100%',
        paddingTop: 4,
        paddingBottom: 2,
    },
    collapsedBar: {
        height: 36,
        borderRadius: 8,
        backgroundColor: theme.colors.input.background,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        paddingHorizontal: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    machineGroup: {
        minWidth: 0,
        flexShrink: 1,
        flexBasis: 120,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    machineText: {
        minWidth: 0,
        flexShrink: 1,
        color: theme.colors.text,
        fontSize: 13,
        fontWeight: '600',
    },
    chipGroup: {
        minWidth: 0,
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 6,
    },
    chip: {
        minWidth: 0,
        maxWidth: '48%',
        height: 24,
        borderRadius: 8,
        backgroundColor: theme.colors.surfacePressed,
        paddingHorizontal: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    chipText: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontWeight: '600',
    },
    chevronButton: {
        width: 28,
        height: 28,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    chevronButtonPressed: {
        backgroundColor: theme.colors.surfacePressed,
    },
    expandedBody: {
        width: '100%',
    },
    pickerStack: {
        paddingTop: 8,
        paddingBottom: 4,
        gap: 4,
    },
    resumeSection: {
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        backgroundColor: theme.colors.input.background,
        padding: 10,
        gap: 8,
    },
    resumeCopyColumn: {
        gap: 2,
    },
    resumeTitle: {
        color: theme.colors.text,
        fontSize: 13,
        fontWeight: '700',
    },
    resumeSubtitle: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 16,
    },
    resumeButton: {
        height: 36,
        borderRadius: 8,
        backgroundColor: theme.colors.button.primary.background,
        alignItems: 'center',
        justifyContent: 'center',
    },
    resumeButtonPressed: {
        opacity: 0.8,
    },
    resumeButtonDisabled: {
        opacity: 0.45,
    },
    resumeButtonText: {
        color: theme.colors.button.primary.tint,
        fontSize: 14,
        fontWeight: '700',
    },
    resumeCommandArea: {
        gap: 6,
    },
    resumeTerminalText: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 16,
    },
    resumeCommandBlock: {
        minHeight: 48,
        borderRadius: 8,
        backgroundColor: theme.colors.surfaceHigh,
        flexDirection: 'row',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        alignItems: 'flex-start',
    },
    resumeCommandLine: {
        color: theme.colors.text,
        fontSize: 12,
        lineHeight: 17,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
}));
