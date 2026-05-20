import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Plugin, ViteDevServer } from 'vite'
import { overviewActivityPlugin } from '../../vite.config'

const fixtureRoots: string[] = []

afterEach(() => {
    for (const fixtureRoot of fixtureRoots.splice(0)) {
        rmSync(fixtureRoot, { recursive: true, force: true })
    }
})

describe('overviewActivityPlugin', () => {
    it('serves overview activity JSONL from the configured path', async () => {
        const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'codexu-activity-plugin-'))
        fixtureRoots.push(fixtureRoot)
        const activityPath = path.join(fixtureRoot, 'overview-activity.jsonl')
        writeFileSync(activityPath, '{"taskId":"task"}\n')
        const server = makeViteServer()

        await configureServer(overviewActivityPlugin(activityPath), server)

        const response = await request(server, '/overview-activity.jsonl')
        expect(response.statusCode).toBe(200)
        expect(response.headers['Content-Type']).toBe('application/x-ndjson')
        expect(response.body).toBe('{"taskId":"task"}\n')
    })

    it('returns 200 with an empty body when the activity JSONL file is missing', async () => {
        const server = makeViteServer()

        await configureServer(overviewActivityPlugin(path.join(tmpdir(), 'missing-overview-activity.jsonl')), server)

        const response = await request(server, '/overview-activity.jsonl')
        expect(response.statusCode).toBe(200)
        expect(response.headers['Content-Type']).toBe('application/x-ndjson')
        expect(response.body).toBe('')
    })

    it('is registered as a pre plugin for middleware ordering before the SPA fallback', () => {
        expect(overviewActivityPlugin().enforce).toBe('pre')
    })
})

interface MiddlewareLayer {
    route: string
    handler: (req: { url?: string }, res: MockResponse, next: () => void) => void | Promise<void>
}

interface MockViteServer {
    middlewares: {
        layers: MiddlewareLayer[]
        use: ReturnType<typeof vi.fn>
    }
}

class MockResponse {
    statusCode = 200
    headers: Record<string, string> = {}
    body = ''

    setHeader(name: string, value: string): void {
        this.headers[name] = value
    }

    end(value = ''): void {
        this.body += Buffer.isBuffer(value) ? value.toString('utf8') : String(value)
    }
}

function makeViteServer(): MockViteServer {
    const layers: MiddlewareLayer[] = []
    return {
        middlewares: {
            layers,
            use: vi.fn((route: string, handler: MiddlewareLayer['handler']) => {
                layers.push({ route, handler })
            }),
        },
    }
}

async function configureServer(plugin: Plugin, server: MockViteServer): Promise<void> {
    const hook = plugin.configureServer
    if (typeof hook !== 'function') {
        throw new Error('expected plugin.configureServer function')
    }
    await hook.call({} as ThisParameterType<typeof hook>, server as unknown as ViteDevServer)
}

async function request(server: MockViteServer, url: string): Promise<MockResponse> {
    const layer = server.middlewares.layers.find((candidate) => candidate.route === url)
    if (!layer) {
        throw new Error(`no middleware registered for ${url}`)
    }
    const response = new MockResponse()
    await layer.handler({ url }, response, () => {})
    return response
}
