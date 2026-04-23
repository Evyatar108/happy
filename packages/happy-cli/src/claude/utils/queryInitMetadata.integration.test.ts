import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { query, type SDKMessage, type SDKResultMessage } from '@/claude/sdk';
import { queryInitMetadata } from './queryInitMetadata';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureProjectPath = resolve(__dirname, '..', '..', '..', '..', '..', 'environments', 'lab-rat-todo-project');

function resultMessage(messages: SDKMessage[]): SDKResultMessage | undefined {
    return messages.find((message): message is SDKResultMessage => message.type === 'result');
}

async function collectMessages(iterable: AsyncIterable<SDKMessage>): Promise<SDKMessage[]> {
    const messages: SDKMessage[] = [];
    for await (const message of iterable) {
        messages.push(message);
    }
    return messages;
}

async function isClaudeQueryAvailable(): Promise<boolean> {
    const tempProjectDir = mkdtempSync(join(tmpdir(), 'query-init-metadata-probe-'));

    try {
        cpSync(fixtureProjectPath, tempProjectDir, { recursive: true });
        const messages = await collectMessages(query({
            prompt: 'Say exactly ready',
            options: {
                abort: AbortSignal.timeout(20_000),
                cwd: tempProjectDir,
            },
        }));

        const result = resultMessage(messages);
        return (result && 'result' in result) ? result.result?.trim() === 'ready' : false;
    } catch (error) {
        console.log(`[query-init-metadata] Skipping: Claude query unavailable (${String(error)})`);
        return false;
    } finally {
        try {
            rmSync(tempProjectDir, { recursive: true, force: true });
        } catch {}
    }
}

const claudeAvailable = await isClaudeQueryAvailable();

describe.skipIf(!claudeAvailable)('queryInitMetadata integration', { timeout: 60_000 }, () => {
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
