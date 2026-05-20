import fs from 'node:fs'
import path from 'node:path'

export function parseSpawnLauncher(absolutePath) {
    const source = fs.readFileSync(absolutePath, 'utf8')

    return {
        initialPrompt: extractInitialPrompt(source),
        memberName: extractEnvValue(source, 'CREWS_NAME') ?? extractHeaderValue(source, 'name') ?? extractMemberNameFromPath(absolutePath),
        crewName: extractEnvValue(source, 'CREWS_CREW') ?? extractHeaderValue(source, 'crew'),
    }
}

function extractInitialPrompt(source) {
    const lines = source.split(/\r?\n/)
    const commandStart = lines.findIndex((line) => /^\s*(?:&\s*)?claude\b/.test(line))
    if (commandStart === -1) {
        return null
    }

    const quotedArguments = parseSingleQuotedStrings(extractCommandText(lines.slice(commandStart)))
    return quotedArguments.at(-1) ?? null
}

function extractCommandText(lines) {
    const commandLines = []

    for (const line of lines) {
        commandLines.push(line)
        if (hasBalancedSingleQuotes(commandLines.join('\n'))) {
            break
        }
    }

    return commandLines.join('\n')
}

function hasBalancedSingleQuotes(command) {
    let inQuote = false

    for (let index = 0; index < command.length; index += 1) {
        if (command[index] !== "'") {
            continue
        }
        if (inQuote && command[index + 1] === "'") {
            index += 1
            continue
        }
        inQuote = !inQuote
    }

    return !inQuote
}

function parseSingleQuotedStrings(command) {
    const values = []

    for (let index = 0; index < command.length; index += 1) {
        if (command[index] !== "'") {
            continue
        }

        let value = ''
        index += 1

        while (index < command.length) {
            if (command[index] === "'") {
                if (command[index + 1] === "'") {
                    value += "'"
                    index += 2
                    continue
                }
                break
            }

            value += command[index]
            index += 1
        }

        if (index < command.length && command[index] === "'") {
            values.push(value)
        }
    }

    return values
}

function extractEnvValue(source, name) {
    const pattern = new RegExp(`^\\s*\\$env:${name}\\s*=\\s*'((?:''|[^'])*)'\\s*$`, 'm')
    const match = source.match(pattern)
    return match ? unescapePowerShellSingleQuoted(match[1]) : null
}

function extractHeaderValue(source, name) {
    const header = source.match(/^#\s*name:\s*(\S+)\s+crew:\s*(\S+)\s*$/m)
    if (!header) {
        return null
    }
    return name === 'name' ? header[1] : header[2]
}

function extractMemberNameFromPath(absolutePath) {
    const basename = path.basename(absolutePath, path.extname(absolutePath))
    const match = basename.match(/^(.+)-\d+$/)
    return match?.[1] ?? null
}

function unescapePowerShellSingleQuoted(value) {
    return value.replaceAll("''", "'")
}
