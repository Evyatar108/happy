import * as React from 'react';
import { View, StyleSheet, StyleSheet as RNStyleSheet, StyleProp, TextStyle } from 'react-native';
import { ToolCall } from '@/sync/typesMessage';
import { Metadata } from '@/sync/storageTypes';
import { knownTools } from '@/components/tools/knownTools';
import { toolFullViewStyles } from '../ToolFullView';
import { ToolDiffView } from '@/components/tools/ToolDiffView';
import { trimIdent } from '@/utils/trimIdent';
import { t } from '@/text';
import { AnimatedText } from '@/components/StyledText';
import { useChatScaleAnimatedTextStyle } from '@/hooks/useChatFontScale';

interface MultiEditViewFullProps {
    tool: ToolCall;
    metadata: Metadata | null;
}

function AnimatedMultiEditText(props: React.ComponentProps<typeof AnimatedText> & { baseStyle: StyleProp<TextStyle> }) {
    const flattenedBaseStyle = RNStyleSheet.flatten(props.baseStyle) ?? {};
    const animatedTextStyle = useChatScaleAnimatedTextStyle(flattenedBaseStyle.fontSize ?? 0, flattenedBaseStyle.lineHeight);

    return <AnimatedText {...props} style={[props.baseStyle, props.style, animatedTextStyle]} />;
}

export const MultiEditViewFull = React.memo<MultiEditViewFullProps>(({ tool, metadata }) => {
    const { input } = tool;

    let edits: Array<{ old_string: string; new_string: string; replace_all?: boolean }> = [];

    const parsed = knownTools.MultiEdit.input.safeParse(input);
    if (parsed.success && parsed.data.edits) {
        edits = parsed.data.edits;
    }

    if (edits.length === 0) {
        return null;
    }

    return (
        <View style={toolFullViewStyles.sectionFullWidth}>
            {edits.map((edit, index) => {
                const oldString = trimIdent(edit.old_string || '');
                const newString = trimIdent(edit.new_string || '');
                return (
                    <View key={index}>
                        <View style={styles.editHeader}>
                            <AnimatedMultiEditText baseStyle={styles.editNumber}>
                                {t('tools.multiEdit.editNumber', { index: index + 1, total: edits.length })}
                            </AnimatedMultiEditText>
                            {edit.replace_all && (
                                <View style={styles.replaceAllBadge}>
                                    <AnimatedMultiEditText baseStyle={styles.replaceAllText}>{t('tools.multiEdit.replaceAll')}</AnimatedMultiEditText>
                                </View>
                            )}
                        </View>
                        <ToolDiffView oldText={oldString} newText={newString} showLineNumbers />
                        {index < edits.length - 1 && <View style={styles.separator} />}
                    </View>
                );
            })}
        </View>
    );
});

const styles = StyleSheet.create({
    editHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    editNumber: {
        fontSize: 14,
        fontWeight: '600',
        color: '#5856D6',
    },
    replaceAllBadge: {
        backgroundColor: '#5856D6',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        marginLeft: 8,
    },
    replaceAllText: {
        fontSize: 12,
        color: '#fff',
        fontWeight: '600',
    },
    separator: {
        height: 1,
        backgroundColor: '#E5E5EA',
        marginVertical: 16,
    },
});
