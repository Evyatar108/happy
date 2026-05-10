import { describe, expect, it } from 'vitest';
import { resolveMessageModeMeta } from './messageMeta';

describe('resolveMessageModeMeta', () => {
    it('sends user-chosen permission and model keys', () => {
        const meta = resolveMessageModeMeta({
            permissionMode: 'bypassPermissions',
            permissionModeUserChosen: true,
            modelMode: 'gpt-5-high',
            effortLevel: null,
            metadata: null,
        } as any);

        expect(meta).toEqual({
            permissionMode: 'bypassPermissions',
            model: 'gpt-5-high',
        });
    });

    it('omits permission mode when the user has not chosen and sandbox is disabled', () => {
        const meta = resolveMessageModeMeta({
            permissionMode: null,
            permissionModeUserChosen: false,
            modelMode: 'default',
            effortLevel: null,
            metadata: {
                sandbox: null,
            },
        } as any);

        expect(meta).toEqual({
            model: null,
        });
        expect(meta).not.toHaveProperty('permissionMode');
    });

    it('forces bypass permissions in sandbox when the user has not chosen', () => {
        const meta = resolveMessageModeMeta({
            permissionMode: 'default',
            permissionModeUserChosen: false,
            modelMode: null,
            effortLevel: undefined,
            metadata: {
                sandbox: { enabled: true },
            },
        } as any);

        expect(meta).toEqual({
            permissionMode: 'bypassPermissions',
            model: null,
        });
    });

    it('omits UI-only permission mode keys from message meta', () => {
        const meta = resolveMessageModeMeta({
            permissionMode: 'dontAsk',
            permissionModeUserChosen: true,
            modelMode: 'default',
            effortLevel: null,
            metadata: null,
        } as any);

        expect(meta).toEqual({
            model: null,
        });
        expect(meta).not.toHaveProperty('permissionMode');
    });

    it('forces bypass permissions when sandbox is enabled, user chosen is true, and mode is a UI-only key', () => {
        const meta = resolveMessageModeMeta({
            permissionMode: 'dontAsk',
            permissionModeUserChosen: true,
            modelMode: 'default',
            effortLevel: null,
            metadata: {
                sandbox: { enabled: true },
            },
        } as any);

        expect(meta.permissionMode).toBe('bypassPermissions');
    });

    it('sends thinking level from effort level when set', () => {
        const meta = resolveMessageModeMeta({
            permissionMode: 'bypassPermissions',
            permissionModeUserChosen: true,
            modelMode: 'gpt-5-high',
            effortLevel: 'high',
            metadata: null,
        } as any);

        expect(meta).toEqual({
            permissionMode: 'bypassPermissions',
            model: 'gpt-5-high',
            thinkingLevel: 'high',
        });
    });

    it('omits thinking level when effort level is null or undefined', () => {
        const nullMeta = resolveMessageModeMeta({
            permissionMode: null,
            permissionModeUserChosen: false,
            modelMode: 'default',
            effortLevel: null,
            metadata: null,
        } as any);
        const undefinedMeta = resolveMessageModeMeta({
            permissionMode: null,
            permissionModeUserChosen: false,
            modelMode: 'default',
            effortLevel: undefined,
            metadata: null,
        } as any);

        expect(nullMeta).toEqual({ model: null });
        expect(undefinedMeta).toEqual({ model: null });
        expect(nullMeta).not.toHaveProperty('thinkingLevel');
        expect(undefinedMeta).not.toHaveProperty('thinkingLevel');
    });

    it('uses echoed metadata values when local model and effort are unset', () => {
        const meta = resolveMessageModeMeta({
            permissionMode: null,
            permissionModeUserChosen: false,
            modelMode: null,
            effortLevel: null,
            metadata: {
                currentModelCode: 'gpt-5.5',
                currentThoughtLevelCode: 'xhigh',
            },
        } as any);

        expect(meta).toEqual({
            model: 'gpt-5.5',
            thinkingLevel: 'xhigh',
        });
    });
});
