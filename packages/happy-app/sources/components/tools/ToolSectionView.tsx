import * as React from 'react';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useChatScaledStyles } from '@/hooks/useChatFontScale';

interface ToolSectionViewProps {
    title?: string;
    fullWidth?: boolean;
    children: React.ReactNode;
}

export const ToolSectionView = React.memo<ToolSectionViewProps>(({ title, children, fullWidth }) => {
    const { theme } = useUnistyles();
    const scaledTextStyles = useChatScaledStyles({
        sectionTitle: {
            fontSize: 13,
            fontWeight: '600',
            color: theme.colors.textSecondary,
            marginBottom: 6,
            marginHorizontal: 12,
            textTransform: 'uppercase',
        },
    });

    return (
        <View style={[styles.section, fullWidth && styles.fullWidthSection]}>
            {title && <Text style={scaledTextStyles.sectionTitle}>{title}</Text>}
            <View style={fullWidth ? styles.fullWidthContent : undefined}>
                {children}
            </View>
        </View>
    );
});

const styles = StyleSheet.create(() => ({
    section: {
        marginBottom: 12,
        overflow: 'visible',
    },
    fullWidthSection: {
        marginHorizontal: -12, // Compensate for parent padding
    },
    fullWidthContent: {
        // No negative margins needed since we're moving the whole section
    },
}));
