import * as daemonClient from '@/daemon/daemonClient';

export type AccountSettings = Record<string, unknown>;

export async function readAccountSettings(): Promise<AccountSettings> {
  const response = await daemonClient.loopbackFetch('/v2/me/settings');
  if (!response.ok) {
    throw new Error(`Failed to read account settings: ${response.status}`);
  }
  return await response.json() as AccountSettings;
}

export async function writeAccountSettings(settings: AccountSettings): Promise<AccountSettings> {
  const response = await daemonClient.loopbackFetch('/v2/me/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!response.ok) {
    throw new Error(`Failed to write account settings: ${response.status}`);
  }
  return await response.json() as AccountSettings;
}

