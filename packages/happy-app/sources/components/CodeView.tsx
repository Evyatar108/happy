import * as React from 'react';
import { Text, View, Platform } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { useChatScaledStyles } from '@/hooks/useChatFontScale';

interface CodeViewProps {
    code: string;
    language?: string;
    scaled?: boolean;
}

const ScaledCodeBlock = React.memo<{ code: string }>(({ code }) => {
    const scaledTextStyles = useChatScaledStyles({
        codeText: styles.codeText,
    });
    return (
        <View style={styles.codeBlock}>
            <Text style={scaledTextStyles.codeText}>{code}</Text>
        </View>
    );
});

const UnscaledCodeBlock = React.memo<{ code: string }>(({ code }) => (
    <View style={styles.codeBlock}>
        <Text style={styles.codeText}>{code}</Text>
    </View>
));

export const CodeView = React.memo<CodeViewProps>(({
    code,
    scaled = false,
}) => {
    return scaled ? <ScaledCodeBlock code={code} /> : <UnscaledCodeBlock code={code} />;
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
