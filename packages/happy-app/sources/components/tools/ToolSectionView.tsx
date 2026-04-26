import * as React from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { AnimatedText } from '@/components/StyledText';
import { useChatScaleAnimatedTextStyle } from '@/hooks/useChatFontScale';

interface ToolSectionViewProps {
    title?: string;
    fullWidth?: boolean;
    children: React.ReactNode;
}

export const ToolSectionView = React.memo<ToolSectionViewProps>(({ title, children, fullWidth }) => {
    const animatedSectionTitleStyle = useChatScaleAnimatedTextStyle(styles.sectionTitle.fontSize);

    return (
        <View style={[styles.section, fullWidth && styles.fullWidthSection]}>
            {title && <AnimatedText style={[styles.sectionTitle, animatedSectionTitleStyle]}>{title}</AnimatedText>}
            <View style={fullWidth ? styles.fullWidthContent : undefined}>
                {children}
            </View>
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    section: {
        marginBottom: 12,
        overflow: 'visible',
    },
    sectionTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.textSecondary,
        marginBottom: 6,
        marginHorizontal: 12,
        textTransform: 'uppercase',
    },
    fullWidthSection: {
        marginHorizontal: -12, // Compensate for parent padding
    },
    fullWidthContent: {
        // No negative margins needed since we're moving the whole section
    },
}));
