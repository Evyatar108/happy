const WARNED_MALFORMED_TABLES = new Set()

export function parseNotepad(text) {
    const notepadText = typeof text === 'string' ? text : ''
    const deferred = parseDeferredQuestions(extractSection(notepadText, 'Deferred Questions'))
    const storyDoctorInterventions = countStoryDoctorRows(extractSection(notepadText, 'Story Doctor Log'))

    return {
        deferredQuestionsCount: deferred.count,
        deferredQuestionsPreview: deferred.preview,
        storyDoctorInterventions,
    }
}

export function _resetParseNotepadWarnings() {
    WARNED_MALFORMED_TABLES.clear()
}

function parseDeferredQuestions(section) {
    if (!section) {
        return { count: 0, preview: undefined }
    }

    const table = parseMarkdownTable(section, 'Deferred Questions')
    if (!table) {
        return { count: 0, preview: undefined }
    }

    const answerIndex = findColumn(table.headers, 'Answer')
    const questionIndex = findColumn(table.headers, 'Question')
    if (answerIndex === -1 || questionIndex === -1) {
        warnMalformed('Deferred Questions', 'missing Question or Answer column')
        return { count: 0, preview: undefined }
    }

    let count = 0
    let preview
    for (const row of table.rows) {
        if (isEmptyCell(row[answerIndex])) {
            count += 1
            if (preview === undefined) {
                preview = trimPreview(row[questionIndex] ?? '')
            }
        }
    }

    return { count, preview }
}

function countStoryDoctorRows(section) {
    if (!section) {
        return 0
    }

    const table = parseMarkdownTable(section, 'Story Doctor Log')
    if (!table) {
        return 0
    }

    return table.rows.filter((row) => row.some((cell) => !isEmptyCell(cell))).length
}

function extractSection(text, title) {
    const lines = text.split(/\r?\n/)
    const headingPattern = new RegExp(`^##\\s+${escapeRegExp(title)}\\s*$`, 'i')
    const start = lines.findIndex((line) => headingPattern.test(line.trim()))
    if (start === -1) {
        return ''
    }

    const sectionLines = []
    for (let index = start + 1; index < lines.length; index += 1) {
        if (/^##\s+/.test(lines[index].trim())) {
            break
        }
        sectionLines.push(lines[index])
    }
    return sectionLines.join('\n')
}

function parseMarkdownTable(section, sectionName) {
    const lines = section.split(/\r?\n/).map((line) => line.trim())
    const tableStart = lines.findIndex((line) => line.startsWith('|'))
    if (tableStart === -1) {
        return null
    }

    const tableLines = []
    for (let index = tableStart; index < lines.length; index += 1) {
        const line = lines[index]
        if (!line) {
            continue
        }
        if (!line.startsWith('|')) {
            break
        }
        tableLines.push(line)
    }

    if (tableLines.length < 2) {
        warnMalformed(sectionName, 'missing separator row')
        return null
    }

    const headers = splitTableRow(tableLines[0])
    const separator = splitTableRow(tableLines[1])
    if (headers.length === 0 || separator.length !== headers.length || !separator.every(isSeparatorCell)) {
        warnMalformed(sectionName, 'invalid separator row')
        return null
    }

    const rows = []
    for (const line of tableLines.slice(2)) {
        const row = splitTableRow(line)
        if (row.length !== headers.length) {
            warnMalformed(sectionName, 'row column count does not match header')
            return null
        }
        rows.push(row)
    }

    return { headers, rows }
}

function splitTableRow(line) {
    return line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
}

function isSeparatorCell(cell) {
    return /^:?-{3,}:?$/.test(cell.trim())
}

function isEmptyCell(cell) {
    return !cell || cell.trim().length === 0
}

function findColumn(headers, name) {
    return headers.findIndex((header) => header.trim().toLowerCase() === name.toLowerCase())
}

function trimPreview(value) {
    const normalized = value.trim().replace(/\s+/g, ' ')
    return normalized.length > 120 ? normalized.slice(0, 120) : normalized
}

function warnMalformed(sectionName, reason) {
    const key = `${sectionName}:${reason}`
    if (WARNED_MALFORMED_TABLES.has(key)) {
        return
    }
    WARNED_MALFORMED_TABLES.add(key)
    process.stderr.write(`[parse-notepad] malformed table in ${sectionName}: ${reason}\n`)
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
