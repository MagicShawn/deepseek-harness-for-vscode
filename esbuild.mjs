import * as esbuild from 'esbuild'

const watch = process.argv.includes('--watch')
const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.cjs',
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  external: ['vscode'],
  sourcemap: true,
  minify: !watch,
  logLevel: 'info',
}

if (watch) {
  const context = await esbuild.context(options)
  await context.watch()
} else {
  await esbuild.build(options)
}
