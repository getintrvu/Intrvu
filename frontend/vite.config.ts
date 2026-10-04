import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import pkg from './package.json' with { type: 'json' };
import react from '@vitejs/plugin-react';

/**
 * Emits dist/manifest.json from manifest.json, adding the API origin to host_permissions (so the
 * same source works for localhost and production) and, optionally, a fixed extension key so the
 * extension id (and with it the OAuth redirect URL and the backend CORS origin) never changes.
 */
function manifestPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'intrvu-manifest',
    generateBundle() {
      const manifest = JSON.parse(readFileSync('manifest.json', 'utf-8'));
      if (env.VITE_API_BASE_URL) {
        manifest.host_permissions.push(`${new URL(env.VITE_API_BASE_URL).origin}/*`);
      }
      if (env.EXTENSION_PUBLIC_KEY) manifest.key = env.EXTENSION_PUBLIC_KEY;
      this.emitFile({ type: 'asset', fileName: 'manifest.json', source: JSON.stringify(manifest, null, 2) });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: './', // relative asset paths: the UI is served from chrome-extension://<id>/
    plugins: [react(), manifestPlugin(env)],
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    build: { target: 'chrome114' },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
    },
  };
});
