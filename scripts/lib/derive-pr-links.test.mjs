import { execFileSync } from 'node:child_process'
import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('node:child_process', () => ({
    execFileSync: vi.fn(),
}))

const { derivePRLinks } = await import('./derive-pr-links.mjs')

const REPO_ROOT = '/repo'
const BRANCH_NAME = 'feature/context-links'

beforeEach(() => {
    execFileSync.mockReset()
})

function mockGit(handler) {
    execFileSync.mockImplementation((command, args) => {
        expect(command).toBe('git')
        return handler(args)
    })
}

describe('derivePRLinks', () => {
    test('uses a direct GitHub pull URL from group state without git when branch is absent', () => {
        expect(
            derivePRLinks({
                groupState: { prUrl: 'https://github.com/slopus/happy/pull/1154' },
                repoRoot: REPO_ROOT,
                branchName: undefined,
                stage: 'review',
            }),
        ).toEqual({ prUrl: 'https://github.com/slopus/happy/pull/1154' })
        expect(execFileSync).not.toHaveBeenCalled()
    })

    test('finds a direct GitHub pull URL in branch log output', () => {
        mockGit((args) => {
            expect(args).toEqual(['-C', REPO_ROOT, 'log', '--format=%H%n%s%n%b', '-n', '5', BRANCH_NAME])
            return 'abc123\nfeat: add link\nSee https://github.com/slopus/happy/pull/42\n'
        })

        expect(derivePRLinks({ repoRoot: REPO_ROOT, branchName: BRANCH_NAME, stage: 'review' })).toEqual({
            branchName: BRANCH_NAME,
            prUrl: 'https://github.com/slopus/happy/pull/42',
        })
    })

    test('reconstructs Closes #N references with a parseable GitHub origin', () => {
        mockGit((args) => {
            expect(args).toEqual(['-C', REPO_ROOT, 'log', '--format=%H%n%s%n%b', '-n', '5', BRANCH_NAME])
            return 'abc123\nfeat: close the loop\n\nCloses #77\n'
        })

        expect(
            derivePRLinks({
                repoRoot: REPO_ROOT,
                branchName: BRANCH_NAME,
                stage: 'review',
                originUrl: 'git@github.com:slopus/happy.git',
            }),
        ).toEqual({ branchName: BRANCH_NAME, prUrl: 'https://github.com/slopus/happy/pull/77' })
    })

    test('leaves Closes #N unresolved for non-GitHub origins', () => {
        mockGit(() => 'abc123\nfeat: close the loop\n\nCloses #77\n')

        expect(
            derivePRLinks({
                repoRoot: REPO_ROOT,
                branchName: BRANCH_NAME,
                stage: 'review',
                originUrl: 'https://example.com/slopus/happy.git',
            }),
        ).toEqual({ branchName: BRANCH_NAME })
    })

    test('leaves prUrl undefined when no PR reference exists', () => {
        mockGit(() => 'abc123\nfeat: ordinary commit\n\nNo pull request reference here.\n')

        expect(derivePRLinks({ repoRoot: REPO_ROOT, branchName: BRANCH_NAME, stage: 'review' })).toEqual({
            branchName: BRANCH_NAME,
        })
    })

    test('returns known branchName when git log throws for a missing branch', () => {
        mockGit(() => {
            throw new Error('unknown revision')
        })

        expect(derivePRLinks({ repoRoot: REPO_ROOT, branchName: BRANCH_NAME, stage: 'review' })).toEqual({
            branchName: BRANCH_NAME,
        })
    })

    test('returns known branchName when git log output is empty', () => {
        mockGit(() => '')

        expect(derivePRLinks({ repoRoot: REPO_ROOT, branchName: BRANCH_NAME, stage: 'review' })).toEqual({
            branchName: BRANCH_NAME,
        })
    })

    test('returns known branchName when origin lookup throws', () => {
        mockGit((args) => {
            if (args[2] === 'log') {
                return 'abc123\nfeat: close the loop\n\nCloses #88\n'
            }
            if (args[2] === 'remote') {
                throw new Error('origin missing')
            }
            throw new Error(`unexpected git args: ${args.join(' ')}`)
        })

        expect(derivePRLinks({ repoRoot: REPO_ROOT, branchName: BRANCH_NAME, stage: 'review' })).toEqual({
            branchName: BRANCH_NAME,
        })
    })

    test('omits mergeCommit for non-shipped stages', () => {
        mockGit(() => 'abc123\nfeat: add link\nSee https://github.com/slopus/happy/pull/42\n')

        expect(derivePRLinks({ repoRoot: REPO_ROOT, branchName: BRANCH_NAME, stage: 'review' })).toEqual({
            branchName: BRANCH_NAME,
            prUrl: 'https://github.com/slopus/happy/pull/42',
        })
        expect(execFileSync).toHaveBeenCalledTimes(1)
    })

    test('populates mergeCommit for shipped stages via rev-parse', () => {
        mockGit((args) => {
            if (args[2] === 'log') {
                return 'abc123\nfeat: add link\nSee https://github.com/slopus/happy/pull/42\n'
            }
            if (args[2] === 'rev-parse') {
                expect(args).toEqual(['-C', REPO_ROOT, 'rev-parse', BRANCH_NAME])
                return '1234567890abcdef\n'
            }
            throw new Error(`unexpected git args: ${args.join(' ')}`)
        })

        expect(derivePRLinks({ repoRoot: REPO_ROOT, branchName: BRANCH_NAME, stage: 'shipped' })).toEqual({
            branchName: BRANCH_NAME,
            prUrl: 'https://github.com/slopus/happy/pull/42',
            mergeCommit: '12345678',
        })
    })
})
