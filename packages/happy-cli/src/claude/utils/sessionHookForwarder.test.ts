import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const FORWARDER_PATH = fileURLToPath(new URL('../../../scripts/session_hook_forwarder.cjs', import.meta.url));

let server: Server | null = null;

function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        req.on('error', reject);
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
}

async function startRecordingServer(): Promise<{
    port: number;
    received: Promise<Array<{ body: string; path: string }>>;
}> {
    const records: Array<{ body: string; path: string }> = [];
    let resolveReceived!: (records: Array<{ body: string; path: string }>) => void;
    const received = new Promise<Array<{ body: string; path: string }>>((resolve) => {
        resolveReceived = resolve;
    });

    server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
        records.push({
            path: req.url ?? '',
            body: await readBody(req),
        });
        res.statusCode = 200;
        res.end('ok');
        resolveReceived(records);
    });

    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
        throw new Error('Expected TCP server address');
    }

    return { port: address.port, received };
}

function runForwarder(port: number, payload: Record<string, unknown>): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [FORWARDER_PATH, String(port)], {
            stdio: ['pipe', 'ignore', 'ignore'],
        });
        child.on('error', reject);
        child.on('exit', (code) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`session_hook_forwarder exited with ${code}`));
        });
        child.stdin.end(JSON.stringify(payload));
    });
}

describe('session_hook_forwarder', () => {
    afterEach(async () => {
        await new Promise<void>((resolve) => server?.close(() => resolve()));
        server = null;
    });

    it.each([
        ['SessionStart', '/hook/session-start'],
        ['UserPromptSubmit', '/hook/user-prompt-submit'],
        ['Stop', '/hook/stop'],
    ] as const)('routes %s payloads to %s', async (hook_event_name, expectedPath) => {
        const { port, received } = await startRecordingServer();
        const payload = { hook_event_name, session_id: 'claude-session-1' };

        await runForwarder(port, payload);
        const records = await received;

        expect(records).toEqual([{
            path: expectedPath,
            body: JSON.stringify(payload),
        }]);
    });
});
