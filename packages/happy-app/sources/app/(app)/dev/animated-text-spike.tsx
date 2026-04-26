import * as React from 'react';
import { Pressable, ScrollView, StyleProp, Text, TextStyle, View } from 'react-native';
import Animated, {
    runOnJS,
    SharedValue,
    useAnimatedStyle,
    useSharedValue,
    withSequence,
    withTiming,
} from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';
import {
    ANIMATED_TEXT_SPIKE_CAPTURE_STEPS,
    ANIMATED_TEXT_SPIKE_DECISION_MATRIX,
    ANIMATED_TEXT_SPIKE_DURATION_MS,
    ANIMATED_TEXT_SPIKE_EXTRACTION_PIPELINE,
    ANIMATED_TEXT_SPIKE_MULTIPLIER_MAX,
    ANIMATED_TEXT_SPIKE_MULTIPLIER_MIN,
    ANIMATED_TEXT_SPIKE_PROBES,
    ANIMATED_TEXT_SPIKE_THRESHOLDS,
    createAnimatedTextSpikeStyleWorklet,
} from './animated-text-spike.shared';

const AnimatedText = Animated.createAnimatedComponent(Text);

type ProbeKey = (typeof ANIMATED_TEXT_SPIKE_PROBES)[number];

type ProbeVisibility = Record<ProbeKey, boolean>;

type ProbeTextProps = React.PropsWithChildren<{
    multiplier: SharedValue<number>;
    baseFontSize: number;
    baseLineHeight: number;
    style?: StyleProp<TextStyle>;
}>;

function useProbeAnimatedTextStyle(multiplier: SharedValue<number>, baseFontSize: number, baseLineHeight: number) {
    const worklet = React.useMemo(
        () => createAnimatedTextSpikeStyleWorklet(baseFontSize, baseLineHeight),
        [baseFontSize, baseLineHeight],
    );

    return useAnimatedStyle(() => worklet(multiplier.value), [multiplier, worklet]);
}

function ProbeText({ multiplier, baseFontSize, baseLineHeight, style, children }: ProbeTextProps) {
    const animatedStyle = useProbeAnimatedTextStyle(multiplier, baseFontSize, baseLineHeight);

    return (
        <AnimatedText style={[style, animatedStyle]}>
            {children}
        </AnimatedText>
    );
}

const FlatProbeBlock = React.memo(({ multiplier }: { multiplier: SharedValue<number> }) => {
    const rows = React.useMemo(
        () => Array.from({ length: 50 }, (_, index) => {
            const baseFontSize = [12, 14, 16, 20][index % 4];
            const baseLineHeight = [18, 20, 24, 28][index % 4];

            return {
                id: `flat-${index}`,
                baseFontSize,
                baseLineHeight,
                label: `A${String(index + 1).padStart(2, '0')} flat text row with Animated.Text fontSize worklet.`,
            };
        }),
        [],
    );

    return (
        <View style={styles.probeContent}>
            {rows.map(row => (
                <ProbeText
                    key={row.id}
                    multiplier={multiplier}
                    baseFontSize={row.baseFontSize}
                    baseLineHeight={row.baseLineHeight}
                    style={styles.flatText}
                >
                    {row.label}
                </ProbeText>
            ))}
        </View>
    );
});

const NestedOuterOnlyBlock = React.memo(({ multiplier }: { multiplier: SharedValue<number> }) => {
    const rows = React.useMemo(() => Array.from({ length: 20 }, (_, index) => index), []);

    return (
        <View style={styles.probeContent}>
            {rows.map(index => (
                <ProbeText
                    key={`nested-outer-${index}`}
                    multiplier={multiplier}
                    baseFontSize={16}
                    baseLineHeight={24}
                    style={styles.bodyText}
                >
                    {`B1-${index + 1} `}
                    <Text style={styles.boldText}>bold</Text>
                    <Text style={styles.bodyText}> / </Text>
                    <Text style={styles.italicText}>italic</Text>
                    <Text style={styles.bodyText}> / </Text>
                    <Text style={styles.codeSpanText}>inline-code</Text>
                    <Text style={styles.bodyText}> / </Text>
                    <Text style={styles.linkText}>link</Text>
                </ProbeText>
            ))}
        </View>
    );
});

