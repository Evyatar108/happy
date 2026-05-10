/// <reference types="node" />

import { exec as execCallback, spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execCallback);

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ARTIFACT_ROOT = join(SCRIPT_DIR, 'artefacts', 'p4-attachments');

type StepLabel = 'AC15a' | 'AC15b' | 'AC15c' | 'AC15d' | 'AC15e';

interface BrowserResult {
    stdout: string;
    stderr: string;
}

interface StepContext {
    label: StepLabel;
    lines: string[];
}

interface Config {
    sessionId: string;
    sessionUrl: string;
    newSessionUrl: string;
    existingFilePath: string;
    existingFileV1: string;
    existingFileV2: string;
    sessionReadFileCommand: string;
    editRemoteFileCommand: string;
    codexApprovalTriggerCommand: string;
    codexApprovalMutationCommand: string;
    codexExpectedFiles: string[];
    chatInputSelector: string;
    newSessionInputSelector: string;
    sendSelector: string;
    newSessionSendSelector: string;
    inChatAttachmentRootSelector: string;
    newSessionAttachmentRootSelector: string;
    attachmentChipSelector: string;
}

const requiredEnv = [
    'HAPPY_E2E_URL',
    'HAPPY_E2E_SESSION_ID',
    'HAPPY_E2E_EXISTING_FILE_PATH',
    'HAPPY_E2E_SESSION_READ_FILE_COMMAND',
    'HAPPY_E2E_EDIT_REMOTE_FILE_COMMAND',
    'HAPPY_E2E_CODEX_APPROVAL_TRIGGER_COMMAND',
    'HAPPY_E2E_CODEX_APPROVAL_MUTATION_COMMAND',
    'HAPPY_E2E_CODEX_EXPECTED_FILES',
];

function env(name: string, fallback?: string): string {
    const value = process.env[name];
    if (value && value.trim().length > 0) {
        return value;
    }
    if (fallback !== undefined) {
        return fallback;
    }
    throw new Error(`Missing required environment variable: ${name}`);
}

function loadConfig(): Config {
    for (const name of requiredEnv) {
        env(name);
    }

    const baseUrl = env('HAPPY_E2E_URL').replace(/\/$/, '');
    const sessionId = env('HAPPY_E2E_SESSION_ID');
    return {
        sessionId,
        sessionUrl: env('HAPPY_E2E_SESSION_URL', `${baseUrl}/session/${encodeURIComponent(sessionId)}`),
        newSessionUrl: env('HAPPY_E2E_NEW_SESSION_URL', `${baseUrl}/new`),
        existingFilePath: env('HAPPY_E2E_EXISTING_FILE_PATH'),
        existingFileV1: env('HAPPY_E2E_EXISTING_FILE_V1', 'AC15a-v1'),
        existingFileV2: env('HAPPY_E2E_EXISTING_FILE_V2', 'AC15b-v2'),
        sessionReadFileCommand: env('HAPPY_E2E_SESSION_READ_FILE_COMMAND'),
        editRemoteFileCommand: env('HAPPY_E2E_EDIT_REMOTE_FILE_COMMAND'),
        codexApprovalTriggerCommand: env('HAPPY_E2E_CODEX_APPROVAL_TRIGGER_COMMAND'),
        codexApprovalMutationCommand: env('HAPPY_E2E_CODEX_APPROVAL_MUTATION_COMMAND'),
        codexExpectedFiles: env('HAPPY_E2E_CODEX_EXPECTED_FILES').split(',').map(item => item.trim()).filter(Boolean),
        chatInputSelector: env('HAPPY_E2E_CHAT_INPUT_SELECTOR', '[data-testid="agent-input-attachment-root"] textarea, textarea, [contenteditable="true"]'),
        newSessionInputSelector: env('HAPPY_E2E_NEW_SESSION_INPUT_SELECTOR', '[data-testid="new-session-attachment-root"] textarea, textarea, [contenteditable="true"]'),
        sendSelector: env('HAPPY_E2E_SEND_SELECTOR', '[data-testid="agent-input-send"], button[aria-label="Send"]'),
        newSessionSendSelector: env('HAPPY_E2E_NEW_SESSION_SEND_SELECTOR', '[data-testid="new-session-send"], button[aria-label="Send"]'),
        inChatAttachmentRootSelector: env('HAPPY_E2E_IN_CHAT_ATTACHMENT_ROOT_SELECTOR', '[data-testid="agent-input-attachment-root"]'),
        newSessionAttachmentRootSelector: env('HAPPY_E2E_NEW_SESSION_ATTACHMENT_ROOT_SELECTOR', '[data-testid="new-session-attachment-root"]'),
        attachmentChipSelector: env('HAPPY_E2E_ATTACHMENT_CHIP_SELECTOR', '[data-testid="attachment-chip"]'),
    };
}

