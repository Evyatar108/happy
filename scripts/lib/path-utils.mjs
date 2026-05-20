import { execFileSync } from 'node:child_process'
import path from 'node:path'

export function toPosix(value) {
    return String(value).split(path.sep).join('/').replace(/\\/g, '/')
}

export function splitPath(value) {
    return String(value).split(/[\\/]+/).filter(Boolean)
}

export function globToRegExp(pattern) {
    const doubleStar = '__RALPH_DOUBLE_STAR__'
    const escaped = toPosix(pattern)
        .replace(/\*\*/g, doubleStar)
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '[^/]*')
        .replaceAll(doubleStar, '.*')
    return new RegExp(`^${escaped}$`)
}

export function compileIgnoredPatterns(patterns) {
    return (patterns ?? []).map((pattern) => globToRegExp(pattern))
}

export function matchesIgnored(filePath, repoRoot, ignored, altRoot) {
    const roots = altRoot && altRoot !== repoRoot ? [repoRoot, altRoot] : [repoRoot]
    if (Array.isArray(ignored) && ignored.length > 0 && ignored[0] instanceof RegExp) {
        return roots.some((root) => {
            const relative = toPosix(path.relative(root, filePath))
            if (relative.startsWith('..')) {
                return false
            }
            const candidate = `${relative}/`
            return ignored.some((regex) => regex.test(relative) || regex.test(candidate))
        })
    }
    return roots.some((root) => {
        const relative = toPosix(path.relative(root, filePath))
        if (relative.startsWith('..')) {
            return false
        }
        const candidate = `${relative}/`
        return (ignored ?? []).some((pattern) => globToRegExp(pattern).test(relative) || globToRegExp(pattern).test(candidate))
    })
}

export function resolveHeadShortSha(repoRoot, { onError } = {}) {
    try {
        return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
            cwd: repoRoot,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim()
    } catch (error) {
        onError?.(error)
        return 'unknown'
    }
}
