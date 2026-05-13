#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtemp, mkdir, copyFile, writeFile, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

const REQUEST_TIMEOUT_MS = 10_000;
const TURN_COMPLETE_TIMEOUT_MS = 30_000;
const THREAD_COMPACTED_TIMEOUT_MS = 60_000;
const SPIKE_NAME = 'codex-wire-spike';
const RED_CANARY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAMElEQVR4nO3OIQEAAAgDMGIg6Z+JLhDjZmJ+tT2XVAICAgICAgICAgICAgICAunAA9mpTHl4No2FAAAAAElFTkSuQmCC';
const Q1_ACCEPTED = 'IMAGE_ACCEPTED_RED_CANARY';
const Q1_DROPPED = 'NO IMAGE RECEIVED';
const Q3_TOP_CANARY = 'CANARY-Q3-TOP-XJ7QK';
const Q3_NESTED_CANARY = 'CANARY-Q3-NESTED-XJ7QK';

function winPath(p) {
  return process.platform === 'win32' ? p.replaceAll('/', '\\') : p;
}

function realCodexHome() {
  return process.env.CODEX_HOME || path.join(homedir(), '.codex');
}

function maybeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function codexSpawnSpec(args) {
  if (process.platform === 'win32') {
    const npmCodex = path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@gim-home', 'codex', 'bin', 'codex.js');
    if (existsSync(npmCodex)) return { command: process.execPath, args: [npmCodex, ...args] };
    return { command: 'bash', args: ['-lc', `exec codex ${args.map(shellQuote).join(' ')}`] };
  }
  return { command: 'codex', args };
}

function killProcessTree(pid) {
  if (!pid) return Promise.resolve();
  if (process.platform !== 'win32') {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {}
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const killer = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
    killer.on('error', () => resolve());
    killer.on('exit', () => resolve());
  });
}

function findLayerOverrides(configReadResult) {
  const warnings = [];
  for (const layer of configReadResult?.layers || []) {
    const config = layer?.config && typeof layer.config === 'object' ? layer.config : {};
    for (const key of ['project_doc_fallback_filenames', 'compact_prompt']) {
      if (Object.prototype.hasOwnProperty.call(config, key)) {
        warnings.push({ layer: layer.name, version: layer.version, key, value: config[key] });
      }
    }
  }
  return warnings;
}

class JsonRpcStdioClient {
  constructor(command, args, env) {
    this.command = command;
    this.args = args;
    this.env = env;
    this.nextId = 1;
    this.pending = new Map();
    this.notifications = [];
    this.notificationWaiters = [];
    this.stderr = [];
    this.proc = null;
    this.readline = null;
  }

  start() {
    this.proc = spawn(this.command, this.args, {
      env: this.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.proc.on('exit', (code, signal) => {
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`codex app-server exited while waiting for ${pending.method} (id=${id}, code=${code}, signal=${signal})`));
      }
      this.pending.clear();
    });

    this.proc.stderr.on('data', (chunk) => {
      const text = chunk.toString().trim();
      if (text) this.stderr.push(text);
    });

