// Bundles the content script and service worker into single classic scripts (no imports/chunks),
// which is what Chrome requires for content scripts. Runs after `vite build`.
import { build } from 'esbuild';

const production = process.env.NODE_ENV !== 'development';

await build({
  entryPoints: {
    content: 'src/extension/content.ts',
    background: 'src/extension/background.ts',
  },
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  target: 'chrome114',
  minify: production,
  sourcemap: !production,
  logLevel: 'info',
});