function template(command: string, values: Record<string, string>): string {
    return command.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => {
        return values[key] ?? match;
    });
}

function asJson(value: unknown): string {
    return JSON.stringify(value);
}

async function runShell(command: string, ctx: StepContext): Promise<string> {
    ctx.lines.push(`$ ${command}`);
    const result = await exec(command, { cwd: join(SCRIPT_DIR, '..', '..'), windowsHide: true, maxBuffer: 1024 * 1024 * 20 });
    if (result.stdout.trim()) {
        ctx.lines.push(result.stdout.trim());
    }
    if (result.stderr.trim()) {
        ctx.lines.push(result.stderr.trim());
    }
    return result.stdout;
}

async function runBrowser(args: string[], ctx: StepContext, stdin?: string): Promise<BrowserResult> {
    ctx.lines.push(`$ npx agent-browser ${args.join(' ')}`);
    const result = await new Promise<BrowserResult>((resolve, reject) => {
        const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['agent-browser', ...args], {
            cwd: join(SCRIPT_DIR, '..', '..'),
            windowsHide: true,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', chunk => { stdout += chunk; });
        child.stderr.on('data', chunk => { stderr += chunk; });
        child.on('error', reject);
        child.on('close', code => {
            const output = { stdout, stderr };
            if (code === 0) {
                resolve(output);
                return;
            }
            const error = new Error(`npx agent-browser ${args.join(' ')} exited with ${code}\n${stderr || stdout}`);
            reject(error);
        });
        if (stdin !== undefined) {
            child.stdin.write(stdin);
        }
        child.stdin.end();
    });
    if (result.stdout.trim()) {
        ctx.lines.push(result.stdout.trim());
    }
    if (result.stderr.trim()) {
        ctx.lines.push(result.stderr.trim());
    }
    return result;
}

async function browserEval<T>(source: string, ctx: StepContext): Promise<T> {
    const result = await runBrowser(['eval', '--stdin'], ctx, source);
    const text = result.stdout.trim();
    const line = text.split(/\r?\n/).filter(Boolean).at(-1);
    if (!line) {
        throw new Error('agent-browser eval returned no output');
    }
    return JSON.parse(line) as T;
}

async function saveStepArtifacts(ctx: StepContext): Promise<void> {
    await mkdir(ARTIFACT_ROOT, { recursive: true });
    await runBrowser(['snapshot', '-i'], ctx).catch(error => {
        ctx.lines.push(`snapshot failed: ${error instanceof Error ? error.message : String(error)}`);
        return { stdout: '', stderr: '' };
    });
    const screenshotPath = join(ARTIFACT_ROOT, `${ctx.label}.png`);
    await runBrowser(['screenshot', screenshotPath], ctx).catch(error => {
        ctx.lines.push(`screenshot failed: ${error instanceof Error ? error.message : String(error)}`);
        return { stdout: '', stderr: '' };
    });
    await writeFile(join(ARTIFACT_ROOT, `${ctx.label}.log.txt`), `${ctx.lines.join('\n')}\n`, 'utf8');
}

async function step(label: StepLabel, fn: (ctx: StepContext) => Promise<void>): Promise<void> {
    const ctx: StepContext = { label, lines: [`# ${label}`] };
    try {
        await fn(ctx);
        ctx.lines.push(`PASS ${label}`);
    } catch (error) {
        ctx.lines.push(`FAIL ${label}: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
        throw error;
    } finally {
        await saveStepArtifacts(ctx);
    }
}

function assertIncludes(haystack: string, needle: string, message: string): void {
    if (!haystack.includes(needle)) {
        throw new Error(`${message}: missing ${JSON.stringify(needle)}`);
    }
}

function assertMatches(value: string, pattern: RegExp, message: string): RegExpMatchArray {
    const match = value.match(pattern);
    if (!match) {
        throw new Error(`${message}: ${pattern} did not match`);
    }
    return match;
}

async function setRemoteFile(config: Config, path: string, content: string, ctx: StepContext): Promise<void> {
    await runShell(template(config.editRemoteFileCommand, {
        sessionId: config.sessionId,
        path,
        content,
        contentBase64: Buffer.from(content, 'utf8').toString('base64'),
    }), ctx);
}

async function sessionReadFile(config: Config, sessionId: string, path: string, expected: string, ctx: StepContext): Promise<void> {
    const stdout = await runShell(template(config.sessionReadFileCommand, {
        sessionId,
        path,
        content: expected,
        contentBase64: Buffer.from(expected, 'utf8').toString('base64'),
    }), ctx);
    assertIncludes(stdout, expected, `post-hoc sessionReadFile(${sessionId}, ${path}) did not return expected bytes`);
}

async function sendPrompt(prompt: string, inputSelector: string, sendSelector: string, ctx: StepContext): Promise<void> {
    await browserEval(injectTextAndSubmit(prompt, inputSelector, sendSelector), ctx);
    await runBrowser(['wait', '1500'], ctx);
}

function injectTextAndSubmit(prompt: string, inputSelector: string, sendSelector: string): string {
    return `(() => {
        const input = document.querySelector(${asJson(inputSelector)});
        if (!input) throw new Error('input not found: ' + ${asJson(inputSelector)});
        input.focus();
        if ('value' in input) {
            input.value = ${asJson(prompt)};
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
            input.textContent = ${asJson(prompt)};
            input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${asJson(prompt)} }));
        }
        const send = document.querySelector(${asJson(sendSelector)});
        if (!send) throw new Error('send control not found: ' + ${asJson(sendSelector)});
        send.click();
        return JSON.stringify({ ok: true });
    })()`;
}

function domTextProbe(): string {
    return `(() => JSON.stringify({ url: location.href, text: document.body.innerText || '' }))()`;
}

async function clickText(text: string, ctx: StepContext): Promise<void> {
    await browserEval(`(() => {
        const needle = ${asJson(text)};
        const candidates = Array.from(document.querySelectorAll('a, button, [role="button"], span, div, p'));
        const element = candidates.find(item => (item.textContent || '').includes(needle));
        if (!element) throw new Error('click target containing text not found: ' + needle);
        element.click();
        return JSON.stringify({ ok: true, text: element.textContent });
    })()`, ctx);
}

async function dropFixture(rootSelector: string, name: string, content: string, ctx: StepContext): Promise<void> {
    await browserEval(`(() => {
        const root = document.querySelector(${asJson(rootSelector)});
        if (!root) throw new Error('attachment root not found: ' + ${asJson(rootSelector)});
        const file = new File([${asJson(content)}], ${asJson(name)}, { type: 'text/plain' });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        root.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
        root.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
        return JSON.stringify({ ok: true, file: file.name, size: file.size });
    })()`, ctx);
    await runBrowser(['wait', '1000'], ctx);
}

async function assertChip(config: Config, fileName: string, ctx: StepContext): Promise<void> {
    const result = await browserEval<{ text: string }>(`(() => {
        const text = Array.from(document.querySelectorAll(${asJson(config.attachmentChipSelector)}))
            .map(item => item.textContent || '')
            .join('\n');
        return JSON.stringify({ text });
    })()`, ctx);
    assertIncludes(result.text, fileName, 'attachment chip did not render expected file name');
    assertMatches(result.text, /\b\d+(\.\d+)?\s?(B|KB|MB)\b/i, 'attachment chip did not render a size');
}

async function assertNoChip(config: Config, fileName: string, ctx: StepContext): Promise<void> {
    const result = await browserEval<{ text: string }>(`(() => {
        const text = Array.from(document.querySelectorAll(${asJson(config.attachmentChipSelector)}))
            .map(item => item.textContent || '')
            .join('\n');
        return JSON.stringify({ text });
    })()`, ctx);
    if (result.text.includes(fileName)) {
        throw new Error(`attachment chip still contains ${fileName}`);
    }
}

async function main(): Promise<void> {
    const config = loadConfig();
    await mkdir(ARTIFACT_ROOT, { recursive: true });

    await step('AC15a', async ctx => {
        await setRemoteFile(config, config.existingFilePath, config.existingFileV1, ctx);
        await runBrowser(['open', config.sessionUrl], ctx);
        await runBrowser(['wait', '--load', 'networkidle'], ctx);
        await sendPrompt(`Open ${config.existingFilePath}`, config.chatInputSelector, config.sendSelector, ctx);
        const chat = await browserEval<{ text: string }>(domTextProbe(), ctx);
        assertIncludes(chat.text, config.existingFilePath, 'chat body did not contain the sent file path');
        await clickText(config.existingFilePath, ctx);
        await runBrowser(['wait', '2500'], ctx);
        const viewer = await browserEval<{ url: string; text: string }>(domTextProbe(), ctx);
        assertIncludes(viewer.url, 'refresh=1', 'viewer URL did not include refresh=1');
        assertIncludes(viewer.url, 'view=file', 'viewer URL did not include view=file');
        assertIncludes(viewer.text, config.existingFileV1, 'viewer did not show current file content');
    });

    await step('AC15b', async ctx => {
        await setRemoteFile(config, config.existingFilePath, config.existingFileV2, ctx);
        await runBrowser(['open', config.sessionUrl], ctx);
        await runBrowser(['wait', '--load', 'networkidle'], ctx);
        const frames = await browserEval<{ frames: string[]; url: string }>(`(async () => {
            const needle = ${asJson(config.existingFilePath)};
            const candidates = Array.from(document.querySelectorAll('a, button, [role="button"], span, div, p'));
            const element = candidates.find(item => (item.textContent || '').includes(needle));
            if (!element) throw new Error('file link not found for stale-paint probe: ' + needle);
            element.click();
            const frames = [];
            for (let i = 0; i < 3; i += 1) {
                await new Promise(resolve => requestAnimationFrame(resolve));
                frames.push(document.body.innerText || '');
            }
            return JSON.stringify({ url: location.href, frames });
        })()`, ctx);
        if (frames.frames.some(frame => frame.includes(config.existingFileV1))) {
            throw new Error('stale v1 content painted during the first three frames after refresh open');
        }
        await runBrowser(['wait', '2500'], ctx);
        const viewer = await browserEval<{ text: string }>(domTextProbe(), ctx);
        assertIncludes(viewer.text, config.existingFileV2, 'viewer did not show edited v2 content');
    });

    await step('AC15c', async ctx => {
        await runBrowser(['open', config.newSessionUrl], ctx);
        await runBrowser(['wait', '--load', 'networkidle'], ctx);
        await dropFixture(config.newSessionAttachmentRootSelector, 'fixture-new.txt', 'AC15c-fixture', ctx);
        await assertChip(config, 'fixture-new.txt', ctx);
        await sendPrompt('AC15c new-session attachment fixture', config.newSessionInputSelector, config.newSessionSendSelector, ctx);
        await runBrowser(['wait', '5000'], ctx);
        const page = await browserEval<{ url: string; text: string }>(domTextProbe(), ctx);
        const sessionMatch = assertMatches(page.url, /\/session\/([^/?#]+)/, 'new session URL did not expose a session id');
        const remotePathMatch = assertMatches(page.text, /(?:^|\s)(\.happy\/attachments\/([^/\s]+)\/fixture-new\.txt)(?=\s|$)/m, 'chat body did not reference the new-session attachment path');
        const remotePath = remotePathMatch[1];
        await sessionReadFile(config, decodeURIComponent(sessionMatch[1]), remotePath, 'AC15c-fixture', ctx);
    });

    await step('AC15d', async ctx => {
        await runBrowser(['open', config.sessionUrl], ctx);
        await runBrowser(['wait', '--load', 'networkidle'], ctx);
        await dropFixture(config.inChatAttachmentRootSelector, 'fixture-chat.txt', 'AC15d-fixture', ctx);
        await assertChip(config, 'fixture-chat.txt', ctx);
        await sendPrompt('AC15d in-chat attachment fixture', config.chatInputSelector, config.sendSelector, ctx);
        await runBrowser(['wait', '3000'], ctx);
        await assertNoChip(config, 'fixture-chat.txt', ctx);
        const page = await browserEval<{ text: string }>(domTextProbe(), ctx);
        const remotePathMatch = assertMatches(page.text, /(?:^|\s)(\.happy\/attachments\/([^/\s]+)\/fixture-chat\.txt)(?=\s|$)/m, 'chat body did not reference the in-chat attachment path');
        const remotePath = remotePathMatch[1];
        await sessionReadFile(config, config.sessionId, remotePath, 'AC15d-fixture', ctx);
    });

    await step('AC15e', async ctx => {
        await runShell(config.codexApprovalTriggerCommand, ctx);
        await runBrowser(['wait', '3000'], ctx);
        const before = await browserEval<{ text: string }>(domTextProbe(), ctx);
        for (const file of config.codexExpectedFiles) {
            assertIncludes(before.text, file, `CodexPatchView did not list expected approval file before mutation: ${file}`);
        }
        await runShell(config.codexApprovalMutationCommand, ctx);
        await runBrowser(['wait', '1500'], ctx);
        const after = await browserEval<{ text: string }>(domTextProbe(), ctx);
        for (const file of config.codexExpectedFiles) {
            assertIncludes(after.text, file, `CodexPatchView did not retain expected approval file after mutation: ${file}`);
        }
        if (process.env.HAPPY_E2E_CODEX_MUTATED_FILE) {
            if (after.text.includes(process.env.HAPPY_E2E_CODEX_MUTATED_FILE)) {
                throw new Error('CodexPatchView changed after post-emission mutation');
            }
        }
    });

    await writeFile(join(ARTIFACT_ROOT, 'summary.log.txt'), 'PASS AC15a-AC15e\n', 'utf8');
    await runBrowser(['close'], { label: 'AC15e', lines: [] }).catch(() => undefined);
}

main().catch(async error => {
    await mkdir(ARTIFACT_ROOT, { recursive: true });
    await writeFile(join(ARTIFACT_ROOT, 'failure.log.txt'), `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`, 'utf8');
    process.exitCode = 1;
});
