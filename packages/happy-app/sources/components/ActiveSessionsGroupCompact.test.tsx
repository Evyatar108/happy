import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('ActiveSessionsGroupCompact header layout', () => {
    const source = readFileSync(new URL('./ActiveSessionsGroupCompact.tsx', import.meta.url), 'utf8');

    it('keeps long paths constrained before the branch and git stats row', () => {
        expect(source).toContain('style={styles.sectionHeaderPath} numberOfLines={1} ellipsizeMode="middle"');
        expect(source).toContain('flex: 1,');
        expect(source).toContain('minWidth: 0,');
        expect(source).toContain('marginLeft: 8,');
        expect(source).toContain('flexShrink: 0,');
    });

    it('does not route the compact header through CompactGitStatus', () => {
        expect(source).not.toContain('CompactGitStatus');
    });
});
