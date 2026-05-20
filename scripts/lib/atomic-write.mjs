import fs from 'node:fs'
import path from 'node:path'

const TRANSIENT_RENAME_ERRORS = new Set(['EBUSY', 'EACCES', 'EPERM'])
const RENAME_RETRY_LIMIT = 3
const RENAME_RETRY_DELAY_MS = 100

export async function atomicWriteFile(finalPath, contents) {
    if (!finalPath) {
        throw new Error('atomicWriteFile requires a final path')
    }
    fs.mkdirSync(path.dirname(finalPath), { recursive: true })
    const tmpPath = `${finalPath}.tmp`
    let fd
    try {
        fd = fs.openSync(tmpPath, 'w')
        fs.writeFileSync(fd, contents)
        fs.fsyncSync(fd)
    } finally {
        if (fd !== undefined) {
            fs.closeSync(fd)
        }
    }

    try {
        await renameWithRetry(tmpPath, finalPath)
    } catch (error) {
        fs.rmSync(tmpPath, { force: true })
        throw error
    }
}

async function renameWithRetry(tmpPath, finalPath) {
    for (let attempt = 1; attempt <= RENAME_RETRY_LIMIT; attempt += 1) {
        try {
            fs.renameSync(tmpPath, finalPath)
            return
        } catch (error) {
            if (!TRANSIENT_RENAME_ERRORS.has(error?.code) || attempt === RENAME_RETRY_LIMIT) {
                throw error
            }
            await delay(RENAME_RETRY_DELAY_MS)
        }
    }
}

function delay(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}
