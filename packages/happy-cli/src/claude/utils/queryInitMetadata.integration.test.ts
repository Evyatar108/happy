// This integration test makes real Claude SDK calls.
// Set RUN_CLAUDE_INTEGRATION=1 to run it; otherwise it's skipped.
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { queryInitMetadata } from './queryInitMetadata';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureProjectPath = resolve(__dirname, '..', '..', '..', '..', '..', 'environments', 'lab-rat-todo-project');

describe.skipIf(process.env.RUN_CLAUDE_INTEGRATION !== '1')('queryInitMetadata integration', { timeout: 60_000 }, () => {
    let tempDir: string;
    let projectPath: string;
    let settingsPath: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), 'query-init-metadata-'));
        projectPath = join(tempDir, 'project');
        cpSync(fixtureProjectPath, projectPath, { recursive: true });
        settingsPath = join(tempDir, 'settings.json');
        writeFileSync(settingsPath, '{}\n');
    });

    afterEach(() => {
        try {
            rmSync(tempDir, { recursive: true, force: true });
        } catch {}
    });

    it('captures real Claude init metadata from the fixture project', async () => {
        const metadata = await queryInitMetadata({
            cwd: projectPath,
            settingsPath,
            timeoutMs: 20_000,
        });

        expect(metadata.tools && metadata.tools.length > 0).toBe(true);
        expect(metadata.slashCommands && metadata.slashCommands.length > 0).toBe(true);
        expect(Array.isArray(metadata.plugins)).toBe(true);
        expect(Array.isArray(metadata.mcpServers)).toBe(true);
        expect(typeof metadata.outputStyle).toBe('string');
    });
});
