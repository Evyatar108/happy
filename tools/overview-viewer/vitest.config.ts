import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'ssr',
          environment: 'node',
          include: ['src/__tests__/**/*.test.{ts,tsx}'],
          exclude: ['src/__tests__/interactions/**/*.test.{ts,tsx}'],
        },
      },
      {
        test: {
          name: 'interactions',
          environment: 'jsdom',
          include: ['src/__tests__/interactions/**/*.test.tsx'],
        },
      },
    ],
  },
});
