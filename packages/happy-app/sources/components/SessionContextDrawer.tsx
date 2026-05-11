import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as React from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import type { ModelMode, PermissionMode } from './PermissionModeSelector';
import type { ResumeCommandBlock } from '@/utils/resumeCommand';
import type { ResumeAvailability } from '@/utils/resumeAvailability';
import type { SpawnSessionResult } from '@/sync/ops';
import type { Machine, Session } from '@/sync/storageTypes';
import { t } from '@/text';
import { forkAvailability } from '@/utils/forkAvailability';

type SessionContextDrawerProps = {
    machineName: string | null;
    workdirPath?: string | null;
    modelMode: ModelMode | null;
    permissionMode: PermissionMode | null;
    canResume: boolean;
    resumeAvailability: ResumeAvailability;
    resumeCommandBlock: ResumeCommandBlock | null;
    session: Session;
    machine: Machine | null | undefined;
    onForkPress: () => void;
    resumeSessionInline: () => Promise<SpawnSessionResult>;
};

const COLLAPSED_BAR_HEIGHT = 36;
const EXPANDED_BODY_MAX_HEIGHT = 440;

export const SessionContextDrawer = React.memo((props: SessionContextDrawerProps) => {
    const { theme } = useUnistyles();
    const { height: windowHeight } = useWindowDimensions();
    const { canResume, resumeAvailability, resumeCommandBlock, resumeSessionInline } = props;
    const canFork = forkAvailability(props.session, props.machine);
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

    // Compact viewports keep the expanded controls inside this overlay scroller,
    // leaving the composer and message list layout stable while the drawer opens.
    const maxExpandedBodyHeight = Math.max(220, Math.min(EXPANDED_BODY_MAX_HEIGHT, Math.round(windowHeight * 0.55)));

    const bodyAnimatedStyle = useAnimatedStyle(() => ({
        height: expandedProgress.value * maxExpandedBodyHeight,
        opacity: expandedProgress.value,
        overflow: 'hidden' as const,
    }), [maxExpandedBodyHeight]);

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
                {!!props.workdirPath && (
                    <PathChip label={pathBasename(props.workdirPath)} />
                )}
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
            <Animated.View
                pointerEvents={isExpanded ? 'auto' : 'none'}
                style={[styles.expandedBody, bodyAnimatedStyle]}
            >
                <ScrollView
                    style={styles.expandedScroll}
                    contentContainerStyle={styles.pickerStack}
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled={true}
                >
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
                    <Pressable
                        onPress={canFork ? props.onForkPress : undefined}
                        disabled={!canFork}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: !canFork }}
                        style={({ pressed }) => [
                            styles.forkButton,
                            !canFork && styles.forkButtonDisabled,
                            pressed && canFork && styles.forkButtonPressed,
                        ]}
                    >
                        <Ionicons name="git-branch-outline" size={16} color={canFork ? theme.colors.text : theme.colors.textSecondary} />
                        <Text style={[styles.forkButtonText, canFork && styles.forkButtonTextEnabled]}>
                            {canFork ? t('drawer.fork.action') : t('drawer.fork.comingSoon')}
                        </Text>
                    </Pressable>
                </ScrollView>
            </Animated.View>
        </View>
    );
});

function pathBasename(path: string): string {
    const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
    const slash = normalized.lastIndexOf('/');
    return slash >= 0 ? normalized.slice(slash + 1) : normalized;
}

function ContextChip(props: { label: string }) {
    return (
        <View style={styles.chip}>
            <Text style={styles.chipText} numberOfLines={1}>{props.label}</Text>
        </View>
    );
}

function PathChip(props: { label: string }) {
    const { theme } = useUnistyles();
    return (
        <View style={styles.pathChip}>
            <Ionicons name="folder-outline" size={11} color={theme.colors.textSecondary} />
            <Text style={styles.pathChipText} numberOfLines={1}>{props.label}</Text>
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
        position: 'relative',
        paddingTop: 4,
        paddingBottom: 2,
        zIndex: 20,
    },
    collapsedBar: {
        height: COLLAPSED_BAR_HEIGHT,
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
    pathChip: {
        minWidth: 0,
        flexShrink: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        height: 24,
        borderRadius: 8,
        backgroundColor: theme.colors.surfacePressed,
        paddingHorizontal: 8,
    },
    pathChipText: {
        minWidth: 0,
        flexShrink: 1,
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontWeight: '500',
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
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: COLLAPSED_BAR_HEIGHT + 6,
        width: '100%',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        backgroundColor: theme.colors.surface,
        shadowColor: theme.colors.shadow.color,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: theme.colors.shadow.opacity,
        shadowRadius: 8,
        elevation: 4,
        zIndex: 30,
    },
    expandedScroll: {
        flex: 1,
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
    forkButton: {
        height: 36,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        backgroundColor: theme.colors.input.background,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    forkButtonDisabled: {
        opacity: 0.45,
    },
    forkButtonPressed: {
        backgroundColor: theme.colors.surfacePressed,
    },
    forkButtonText: {
        color: theme.colors.textSecondary,
        fontSize: 13,
        fontWeight: '700',
    },
    forkButtonTextEnabled: {
        color: theme.colors.text,
    },
}));
