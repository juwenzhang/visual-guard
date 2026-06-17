import {defineConfig} from 'tsup';

/**
 * tsup config for app.
 *
 * `format` is rendered from the format-* features you selected at scaffold:
 *   esm + cjs + umd.
 *
 * Switch formats by editing the array; UMD requires `globalName` (set below).
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs', 'umd'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  globalName: 'App',
  outExtension: ({format}) =>
    format === 'esm' ? {js: '.mjs'} : format === 'cjs' ? {js: '.cjs'} : {js: '.umd.js'}
});
