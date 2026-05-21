#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { atomicWriteFile } from '../../../scripts/lib/atomic-write.mjs';

export interface InstallServerOptions {
  repoRoot?: string;
  printOnly?: boolean;
  stdout?: Pick<NodeJS.WriteStream, 'write'>;
}

export interface InstallServerResult {
  settingsPath: string;
  settings: ClaudeSettings;
}

type JsonObject = Record<string, unknown>;

interface ClaudeSettings extends JsonObject {
  mcpServers?: Record<string, unknown>;
}

const SERVER_NAME = 'codexu-overview';

export async function installServer(options: InstallServerOptions = {}): Promise<InstallServerResult> {
  const repoRoot = path.resolve(options.repoRoot ?? resolveRepoRoot(process.cwd()));
  const indexPath = path.join(repoRoot, 'tools', 'overview-mcp', 'dist', 'index.js');

  if (!fs.existsSync(indexPath)) {
    throw new Error(`Missing ${toForwardSlash(indexPath)}; run pnpm overview-mcp:build first.`);
  }

  const settingsPath = path.join(repoRoot, '.claude', 'settings.local.json');
  const settings = readSettings(settingsPath);
  const nextSettings: ClaudeSettings = {
    ...settings,
    mcpServers: {
      ...(isPlainObject(settings.mcpServers) ? settings.mcpServers : {}),
      [SERVER_NAME]: {
        command: 'node',
        args: [toForwardSlash(path.resolve(indexPath))],
      },
    },
  };
  const serialized = `${JSON.stringify(nextSettings, null, 2)}\n`;

  if (options.printOnly) {
    options.stdout?.write(serialized);
  } else {
    await atomicWriteFile(settingsPath, serialized);
  }

  return { settingsPath, settings: nextSettings };
}

function readSettings(settingsPath: string): ClaudeSettings {
  if (!fs.existsSync(settingsPath)) {
    return {};
  }

  const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as unknown;
  if (!isPlainObject(parsed)) {
    throw new Error(`${settingsPath} must contain a JSON object.`);
  }
  return parsed;
}

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toForwardSlash(value: string): string {
  return value.replace(/\\/g, '/');
}

function resolveRepoRoot(cwd: string): string {
  try {
    return execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return cwd;
  }
}

function parseArgs(argv: string[]): { printOnly: boolean } {
  const unknown = argv.filter((arg) => arg !== '--print-only');
  if (unknown.length > 0) {
    throw new Error(`Unknown argument: ${unknown[0]}`);
  }
  return { printOnly: argv.includes('--print-only') };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  await installServer({ printOnly: args.printOnly, stdout: process.stdout });
}

const currentFile = fileURLToPath(import.meta.url);
const entryFile = process.argv[1] ? path.resolve(process.argv[1]) : '';

if (entryFile === currentFile) {
  main().catch((error: unknown) => {
    process.stderr.write(`overview-mcp-install: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
