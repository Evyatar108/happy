import * as React from 'react';
import { Text, View, Platform } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { useChatScaledStyles } from '@/hooks/useChatFontScale';

interface CodeViewProps {
    code: string;
    language?: string;
    scaled?: boolean;
}

export const CodeView = React.memo<CodeViewProps>(({ 
    code, 
    scaled = false,
}) => {
    const scaledTextStyles = useChatScaledStyles({
        codeText: styles.codeText,
    });

    return (
        <View style={styles.codeBlock}>
            <Text style={scaled ? scaledTextStyles.codeText : styles.codeText}>{code}</Text>
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    codeBlock: {
        backgroundColor: theme.colors.surfaceHigh,
        borderRadius: 6,
        padding: 12,
    },
    codeText: {
        fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
        fontSize: 12,
        color: theme.colors.text,
        lineHeight: 18,
    },
}));
