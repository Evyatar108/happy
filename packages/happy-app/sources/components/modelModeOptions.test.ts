import { describe, expect, it } from 'vitest';
import {
    getAvailableModels,
    getAvailablePermissionModes,
    getCodexModelModes,
    getClaudePermissionModes,
    mapMetadataOptions,
    resolvePermissionModeForPicker,
    resolveCurrentOption,
} from './modelModeOptions';

const translate = (key: string) => `tr:${key}`;

describe('modelModeOptions', () => {
    it('maps metadata option shape into mode options', () => {
        expect(mapMetadataOptions([
            { code: 'm1', value: 'Model One', description: 'Primary model' },
            { code: 'm2', value: 'Model Two' },
        ])).toEqual([
            { key: 'm1', name: 'Model One', description: 'Primary model' },
            { key: 'm2', name: 'Model Two', description: null },
        ]);
    });

    it('builds claude permission fallbacks with translated names', () => {
        const modes = getClaudePermissionModes(translate);
        expect(modes.map((mode) => mode.key)).toEqual(['default', 'plan', 'dontAsk', 'acceptEdits', 'bypassPermissions']);
        expect(modes[0].name).toBe('tr:agentInput.permissionMode.default');
    });

    it('builds codex model fallbacks', () => {
        const models = getCodexModelModes();
        expect(models.map((model) => model.key)).toEqual([
            'default',
            'gpt-5.5',
            'gpt-5.4',
            'gpt-5.3-codex',
            'gpt-5.2-codex',
            'gpt-5.1-codex-max',
            'gpt-5.2',
            'gpt-5.1-codex-mini',
        ]);
        expect(models[0].name).toBe('default model');
        expect(models[1].name).toBe('gpt-5.5');
    });

    it('prefers metadata models over hardcoded fallbacks', () => {
        const models = getAvailableModels('gemini', {
            models: [
                { code: 'custom-gemini', value: 'Gemini Custom', description: 'From metadata' },
            ],
        } as any, translate);

        expect(models).toEqual([
            { key: 'custom-gemini', name: 'Gemini Custom', description: 'From metadata' },
        ]);
    });

    it('adds codex default model option when metadata models are present', () => {
        const models = getAvailableModels('codex', {
            models: [
                { code: 'gpt-5.4', value: 'gpt-5.4', description: 'Latest' },
            ],
        } as any, translate);

        expect(models).toEqual([
            { key: 'default', name: 'default model', description: null },
            { key: 'gpt-5.4', name: 'gpt-5.4', description: 'Latest' },
        ]);
    });

    it('keeps codex permission modes hardcoded even when metadata modes exist', () => {
        const modes = getAvailablePermissionModes('codex', {
            operatingModes: [{ code: 'metadata-only', value: 'Metadata Mode', description: null }],
        } as any, translate);

        expect(modes.map((mode) => mode.key)).toEqual(['default', 'read-only', 'safe-yolo', 'yolo']);
    });

    it('applies hacks to metadata-provided operating modes', () => {
        const modes = getAvailablePermissionModes('gemini', {
            operatingModes: [
                { code: 'build', value: 'build, build', description: 'Do build steps' },
                { code: 'plan', value: 'plan/plan', description: 'Plan first' },
            ],
        } as any, translate);

        expect(modes).toEqual([
            { key: 'build', name: 'build', description: 'Do build steps' },
            { key: 'plan', name: 'plan', description: 'Plan first' },
        ]);
    });

    it('resolves the first matching preferred key', () => {
        const options = [
            { key: 'a', name: 'A' },
            { key: 'b', name: 'B' },
        ];

        expect(resolveCurrentOption(options, ['missing', 'b', 'a'])).toEqual({ key: 'b', name: 'B' });
        expect(resolveCurrentOption(options, ['missing'])).toBeNull();
    });

    describe('resolvePermissionModeForPicker', () => {
        const claudeModes = [
            { key: 'default', name: 'Default' },
            { key: 'plan', name: 'Plan' },
            { key: 'bypassPermissions', name: 'Bypass' },
        ];
        const codexModes = [
            { key: 'default', name: 'Default' },
            { key: 'read-only', name: 'Read Only' },
            { key: 'yolo', name: 'YOLO' },
        ];

        it('uses metadata current permission mode when the user has not chosen', () => {
            expect(resolvePermissionModeForPicker(claudeModes, {
                userChosen: false,
                sessionPermissionMode: 'bypassPermissions',
                metadataCurrentPermissionModeCode: 'plan',
                metadataDangerouslySkipPermissions: false,
                flavor: 'claude',
            })?.key).toBe('plan');
        });

        it('uses the session permission mode when the user has chosen', () => {
            expect(resolvePermissionModeForPicker(claudeModes, {
                userChosen: true,
                sessionPermissionMode: 'bypassPermissions',
                metadataCurrentPermissionModeCode: 'plan',
                metadataDangerouslySkipPermissions: false,
                flavor: 'claude',
            })?.key).toBe('bypassPermissions');
        });

        it('falls back to the flavor default when no user or metadata mode exists', () => {
            expect(resolvePermissionModeForPicker(claudeModes, {
                userChosen: false,
                sessionPermissionMode: undefined,
                metadataCurrentPermissionModeCode: undefined,
                metadataDangerouslySkipPermissions: false,
                flavor: 'claude',
            })?.key).toBe('default');
        });

        it('falls back to the flavor default when metadata mode is unavailable', () => {
            expect(resolvePermissionModeForPicker(claudeModes, {
                userChosen: false,
                sessionPermissionMode: undefined,
                metadataCurrentPermissionModeCode: 'missing-mode',
                metadataDangerouslySkipPermissions: false,
                flavor: 'claude',
            })?.key).toBe('default');
        });

        it('uses the Claude legacy bypass flag when modern metadata is absent', () => {
            expect(resolvePermissionModeForPicker(claudeModes, {
                userChosen: false,
                sessionPermissionMode: undefined,
                metadataCurrentPermissionModeCode: undefined,
                metadataDangerouslySkipPermissions: true,
                flavor: 'claude',
            })?.key).toBe('bypassPermissions');
        });

        it('prefers modern metadata over the Claude legacy bypass flag', () => {
            expect(resolvePermissionModeForPicker(claudeModes, {
                userChosen: false,
                sessionPermissionMode: undefined,
                metadataCurrentPermissionModeCode: 'plan',
                metadataDangerouslySkipPermissions: true,
                flavor: 'claude',
            })?.key).toBe('plan');
        });

        it('does not apply the legacy bypass fallback to Codex sessions', () => {
            expect(resolvePermissionModeForPicker(codexModes, {
                userChosen: false,
                sessionPermissionMode: undefined,
                metadataCurrentPermissionModeCode: undefined,
                metadataDangerouslySkipPermissions: true,
                flavor: 'codex',
            })?.key).toBe('default');
        });
    });
});
