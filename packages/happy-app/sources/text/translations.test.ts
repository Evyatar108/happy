import { readdirSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { describe, expect, it } from 'vitest';

import { SUPPORTED_LANGUAGE_CODES, type SupportedLanguage } from './_all';
import { en, type TranslationStructure } from './_default';
import { ca } from './translations/ca';
import { es } from './translations/es';
import { it as italian } from './translations/it';
import { ja } from './translations/ja';
import { pl } from './translations/pl';
import { pt } from './translations/pt';
import { ru } from './translations/ru';
import { zhHans } from './translations/zh-Hans';
import { zhHant } from './translations/zh-Hant';

const translations = {
    en,
    ru,
    pl,
    es,
    it: italian,
    pt,
    ca,
    'zh-Hans': zhHans,
    'zh-Hant': zhHant,
    ja,
} satisfies Record<SupportedLanguage, TranslationStructure>;

const REQUIRED_DEFERRED_SWITCH_KEYS = [
    'pendingSwitch.banner',
    'requestSwitch.now',
    'requestSwitch.whenIdle',
    'cancelPendingSwitch.label',
    'cancelPendingSwitch.note',
    'abortPrompt.title',
    'abortPrompt.message',
    'abortPrompt.switchWhenIdle',
    'abortPrompt.switchNow',
    'abortPrompt.cancel',
    'errors.requestSwitchFailed',
    'errors.sendFailed',
] as const;

const REQUIRED_SESSION_DRAWER_KEYS = [
    'drawer.fork.comingSoon',
    'drawer.applyFailed',
    'session.resumeFromTerminal',
    'sessionInfo.resumeSession',
    'sessionInfo.resumeSessionSubtitle',
    'sessionInfo.resumeSessionSameMachineOnly',
    'sessionInfo.resumeSessionMachineOffline',
    'sessionInfo.resumeSessionNeedsHappyAgent',
    'sessionInfo.resumeSessionMissingMachine',
    'sessionInfo.resumeSessionMissingBackendId',
    'sessionInfo.resumeSessionUnexpectedDirectoryPrompt',
    'agentInput.model.title',
    'agentInput.permissionMode.title',
    'agentInput.effort.title',
    'commandPalette.placeholder',
    'sidebar.expand',
    'sidebar.collapse',
    'status.unknown',
] as const;

type TranslationTree =
    | string
    | ((...args: any[]) => string)
    | { readonly [key: string]: TranslationTree };

function getByPath(dictionary: TranslationStructure, path: string): unknown {
    return path.split('.').reduce<unknown>((value, key) => {
        if (value == null || typeof value !== 'object') {
            return undefined;
        }

        return (value as Record<string, unknown>)[key];
    }, dictionary);
}

function collectLeafPaths(value: TranslationTree, prefix = ''): string[] {
    if (typeof value === 'string' || typeof value === 'function') {
        return prefix ? [prefix] : [];
    }

    return Object.entries(value).flatMap(([key, child]) =>
        collectLeafPaths(child, prefix ? `${prefix}.${key}` : key)
    );
}

describe('translations', () => {
    it('has one locale file for every supported language', () => {
        const localeCodes = readdirSync(new URL('./translations', import.meta.url))
            .filter(file => file.endsWith('.ts'))
            .map(file => basename(file, extname(file)))
            .sort();

        expect(localeCodes).toEqual([...SUPPORTED_LANGUAGE_CODES].sort());
    });

    it('keeps every locale in parity with the English translation shape', () => {
        const sourceKeys = collectLeafPaths(en as TranslationTree);

        for (const [language, dictionary] of Object.entries(translations)) {
            for (const key of sourceKeys) {
                const sourceValue = getByPath(en, key);
                const translatedValue = getByPath(dictionary, key);

                expect(translatedValue, `${language}.${key}`).toBeDefined();
                expect(typeof translatedValue, `${language}.${key}`).toBe(typeof sourceValue);

                if (typeof translatedValue === 'string') {
                    expect(translatedValue.trim(), `${language}.${key}`).not.toBe('');
                }
            }
        }
    });

    it('keeps the deferred switch strings present in every locale', () => {
        for (const [language, dictionary] of Object.entries(translations)) {
            for (const key of REQUIRED_DEFERRED_SWITCH_KEYS) {
                const value = getByPath(dictionary, key);

                expect(value, `${language}.${key}`).toBeTypeOf('string');
                expect((value as string).trim(), `${language}.${key}`).not.toBe('');
            }
        }
    });

    it('keeps the session drawer strings present in every locale', () => {
        for (const [language, dictionary] of Object.entries(translations)) {
            for (const key of REQUIRED_SESSION_DRAWER_KEYS) {
                const value = getByPath(dictionary, key);

                expect(value, `${language}.${key}`).toBeTypeOf('string');
                expect((value as string).trim(), `${language}.${key}`).not.toBe('');
            }
        }
    });
});
