import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { installServer } from '../install-server.js';

let tempRoot: string;

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'overview-mcp-install-'));
});

afterEach(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('overview-mcp-install', () => {
  it('writes codexu-overview MCP settings and is idempotent', async () => {
    await writeBuiltServer(tempRoot);
    const settingsPath = path.join(tempRoot, '.claude', 'settings.local.json');
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    await fs.writeFile(
      settingsPath,
      `${JSON.stringify({ mcpServers: { existing: { command: 'node', args: ['existing.js'] } }, other: true }, null, 2)}\n`,
      'utf8',
    );

    await installServer({ repoRoot: tempRoot });
    const firstWrite = await fs.readFile(settingsPath, 'utf8');
    await installServer({ repoRoot: tempRoot });
    const secondWrite = await fs.readFile(settingsPath, 'utf8');

    expect(secondWrite).toBe(firstWrite);
    expect(JSON.parse(firstWrite)).toEqual({
      mcpServers: {
        existing: { command: 'node', args: ['existing.js'] },
        'codexu-overview': {
          command: 'node',
          args: [toForwardSlash(path.join(tempRoot, 'tools', 'overview-mcp', 'dist', 'index.js'))],
        },
      },
      other: true,
    });
  });

  it('creates settings.local.json from an absent file', async () => {
    await writeBuiltServer(tempRoot);

    await installServer({ repoRoot: tempRoot });

    const settings = JSON.parse(await fs.readFile(path.join(tempRoot, '.claude', 'settings.local.json'), 'utf8'));
    expect(settings.mcpServers['codexu-overview']).toEqual({
      command: 'node',
      args: [toForwardSlash(path.join(tempRoot, 'tools', 'overview-mcp', 'dist', 'index.js'))],
    });
  });

  it('prints the merged JSON without writing when --print-only is requested', async () => {
    await writeBuiltServer(tempRoot);
    let stdout = '';

    await installServer({
      repoRoot: tempRoot,
      printOnly: true,
      stdout: { write: (chunk: string) => { stdout += chunk; return true; } },
    });

    expect(JSON.parse(stdout).mcpServers['codexu-overview']).toEqual({
      command: 'node',
      args: [toForwardSlash(path.join(tempRoot, 'tools', 'overview-mcp', 'dist', 'index.js'))],
    });
    await expect(fs.stat(path.join(tempRoot, '.claude', 'settings.local.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('errors clearly when dist/index.js is absent', async () => {
    await expect(installServer({ repoRoot: tempRoot })).rejects.toThrow(/run pnpm overview-mcp:build first/);
    await expect(fs.stat(path.join(tempRoot, '.claude', 'settings.local.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

async function writeBuiltServer(repoRoot: string): Promise<void> {
  const indexPath = path.join(repoRoot, 'tools', 'overview-mcp', 'dist', 'index.js');
  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  await fs.writeFile(indexPath, 'export {};\n', 'utf8');
}

function toForwardSlash(value: string): string {
  return value.replace(/\\/g, '/');
}
