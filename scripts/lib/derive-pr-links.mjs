import { execFileSync } from 'node:child_process'

const GITHUB_PULL_URL_PATTERN = /https:\/\/github\.com\/[^\s)]+\/[^\s)]+\/pull\/\d+/i
const CLOSES_ISSUE_PATTERN = /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/i

export function derivePRLinks({ groupState, repoRoot, branchName, stage, originUrl } = {}) {
    const result = {}
    const normalizedBranchName = normalizeString(branchName)
    if (normalizedBranchName) {
        result.branchName = normalizedBranchName
    }

    const groupPrUrl = normalizeString(groupState?.prUrl)
    if (isGitHubPullUrl(groupPrUrl)) {
        result.prUrl = groupPrUrl
    }

    if (!normalizedBranchName) {
        return result
    }

    if (!result.prUrl) {
        let logOutput = ''
        try {
            logOutput = execFileSync('git', ['-C', repoRoot, 'log', '--format=%H%n%s%n%b', '-n', '5', normalizedBranchName], {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'],
            })
        } catch {
            return result
        }
        result.prUrl = findPRUrl(logOutput, () => originUrl ?? resolveOriginUrl(repoRoot))
    }

    if (stage === 'shipped') {
        try {
            const mergeCommit = execFileSync('git', ['-C', repoRoot, 'rev-parse', normalizedBranchName], {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'],
            }).trim()
            if (mergeCommit) {
                result.mergeCommit = mergeCommit.slice(0, 8)
            }
        } catch {
            return result
        }
    }

    return result
}

function findPRUrl(logOutput, getOriginUrl) {
    const directMatch = normalizeString(logOutput).match(GITHUB_PULL_URL_PATTERN)
    if (directMatch) {
        return directMatch[0]
    }

    const closesMatch = normalizeString(logOutput).match(CLOSES_ISSUE_PATTERN)
    const repoUrl = closesMatch ? githubRepoUrl(getOriginUrl()) : undefined
    if (closesMatch && repoUrl) {
        return `${repoUrl}/pull/${closesMatch[1]}`
    }

    return undefined
}

function resolveOriginUrl(repoRoot) {
    try {
        return execFileSync('git', ['-C', repoRoot, 'remote', 'get-url', 'origin'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim()
    } catch {
        return undefined
    }
}

function githubRepoUrl(originUrl) {
    const value = normalizeString(originUrl)
    if (!value) {
        return undefined
    }

    const httpsMatch = value.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i)
    if (httpsMatch) {
        return `https://github.com/${httpsMatch[1]}/${httpsMatch[2]}`
    }

    const sshMatch = value.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i)
    if (sshMatch) {
        return `https://github.com/${sshMatch[1]}/${sshMatch[2]}`
    }

    return undefined
}

function isGitHubPullUrl(value) {
    return Boolean(normalizeString(value).match(/^https:\/\/github\.com\/[^\s)]+\/[^\s)]+\/pull\/\d+$/i))
}

function normalizeString(value) {
    return typeof value === 'string' ? value.trim() : ''
}
