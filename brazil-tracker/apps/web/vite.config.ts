import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const sha = (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'nogit';
  }
})();
const build = process.env.BUILD_VERSION || `${sha}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`;

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  define: { __BUILD__: JSON.stringify(build) },
  build: { outDir: fileURLToPath(new URL('../../dist/web', import.meta.url)), emptyOutDir: true, target: 'es2020' },
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
});
