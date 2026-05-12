import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadVendorTokensWithHome(homeDir: string) {
  vi.resetModules();
  vi.doMock('@/configuration', () => ({
    configuration: { happyHomeDir: homeDir },
  }));
  return await import('./vendorTokens');
}

describe('vendor token persistence', () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    vi.doUnmock('@/configuration');
    for (const dir of tmpDirs.splice(0)) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('writes and reads vendor tokens from vendor-tokens.json', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'happy-vendor-tokens-'));
    tmpDirs.push(homeDir);
    const vendorTokens = await loadVendorTokensWithHome(homeDir);

    await vendorTokens.writeVendorToken('gemini', { oauth: { access_token: 'gemini-token' } });
    await vendorTokens.writeVendorToken('openai', { oauth: { access_token: 'openai-token' } });

    await expect(vendorTokens.readVendorToken('gemini')).resolves.toEqual({ oauth: { access_token: 'gemini-token' } });
    await expect(vendorTokens.getVendorTokenStatus('openai')).resolves.toMatchObject({ connected: true });
    await expect(fs.readFile(path.join(homeDir, 'vendor-tokens.json'), 'utf-8').then(JSON.parse)).resolves.toEqual({
      gemini: { oauth: { access_token: 'gemini-token' } },
      openai: { oauth: { access_token: 'openai-token' } },
    });
  });

  it('never leaves corrupt JSON after concurrent writes', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'happy-vendor-tokens-'));
    tmpDirs.push(homeDir);
    const vendorTokens = await loadVendorTokensWithHome(homeDir);

    await Promise.all([
      vendorTokens.writeVendorToken('gemini', { oauth: { access_token: 'gemini-token' } }),
      vendorTokens.writeVendorToken('openai', { oauth: { access_token: 'openai-token' } }),
      vendorTokens.writeVendorToken('anthropic', { oauth: { access_token: 'anthropic-token' } }),
    ]);

    const parsed = JSON.parse(await fs.readFile(path.join(homeDir, 'vendor-tokens.json'), 'utf-8'));
    expect(Object.keys(parsed).length).toBeGreaterThan(0);
  });
});

