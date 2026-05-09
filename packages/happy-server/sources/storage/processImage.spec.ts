import { processImage } from './processImage';
import { describe, expect, it } from 'vitest';

describe('processImage', () => {
    it('should resize image', async () => {
        const sharp = (await import('sharp')).default;
        const img = await sharp({
            create: {
                width: 20,
                height: 10,
                channels: 3,
                background: { r: 255, g: 0, b: 0 },
            },
        }).jpeg().toBuffer();
        let result = await processImage(img);
        expect(result.width).toBe(20);
        expect(result.height).toBe(10);
        expect(result.format).toBe('jpeg');
        expect(result.thumbhash.length).toBeGreaterThan(0);
    });
});
