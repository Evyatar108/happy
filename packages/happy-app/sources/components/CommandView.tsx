import * as React from 'react';
import { Text, View, StyleSheet, Platform } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';
import { useChatFontScale } from '@/hooks/useChatFontScale';

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
    // Use legacy output if new props aren't provided
    const hasNewProps = stdout !== undefined || stderr !== undefined || error !== undefined;

    // Chat font-scale applied to the whole terminal block. Base sizes are 14/20
    // for prompt+command and 13/18 for stdout/stderr/error/empty.
    const scale = useChatFontScale();

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
        promptText: {
            fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
            fontSize: 14 * scale,
            lineHeight: 20 * scale,
            color: theme.colors.terminal.prompt,
            fontWeight: '600',
        },
        commandText: {
            fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
            fontSize: 14 * scale,
            color: theme.colors.terminal.command,
            lineHeight: 20 * scale,
            flex: 1,
        },
        stdout: {
            fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
            fontSize: 13 * scale,
            color: theme.colors.terminal.stdout,
            lineHeight: 18 * scale,
            marginTop: 8,
        },
        stderr: {
            fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
            fontSize: 13 * scale,
            color: theme.colors.terminal.stderr,
            lineHeight: 18 * scale,
            marginTop: 8,
        },
        error: {
            fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
            fontSize: 13 * scale,
            color: theme.colors.terminal.error,
            lineHeight: 18 * scale,
            marginTop: 8,
        },
        emptyOutput: {
            fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
            fontSize: 13 * scale,
            color: theme.colors.terminal.emptyOutput,
            lineHeight: 18 * scale,
            marginTop: 8,
            fontStyle: 'italic',
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
                <Text style={styles.promptText}>{prompt} </Text>
                <Text style={styles.commandText}>{command}</Text>
            </View>

            {hasNewProps ? (
                <>
                    {/* Standard Output */}
                    {stdout && stdout.trim() && (
                        <Text style={styles.stdout}>{stdout}</Text>
                    )}

                    {/* Standard Error */}
                    {stderr && stderr.trim() && (
                        <Text style={styles.stderr}>{stderr}</Text>
                    )}

                    {/* Error Message */}
                    {error && (
                        <Text style={styles.error}>{error}</Text>
                    )}

                    {/* Empty output indicator */}
                    {!stdout && !stderr && !error && !hideEmptyOutput && (
                        <Text style={styles.emptyOutput}>[Command completed with no output]</Text>
                    )}
                </>
            ) : (
                /* Legacy output format */
                output && (
                    <Text style={styles.commandText}>{'\n---\n' + output}</Text>
                )
            )}
        </View>
    );
});