const NestedPerSpanBlock = React.memo(({ multiplier }: { multiplier: SharedValue<number> }) => {
    const rows = React.useMemo(() => Array.from({ length: 20 }, (_, index) => index), []);

    return (
        <View style={styles.probeContent}>
            {rows.map(index => (
                <Text key={`nested-span-${index}`} style={styles.bodyText}>
                    {`B2-${index + 1} `}
                    <ProbeText multiplier={multiplier} baseFontSize={16} baseLineHeight={24} style={styles.boldText}>bold</ProbeText>
                    <Text style={styles.bodyText}> / </Text>
                    <ProbeText multiplier={multiplier} baseFontSize={16} baseLineHeight={24} style={styles.italicText}>italic</ProbeText>
                    <Text style={styles.bodyText}> / </Text>
                    <ProbeText multiplier={multiplier} baseFontSize={16} baseLineHeight={24} style={styles.codeSpanText}>inline-code</ProbeText>
                    <Text style={styles.bodyText}> / </Text>
                    <ProbeText multiplier={multiplier} baseFontSize={16} baseLineHeight={24} style={styles.linkText}>link</ProbeText>
                </Text>
            ))}
        </View>
    );
});

const DiffToolProbeBlock = React.memo(({ multiplier }: { multiplier: SharedValue<number> }) => {
    const diffRows = React.useMemo(() => Array.from({ length: 10 }, (_, index) => index), []);
    const toolRows = React.useMemo(() => Array.from({ length: 10 }, (_, index) => index), []);

    return (
        <View style={styles.probeContent}>
            <Text style={styles.subsectionLabel}>DiffView-style tokens</Text>
            {diffRows.map(index => (
                <ProbeText
                    key={`diff-${index}`}
                    multiplier={multiplier}
                    baseFontSize={13}
                    baseLineHeight={20}
                    style={styles.diffLineText}
                >
                    <Text style={styles.diffLineNumber}>{String(index + 1).padStart(2, '0')}</Text>
                    <Text style={styles.diffAdded}> + </Text>
                    <Text style={styles.diffContext}>const </Text>
                    <Text style={styles.diffChangedToken}>value</Text>
                    <Text style={styles.diffContext}>{` = "row-${index + 1}"`}</Text>
                </ProbeText>
            ))}
            <Text style={styles.subsectionLabel}>ToolView-style nested status</Text>
            {toolRows.map(index => (
                <ProbeText
                    key={`tool-${index}`}
                    multiplier={multiplier}
                    baseFontSize={14}
                    baseLineHeight={20}
                    style={styles.toolNameText}
                >
                    {`Tool ${index + 1}`}
                    <Text style={styles.toolStatusText}> running</Text>
                </ProbeText>
            ))}
        </View>
    );
});

function CodeBlock({ lines }: { lines: readonly string[] }) {
    return (
        <View style={styles.codeBlock}>
            {lines.map(line => (
                <Text key={line} style={styles.codeLine}>
                    {line}
                </Text>
            ))}
        </View>
    );
}

function ProbeToggle({
    label,
    enabled,
    onPress,
}: {
    label: string;
    enabled: boolean;
    onPress: () => void;
}) {
    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => [
                styles.toggleChip,
                enabled ? styles.toggleChipEnabled : styles.toggleChipDisabled,
                pressed && styles.toggleChipPressed,
            ]}
        >
            <Text style={[styles.toggleChipLabel, enabled ? styles.toggleChipLabelEnabled : styles.toggleChipLabelDisabled]}>
                {enabled ? `Hide ${label}` : `Show ${label}`}
            </Text>
        </Pressable>
    );
}

function ProbeCard({
    probeId,
    title,
    summary,
    visible,
    onToggle,
    children,
}: React.PropsWithChildren<{
    probeId: ProbeKey;
    title: string;
    summary: string;
    visible: boolean;
    onToggle: () => void;
}>) {
    return (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <View style={styles.cardHeaderText}>
                    <Text style={styles.cardTitle}>{probeId} - {title}</Text>
                    <Text style={styles.cardSummary}>{summary}</Text>
                </View>
                <ProbeToggle label={probeId} enabled={visible} onPress={onToggle} />
            </View>
            {visible ? children : null}
        </View>
    );
}

