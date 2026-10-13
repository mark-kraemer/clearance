// Bundles the three Electron entry points with esbuild and copies the static
// renderer files. Run with `pnpm build`; `pnpm start` builds then launches.
import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

mkdirSync('dist', { recursive: true });

const node = { platform: 'node', format: 'cjs', target: 'node22', bundle: true, sourcemap: true, logLevel: 'info' };

await Promise.all([
  build({ ...node, entryPoints: ['app/main/main.ts'], outfile: 'dist/main.cjs', external: ['electron'] }),
  build({ ...node, entryPoints: ['app/main/preload.ts'], outfile: 'dist/preload.cjs', external: ['electron'] }),
  build({ ...node, format: 'esm', entryPoints: ['app/main/permission-server.ts'], outfile: 'dist/permission-server.mjs', banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" } }),
  build({ platform: 'browser', format: 'iife', target: 'es2022', bundle: true, sourcemap: true, logLevel: 'info', entryPoints: ['app/renderer/renderer.ts'], outfile: 'dist/renderer.js' }),
]);

cpSync('app/renderer/index.html', 'dist/index.html');
cpSync('app/renderer/styles.css', 'dist/styles.css');
