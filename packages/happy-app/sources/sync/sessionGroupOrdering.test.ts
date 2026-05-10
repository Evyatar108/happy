import { describe, expect, it } from 'vitest';
import { applyOrderToProjectEntries, makeSessionGroupKey, moveSessionGroup } from './sessionGroupOrdering';

describe('sessionGroupOrdering', () => {
    describe('makeSessionGroupKey', () => {
        it('composes machine and path into a stable key', () => {
            expect(makeSessionGroupKey('machine-1', '/repo/worktree')).toBe('machine-1::/repo/worktree');
        });
    });

    describe('applyOrderToProjectEntries', () => {
        const entries: Array<[path: string, group: { id: string }]> = [
            ['/alpha', { id: 'alpha' }],
            ['/beta', { id: 'beta' }],
            ['/gamma', { id: 'gamma' }],
        ];

        it('keeps alphabetical entries unchanged when order is empty', () => {
            expect(applyOrderToProjectEntries(entries, 'machine-1', [])).toBe(entries);
        });

        it('applies a full saved order', () => {
            expect(applyOrderToProjectEntries(entries, 'machine-1', [
                'machine-1::/gamma',
                'machine-1::/alpha',
                'machine-1::/beta',
            ])).toEqual([
                ['/gamma', { id: 'gamma' }],
                ['/alpha', { id: 'alpha' }],
                ['/beta', { id: 'beta' }],
            ]);
        });

        it('applies partial saved order and preserves the unordered tail', () => {
            expect(applyOrderToProjectEntries(entries, 'machine-1', [
                'machine-1::/gamma',
            ])).toEqual([
                ['/gamma', { id: 'gamma' }],
                ['/alpha', { id: 'alpha' }],
                ['/beta', { id: 'beta' }],
            ]);
        });

        it('silently skips unknown keys in saved order', () => {
            expect(applyOrderToProjectEntries(entries, 'machine-1', [
                'machine-1::/missing',
                'other-machine::/beta',
                'machine-1::/beta',
            ])).toEqual([
                ['/beta', { id: 'beta' }],
                ['/alpha', { id: 'alpha' }],
                ['/gamma', { id: 'gamma' }],
            ]);
        });
    });

    describe('moveSessionGroup', () => {
        it('moves a group up before another visible key', () => {
            expect(moveSessionGroup(
                ['machine-1::/alpha', 'machine-1::/beta', 'machine-1::/gamma'],
                ['machine-1::/alpha', 'machine-1::/beta', 'machine-1::/gamma'],
                'machine-1::/gamma',
                'machine-1::/alpha',
                'before',
            )).toEqual(['machine-1::/gamma', 'machine-1::/alpha', 'machine-1::/beta']);
        });

        it('moves a group down after the next visible key', () => {
            expect(moveSessionGroup(
                ['machine-1::/alpha', 'machine-1::/beta', 'machine-1::/gamma'],
                ['machine-1::/alpha', 'machine-1::/beta', 'machine-1::/gamma'],
                'machine-1::/alpha',
                'machine-1::/beta',
                'after',
            )).toEqual(['machine-1::/beta', 'machine-1::/alpha', 'machine-1::/gamma']);
        });

        it('moves a group to the end after the last visible key', () => {
            expect(moveSessionGroup(
                ['machine-1::/alpha', 'machine-1::/beta', 'machine-1::/gamma'],
                ['machine-1::/alpha', 'machine-1::/beta', 'machine-1::/gamma'],
                'machine-1::/alpha',
                'machine-1::/gamma',
                'after',
            )).toEqual(['machine-1::/beta', 'machine-1::/gamma', 'machine-1::/alpha']);
        });

        it('preserves stale keys across reorder', () => {
            expect(moveSessionGroup(
                ['machine-1::/alpha', 'machine-2::/stale', 'machine-1::/beta'],
                ['machine-1::/alpha', 'machine-1::/beta'],
                'machine-1::/beta',
                'machine-1::/alpha',
                'before',
            )).toEqual(['machine-1::/beta', 'machine-1::/alpha', 'machine-2::/stale']);
        });

        it('auto-appends missing visible keys before moving', () => {
            expect(moveSessionGroup(
                ['machine-1::/alpha'],
                ['machine-1::/alpha', 'machine-1::/beta', 'machine-1::/gamma'],
                'machine-1::/gamma',
                'machine-1::/alpha',
                'before',
            )).toEqual(['machine-1::/gamma', 'machine-1::/alpha', 'machine-1::/beta']);
        });

        it('returns the original order unchanged for same-key moves', () => {
            const order = ['machine-1::/alpha', 'machine-1::/beta'];

            expect(moveSessionGroup(
                order,
                ['machine-1::/alpha', 'machine-1::/beta', 'machine-1::/gamma'],
                'machine-1::/alpha',
                'machine-1::/alpha',
                'after',
            )).toBe(order);
        });
    });
});
