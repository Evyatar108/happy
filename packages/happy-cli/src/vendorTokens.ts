import { mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { writeJsonAtomically } from '@slopus/happy-wire/node';

import { configuration } from '@/configuration';

export type VendorTokenName = 'openai' | 'anthropic' | 'gemini';
export interface OAuthVendorToken {
  oauth?: {
    access_token?: string;
    refresh_token?: string;
    id_token?: string;
    expires_at?: number;
    expires_in?: number;
    token_type?: string;
    scope?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}
export type VendorToken = OAuthVendorToken;

const vendorTokensPath = () => join(configuration.happyHomeDir, 'vendor-tokens.json');

async function readVendorTokensFile(): Promise<Partial<Record<VendorTokenName, unknown>>> {
  try {
    return JSON.parse(await readFile(vendorTokensPath(), 'utf-8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

export async function readVendorToken(vendor: VendorTokenName): Promise<VendorToken | null> {
  const tokens = await readVendorTokensFile();
  const token = tokens[vendor];
  return token === undefined ? null : token as VendorToken;
}

export async function writeVendorToken(vendor: VendorTokenName, token: unknown): Promise<void> {
  if (!existsSync(configuration.happyHomeDir)) {
    await mkdir(configuration.happyHomeDir, { recursive: true });
  }
  const tokens = await readVendorTokensFile();
  await writeJsonAtomically(vendorTokensPath(), { ...tokens, [vendor]: token });
}

export async function getVendorTokenStatus(vendor: VendorTokenName): Promise<{ connected: boolean; token: VendorToken | null }> {
  const token = await readVendorToken(vendor);
  return { connected: token !== null, token };
}
