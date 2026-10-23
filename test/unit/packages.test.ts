import { beforeAll, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dir, '../..');

// Verify the package boundary from a clean checkout, including fresh bundles.
beforeAll(() => { execFileSync(process.execPath, ['scripts/build.ts'], { cwd: root, stdio: 'pipe' }); });

for (const [name, version, script, foreignScript] of [
  ['codex-smart-paste', '0.3.0', 'contains-image.ps1', 'open-session.ps1'],
  ['codex-terminal-tool', '0.5.0', 'open-session.ps1', 'contains-image.ps1'],
]) {
  describe(name!, () => {
    const directory = path.join(root, 'extensions', name!);
    const manifest = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'));
    test('has an independent extension identity and no runtime dependencies', () => {
      expect(`${manifest.publisher}.${manifest.name}`).toBe(`local.${name}`);
      expect(manifest.version).toBe(version);
      expect(manifest.dependencies).toBeUndefined();
      expect(manifest.extensionDependencies).toBeUndefined();
      expect(manifest.extensionPack).toBeUndefined();
      expect(manifest.main).toBe('dist/extension.cjs');
    });
    test('vsce includes exactly its own runtime and PowerShell helper', () => {
      const files = execFileSync(path.join(root, 'node_modules/.bin/vsce'), ['ls', '--no-dependencies'], {
        cwd: directory, encoding: 'utf8',
      }).trim().split(/\r?\n/).sort();
      expect(files).toEqual(['README.md', 'dist/extension.cjs', 'package.json', `scripts/${script}`].sort());
      expect(files.some((file) => file.includes(foreignScript!))).toBe(false);
    });
  });
}
