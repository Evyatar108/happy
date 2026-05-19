import react from '@vitejs/plugin-react'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { transform } from 'esbuild'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import { viteSingleFile as singleFile } from 'vite-plugin-singlefile'

const overviewDataPath = resolve(__dirname, '../../plans/overview-data.js')
const overviewRalphStatePath = resolve(__dirname, '../../plans/overview-ralph-state.js')
const overviewHtmlPath = resolve(__dirname, '../../plans/overview.html')
const overviewHtmlNextPath = resolve(__dirname, '../../plans/overview.html.next')
const overviewDataScriptTag = '<script src="./overview-data.js"></script>'
const overviewRalphStateScriptTag = '<script src="./overview-ralph-state.js"></script>'

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

                if (!html.includes(overviewDataScriptTag)) {
                    this.error(`Expected ${overviewDataScriptTag} in overview.html`)
                }

                const data = await readFile(overviewDataPath, 'utf8')
                const minifiedData = await transform(data, {
                    loader: 'js',
                    minify: true,
                    legalComments: 'none',
                })
                return html.replace(overviewDataScriptTag, `<script>${minifiedData.code.replace(/<\/script/gi, '<\\/script')}</script>`)
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

function overviewRalphStatePlugin(): Plugin {
    return {
        name: 'overview-ralph-state',
        enforce: 'pre',
        configureServer(server) {
            server.middlewares.use('/overview-ralph-state.js', async (_req, res) => {
                try {
                    const data = await readFile(overviewRalphStatePath)
                    res.setHeader('Content-Type', 'application/javascript')
                    res.end(data)
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error)
                    res.statusCode = 500
                    res.setHeader('Content-Type', 'application/javascript')
                    res.end(`/* Failed to read overview-ralph-state.js: ${message.replace(/\*\//g, '* /')} */`)
                }
            })
        },
        transformIndexHtml: {
            order: 'pre',
            async handler(html, ctx) {
                if (ctx.server) {
                    return html
                }

                if (!html.includes(overviewRalphStateScriptTag)) {
                    this.error(`Expected ${overviewRalphStateScriptTag} in overview.html`)
                }

                const data = await readFile(overviewRalphStatePath, 'utf8')
                const minifiedData = await transform(data, {
                    loader: 'js',
                    minify: true,
                    legalComments: 'none',
                })
                return html.replace(overviewRalphStateScriptTag, `<script>${minifiedData.code.replace(/<\/script/gi, '<\\/script')}</script>`)
            },
        },
    }
}

export default defineConfig({
    root: __dirname,
    base: './',
    plugins: [react(), singleFile(), overviewDataPlugin(), overviewRalphStatePlugin()],
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
