import { homedir } from 'node:os';
import { join } from 'node:path';

export type Config = {
    legacyServerUrl: string;
    pairingBaseUrl: string;
    homeDir: string;
    credentialPath: string;
};

export function loadConfig(): Config {
    const legacyServerUrl = (process.env.HAPPY_SERVER_URL ?? 'https://api.cluster-fluster.com').replace(/\/+$/, '');
    const pairingBaseUrl = (process.env.HAPPY_PAIRING_URL ?? legacyServerUrl).replace(/\/+$/, '');
    const homeDir = process.env.HAPPY_AGENT_HOME_DIR ?? join(homedir(), '.happy-agent');
    if (process.env.HAPPY_HOME_DIR && !process.env.HAPPY_AGENT_HOME_DIR) {
        console.warn('HAPPY_HOME_DIR is deprecated for happy-agent credentials; use HAPPY_AGENT_HOME_DIR. HAPPY_HOME_DIR is only used for legacy agent.key lookup.');
    }
    const credentialPath = join(homeDir, 'credentials.json');
    return { legacyServerUrl, pairingBaseUrl, homeDir, credentialPath };
}
