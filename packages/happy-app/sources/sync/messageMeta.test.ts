import { describe, expect, it } from 'vitest';
import { resolveMessageModeMeta } from './messageMeta';

describe('resolveMessageModeMeta', () => {
    it('sends user-chosen permission and model keys', () => {
        const meta = resolveMessageModeMeta({
            permissionMode: 'bypassPermissions',
            permissionModeUserChosen: true,
            modelMode: 'gpt-5-high',
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
            metadata: null,
        } as any);

        expect(meta).toEqual({
            model: null,
        });
        expect(meta).not.toHaveProperty('permissionMode');
    });
});
