import chalk from 'chalk';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { readCredentials } from '@/persistence';
import { getVendorTokenStatus, writeVendorToken } from '@/vendorTokens';
import { authenticateCodex } from './connect/authenticateCodex';
import { authenticateClaude } from './connect/authenticateClaude';
import { authenticateGemini } from './connect/authenticateGemini';
import { decodeJwtPayload } from './connect/utils';

/**
 * Handle connect subcommand
 * 
 * Implements connect subcommands for storing AI vendor API keys:
 * - connect codex: Store OpenAI API key for Happy
 * - connect claude: Store Anthropic API key for Happy
 * - connect gemini: Store Gemini API key for Happy
 * - connect help: Show help for connect command
 */
export async function handleConnectCommand(args: string[]): Promise<void> {
    const subcommand = args[0];

    if (!subcommand || subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
        showConnectHelp();
        return;
    }

    switch (subcommand.toLowerCase()) {
        case 'codex':
            await handleConnectVendor('codex', 'OpenAI');
            break;
        case 'claude':
            await handleConnectVendor('claude', 'Anthropic');
            break;
        case 'gemini':
            await handleConnectVendor('gemini', 'Gemini');
            break;
        case 'status':
            await handleConnectStatus();
            break;
        default:
            console.error(chalk.red(`Unknown connect target: ${subcommand}`));
            showConnectHelp();
            process.exit(1);
    }
}

function showConnectHelp(): void {
    console.log(`
${chalk.bold('happy connect')} - Connect AI vendor API keys to Happy

${chalk.bold('Usage:')}
  happy connect codex        Store your Codex API key for Happy
  happy connect claude       Store your Anthropic API key for Happy
  happy connect gemini       Store your Gemini API key for Happy
  happy connect status       Show connection status for all vendors
  happy connect help         Show this help message

${chalk.bold('Description:')}
  The connect command allows you to securely store your AI vendor API keys
  for Happy. This enables you to use these services through Happy.

${chalk.bold('Examples:')}
  happy connect codex
  happy connect claude
  happy connect gemini
  happy connect status

${chalk.bold('Notes:')} 
  • You must be authenticated with Happy first (run 'happy auth login')
  • API keys are stored locally in your Happy data directory
  • Machine-local pairing is managed with 'happy init' and the mobile pairing flow
`);
}

async function handleConnectVendor(vendor: 'codex' | 'claude' | 'gemini', displayName: string): Promise<void> {
    console.log(chalk.bold(`\n🔌 Connecting ${displayName} to Happy\n`));

    // Check if authenticated
    const credentials = await readCredentials();
    if (!credentials) {
        console.log(chalk.yellow('⚠️  Not authenticated with Happy'));
        console.log(chalk.gray('  Please run "happy auth login" first'));
        process.exit(1);
    }

    // Handle vendor authentication
    if (vendor === 'codex') {
        console.log('🚀 Saving Codex token locally');
        const codexAuthTokens = await authenticateCodex();
        await writeVendorToken('openai', { oauth: codexAuthTokens });
        console.log('✅ Codex token saved locally');
        process.exit(0);
    } else if (vendor === 'claude') {
        console.log('🚀 Saving Anthropic token locally');
        const anthropicAuthTokens = await authenticateClaude();
        await writeVendorToken('anthropic', { oauth: anthropicAuthTokens });
        console.log('✅ Anthropic token saved locally');
        process.exit(0);
    } else if (vendor === 'gemini') {
        console.log('🚀 Saving Gemini token locally');
        const geminiAuthTokens = await authenticateGemini();
        await writeVendorToken('gemini', { oauth: geminiAuthTokens });
        console.log('✅ Gemini token saved locally');
        
        // Also update local Gemini config to keep tokens in sync
        updateLocalGeminiCredentials(geminiAuthTokens);
        
        process.exit(0);
    } else {
        throw new Error(`Unsupported vendor: ${vendor}`);
    }
}

/**
 * Show connection status for all vendors
 */
async function handleConnectStatus(): Promise<void> {
    console.log(chalk.bold('\n🔌 Connection Status\n'));

    // Check if authenticated
    const credentials = await readCredentials();
    if (!credentials) {
        console.log(chalk.yellow('⚠️  Not authenticated with Happy'));
        console.log(chalk.gray('  Please run "happy auth login" first'));
        process.exit(1);
    }

    // Check each vendor
    const vendors: Array<{ key: 'openai' | 'anthropic' | 'gemini'; name: string; display: string }> = [
        { key: 'gemini', name: 'Gemini', display: 'Google Gemini' },
        { key: 'openai', name: 'Codex', display: 'OpenAI Codex' },
        { key: 'anthropic', name: 'Claude', display: 'Anthropic Claude' },
    ];

    for (const vendor of vendors) {
        try {
            const { token } = await getVendorTokenStatus(vendor.key);
            
            if (token?.oauth) {
                // Try to extract user info from id_token (JWT)
                let userInfo = '';
                
                if (token.oauth.id_token) {
                    const payload = decodeJwtPayload(token.oauth.id_token);
                    if (payload?.email) {
                        userInfo = chalk.gray(` (${payload.email})`);
                    }
                }
                
                // Check if token might be expired
                const expiresAt = token.oauth.expires_at || (token.oauth.expires_in ? Date.now() + token.oauth.expires_in * 1000 : null);
                const isExpired = expiresAt && expiresAt < Date.now();
                
                if (isExpired) {
                    console.log(`  ${chalk.yellow('⚠️')}  ${vendor.display}: ${chalk.yellow('expired')}${userInfo}`);
                } else {
                    console.log(`  ${chalk.green('✓')}  ${vendor.display}: ${chalk.green('connected')}${userInfo}`);
                }
            } else {
                console.log(`  ${chalk.gray('○')}  ${vendor.display}: ${chalk.gray('not connected')}`);
            }
        } catch {
            console.log(`  ${chalk.gray('○')}  ${vendor.display}: ${chalk.gray('not connected')}`);
        }
    }

    console.log('');
    console.log(chalk.gray('To connect a vendor, run: happy connect <vendor>'));
    console.log(chalk.gray('Example: happy connect gemini'));
    console.log('');
}

/**
 * Update local Gemini credentials file to keep in sync with Happy
 * This ensures the Gemini SDK uses the same account as Happy
 */
function updateLocalGeminiCredentials(tokens: {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
}): void {
    try {
        const geminiDir = join(homedir(), '.gemini');
        const credentialsPath = join(geminiDir, 'oauth_creds.json');
        
        // Create directory if it doesn't exist
        if (!existsSync(geminiDir)) {
            mkdirSync(geminiDir, { recursive: true });
        }
        
        // Write credentials in the format Gemini CLI expects
        const credentials = {
            access_token: tokens.access_token,
            token_type: tokens.token_type || 'Bearer',
            scope: tokens.scope || 'https://www.googleapis.com/auth/cloud-platform',
            ...(tokens.refresh_token && { refresh_token: tokens.refresh_token }),
            ...(tokens.id_token && { id_token: tokens.id_token }),
            ...(tokens.expires_in && { expires_in: tokens.expires_in }),
        };
        
        writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2), 'utf-8');
        console.log(chalk.gray(`  Updated local credentials: ${credentialsPath}`));
    } catch (error) {
        // Non-critical error - server tokens will still work
        console.log(chalk.yellow(`  ⚠️ Could not update local credentials: ${error}`));
    }
}
