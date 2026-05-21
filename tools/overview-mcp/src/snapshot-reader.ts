import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import chokidar, { type FSWatcher } from 'chokidar';

import { loadOverviewData } from '../../../scripts/lib/sync-core.mjs';

import type { RalphOverviewConfig } from '../../../scripts/lib/default-config.mjs';
import type { OverviewData, Snapshot } from './types.js';

type CacheSlot<T> = {
  value: T | null;
  loaded: boolean;
};

export class SnapshotReader {
  readonly #config: RalphOverviewConfig;
  #snapshot: CacheSlot<Snapshot> = { value: null, loaded: false };
  #overviewData: CacheSlot<OverviewData> = { value: null, loaded: false };
  #watcher: FSWatcher | null = null;

  constructor(config: RalphOverviewConfig) {
    this.#config = {
      ...config,
      dataFile: path.resolve(config.dataFile),
      outputs: {
        ...config.outputs,
        snapshot: path.resolve(config.outputs.snapshot),
      },
    };
  }

  start(): FSWatcher {
    if (this.#watcher) {
      return this.#watcher;
    }

    const paths = [this.#config.outputs.snapshot, this.#config.dataFile];
    this.#watcher = chokidar.watch(paths, {
      ignoreInitial: true,
      interval: 50,
      awaitWriteFinish: false,
      usePolling: true,
    });
    this.#watcher.on('change', (changedPath) => {
      this.#invalidate(changedPath);
    });
    this.#watcher.on('add', (changedPath) => {
      this.#invalidate(changedPath);
    });
    this.#watcher.on('unlink', (changedPath) => {
      this.#invalidate(changedPath);
    });
    return this.#watcher;
  }

  async close(): Promise<void> {
    const watcher = this.#watcher;
    this.#watcher = null;
    if (watcher) {
      await watcher.close();
    }
  }

  async getSnapshot(): Promise<Snapshot | null> {
    if (this.#snapshot.loaded) {
      return this.#snapshot.value;
    }

    const value = await readWithRetry({
      filePath: this.#config.outputs.snapshot,
      previous: this.#snapshot.value,
      missingValue: null,
      label: 'snapshot',
      parser: async () => JSON.parse(await fs.readFile(this.#config.outputs.snapshot, 'utf8')) as Snapshot,
    });
    this.#snapshot = { value, loaded: true };
    return value;
  }

  async getOverviewData(): Promise<OverviewData | null> {
    if (this.#overviewData.loaded) {
      return this.#overviewData.value;
    }

    const value = await readWithRetry({
      filePath: this.#config.dataFile,
      previous: this.#overviewData.value,
      missingValue: null,
      label: 'overview data',
      parser: async () => loadOverviewData(this.#config.dataFile),
    });
    this.#overviewData = { value, loaded: true };
    return value;
  }

  #invalidate(changedPath: string): void {
    const resolvedPath = path.resolve(changedPath);
    if (resolvedPath === this.#config.outputs.snapshot) {
      this.#snapshot.loaded = false;
    }
    if (resolvedPath === this.#config.dataFile) {
      this.#overviewData.loaded = false;
    }
  }
}

async function readWithRetry<T>({
  filePath,
  previous,
  missingValue,
  label,
  parser,
}: {
  filePath: string;
  previous: T | null;
  missingValue: T | null;
  label: string;
  parser: () => Promise<T>;
}): Promise<T | null> {
  if (!(await exists(filePath))) {
    return missingValue;
  }

  const maxRetries = 3;
  let lastError: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      await delay(100);
    }
    try {
      return await parser();
    } catch (error) {
      lastError = error;
    }
  }
  process.stderr.write(
    `overview-mcp: failed to read ${label} at ${filePath}; using ${previous ? 'cached value' : 'null'} (${formatError(lastError)})\n`,
  );
  return previous ?? null;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
