import * as React from 'react';
import { ToolViewProps } from './_all';
import { ToolSectionView } from '../../tools/ToolSectionView';
import { knownTools } from '../../tools/knownTools';
import { ToolDiffView } from '@/components/tools/ToolDiffView';
import { CollapsibleDiffPreview } from '@/components/diff/CollapsibleDiffPreview';
import { trimIdent } from '@/utils/trimIdent';

export const FileEditView = React.memo<ToolViewProps>(({ tool }) => {
    const parsed = knownTools['file-edit'].input.safeParse(tool.input);
    if (!parsed.success) {
        return null;
    }

    const fileName = parsed.data.filePath;
    const oldText = trimIdent(parsed.data.oldContent || '');
    const newText = trimIdent(parsed.data.newContent || '');

    if (parsed.data.diff) {
        return (
            <ToolSectionView fullWidth>
                <ToolDiffView patch={parsed.data.diff} fileName={fileName} />
            </ToolSectionView>
        );
    }

    return (
        <ToolSectionView fullWidth>
            <CollapsibleDiffPreview
                oldText={oldText}
                newText={newText}
                collapsedLines={10}
                renderDiff={({ hunks, maxVisibleLines }) => (
                    <ToolDiffView
                        oldText={oldText}
                        newText={newText}
                        fileName={fileName}
                        hunks={hunks}
                        maxVisibleLines={maxVisibleLines}
                    />
                )}
            />
        </ToolSectionView>
    );
});
