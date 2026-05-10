import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UserMessageSchema } from '@/api/types';

describe('runCodex attachment ignore behavior', () => {
    it('accepts attachment-bearing user messages while keeping Codex queueing text-only', () => {
        const parsed = UserMessageSchema.parse({
            role: 'user',
            content: {
                type: 'text',
                text: 'verbatim codex text',
                attachments: [{ type: 'image', ref: 'base64-image', mimeType: 'image/png' }],
            },
        });
        const source = readFileSync(new URL('./runCodex.ts', import.meta.url), 'utf8');

        expect(parsed.content.text).toBe('verbatim codex text');
        expect(source).toContain('messageQueue.push(message.content.text, enhancedMode);');
        expect(source).not.toContain('message.content.attachments');
    });
});
