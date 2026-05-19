import react from '@vitejs/plugin-react'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { transform } from 'esbuild'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import { viteSingleFile as singleFile } from 'vite-plugin-singlefile'

const overviewDataPath = resolve(__dirname, '../../plans/overview-data.js')
const overviewHtmlPath = resolve(__dirname, '../../plans/overview.html')
const overviewHtmlNextPath = resolve(__dirname, '../../plans/overview.html.next')
const sidecarScriptTag = '<script src="./overview-data.js"></script>'
const repoRoot = resolve(__dirname, '../..')
const ralphStateUpdateEvent = 'overview-ralph-state:update'

type RalphStateWatcherModule = typeof import('../../scripts/lib/watch-ralph-state.mjs')

interface RalphStateWatcherPluginOptions {
    repoRoot?: string
    configPath?: string
    importWatcher?: () => Promise<RalphStateWatcherModule>
}

function isSafeNameBuild(): boolean {
    return process.env.OVERVIEW_BUILD_SAFE_NAME === '1'
}

function overviewDataPlugin(): Plugin {
    let liveOverviewHtml: Uint8Array | null = null

    return {
        name: 'overview-data',
        enforce: 'pre',
        async buildStart() {
            if (!isSafeNameBuild()) {
                return
            }

            liveOverviewHtml = await readFile(overviewHtmlPath).catch(() => null)
        },
        configureServer(server) {
            server.middlewares.use((req, _res, next) => {
                if (req.url === '/') {
                    req.url = '/overview.html'
                }
                next()
            })
            server.middlewares.use('/overview-data.js', async (_req, res) => {
                const data = await readFile(overviewDataPath)
                res.setHeader('Content-Type', 'application/javascript')
                res.end(data)
            })
            server.watcher.add(overviewDataPath)
            server.watcher.on('change', (file) => {
                if (file === overviewDataPath) {
                    server.ws.send({
                        type: 'custom',
                        event: 'overview-data:update',
                    })
                    server.config.logger.info('overview-data:update')
                }
            })
        },
        transformIndexHtml: {
            order: 'pre',
            async handler(html, ctx) {
                if (ctx.server) {
                    return html
                }

                if (!html.includes(sidecarScriptTag)) {
                    this.error(`Expected ${sidecarScriptTag} in overview.html`)
                }

                const data = await readFile(overviewDataPath, 'utf8')
                const minifiedData = await transform(data, {
                    loader: 'js',
                    minify: true,
                    legalComments: 'none',
                })
                return html.replace(sidecarScriptTag, `<script>${minifiedData.code.replace(/<\/script/gi, '<\\/script')}</script>`)
            },
        },
        async closeBundle() {
            if (!isSafeNameBuild()) {
                return
            }

            await rm(overviewHtmlNextPath, { force: true })
            await rename(overviewHtmlPath, overviewHtmlNextPath)

            if (liveOverviewHtml) {
                await writeFile(overviewHtmlPath, liveOverviewHtml)
            }
        },
    }
}

export function ralphStateWatcherPlugin({
    repoRoot: watcherRepoRoot = repoRoot,
    configPath,
    importWatcher = () => import(pathToFileURL(resolve(__dirname, '../../scripts/lib/watch-ralph-state.mjs')).href),
}: RalphStateWatcherPluginOptions = {}): Plugin {
    return {
        name: 'overview-ralph-state-watcher',
        async configureServer(server) {
            try {
                const watcher = await importWatcher()
                const handle = await watcher.start({
                    repoRoot: watcherRepoRoot,
                    configPath,
                    processLabel: 'vite-plugin',
                    onWrite() {
                        server.ws.send({ type: 'custom', event: ralphStateUpdateEvent })
                    },
                })
                server.httpServer?.on('close', () => {
                    handle.stop().catch(() => {})
                })
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                if (message.includes('another sync in progress')) {
                    server.config.logger.warn(`overview Ralph watcher not started: another watcher holds lock: ${message}`)
                    return
                }
                throw error
            }
        },
    }
}

export default defineConfig({
    root: __dirname,
    base: './',
    plugins: [react(), singleFile(), overviewDataPlugin(), ralphStateWatcherPlugin()],
    build: {
        outDir: '../../plans',
        emptyOutDir: false,
        rollupOptions: {
            input: {
                overview: resolve(__dirname, 'overview.html'),
            },
        },
    },
    server: {
        fs: {
            allow: [__dirname, '../../plans'],
        },
    },
})
