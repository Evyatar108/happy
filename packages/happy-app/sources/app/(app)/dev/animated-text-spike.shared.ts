import { TextStyle } from 'react-native';

// Permanent dev artifact for the BOOX hold-at-peak verification route.
// Keep this shared worklet factory aligned with the in-chat animated text math.

export const ANIMATED_TEXT_SPIKE_PROBES = ['A', 'B1', 'B2', 'C'] as const;

export type AnimatedTextSpikeProbe = (typeof ANIMATED_TEXT_SPIKE_PROBES)[number];

export type AnimatedTextSpikeStyle = Pick<TextStyle, 'fontSize' | 'lineHeight'>;

export const ANIMATED_TEXT_SPIKE_MULTIPLIER_MIN = 1.0;
export const ANIMATED_TEXT_SPIKE_MULTIPLIER_MAX = 1.5;
export const ANIMATED_TEXT_SPIKE_DURATION_MS = 500;

export const ANIMATED_TEXT_SPIKE_THRESHOLDS = {
    skippedCountMax: 5,
    maxSkippedFrames: 30,
    daveyOver500Max: 0,
    treeExceededNewMax: 0,
} as const;

export function createAnimatedTextSpikeStyleWorklet(baseFontSize: number, baseLineHeight: number): (multiplier: number) => AnimatedTextSpikeStyle {
    return (multiplier: number) => {
        'worklet';

        return {
            fontSize: baseFontSize * multiplier,
            lineHeight: baseLineHeight * multiplier,
        };
    };
}

export const ANIMATED_TEXT_SPIKE_CAPTURE_STEPS = [
    'adb shell am force-stop com.slopus.happy.dev',
    'adb logcat -c',
    'adb shell monkey -p com.slopus.happy.dev -c android.intent.category.LAUNCHER 1',
    'adb logcat -c',
    'adb logcat -v threadtime > spike-<probe>-baseline.log &',
    '# wait ~4s on the mounted probe with NO animation, then stop baseline capture',
    'adb logcat -c',
    'adb logcat -v threadtime > spike-<probe>.log &',
    '# tap "Run 1x" five times with ~500ms idle between taps, then stop capture after ~2s slack',
] as const;

export const ANIMATED_TEXT_SPIKE_EXTRACTION_PIPELINE = [
    "grep -oE 'Choreographer.*Skipped [0-9]+ frames' spike-<probe>.log | grep -oE '[0-9]+' > skipped-<probe>.txt",
    'SKIPPED_COUNT=$(wc -l < skipped-<probe>.txt)',
    "MAX_SKIPPED=$(awk 'BEGIN{max=0} {if ($1>max) max=$1} END{print max}' skipped-<probe>.txt)",
    "grep -oE '(HWUI|OpenGLRenderer).*Davey! duration=[0-9]+ms' spike-<probe>.log | grep -oE 'duration=[0-9]+ms' | grep -oE '[0-9]+' > davey-<probe>.txt",
    'DAVEY_TOTAL=$(wc -l < davey-<probe>.txt)',
    "DAVEY_OVER_500=$(awk '$1>500' davey-<probe>.txt | wc -l)",
    "TREE_EXCEEDED_BASELINE=$(grep -cE 'SetSpanOperation.*Text tree size exceeded' spike-<probe>-baseline.log)",
    "TREE_EXCEEDED_ANIM=$(grep -cE 'SetSpanOperation.*Text tree size exceeded' spike-<probe>.log)",
    'TREE_EXCEEDED_NEW=$(( TREE_EXCEEDED_ANIM - TREE_EXCEEDED_BASELINE ))',
    'if [ "$TREE_EXCEEDED_NEW" -lt 0 ]; then TREE_EXCEEDED_NEW=0; fi',
] as const;

export const ANIMATED_TEXT_SPIKE_DECISION_MATRIX = [
    'A pass + B1 pass + C pass -> proceed-outer-only',
    'A pass + B1 no-propagation + B2 pass + C pass -> proceed-per-span',
    'A pass + B1 logcat fail -> stop-and-file-D002-or-D005',
    'A pass + B1 no-propagation + B2 fail -> stop-and-file-D002-or-D005',
    'A pass + B1 no-propagation + B2 inconclusive -> partial-coverage',
    'A fail -> stop-and-file-D002-or-D005',
    'A pass + markdown probes pass + C fail -> partial-coverage',
] as const;
