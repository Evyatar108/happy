import react from '@vitejs/plugin-react'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import { viteSingleFile as singleFile } from 'vite-plugin-singlefile'

const overviewDataPath = resolve(__dirname, '../../plans/overview-data.js')

function overviewDataPlugin(): Plugin {
    return {
        name: 'overview-data',
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
    }
}

export default defineConfig({
    root: __dirname,
    base: './',
    plugins: [react(), singleFile(), overviewDataPlugin()],
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