    this.readline = createInterface({ input: this.proc.stdout });
    this.readline.on('line', (line) => {
      if (!line.trim()) return;
      const msg = maybeJson(line);
      if (!msg) return;
      this.handleMessage(msg);
    });
  }

  handleMessage(msg) {
    if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(msg.id);
      if (msg.error) {
        pending.reject(new Error(`${pending.method}: ${msg.error.message || JSON.stringify(msg.error)}`));
      } else {
        pending.resolve(msg.result);
      }
      return;
    }
    if (msg.method) {
      this.notifications.push(msg);
      for (const waiter of [...this.notificationWaiters]) {
        if (!waiter.predicate(msg)) continue;
        clearTimeout(waiter.timer);
        this.notificationWaiters = this.notificationWaiters.filter((candidate) => candidate !== waiter);
        waiter.resolve(msg);
      }
    }
  }

  send(message) {
    return new Promise((resolve, reject) => {
      const stdin = this.proc?.stdin;
      if (!stdin?.writable) {
        reject(new Error('codex app-server stdin is not writable'));
        return;
      }
      stdin.write(`${JSON.stringify(message)}\n`, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  request(method, params, timeoutMs = REQUEST_TIMEOUT_MS) {
    const id = this.nextId++;
    const message = { jsonrpc: '2.0', id, method, params };
    const response = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out after ${timeoutMs}ms (id=${id})`));
      }, timeoutMs);
      this.pending.set(id, { method, resolve, reject, timer });
    });
    return this.send(message).then(() => response);
  }

  notify(method, params) {
    return this.send({ jsonrpc: '2.0', method, params });
  }

  markNotifications() {
    return this.notifications.length;
  }

  notificationsSince(mark) {
    return this.notifications.slice(mark);
  }

  waitForNotification(predicate, timeoutMs, startIndex = 0) {
    const existing = this.notifications.slice(startIndex).find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        timer: setTimeout(() => {
          this.notificationWaiters = this.notificationWaiters.filter((candidate) => candidate !== waiter);
          reject(new Error(`notification wait timed out after ${timeoutMs}ms`));
        }, timeoutMs),
      };
      this.notificationWaiters.push(waiter);
    });
  }

  async close() {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`client closing while waiting for ${pending.method} (id=${id})`));
    }
    this.pending.clear();
    for (const waiter of this.notificationWaiters) {
      clearTimeout(waiter.timer);
      waiter.resolve(null);
    }
    this.notificationWaiters = [];
    this.readline?.close();
    if (!this.proc) return;
    const pid = this.proc.pid;
    this.proc.stdin?.end();
    await killProcessTree(pid);
    await new Promise((resolve) => {
      const done = () => resolve();
      const timer = setTimeout(() => {
        if (this.proc && !this.proc.killed) this.proc.kill('SIGKILL');
        resolve();
      }, 2_000);
      this.proc.once('exit', () => {
        clearTimeout(timer);
        done();
      });
    });
  }
}

async function prepareIsolatedHome(root) {
  const tmpCodexHome = path.join(root, 'codex-home');
  await mkdir(tmpCodexHome, { recursive: true });
  await writeFile(path.join(tmpCodexHome, 'config.toml'), '', 'utf8');

  const sourceAuth = path.join(realCodexHome(), 'auth.json');
  const copiedAuth = existsSync(sourceAuth);
  if (copiedAuth) {
    await copyFile(sourceAuth, path.join(tmpCodexHome, 'auth.json'));
  }
  return { tmpCodexHome, sourceAuth, copiedAuth, openaiApiKeyPassthrough: !copiedAuth && Boolean(process.env.OPENAI_API_KEY) };
}

async function writeProbeFiles(root, files) {
  await mkdir(root, { recursive: true });
  for (const [name, text] of Object.entries(files)) {
    await writeFile(path.join(root, name), text, 'utf8');
  }
}

function threadStartParams(cwd, config) {
  return {
    cwd: winPath(cwd),
    approvalPolicy: 'never',
    sandbox: 'read-only',
    config: config || null,
    ephemeral: true,
    sessionStartSource: 'startup',
    threadSource: 'local',
  };
}

function threadIdFromResponse(response) {
  return response?.thread?.id || response?.thread?.threadId || response?.thread?.thread_id || null;
}

function eventParams(notification) {
  return notification?.params || {};
}

function normalizedEvent(notification) {
  if (notification?.method !== 'codex/event' && !notification?.method?.startsWith?.('codex/event/')) {
    return notification;
  }
  const msg = notification?.params?.msg;
  if (!msg || typeof msg !== 'object') return notification;
  if (msg.type === 'task_started') {
    return { method: 'turn/started', params: { ...msg, turnId: msg.turn_id || msg.turnId || null } };
  }
  if (msg.type === 'task_complete' || msg.type === 'turn_aborted') {
    return { method: 'turn/completed', params: { ...msg, turnId: msg.turn_id || msg.turnId || null } };
  }
  if (msg.type === 'agent_message') {
    return { method: 'item/completed', params: { item: { type: 'agentMessage', text: msg.message || '' }, ...msg } };
  }
  return notification;
}

function eventThreadId(notification) {
  const params = eventParams(notification);
  return params.threadId || params.thread_id || params.thread?.id || null;
}

function eventTurnId(notification) {
  const params = eventParams(notification);
  return params.turnId || params.turn_id || params.turn?.id || null;
}

function isInterestingEvent(notification) {
  notification = normalizedEvent(notification);
  return [
    'error',
    'turn/started',
    'item/agentMessage/delta',
    'item/completed',
    'rawResponseItem/completed',
    'turn/completed',
  ].includes(notification?.method);
}

function capturedEvents(client, mark, threadId = null, turnId = null) {
  return client.notificationsSince(mark).map(normalizedEvent).filter((notification) => {
    if (!isInterestingEvent(notification)) return false;
    if (threadId && eventThreadId(notification) && eventThreadId(notification) !== threadId) return false;
    if (turnId && eventTurnId(notification) && eventTurnId(notification) !== turnId) return false;
    return true;
  });
}

function extractText(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  if (typeof value.text === 'string') return value.text;
  if (typeof value.message === 'string') return value.message;
  if (typeof value.delta === 'string') return value.delta;
  if (value.item) return extractText(value.item);
  if (Array.isArray(value.content)) return value.content.map(extractText).join('');
  if (Array.isArray(value.items)) return value.items.map(extractText).join('');
  return '';
}

function agentContentFromEvents(events) {
  const finalMessages = events
    .filter((event) => event.method === 'item/completed' && event.params?.item?.type === 'agentMessage')
    .map((event) => extractText(event.params.item))
    .filter(Boolean);
  if (finalMessages.length > 0) return finalMessages.join('');

  return events.map((event) => {
    if (event.method === 'item/agentMessage/delta') return extractText(event.params);
    if (event.method === 'item/completed' && event.params?.item?.type === 'agentMessage') {
      return extractText(event.params.item);
    }
    if (event.method === 'codex/event' && event.params?.msg?.type === 'agent_message') {
      return extractText(event.params.msg);
    }
    return '';
  }).join('');
}

function q1Verdict(events, error) {
  if (error) return { status: 'rejected', marker: 'rejected', reason: error.message };
  const content = agentContentFromEvents(events);
  if (content.includes(Q1_ACCEPTED)) return { status: 'accepted', marker: 'accepted', content };
  if (content.includes(Q1_DROPPED) || content.trim() === '') return { status: 'silently dropped', marker: 'silently-dropped', content };
  return { status: 'accepted', marker: 'accepted', content };
}

async function waitForTurnCompletion(client, mark, threadId, turnId) {
  return client.waitForNotification((notification) => (
    notification?.method === 'turn/completed'
    && (!threadId || eventThreadId(notification) === threadId)
    && (!turnId || eventTurnId(notification) === turnId)
  ), TURN_COMPLETE_TIMEOUT_MS, mark);
}

async function runImageProbe(client, scratchRoot, variant) {
  const cwd = path.join(scratchRoot, `q1-${variant}`);
  await writeProbeFiles(cwd, {});
  const threadResponse = await client.request('thread/start', threadStartParams(cwd, null));
  const threadId = threadIdFromResponse(threadResponse);
  const prompt = `This is an image transport probe. If the attached image is visible and predominantly red, reply exactly ${Q1_ACCEPTED}. If no image is visible, reply exactly ${Q1_DROPPED}.`;
  let imageItem;
  if (variant === 'data-url') {
    imageItem = { type: 'image', url: `data:image/png;base64,${RED_CANARY_PNG_BASE64}` };
  } else {
    const imagePath = path.join(cwd, 'q1-red-canary.png');
    await writeFile(imagePath, Buffer.from(RED_CANARY_PNG_BASE64, 'base64'));
    imageItem = { type: 'localImage', path: winPath(imagePath) };
  }

  const request = {
    threadId,
    input: [
      { type: 'text', text: prompt },
      imageItem,
    ],
  };
  const mark = client.markNotifications();
  let response = null;
  let error = null;
  let turnId = null;
  try {
    response = await client.request('turn/start', request);
    turnId = response?.turn?.id || null;
    await waitForTurnCompletion(client, mark, threadId, turnId);
  } catch (caught) {
    error = caught;
  }
  const events = capturedEvents(client, mark, threadId, turnId);
  return {
    variant,
    cwd: winPath(cwd),
    request,
    response,
    error: error ? error.message : null,
    events,
    verdict: q1Verdict(events, error),
  };
}

async function readFirstExisting(paths) {
  for (const candidate of paths) {
    if (!existsSync(candidate)) continue;
    return { source: candidate, origin: 'local', text: await readFile(candidate, 'utf8') };
  }
  return null;
}

function candidateRepoRoots() {
  const cwd = process.cwd();
  const roots = [cwd];
  const parts = cwd.split(/[\\/]+/);
  const worktreesIndex = parts.lastIndexOf('.worktrees');
  if (worktreesIndex > 0) {
    roots.push(parts.slice(0, worktreesIndex).join(path.sep));
  }
  return [...new Set(roots)];
}

async function q3SourceOracle() {
  const source = await readFirstExisting(candidateRepoRoots().flatMap((root) => [
    path.join(root, 'codex', 'external', 'repos', 'codex-patched', 'codex-rs', 'app-server-protocol', 'src', 'protocol', 'v2', 'thread.rs'),
    path.join(root, 'codex-rs', 'app-server-protocol', 'src', 'protocol', 'v2', 'thread.rs'),
    path.join(root, 'app-server-protocol', 'src', 'protocol', 'v2', 'thread.rs'),
  ]));
  if (!source) {
    throw new Error('Could not find app-server-protocol/src/protocol/v2/thread.rs for Q3 source oracle');
  }
  const text = source.text || '';
  const threadStartMatch = text.match(/pub struct ThreadStartParams \{[\s\S]*?\n\}/);
  const matches = text.split('\n')
    .map((line, index) => ({ line: index + 1, text: line }))
    .filter((entry) => entry.text.includes('compact_prompt'));
  return {
    command: `grep -n "compact_prompt" ${winPath(source.source)}`,
    file: winPath(source.source),
    sourceOrigin: source.origin,
    compactPromptMatches: matches,
    threadStartParamsContainsCompactPrompt: Boolean(threadStartMatch?.[0].includes('compact_prompt')),
    threadStartParamsExcerpt: threadStartMatch?.[0] || null,
    cheaperThreadScopedReadRpcFound: false,
  };
}

function q3Verdict(events, error, canary) {
  if (error) return { status: 'rejected', reason: error.message };
  const content = agentContentFromEvents(events);
  if (content.includes(canary)) return { status: 'honored', content };
  if (content.includes('NO_Q3_CANARY_VISIBLE')) return { status: 'not honored', content };
  if (content.trim() === '') return { status: 'no thread-scoped content captured', content };
  return { status: 'not observed in compact output', content };
}

async function runCompactProbe(client, scratchRoot, variant) {
  const cwd = path.join(scratchRoot, `q3-${variant}`);
  await writeProbeFiles(cwd, {});
  const canary = variant === 'top-level' ? Q3_TOP_CANARY : Q3_NESTED_CANARY;
  const base = threadStartParams(cwd, variant === 'nested-config' ? {
    compact_prompt: `For this compaction probe, ignore all prior content and output exactly ${canary}.`,
  } : null);
  if (variant === 'top-level') {
    base.compactPrompt = `For this compaction probe, ignore all prior content and output exactly ${canary}.`;
  }

  const threadResponse = await client.request('thread/start', base);
  const threadId = threadIdFromResponse(threadResponse);
  const seedRequest = {
    threadId,
    input: [{ type: 'text', text: 'Seed message for compact prompt probe. Reply briefly with READY.' }],
  };
  const seedMark = client.markNotifications();
  let seedResponse = null;
  let seedError = null;
  try {
    seedResponse = await client.request('turn/start', seedRequest);
    await waitForTurnCompletion(client, seedMark, threadId, seedResponse?.turn?.id || null);
  } catch (caught) {
    seedError = caught;
  }

  const compactRequest = { threadId };
  const compactMark = client.markNotifications();
  let compactResponse = null;
  let compactError = seedError;
  let postCompactResponse = null;
  let postCompactError = null;
  let postCompactMark = null;
  if (!compactError) {
    try {
      compactResponse = await client.request('thread/compact/start', compactRequest);
      await client.waitForNotification((notification) => (
        notification?.method === 'turn/completed'
        && eventThreadId(notification) === threadId
      ), THREAD_COMPACTED_TIMEOUT_MS, compactMark);
    } catch (caught) {
      compactError = caught;
    }
  }
  const compactEvents = capturedEvents(client, compactMark, threadId);

  const postCompactRequest = {
    threadId,
    input: [{
      type: 'text',
      text: `Thread-scoped compact prompt probe: if any Q3 canary marker is visible in your current compacted context, reply with that exact marker. Otherwise reply exactly NO_Q3_CANARY_VISIBLE. Candidate markers: ${Q3_TOP_CANARY}, ${Q3_NESTED_CANARY}.`,
    }],
  };
  if (!compactError) {
    postCompactMark = client.markNotifications();
    try {
      postCompactResponse = await client.request('turn/start', postCompactRequest);
      await waitForTurnCompletion(client, postCompactMark, threadId, postCompactResponse?.turn?.id || null);
    } catch (caught) {
      postCompactError = caught;
    }
  }

  const postCompactEvents = postCompactMark === null
    ? []
    : capturedEvents(client, postCompactMark, threadId, postCompactResponse?.turn?.id || null);
  return {
    variant,
    canary,
    cwd: winPath(cwd),
    threadStartRequest: base,
    threadStartResponse: threadResponse,
    seedTurn: {
      request: seedRequest,
      response: seedResponse,
      events: capturedEvents(client, seedMark, threadId, seedResponse?.turn?.id || null),
      error: seedError ? seedError.message : null,
    },
    compact: {
      request: compactRequest,
      response: compactResponse,
      events: compactEvents,
      error: compactError ? compactError.message : null,
    },
    postCompactTurn: {
      request: postCompactRequest,
      response: postCompactResponse,
      events: postCompactEvents,
      error: postCompactError ? postCompactError.message : null,
    },
    verdict: q3Verdict([...compactEvents, ...postCompactEvents], compactError || postCompactError, canary),
  };
}

async function main() {
  const scratchRoot = await mkdtemp(path.join(tmpdir(), `${SPIKE_NAME}-`));
  let client;
  const result = {
    spike: SPIKE_NAME,
    startedAt: new Date().toISOString(),
    codexVersion: null,
    isolation: null,
    taintWarnings: [],
    timeouts: {
      requestMs: REQUEST_TIMEOUT_MS,
      turnCompleteMs: TURN_COMPLETE_TIMEOUT_MS,
      threadCompactedMs: THREAD_COMPACTED_TIMEOUT_MS,
    },
    q1: [],
    q2: [],
    q3: null,
  };

  try {
    result.codexVersion = await new Promise((resolve, reject) => {
      const spec = codexSpawnSpec(['--version']);
      const proc = spawn(spec.command, spec.args, { windowsHide: true });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
      proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      proc.on('error', reject);
      proc.on('exit', (code) => {
        if (code === 0) resolve(stdout.trim());
        else reject(new Error(`codex --version exited ${code}: ${stderr.trim()}`));
      });
    });

    const isolation = await prepareIsolatedHome(scratchRoot);
    result.isolation = {
      codeXHome: winPath(isolation.tmpCodexHome),
      copiedAuthJson: isolation.copiedAuth,
      authSource: isolation.copiedAuth ? winPath(isolation.sourceAuth) : null,
      openaiApiKeyPassthrough: isolation.openaiApiKeyPassthrough,
      emptyConfigToml: true,
    };

    const env = { ...process.env, CODEX_HOME: isolation.tmpCodexHome };
    const appServerSpec = codexSpawnSpec(['app-server', '--listen', 'stdio://']);
    client = new JsonRpcStdioClient(appServerSpec.command, appServerSpec.args, env);
    client.start();

    await client.request('initialize', {
      clientInfo: { name: SPIKE_NAME, title: 'Codex Wire Spike', version: '0.1.0' },
      capabilities: { experimentalApi: true },
    });
    await client.notify('initialized');

    const configRead = await client.request('config/read', { includeLayers: true });
    result.configRead = {
      request: { includeLayers: true },
      layers: configRead?.layers || null,
      origins: configRead?.origins || null,
    };
    result.taintWarnings = findLayerOverrides(configRead);

    const probes = [
      {
        id: '3a',
        title: 'CLAUDE-only with project_doc_fallback_filenames',
        files: { 'CLAUDE.md': 'Q2-3A CLAUDE instruction source canary\n' },
        config: { project_doc_fallback_filenames: ['CLAUDE.md'] },
      },
      {
        id: '3b',
        title: 'CLAUDE-only without project_doc_fallback_filenames',
        files: { 'CLAUDE.md': 'Q2-3B CLAUDE instruction source canary\n' },
        config: null,
      },
      {
        id: '3c',
        title: 'AGENTS and CLAUDE with CLAUDE-first fallback list',
        files: {
          'AGENTS.md': 'Q2-3C AGENTS instruction source canary\n',
          'CLAUDE.md': 'Q2-3C CLAUDE instruction source canary\n',
        },
        config: { project_doc_fallback_filenames: ['CLAUDE.md', 'AGENTS.md'] },
      },
    ];

    for (const probe of probes) {
      const cwd = path.join(scratchRoot, `q2-${probe.id}`);
      await writeProbeFiles(cwd, probe.files);
      const request = threadStartParams(cwd, probe.config);
      const response = await client.request('thread/start', request);
      result.q2.push({
        id: probe.id,
        title: probe.title,
        cwd: winPath(cwd),
        request,
        instructionSources: response?.instructionSources || response?.instruction_sources || [],
        response,
      });
    }

    for (const variant of ['data-url', 'local-file']) {
      result.q1.push(await runImageProbe(client, scratchRoot, variant));
    }

    const q3 = {
      sourceOracle: await q3SourceOracle(),
      probes: [],
      staticSourceVerdict: '`ThreadStartParams` lacks compact_prompt; serde does not deny unknown fields, so top-level compactPrompt is dropped during deserialization.',
      authFallback: null,
    };
    for (const variant of ['top-level', 'nested-config']) {
      q3.probes.push(await runCompactProbe(client, scratchRoot, variant));
    }
    if (q3.probes.some((probe) => probe.compact.error)) {
      q3.authFallback = 'Q3 runtime oracle did not fully complete; use static-source verdict and re-spike with working auth/model execution before finalizing Gap 5.';
    }
    result.q3 = q3;

    result.stderr = client.stderr;
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await client?.close().catch(() => undefined);
    await rm(scratchRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
