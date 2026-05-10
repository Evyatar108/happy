import * as React from 'react';
import { ToolSectionView } from '../../tools/ToolSectionView';
import { ToolViewProps } from './_all';
import { CollapsibleDiffPreview } from '@/components/diff/CollapsibleDiffPreview';
import { ToolDiffView } from '@/components/tools/ToolDiffView';
import { knownTools } from '../../tools/knownTools';
import { trimIdent } from '@/utils/trimIdent';
import { useSetting } from '@/sync/storage';
import { resolvePath } from '@/utils/pathUtils';
import { ToolError } from '@/components/tools/ToolError';
import { warnToolInputParseFailure } from './parseFailure';


export const EditView = React.memo<ToolViewProps>(({ tool, metadata }) => {
    const showLineNumbersInToolViews = useSetting('showLineNumbersInToolViews');
    
    const parsed = knownTools.Edit.input.safeParse(tool.input);
    if (!parsed.success) {
        const message = warnToolInputParseFailure('Edit', parsed.error);
        return (
            <ToolSectionView fullWidth>
                <ToolError message={message} />
            </ToolSectionView>
        );
    }

    const fileName = resolvePath(parsed.data.file_path ?? '', metadata);
    const oldString = trimIdent(parsed.data.old_string ?? '');
    const newString = trimIdent(parsed.data.new_string ?? '');

    return (
        <>
            <ToolSectionView fullWidth>
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
                            showLineNumbers={showLineNumbersInToolViews}
                            showPlusMinusSymbols={showLineNumbersInToolViews}
                        />
                    )}
                />
            </ToolSectionView>
        </>
    );
});
