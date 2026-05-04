import { createServer } from 'node:net';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

async function importFreshHelper() {
    vi.resetModules();
    return import('./pickFreeLoopbackPort');
}

describe('pickFreeLoopbackPort', () => {
    afterEach(() => {
        vi.doUnmock('node:net');
        vi.restoreAllMocks();
    });

    it('resolves a numeric IPv4 loopback port and closes the temporary server', async () => {
        const { pickFreeLoopbackPort } = await importFreshHelper();

        const port = await pickFreeLoopbackPort();

        expect(typeof port).toBe('number');
        expect(port).toBeGreaterThan(0);

        await new Promise<void>((resolve, reject) => {
            const server = createServer();
            server.once('error', reject);
            server.listen(port, '127.0.0.1', () => {
                const address = server.address();
                expect(address).toEqual(expect.objectContaining({ family: 'IPv4' }));
                server.close((error) => {
                    if (error) reject(error);
                    else resolve();
                });
            });
        });
    });

    it('binds to 127.0.0.1 and retries after an EADDRINUSE attempt', async () => {
        const hosts: string[] = [];
        const closed: boolean[] = [];
        const outcomes = ['EADDRINUSE', 'success'];

        vi.doMock('node:net', () => ({
            createServer: () => {
                const server = Object.assign(new EventEmitter(), {
                    listening: false,
                    listen: (_port: number, host: string, callback: () => void) => {
                        hosts.push(host);
                        const outcome = outcomes.shift();
                        if (outcome === 'EADDRINUSE') {
                            queueMicrotask(() => server.emit('error', Object.assign(new Error('busy'), { code: 'EADDRINUSE' })));
                            return server;
                        }
                        server.listening = true;
                        queueMicrotask(callback);
                        return server;
                    },
                    address: () => ({ port: 43210, family: 'IPv4', address: '127.0.0.1' }),
                    close: (callback?: (error?: Error) => void) => {
                        closed.push(true);
                        server.listening = false;
                        queueMicrotask(() => callback?.());
                        return server;
                    },
                });
                return server;
            },
        }));
        const { pickFreeLoopbackPort } = await importFreshHelper();

        await expect(pickFreeLoopbackPort()).resolves.toBe(43210);

        expect(hosts).toEqual(['127.0.0.1', '127.0.0.1']);
        expect(closed).toHaveLength(1);
    });

    it('rejects with a recognizable error after three EADDRINUSE attempts', async () => {
        let attempts = 0;
        vi.doMock('node:net', () => ({
            createServer: () => {
                const server = Object.assign(new EventEmitter(), {
                    listening: false,
                    listen: (_port: number, _host: string, _callback: () => void) => {
                        attempts += 1;
                        queueMicrotask(() => server.emit('error', Object.assign(new Error('busy'), { code: 'EADDRINUSE' })));
                        return server;
                    },
                    address: () => null,
                    close: (callback?: (error?: Error) => void) => {
                        queueMicrotask(() => callback?.());
                        return server;
                    },
                });
                return server;
            },
        }));
        const { pickFreeLoopbackPort } = await importFreshHelper();

        await expect(pickFreeLoopbackPort()).rejects.toThrow('Failed to pick free loopback port after 3 attempts');
        expect(attempts).toBe(3);
    });
});
