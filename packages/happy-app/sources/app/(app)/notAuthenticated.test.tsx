import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
    return readFileSync(resolve(__dirname, '..', '..', path), 'utf8');
}

describe('NotAuthenticated private tunnel pairing', () => {
    it('threads the acquired connect token through pairing and credentials', () => {
        const home = source('app/(app)/index.tsx');

        expect(home).toContain('acquireConnectTokenForPair(machine)');
        expect(home).toContain('completePair(machine, connectToken)');
        expect(home).toContain('connectTokenExpiry');
        expect(home).not.toContain('.getConnectToken(');
    });
});
