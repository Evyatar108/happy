import * as React from 'react';
import { View, StyleSheet } from 'react-native';
import { ToolSectionView } from '../../tools/ToolSectionView';
import { ToolViewProps } from './_all';
import { CollapsibleDiffPreview } from '@/components/diff/CollapsibleDiffPreview';
import { ToolDiffView } from '@/components/tools/ToolDiffView';
import { knownTools } from '../../tools/knownTools';
import { trimIdent } from '@/utils/trimIdent';
import { resolvePath } from '@/utils/pathUtils';
import { t } from '@/text';
import { Text } from '@/components/StyledText';
import { ToolError } from '@/components/tools/ToolError';
import { warnToolInputParseFailure } from './parseFailure';

export const MultiEditView = React.memo<ToolViewProps>(({ tool, metadata }) => {
    const parsed = knownTools.MultiEdit.input.safeParse(tool.input);
    if (!parsed.success) {
        const message = warnToolInputParseFailure('MultiEdit', parsed.error, t('tools.multiEdit.parseError'));
        return (
            <ToolSectionView fullWidth>
                <ToolError message={message} />
            </ToolSectionView>
        );
    }

    const fileName = resolvePath(parsed.data.file_path ?? '', metadata);
    const edits = parsed.data.edits ?? [];

    return (
        <ToolSectionView fullWidth>
            {fileName ? <Text style={styles.fileName}>{fileName}</Text> : null}
            {edits.map((edit, index) => {
                const oldString = trimIdent(edit.old_string ?? '');
                const newString = trimIdent(edit.new_string ?? '');
                return (
                    <View key={index}>
                        <View style={styles.editHeader}>
                            <Text style={styles.editNumber}>
                                {t('tools.multiEdit.editNumber', { index: index + 1, total: edits.length })}
                            </Text>
                            {edit.replace_all ? (
                                <View style={styles.replaceAllBadge}>
                                    <Text style={styles.replaceAllText}>{t('tools.multiEdit.replaceAll')}</Text>
                                </View>
                            ) : null}
                        </View>
                        <CollapsibleDiffPreview
                            oldText={oldString}
                            newText={newString}
                            collapsedLines={10}
                            renderDiff={({ hunks, maxVisibleLines }) => (
                                <ToolDiffView
                                    oldText={oldString}
                                    newText={newString}
                                    fileName={fileName}
                                    hunks={hunks}
                                    maxVisibleLines={maxVisibleLines}
                                />
                            )}
                        />
                        {index < edits.length - 1 && <View style={styles.separator} />}
                    </View>
                );
            })}
        </ToolSectionView>
    );
});

const styles = StyleSheet.create({
    fileName: {
        fontSize: 13,
        fontWeight: '600',
        color: '#3C3C43',
        marginBottom: 8,
    },
    editHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
    },
    editNumber: {
        fontSize: 12,
        fontWeight: '600',
        color: '#5856D6',
    },
    replaceAllBadge: {
        backgroundColor: '#5856D6',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 8,
        marginLeft: 8,
    },
    replaceAllText: {
        fontSize: 11,
        color: '#fff',
        fontWeight: '600',
    },
    separator: {
        height: 8,
    },
});
