import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { include: ['workers/api/test/**/*.test.ts'], environment: 'node' } });
