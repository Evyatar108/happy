import { configuration } from "@/configuration";
import tweetnacl from 'tweetnacl';
import { writeCredentialsLegacy, readCredentials, updateSettings, Credentials, writeCredentialsDataKey } from "@/persistence";
import { openBrowser } from "@/utils/browser";
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { writeJsonAtomically } from '@slopus/happy-wire/node';
import { pollForToken, requestDeviceCode } from '@/auth/githubDeviceFlow';
import { logger } from './logger';

interface GitHubUserProfile {
    id: number;
    login: string;
    name?: string | null;
    avatar_url?: string | null;
    updated_at?: string | null;
}

export async function doAuth(): Promise<Credentials | null> {
    console.clear();
    try {
        const existingCredentials = await readCredentials();
        const deviceCode = await requestDeviceCode();
        console.log('\nGitHub Authentication\n');
        console.log(`Open: ${deviceCode.verification_uri_complete ?? deviceCode.verification_uri}`);
        console.log(`Code: ${deviceCode.user_code}\n`);

        if (deviceCode.verification_uri_complete) {
            await openBrowser(deviceCode.verification_uri_complete);
        }

        process.stdout.write('Waiting for GitHub authorization');
        const token = await pollForToken(deviceCode.device_code, deviceCode.interval, deviceCode.expires_in);
        process.stdout.write('\n');
        const credentials = await persistDeviceFlowCredentials(token, existingCredentials);
        await writeGitHubProfile(token);
        console.log('\n✓ Authentication successful\n');
        return credentials;
    } catch (error) {
        console.log(`\nAuthentication failed: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
        return null;
    }
}

async function persistDeviceFlowCredentials(token: string, existingCredentials: Credentials | null): Promise<Credentials> {
    if (existingCredentials?.encryption.type === 'legacy') {
        await writeCredentialsLegacy({ secret: existingCredentials.encryption.secret, token });
        return { token, encryption: existingCredentials.encryption };
    }
    if (existingCredentials?.encryption.type === 'dataKey') {
        await writeCredentialsDataKey({
            publicKey: existingCredentials.encryption.publicKey,
            machineKey: existingCredentials.encryption.machineKey,
            token,
        });
        return { token, encryption: existingCredentials.encryption };
    }

    const keypair = tweetnacl.box.keyPair();
    await writeCredentialsDataKey({ publicKey: keypair.publicKey, machineKey: keypair.secretKey, token });
    return {
        token,
        encryption: {
            type: 'dataKey',
            publicKey: keypair.publicKey,
            machineKey: keypair.secretKey,
        },
    };
}

async function writeGitHubProfile(token: string): Promise<void> {
    try {
        const response = await fetch('https://api.github.com/user', {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github.v3+json',
            },
        });
        if (!response.ok) {
            throw new Error(`GitHub profile fetch failed: ${response.status}`);
        }
        const profile = await response.json() as GitHubUserProfile;
        await writeJsonAtomically(join(configuration.happyHomeDir, 'profile.json'), {
            githubUserId: profile.id,
            githubLogin: profile.login,
            name: profile.name ?? null,
            avatarUrl: profile.avatar_url ?? null,
            updatedAt: profile.updated_at ?? new Date().toISOString(),
        });
    } catch (error) {
        logger.warn(`GitHub profile fetch failed; continuing auth without profile.json: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Ensure authentication and machine setup
 * This replaces the onboarding flow and ensures everything is ready
 */
export async function authAndSetupMachineIfNeeded(): Promise<{
    credentials: Credentials;
    machineId: string;
}> {
    logger.debug('[AUTH] Starting auth and machine setup...');

    // Step 1: Handle authentication
    let credentials = await readCredentials();
    let newAuth = false;

    if (!credentials) {
        logger.debug('[AUTH] No credentials found, starting authentication flow...');
        const authResult = await doAuth();
        if (!authResult) {
            throw new Error('Authentication failed or was cancelled');
        }
        credentials = authResult;
        newAuth = true;
    } else {
        logger.debug('[AUTH] Using existing credentials');
    }

    // Make sure we have a machine ID
    // Server machine entity will be created either by the daemon or by the CLI
    const settings = await updateSettings(async s => {
        if (newAuth || !s.machineId) {
            return {
                ...s,
                machineId: randomUUID()
            };
        }
        return s;
    });

    logger.debug(`[AUTH] Machine ID: ${settings.machineId}`);

    return { credentials, machineId: settings.machineId! };
}
