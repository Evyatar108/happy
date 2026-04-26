import * as React from 'react';
import { View, Platform } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { AnimatedText } from '@/components/StyledText';
import { useChatScaleAnimatedTextStyle } from '@/hooks/useChatFontScale';

interface CommandViewProps {
    command: string;
    prompt?: string;
    stdout?: string | null;
    stderr?: string | null;
    error?: string | null;
    // Legacy prop for backward compatibility
    output?: string | null;
    maxHeight?: number;
    fullWidth?: boolean;
    hideEmptyOutput?: boolean;
}

const monoFontFamily = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

export const CommandView = React.memo<CommandViewProps>(({ 
    command,
    prompt = '$',
    stdout,
    stderr,
    error,
    output,
    maxHeight,
    fullWidth,
    hideEmptyOutput,
}) => {
    // Use legacy output if new props aren't provided
    const hasNewProps = stdout !== undefined || stderr !== undefined || error !== undefined;
    const animatedPromptTextStyle = useChatScaleAnimatedTextStyle(styles.promptText.fontSize, styles.promptText.lineHeight);
    const animatedCommandTextStyle = useChatScaleAnimatedTextStyle(styles.commandText.fontSize, styles.commandText.lineHeight);
    const animatedStdoutStyle = useChatScaleAnimatedTextStyle(styles.stdout.fontSize, styles.stdout.lineHeight);
    const animatedStderrStyle = useChatScaleAnimatedTextStyle(styles.stderr.fontSize, styles.stderr.lineHeight);
    const animatedErrorStyle = useChatScaleAnimatedTextStyle(styles.error.fontSize, styles.error.lineHeight);
    const animatedEmptyOutputStyle = useChatScaleAnimatedTextStyle(styles.emptyOutput.fontSize, styles.emptyOutput.lineHeight);

    return (
        <View style={[
            styles.container, 
            maxHeight ? { maxHeight } : undefined,
            fullWidth ? { width: '100%' } : undefined
        ]}>
            {/* Command Line */}
            <View style={styles.line}>
                <AnimatedText style={[styles.promptText, animatedPromptTextStyle]}>{prompt} </AnimatedText>
                <AnimatedText style={[styles.commandText, animatedCommandTextStyle]}>{command}</AnimatedText>
            </View>

            {hasNewProps ? (
                <>
                    {/* Standard Output */}
                    {stdout && stdout.trim() && (
                        <AnimatedText style={[styles.stdout, animatedStdoutStyle]}>{stdout}</AnimatedText>
                    )}

                    {/* Standard Error */}
                    {stderr && stderr.trim() && (
                        <AnimatedText style={[styles.stderr, animatedStderrStyle]}>{stderr}</AnimatedText>
                    )}

                    {/* Error Message */}
                    {error && (
                        <AnimatedText style={[styles.error, animatedErrorStyle]}>{error}</AnimatedText>
                    )}

                    {/* Empty output indicator */}
                    {!stdout && !stderr && !error && !hideEmptyOutput && (
                        <AnimatedText style={[styles.emptyOutput, animatedEmptyOutputStyle]}>[Command completed with no output]</AnimatedText>
                    )}
                </>
            ) : (
                /* Legacy output format */
                output && (
                    <AnimatedText style={[styles.commandText, animatedCommandTextStyle]}>{'\n---\n' + output}</AnimatedText>
                )
            )}
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        backgroundColor: theme.colors.terminal.background,
        borderRadius: 8,
        overflow: 'hidden',
        padding: 16,
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
    },
    line: {
        alignItems: 'baseline',
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    promptText: {
        fontFamily: monoFontFamily,
        fontSize: 14,
        lineHeight: 20,
        color: theme.colors.terminal.prompt,
        fontWeight: '600',
    },
    commandText: {
        fontFamily: monoFontFamily,
        fontSize: 14,
        color: theme.colors.terminal.command,
        lineHeight: 20,
        flex: 1,
    },
    stdout: {
        fontFamily: monoFontFamily,
        fontSize: 13,
        color: theme.colors.terminal.stdout,
        lineHeight: 18,
        marginTop: 8,
    },
    stderr: {
        fontFamily: monoFontFamily,
        fontSize: 13,
        color: theme.colors.terminal.stderr,
        lineHeight: 18,
        marginTop: 8,
    },
    error: {
        fontFamily: monoFontFamily,
        fontSize: 13,
        color: theme.colors.terminal.error,
        lineHeight: 18,
        marginTop: 8,
    },
    emptyOutput: {
        fontFamily: monoFontFamily,
        fontSize: 13,
        color: theme.colors.terminal.emptyOutput,
        lineHeight: 18,
        marginTop: 8,
        fontStyle: 'italic',
    },
}));

