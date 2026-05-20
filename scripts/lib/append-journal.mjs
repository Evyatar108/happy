import fs from 'node:fs'
import path from 'node:path'

export function appendJournalEntry({ repoRoot, taskId, ts, prevStage, newStage, slug }) {
    if (!repoRoot) {
        throw new Error('appendJournalEntry requires repoRoot')
    }
    assertSafeTaskId(taskId)

    const taskDir = path.join(repoRoot, 'tasks', taskId)
    const journalPath = path.join(taskDir, 'journal.md')
    const line = formatJournalLine({ ts, prevStage, newStage, slug })

    fs.mkdirSync(taskDir, { recursive: true })
    let fd
    try {
        fd = fs.openSync(journalPath, 'a')
        fs.writeSync(fd, line)
        fs.fsyncSync(fd)
    } finally {
        if (fd !== undefined) {
            fs.closeSync(fd)
        }
    }
}

export function formatJournalLine({ ts, prevStage, newStage, slug }) {
    return `- ${ts}  stage: ${prevStage} → ${newStage}  (job: ${slug})\n`
}

function assertSafeTaskId(taskId) {
    if (typeof taskId !== 'string' || taskId.length === 0) {
        throw new Error('appendJournalEntry requires taskId')
    }
    if (taskId.includes('/') || taskId.includes('\\') || taskId.includes('..')) {
        throw new Error(`invalid taskId: ${taskId}`)
    }
}
