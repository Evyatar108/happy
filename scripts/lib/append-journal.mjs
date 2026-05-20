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

    appendLine({ taskDir, journalPath, line })
}

export function appendJournalNote({ repoRoot, taskId, ts, note }) {
    if (!repoRoot) {
        throw new Error('appendJournalNote requires repoRoot')
    }
    assertSafeTaskId(taskId)
    if (typeof note !== 'string') {
        throw new Error('appendJournalNote requires note')
    }

    const taskDir = path.join(repoRoot, 'tasks', taskId)
    const journalPath = path.join(taskDir, 'journal.md')
    const line = `- ${ts}  note: ${formatContinuation(note)}\n`

    appendLine({ taskDir, journalPath, line })
}

function appendLine({ taskDir, journalPath, line }) {
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

export function assertSafeTaskId(taskId) {
    if (typeof taskId !== 'string' || taskId.length === 0) {
        throw new Error('appendJournal requires taskId')
    }
    if (taskId.includes('/') || taskId.includes('\\') || taskId.includes('..')) {
        throw new Error(`invalid taskId: ${taskId}`)
    }
}

function formatContinuation(value) {
    return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').join('\n  ')
}
