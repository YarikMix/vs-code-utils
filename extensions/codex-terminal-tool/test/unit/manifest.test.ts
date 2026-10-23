import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import manifest from '../../package.json';

const root = path.resolve(import.meta.dir, '../..');

test('Terminal Tool is an independent UI extension activated on startup', () => {
  expect(`${manifest.publisher}.${manifest.name}`).toBe('local.codex-terminal-tool');
  expect(manifest.version).toBe('0.5.0');
  expect(manifest.main).toBe('dist/extension.cjs');
  expect(manifest.engines.vscode).toBe('^1.85.0');
  expect(manifest.extensionKind).toEqual(['ui']);
  expect(manifest.activationEvents).toEqual(['onStartupFinished']);
});

test('Terminal Tool contributes no paste command, keybindings or skip-shell defaults', () => {
  const contributions = (manifest as { contributes?: Record<string, unknown> }).contributes;
  expect(contributions?.commands).toBeUndefined();
  expect(contributions?.keybindings).toBeUndefined();
  expect(contributions?.configurationDefaults).toBeUndefined();
});

test('Terminal Tool owns its helper and contains no paste implementation', () => {
  expect(existsSync(path.join(root, 'scripts/open-session.ps1'))).toBe(true);
  expect(existsSync(path.join(root, 'scripts/contains-image.ps1'))).toBe(false);
  const entrypoint = readFileSync(path.join(root, 'src/extension.ts'), 'utf8');
  expect(entrypoint).toContain('vscode.TerminalLocation.Panel');
  expect(entrypoint).not.toContain('createActivation');
  expect(entrypoint).not.toContain('registerCommand');
  for (const name of ['activation', 'clipboard', 'smart-paste']) {
    expect(existsSync(path.join(root, `src/${name}.ts`))).toBe(false);
  }
});
