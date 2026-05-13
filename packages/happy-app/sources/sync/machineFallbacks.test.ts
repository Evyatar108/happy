import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
    return readFileSync(resolve(__dirname, '..', path), 'utf8');
}

describe('Sprint A machine shape fallbacks', () => {
    it('keeps machine detail off deprecated metadata mutation/version render paths', () => {
        const detail = source('app/(app)/machine/[id].tsx');

        expect(detail).not.toContain('machineUpdateMetadata');
        expect(detail).not.toContain('machine.metadata!');
        expect(detail).not.toContain("t('machine.metadataVersion')");
        expect(detail).not.toContain("t('machine.daemonStateVersion')");
    });

    it('keeps common machine consumers on optional metadata fallbacks', () => {
        const settings = source('components/SettingsView.tsx');
        const sessionsList = source('components/SessionsList.tsx');
        const compact = source('components/ActiveSessionsGroupCompact.tsx');
        const sessionView = source('-session/SessionView.tsx');
        const forkComposer = source('app/(app)/session/[id]/fork-composer.tsx');

        expect(settings).toContain('machine.metadata?.host');
        expect(settings).toContain('machine.metadata?.displayName');
        expect(sessionsList).toContain('item.machine.id');
        expect(compact).toContain('machine?.metadata?.host');
        expect(sessionView).toContain('sessionMachine?.metadata?.host');
        expect(forkComposer).toContain('machine?.metadata?.homeDir');
    });

    it('prompts for homeDir before spawning from a tilde path when metadata is absent', () => {
        const newSession = source('app/(app)/new/index.tsx');

        expect(newSession).toContain("pathToUse.startsWith('~') && !homeDir");
        expect(newSession).toContain('Modal.prompt');
        expect(newSession).toContain('resolveAbsolutePath(pathToUse, homeDir)');
    });
});