// Permanent dev artifact for BOOX pinch verification and hold-at-peak checks.
const AnimatedTextSpikeScreen = React.memo(() => {
    const multiplier = useSharedValue(ANIMATED_TEXT_SPIKE_MULTIPLIER_MIN);
    const [runCount, setRunCount] = React.useState(0);
    const [isRunning, setIsRunning] = React.useState(false);
    const [visibleProbes, setVisibleProbes] = React.useState<ProbeVisibility>({
        A: true,
        B1: true,
        B2: true,
        C: true,
    });

    const toggleProbe = React.useCallback((probeId: ProbeKey) => {
        setVisibleProbes(current => ({
            ...current,
            [probeId]: !current[probeId],
        }));
    }, []);

    const finishRun = React.useCallback(() => {
        setIsRunning(false);
        setRunCount(count => count + 1);
    }, []);

    const [held, setHeld] = React.useState(false);

    const handleRunOnce = React.useCallback(() => {
        if (isRunning || held) {
            return;
        }

        setIsRunning(true);
        multiplier.value = withSequence(
            withTiming(ANIMATED_TEXT_SPIKE_MULTIPLIER_MAX, { duration: ANIMATED_TEXT_SPIKE_DURATION_MS }),
            withTiming(
                ANIMATED_TEXT_SPIKE_MULTIPLIER_MIN,
                { duration: ANIMATED_TEXT_SPIKE_DURATION_MS },
                () => {
                    runOnJS(finishRun)();
                },
            ),
        );
    }, [finishRun, isRunning, held, multiplier]);

    const handleToggleHold = React.useCallback(() => {
        if (isRunning) {
            return;
        }
        const next = !held;
        setHeld(next);
        multiplier.value = next ? ANIMATED_TEXT_SPIKE_MULTIPLIER_MAX : ANIMATED_TEXT_SPIKE_MULTIPLIER_MIN;
    }, [held, isRunning, multiplier]);

    return (
        <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
            <View style={styles.hero}>
                <Text style={styles.heroTitle}>Animated.Text Spike</Text>
                <Text style={styles.heroBody}>
                    Permanent dev artifact for the BOOX hold-at-peak gate. Every probe reads one shared multiplier and one tap on
                    {' '}<Text style={styles.inlineCode}>Run 1x</Text>{' '}
                    executes exactly one 1.0 -&gt; 1.5 -&gt; 1.0 cycle.
                </Text>
                <View style={styles.heroActions}>
                    <Pressable
                        onPress={handleRunOnce}
                        style={({ pressed }) => [
                            styles.runButton,
                            isRunning && styles.runButtonDisabled,
                            pressed && !isRunning && styles.runButtonPressed,
                        ]}
                    >
                        <Text style={styles.runButtonLabel}>{isRunning ? 'Running...' : 'Run 1x'}</Text>
                    </Pressable>
                    <Pressable
                        onPress={handleToggleHold}
                        disabled={isRunning}
                        style={({ pressed }) => [
                            styles.runButton,
                            held && styles.runButtonHeld,
                            isRunning && styles.runButtonDisabled,
                            pressed && !isRunning && styles.runButtonPressed,
                        ]}
                    >
                        <Text style={styles.runButtonLabel}>{held ? 'Reset to 1x' : 'Hold at 1.5x'}</Text>
                    </Pressable>
                    <View style={styles.runMeta}>
                        <Text style={styles.runMetaLabel}>Completed cycles</Text>
                        <Text style={styles.runMetaValue}>{runCount}</Text>
                    </View>
                </View>
                <Text style={styles.heroHint}>
                    Manual BOOX protocol: capture baseline + animation for each probe, tap Run 1x five times with
                    about 500ms idle between taps, then evaluate the thresholds below.
                </Text>
            </View>

            <ProbeCard
                probeId="A"
                title="50 flat Animated.Text rows"
                summary="Best-case flat text cost with mixed 12/14/16/20 base sizes."
                visible={visibleProbes.A}
                onToggle={() => toggleProbe('A')}
            >
                <FlatProbeBlock multiplier={multiplier} />
            </ProbeCard>

            <ProbeCard
                probeId="B1"
                title="20 nested outer-only rows"
                summary="Markdown-like nested spans; only the outer Animated.Text receives the animated style."
                visible={visibleProbes.B1}
                onToggle={() => toggleProbe('B1')}
            >
                <NestedOuterOnlyBlock multiplier={multiplier} />
            </ProbeCard>

            <ProbeCard
                probeId="B2"
                title="20 nested per-span rows"
                summary="Markdown-like nested spans; each inner span gets its own Animated.Text worklet style."
                visible={visibleProbes.B2}
                onToggle={() => toggleProbe('B2')}
            >
                <NestedPerSpanBlock multiplier={multiplier} />
            </ProbeCard>

            <ProbeCard
                probeId="C"
                title="DiffView and ToolView shapes"
                summary="Ten diff-token rows plus ten nested tool-status rows for explicit-font-size override checks."
                visible={visibleProbes.C}
                onToggle={() => toggleProbe('C')}
            >
                <DiffToolProbeBlock multiplier={multiplier} />
            </ProbeCard>

            <View style={styles.card}>
                <Text style={styles.sectionTitle}>Capture Steps</Text>
                <CodeBlock lines={ANIMATED_TEXT_SPIKE_CAPTURE_STEPS} />
            </View>

            <View style={styles.card}>
                <Text style={styles.sectionTitle}>Extraction Pipeline</Text>
                <CodeBlock lines={ANIMATED_TEXT_SPIKE_EXTRACTION_PIPELINE} />
            </View>

            <View style={styles.card}>
                <Text style={styles.sectionTitle}>Threshold Checklist</Text>
                <Text style={styles.checklistItem}>SKIPPED_COUNT &lt;= {ANIMATED_TEXT_SPIKE_THRESHOLDS.skippedCountMax}</Text>
                <Text style={styles.checklistItem}>MAX_SKIPPED &lt;= {ANIMATED_TEXT_SPIKE_THRESHOLDS.maxSkippedFrames}</Text>
                <Text style={styles.checklistItem}>DAVEY_OVER_500 == {ANIMATED_TEXT_SPIKE_THRESHOLDS.daveyOver500Max}</Text>
                <Text style={styles.checklistItem}>TREE_EXCEEDED_NEW == {ANIMATED_TEXT_SPIKE_THRESHOLDS.treeExceededNewMax}</Text>
            </View>

            <View style={styles.card}>
                <Text style={styles.sectionTitle}>Decision Matrix</Text>
                {ANIMATED_TEXT_SPIKE_DECISION_MATRIX.map(line => (
                    <Text key={line} style={styles.checklistItem}>
                        {line}
                    </Text>
                ))}
            </View>
        </ScrollView>
    );
});

