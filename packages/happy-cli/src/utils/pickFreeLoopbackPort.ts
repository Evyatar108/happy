import * as net from 'node:net';

const LOOPBACK_HOST = '127.0.0.1';
const MAX_ATTEMPTS = 3;

function closeServer(server: net.Server): Promise<void> {
    return new Promise((resolve, reject) => {
        if (!server.listening) {
            resolve();
            return;
        }

        server.close((error) => {
            if (error) reject(error);
            else resolve();
        });
    });
}

async function pickOnce(): Promise<number> {
    const server = net.createServer();

    return new Promise((resolve, reject) => {
        let settled = false;

        const finish = (fn: () => void) => {
            if (settled) return;
            settled = true;
            fn();
        };

        server.once('error', (error) => {
            finish(() => {
                closeServer(server).catch(() => undefined);
                reject(error);
            });
        });

        server.listen(0, LOOPBACK_HOST, () => {
            const address = server.address();
            if (!address || typeof address === 'string') {
                finish(() => {
                    closeServer(server).then(
                        () => reject(new Error('Failed to read loopback listener port')),
                        reject,
                    );
                });
                return;
            }

            finish(() => {
                closeServer(server).then(
                    () => resolve(address.port),
                    reject,
                );
            });
        });
    });
}

export async function pickFreeLoopbackPort(): Promise<number> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        try {
            return await pickOnce();
        } catch (error) {
            lastError = error;
            const code = typeof error === 'object' && error !== null && 'code' in error
                ? (error as { code?: unknown }).code
                : undefined;
            if (code !== 'EADDRINUSE' || attempt === MAX_ATTEMPTS) {
                break;
            }
        }
    }

    const detail = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`Failed to pick free loopback port after ${MAX_ATTEMPTS} attempts: ${detail}`);
}
