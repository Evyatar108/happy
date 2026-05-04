import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const RUNNER_FILES = [
    {
        name: 'runClaude.ts',
        source: readFileSync(new URL('../claude/runClaude.ts', import.meta.url), 'utf8'),
    },
    {
        name: 'runCodex.ts',
        source: readFileSync(new URL('../codex/runCodex.ts', import.meta.url), 'utf8'),
    },
];

describe('permission mode publish helper wiring', () => {
    it.each(RUNNER_FILES)('$name imports publishPermissionModeIfChanged', ({ source }) => {
        expect(source).toMatch(
            /import\s+\{[^}]*\bpublishPermissionModeIfChanged\b[^}]*\}\s+from\s+['"](?:@\/utils\/publishPermissionMode|\.\.?\/[^'"]*publishPermissionMode)['"]/,
        );
    });

    it.each(RUNNER_FILES)('$name calls publishPermissionModeIfChanged', ({ source }) => {
        expect(source).toContain('publishPermissionModeIfChanged(');
    });
});
