import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const serverEntry = path.join(repoRoot, 'tools', 'overview-mcp', 'dist', 'index.js');

describe('stdio tools/list smoke test', () => {
  it('returns 10 tools with names beginning overview.', async () => {
    const response = await sendToolsList(serverEntry);
    const names: string[] = response.result.tools.map((t: { name: string }) => t.name);

    expect(names).toHaveLength(10);
    for (const name of names) {
      expect(name).toMatch(/^overview\./);
    }
  });
});

function sendToolsList(entry: string): Promise<{ result: { tools: { name: string }[] } }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, OVERVIEW_MCP_REPO_ROOT: repoRoot },
    });

    const chunks: Buffer[] = [];
    let settled = false;

    child.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString('utf8');
      const newline = raw.indexOf('\n');
      if (newline !== -1 && !settled) {
        settled = true;
        child.kill();
        try {
          resolve(JSON.parse(raw.slice(0, newline)) as { result: { tools: { name: string }[] } });
        } catch (err) {
          reject(err);
        }
      }
    });

    child.on('error', (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });

    child.on('close', (code) => {
      if (!settled) {
        settled = true;
        reject(new Error(`server exited with code ${code} before responding`));
      }
    });

    const request = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) + '\n';
    child.stdin.write(request);
  });
}
