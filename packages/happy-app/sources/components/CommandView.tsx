import * as React from 'react';
import { Text, View, StyleSheet, Platform } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';
import { useChatScaledStyles } from '@/hooks/useChatFontScale';

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
    const { theme } = useUnistyles();
    const monoFontFamily = Platform.select({ ios: 'Menlo', android: 'monospace' });
    // Use legacy output if new props aren't provided
    const hasNewProps = stdout !== undefined || stderr !== undefined || error !== undefined;
    const scaledTextStyles = useChatScaledStyles({
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
    });

    const styles = StyleSheet.create({
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
    });

    return (
        <View style={[
            styles.container, 
            maxHeight ? { maxHeight } : undefined,
            fullWidth ? { width: '100%' } : undefined
        ]}>
            {/* Command Line */}
            <View style={styles.line}>
                <Text style={scaledTextStyles.promptText}>{prompt} </Text>
                <Text style={scaledTextStyles.commandText}>{command}</Text>
            </View>

            {hasNewProps ? (
                <>
                    {/* Standard Output */}
                    {stdout && stdout.trim() && (
                        <Text style={scaledTextStyles.stdout}>{stdout}</Text>
                    )}

                    {/* Standard Error */}
                    {stderr && stderr.trim() && (
                        <Text style={scaledTextStyles.stderr}>{stderr}</Text>
                    )}

                    {/* Error Message */}
                    {error && (
                        <Text style={scaledTextStyles.error}>{error}</Text>
                    )}

                    {/* Empty output indicator */}
                    {!stdout && !stderr && !error && !hideEmptyOutput && (
                        <Text style={scaledTextStyles.emptyOutput}>[Command completed with no output]</Text>
                    )}
                </>
            ) : (
                /* Legacy output format */
                output && (
                    <Text style={scaledTextStyles.commandText}>{'\n---\n' + output}</Text>
                )
            )}
        </View>
    );
});