export default AnimatedTextSpikeScreen;

const styles = StyleSheet.create(theme => ({
    screen: {
        flex: 1,
        backgroundColor: theme.colors.surface,
    },
    content: {
        padding: 16,
        gap: 16,
    },
    hero: {
        gap: 12,
        padding: 16,
        borderRadius: 16,
        backgroundColor: theme.colors.surfaceHigh,
        borderWidth: 1,
        borderColor: theme.colors.surfaceHighest,
    },
    heroTitle: {
        fontSize: 24,
        lineHeight: 30,
        fontWeight: '700',
        color: theme.colors.text,
    },
    heroBody: {
        fontSize: 15,
        lineHeight: 22,
        color: theme.colors.text,
    },
    inlineCode: {
        fontFamily: 'monospace',
        backgroundColor: theme.colors.surfaceHighest,
    },
    heroActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    runButton: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 999,
        backgroundColor: theme.colors.textLink,
    },
    runButtonPressed: {
        opacity: 0.9,
    },
    runButtonDisabled: {
        opacity: 0.6,
    },
    runButtonHeld: {
        backgroundColor: theme.colors.warning,
    },
    runButtonLabel: {
        color: theme.colors.surface,
        fontSize: 15,
        fontWeight: '700',
    },
    runMeta: {
        gap: 2,
    },
    runMetaLabel: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        textTransform: 'uppercase',
    },
    runMetaValue: {
        fontSize: 20,
        lineHeight: 24,
        fontWeight: '700',
        color: theme.colors.text,
    },
    heroHint: {
        fontSize: 13,
        lineHeight: 20,
        color: theme.colors.textSecondary,
    },
    card: {
        padding: 16,
        borderRadius: 16,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.surfaceHighest,
        gap: 12,
    },
    cardHeader: {
        flexDirection: 'row',
        gap: 12,
        justifyContent: 'space-between',
    },
    cardHeaderText: {
        flex: 1,
        gap: 4,
    },
    cardTitle: {
        fontSize: 18,
        lineHeight: 24,
        fontWeight: '700',
        color: theme.colors.text,
    },
    cardSummary: {
        fontSize: 13,
        lineHeight: 19,
        color: theme.colors.textSecondary,
    },
    probeContent: {
        gap: 6,
    },
    bodyText: {
        fontSize: 16,
        lineHeight: 24,
        color: theme.colors.text,
    },
    flatText: {
        fontSize: 16,
        lineHeight: 24,
        color: theme.colors.text,
        paddingVertical: 2,
    },
    boldText: {
        fontWeight: '700',
        color: theme.colors.text,
    },
    italicText: {
        fontStyle: 'italic',
        color: theme.colors.text,
    },
    codeSpanText: {
        fontFamily: 'monospace',
        fontSize: 16,
        lineHeight: 24,
        color: theme.colors.text,
        backgroundColor: theme.colors.surfaceHighest,
    },
    linkText: {
        color: theme.colors.textLink,
        textDecorationLine: 'underline',
    },
    subsectionLabel: {
        marginTop: 8,
        fontSize: 13,
        lineHeight: 18,
        fontWeight: '700',
        color: theme.colors.textSecondary,
        textTransform: 'uppercase',
    },
    diffLineText: {
        fontFamily: 'monospace',
        fontSize: 13,
        lineHeight: 20,
        color: theme.colors.text,
        backgroundColor: theme.colors.surfaceHigh,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    diffLineNumber: {
        color: theme.colors.textSecondary,
    },
    diffAdded: {
        color: theme.colors.success,
    },
    diffContext: {
        color: theme.colors.text,
    },
    diffChangedToken: {
        color: theme.colors.warning,
        backgroundColor: theme.colors.surfaceHighest,
    },
    toolNameText: {
        fontSize: 14,
        lineHeight: 20,
        color: theme.colors.text,
        fontWeight: '500',
    },
    toolStatusText: {
        fontSize: 15,
        opacity: 0.4,
        color: theme.colors.textSecondary,
    },
    toggleChip: {
        alignSelf: 'flex-start',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
    },
    toggleChipEnabled: {
        backgroundColor: theme.colors.surfaceHighest,
        borderColor: theme.colors.surfaceHighest,
    },
    toggleChipDisabled: {
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.surfaceHighest,
    },
    toggleChipPressed: {
        opacity: 0.85,
    },
    toggleChipLabel: {
        fontSize: 13,
        fontWeight: '600',
    },
    toggleChipLabelEnabled: {
        color: theme.colors.text,
    },
    toggleChipLabelDisabled: {
        color: theme.colors.textSecondary,
    },
    sectionTitle: {
        fontSize: 16,
        lineHeight: 22,
        fontWeight: '700',
        color: theme.colors.text,
    },
    checklistItem: {
        fontSize: 14,
        lineHeight: 20,
        color: theme.colors.text,
    },
    codeBlock: {
        gap: 4,
        padding: 12,
        borderRadius: 12,
        backgroundColor: theme.colors.surfaceHighest,
    },
    codeLine: {
        fontFamily: 'monospace',
        fontSize: 12,
        lineHeight: 18,
        color: theme.colors.text,
    },
}));
