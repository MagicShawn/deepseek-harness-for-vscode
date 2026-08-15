import { rm } from 'node:fs/promises'
import * as esbuild from 'esbuild'

const watch = process.argv.includes('--watch')

await rm('lib', { recursive: true, force: true })

const hostOptions = {
  entryPoints: {
    index: 'src/index.ts',
    'shared/types': 'src/shared/types.ts',
  },
  bundle: true,
  outdir: 'lib',
  format: 'esm',
  platform: 'node',
  target: 'node22',
  packages: 'external',
  sourcemap: true,
  minify: false,
  logLevel: 'info',
}

const clientOptions = {
  entryPoints: ['src/client/index.tsx'],
  bundle: true,
  outfile: 'lib/client.js',
  format: 'cjs',
  platform: 'browser',
  target: ['chrome120'],
  external: ['react', 'react/jsx-runtime'],
  sourcemap: true,
  minify: !watch,
  logLevel: 'info',
  banner: {
    js: "window.__ModuleLoader__.load({ id: 'deepseek-harness-skill-insight', factory: (require) => { const module = { exports: {} }; const exports = module.exports;",
  },
  footer: {
    js: 'return module.exports; } });',
  },
}

if (watch) {
  const host = await esbuild.context(hostOptions)
  const client = await esbuild.context(clientOptions)
  await Promise.all([host.watch(), client.watch()])
} else {
  await Promise.all([esbuild.build(hostOptions), esbuild.build(clientOptions)])
  await esbuild.build({
    entryPoints: ['src/index.ts', 'src/client/index.tsx', 'src/shared/types.ts'],
    outdir: 'lib/types',
    tsconfig: 'tsconfig.json',
    platform: 'neutral',
    format: 'esm',
    bundle: false,
    sourcemap: false,
    logLevel: 'silent',
  })
}
