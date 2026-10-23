import { expect, test } from 'bun:test';
import { existsSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import manifest from '../../package.json';

const root = path.resolve(import.meta.dir, '../..');

test('manifest exempts smart paste from terminal shell handling by default', () => {
  expect(manifest.contributes.configurationDefaults['terminal.integrated.commandsToSkipShell']).toEqual(['local.codexSmartPaste.paste']);
});

test('manifest activates the UI extension with exact terminal-only physical shortcuts', () => {
  expect(manifest.main).toBe('dist/extension.cjs');
  expect(manifest.extensionKind).toEqual(['ui']);
  expect(manifest.activationEvents).toEqual(['onCommand:local.codexSmartPaste.paste']);
  expect(manifest.engines.vscode).toBe('^1.85.0');
  expect(manifest.name).toBe('codex-smart-paste');
  expect(manifest.publisher).toBe('local');
  expect(manifest.version).toBe('0.3.0');
  expect(manifest.contributes.commands).toEqual([{ command: 'local.codexSmartPaste.paste', title: 'Codex: Smart Paste in Terminal' }]);
  expect(manifest.contributes.keybindings).toEqual([
    { key: 'ctrl+[KeyV]', command: 'local.codexSmartPaste.paste', when: 'terminalFocus' },
    { key: 'alt+[KeyV]', command: 'workbench.action.terminal.sendSequence', args: { text: '\u001bv' }, when: 'terminalFocus' },
    { key: 'ctrl+[KeyC]', command: 'workbench.action.terminal.copySelection', when: 'terminalFocus && terminalTextSelected' },
    { key: 'ctrl+enter', command: 'workbench.action.terminal.sendSequence', args: { text: '\u001b[13;2u' }, when: 'terminalFocus' },
    { key: 'shift+enter', command: 'workbench.action.terminal.sendSequence', args: { text: '\u001b[13;2u' }, when: 'terminalFocus' },
  ]);
});

test('build emits the declared CommonJS extension entrypoint and preserves the root PowerShell resource', () => {
  const bundle = path.join(root, manifest.main);
  rmSync(bundle, { force: true });
  const result = spawnSync(process.execPath, ['run', 'build'], { cwd: path.resolve(root, '../..'), encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  expect(existsSync(bundle)).toBe(true);
  expect(statSync(bundle).size).toBeGreaterThan(0);
  expect(existsSync(path.join(root, 'scripts/contains-image.ps1'))).toBe(true);
  expect(existsSync(path.join(path.dirname(bundle), 'scripts/contains-image.ps1'))).toBe(false);
});
