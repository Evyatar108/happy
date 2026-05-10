import { describe, expect, it } from 'vitest';
import { shellQuoteForOs } from './shellQuote';

describe('shellQuoteForOs', () => {
    it('uses POSIX single-quote escaping by default', () => {
        expect(shellQuoteForOs("packages/it's fine.ts", 'linux')).toBe("'packages/it'\\''s fine.ts'");
    });

    it('uses Windows cmd escaping for Windows sessions', () => {
        expect(shellQuoteForOs('dir/a "b" &|<>^()%!.ts', 'win32')).toBe('"dir/a ""b"" ^&^|^<^>^^^(^)^%^!.ts"');
    });

    it('rejects Windows values containing newlines', () => {
        expect(() => shellQuoteForOs('dir/a\nb.ts', 'windows')).toThrow('newlines');
    });
});
