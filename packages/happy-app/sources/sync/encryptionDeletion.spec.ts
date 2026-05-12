import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = join(__dirname, '..', '..', '..', '..');

const productionFiles = execFileSync('git', ['ls-files', 'packages/happy-app/sources'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n')
    .filter(file => /\.(ts|tsx)$/.test(file))
    .filter(file => !/\.(test|spec|appspec)\.tsx?$/.test(file));

const productionSources = productionFiles.map(file => ({
    file,
    lines: readFileSync(join(repoRoot, file), 'utf8').split(/\r?\n/),
}));

type AllowedMatch = { file: string; pattern: RegExp; reason: string };

const allowedMatches: AllowedMatch[] = [
    { file: 'packages/happy-app/sources/hooks/useFileAttachmentCore.ts', pattern: /typeof crypto !== 'undefined'/, reason: 'browser UUID fallback feature detection' },
    { file: 'packages/happy-app/sources/hooks/useFileAttachmentCore.ts', pattern: /crypto\.randomUUID\(\)/, reason: 'browser UUID fallback for local attachment IDs' },
    { file: 'packages/happy-app/sources/sync/sync.ts', pattern: /expo-crypto/, reason: 'randomUUID for local optimistic IDs' },
    { file: 'packages/happy-app/sources/utils/oauth.ts', pattern: /expo-crypto/, reason: 'OAuth PKCE verifier generation' },
    { file: 'packages/happy-app/sources/utils/worktree.ts', pattern: /expo-crypto/, reason: 'worktree id generation' },
];

function findMatches(pattern: RegExp): Array<{ file: string; line: string }> {
    const matches: Array<{ file: string; line: string }> = [];
    for (const { file, lines } of productionSources) {
        for (const line of lines) {
            pattern.lastIndex = 0;
            if (pattern.test(line)) {
                matches.push({ file, line: line.trim() });
            }
        }
    }
    return matches;
}

function withoutAllowed(matches: Array<{ file: string; line: string }>): Array<{ file: string; line: string }> {
    return matches.filter(match => !allowedMatches.some(allowed => allowed.file === match.file && allowed.pattern.test(match.line)));
}

describe('deleted Sprint D surfaces', () => {
    it('has no strict deleted crypto dependency surfaces in production sources', () => {
        expect(findMatches(/sodiumPlus|libsodium|tweetnacl|@stablelib|@more-tech\/react-native-libsodium|rn-encryption|dataEncryptionKey|contentEncryptionKey|encryptedMetadata|@\/encryption\/|@\/sync\/encryption\//)).toEqual([]);
    });

    it('keeps old-shape migration detector references confined to tokenStorage', () => {
        const matches = findMatches(/pinnedPubkey|sessionKey/);
        expect(matches.every(match => match.file === 'packages/happy-app/sources/auth/tokenStorage.ts')).toBe(true);
    });

    it('has no relaxed crypto verbs outside the allowlist', () => {
        expect(withoutAllowed(findMatches(/\bencrypt\b|\bdecrypt\b|\bcrypto\b/))).toEqual([]);
    });

    it('has no voice or realtime production surfaces', () => {
        expect(findMatches(/voiceHooks|RealtimeProvider|RealtimeVoiceSession|RealtimeSession|VoiceAssistantStatusBar|applyVoiceUpsellOverride|realtimeClientTools|voiceConfig|voiceExperiment|voiceSystemPrompt|contextFormatters|microphonePermissions|@\/realtime\//)).toEqual([]);
    });

    it('has no retired Sprint D route/helper strings', () => {
        expect(findMatches(/refreshConnectTokenIfNeeded|settingsVersion|loadPendingSettings|savePendingSettings|pending-settings|\/pair\/connect|useConnectTerminal/)).toEqual([]);
    });

    it('has no legacy v1 account or machine route strings', () => {
        expect(findMatches(/\/v1\/machines|\/v1\/connect\/github|\/v1\/connect\/|\/v1\/account\/profile|\/v1\/account\/settings|\/v1\/me\/machine/)).toEqual([]);
    });
});
