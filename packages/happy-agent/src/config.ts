import { homedir } from 'node:os';
import { join } from 'node:path';

export type Config = {
    legacyServerUrl: string;
    pairingBaseUrl: string;
    homeDir: string;
    credentialPath: string;
};

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function isInsecureRemoteUrl(rawUrl: string): boolean {
    let parsed: URL;
    try {
        parsed = new URL(rawUrl);
    } catch {
        return false;
    }
    if (parsed.protocol !== 'http:') {
        return false;
    }
    const host = parsed.hostname.replace(/^\[|\]$/g, '');
    return !LOCAL_HOSTS.has(host);
}

function enforceTransportSecurity(envVar: string, rawUrl: string | undefined): void {
    if (!rawUrl || !isInsecureRemoteUrl(rawUrl)) {
        return;
    }
    const message = `${envVar} uses http:// for a non-localhost host (${rawUrl}); credentials and device codes would be transmitted in cleartext.`;
    if (process.env.HAPPY_ALLOW_INSECURE === '1' || process.env.NODE_ENV === 'development') {
        console.warn(message);
        return;
    }
    throw new Error(`${message} Set HAPPY_ALLOW_INSECURE=1 to override (development/test only).`);
}

export function loadConfig(): Config {
    enforceTransportSecurity('HAPPY_SERVER_URL', process.env.HAPPY_SERVER_URL);
    enforceTransportSecurity('HAPPY_PAIRING_URL', process.env.HAPPY_PAIRING_URL);
    const legacyServerUrl = (process.env.HAPPY_SERVER_URL ?? 'https://api.cluster-fluster.com').replace(/\/+$/, '');
    const pairingBaseUrl = (process.env.HAPPY_PAIRING_URL ?? legacyServerUrl).replace(/\/+$/, '');
    const homeDir = process.env.HAPPY_AGENT_HOME_DIR ?? join(homedir(), '.happy-agent');
    if (process.env.HAPPY_HOME_DIR && !process.env.HAPPY_AGENT_HOME_DIR) {
        console.warn('HAPPY_HOME_DIR is deprecated for happy-agent credentials; use HAPPY_AGENT_HOME_DIR. HAPPY_HOME_DIR is only used for legacy agent.key lookup.');
    }
    const credentialPath = join(homeDir, 'credentials.json');
    return { legacyServerUrl, pairingBaseUrl, homeDir, credentialPath };
}
