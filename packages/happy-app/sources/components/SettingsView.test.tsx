import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
    return readFileSync(resolve(__dirname, '..', path), 'utf8');
}

describe('SettingsView private tunnel pairing', () => {
    it('threads X-Tunnel-Connect through the pairing helper instead of calling the provider directly', () => {
        const settings = source('components/SettingsView.tsx');

        expect(settings).toContain('acquireConnectTokenForPair(selectedMachine)');
        expect(settings).toContain('startPairFlow(selectedMachine, connectToken)');
        expect(settings).toContain('waitForPairStatus(selectedMachine, flow, connectToken)');
        expect(settings).toContain('connectTokenExpiry');
        expect(settings).not.toContain('.getConnectToken(');
    });
});
