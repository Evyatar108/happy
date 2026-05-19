import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_MAX_LINES = 1000
const MAX_ACTIVITY_LINE_BYTES = 4096

export function appendActivity(repoRoot, event, { activityPath, activityBackupPath, maxLines = DEFAULT_MAX_LINES }) {
    if (!repoRoot || !activityPath || !activityBackupPath) {
        throw new Error('appendActivity requires repoRoot, activityPath, and activityBackupPath')
    }

    const resolvedActivityPath = resolveMaybeAbsolute(repoRoot, activityPath)
    const resolvedBackupPath = resolveMaybeAbsolute(repoRoot, activityBackupPath)
    const line = `${JSON.stringify(event)}\n`
    if (Buffer.byteLength(line, 'utf8') > MAX_ACTIVITY_LINE_BYTES) {
        throw new Error(`activity event exceeds ${MAX_ACTIVITY_LINE_BYTES} bytes`)
    }

    if (countLines(resolvedActivityPath) >= maxLines) {
        rotateActivity(resolvedActivityPath, resolvedBackupPath)
    }

    fs.mkdirSync(path.dirname(resolvedActivityPath), { recursive: true })
    let fd
    try {
        fd = fs.openSync(resolvedActivityPath, 'a')
        fs.writeSync(fd, line)
        fs.fsyncSync(fd)
    } finally {
        if (fd !== undefined) {
            fs.closeSync(fd)
        }
    }
}

export function rotateActivity(activityPath, activityBackupPath) {
    if (!activityPath || !activityBackupPath || !fs.existsSync(activityPath)) {
        return
    }

    fs.mkdirSync(path.dirname(activityBackupPath), { recursive: true })
    fs.rmSync(activityBackupPath, { force: true })
    fs.renameSync(activityPath, activityBackupPath)
}

function countLines(filePath) {
    if (!fs.existsSync(filePath)) {
        return 0
    }
    const contents = fs.readFileSync(filePath, 'utf8')
    if (!contents) {
        return 0
    }
    return contents.split('\n').filter((line) => line.length > 0).length
}

function resolveMaybeAbsolute(repoRoot, filePath) {
    return path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath)
}
