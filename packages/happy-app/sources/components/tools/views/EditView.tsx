import * as React from 'react';
import { ToolSectionView } from '../../tools/ToolSectionView';
import { ToolViewProps } from './_all';
import { CollapsibleDiffPreview } from '@/components/diff/CollapsibleDiffPreview';
import { ToolDiffView } from '@/components/tools/ToolDiffView';
import { knownTools } from '../../tools/knownTools';
import { trimIdent } from '@/utils/trimIdent';
import { useSetting } from '@/sync/storage';


export const EditView = React.memo<ToolViewProps>(({ tool }) => {
    const showLineNumbersInToolViews = useSetting('showLineNumbersInToolViews');
    
    let oldString = '';
    let newString = '';
    const parsed = knownTools.Edit.input.safeParse(tool.input);
    if (parsed.success) {
        oldString = trimIdent(parsed.data.old_string || '');
        newString = trimIdent(parsed.data.new_string || '');
    }

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
