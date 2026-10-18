import { build } from 'esbuild';
import path from 'node:path';

const root = path.resolve(import.meta.dir, '..');

await build({
  entryPoints: [path.join(root, 'src/extension.ts')],
  outfile: path.join(root, 'dist/extension.cjs'),
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  external: ['vscode'],
});
