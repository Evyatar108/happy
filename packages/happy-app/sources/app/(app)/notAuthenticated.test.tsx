import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
    return readFileSync(resolve(__dirname, '..', '..', path), 'utf8');
}

describe('NotAuthenticated private tunnel pairing', () => {
    it('threads the acquired connect token through pre-pair requests and credentials', () => {
        const home = source('app/(app)/index.tsx');

        expect(home).toContain('acquireConnectTokenForPair(machine)');
        expect(home).toContain('startPairFlow(machine, connectToken)');
        expect(home).toContain('waitForPairStatus(machine, flow, connectToken)');
        expect(home).toContain('connectTokenExpiry');
        expect(home).not.toContain('.getConnectToken(');
    });
});
