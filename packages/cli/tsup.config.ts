import {defineConfig} from 'tsup';

/**
 * tsup build config for @visual-guard/cli.
 * - ESM-only output (matches `"type": "module"` in package.json).
 * - Emits .d.ts via tsup's bundled dts pipeline; keep tsc for typecheck only.
 * - No minification: published tarballs should remain readable for debugging.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: false,
  splitting: false,
  treeshake: true,
  target: 'node18',
  // 引擎包运行时动态加载，不打包进 CLI
  external: ['@visual-guard/engine-playwright', '@visual-guard/engine-puppeteer']
});
