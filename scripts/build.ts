import { build } from 'esbuild';
import path from 'node:path';

const root = path.resolve(import.meta.dir, '..');

for (const name of ['codex-smart-paste', 'codex-terminal-tool']) {
  await build({
    entryPoints: [path.join(root, `extensions/${name}/src/extension.ts`)],
    outfile: path.join(root, `extensions/${name}/dist/extension.cjs`),
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    external: ['vscode'],
  });
}

for (const name of ['run', 'suite']) {
  await build({
    entryPoints: [path.join(root, `test/integration/${name}.ts`)],
    outfile: path.join(root, `dist/test/integration/${name}.cjs`),
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    external: ['vscode', '@vscode/test-electron'],
  });
}
