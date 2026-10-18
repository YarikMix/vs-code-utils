import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import path from 'node:path';
import * as vscode from 'vscode';
import { containsImage } from '../../src/clipboard.ts';

interface Keybinding {
  key: string;
  command: string;
  when: string;
  args?: { text: string };
}

const expectedBindings: Keybinding[] = [
  { key: 'ctrl+[KeyV]', command: 'local.codexSmartPaste.paste', when: 'terminalFocus' },
  { key: 'alt+[KeyV]', command: 'workbench.action.terminal.sendSequence', args: { text: '\u001bv' }, when: 'terminalFocus' },
  { key: 'ctrl+[KeyC]', command: 'workbench.action.terminal.copySelection', when: 'terminalFocus && terminalTextSelected' },
  { key: 'ctrl+enter', command: 'workbench.action.terminal.sendSequence', args: { text: '\u001b[13;2u' }, when: 'terminalFocus' },
  { key: 'shift+enter', command: 'workbench.action.terminal.sendSequence', args: { text: '\u001b[13;2u' }, when: 'terminalFocus' },
];

async function checkSequence(binding: Keybinding): Promise<void> {
  let terminal: vscode.Terminal | undefined;
  let activeListener: vscode.Disposable | undefined;
  let readyTimer: ReturnType<typeof setTimeout> | undefined;
  let inputTimer: ReturnType<typeof setTimeout> | undefined;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  const output = new vscode.EventEmitter<string>();
  let onInput: (data: string) => void = () => {};
  try {
    const ready = new Promise<void>((resolve, reject) => {
      let opened = false;
      const checkReady = () => {
        if (opened && vscode.window.activeTerminal === terminal) resolve();
      };
      readyTimer = setTimeout(() => reject(new Error(`Terminal did not become active for ${binding.key}`)), 10_000);
      activeListener = vscode.window.onDidChangeActiveTerminal(checkReady);
      terminal = vscode.window.createTerminal({
        name: `Smart Paste integration: ${binding.key}`,
        pty: {
          onDidWrite: output.event,
          open: () => { opened = true; checkReady(); },
          close: () => {},
          handleInput: (data: string) => onInput(data),
        },
      });
      terminal.show();
      checkReady();
    });
    await ready;
    clearTimeout(readyTimer);
    activeListener?.dispose();

    const input = new Promise<string>((resolve, reject) => {
      let received = '';
      inputTimer = setTimeout(() => reject(new Error(`No Pseudoterminal input for ${binding.key}`)), 5_000);
      onInput = (data) => {
        received += data;
        clearTimeout(settleTimer);
        // Capture any extra chunks (including an accidentally appended Enter).
        settleTimer = setTimeout(() => resolve(received), 100);
      };
    });
    await vscode.commands.executeCommand(binding.command, binding.args);
    const received = await input;
    assert.equal(received, binding.args?.text, `${binding.key} must deliver exact ESC bytes`);
    assert.equal(/[\r\n]/.test(received), false, `${binding.key} must not append Enter`);
    console.log(`PASS ${binding.key}: exact Pseudoterminal bytes ${JSON.stringify(received)}`);
  } finally {
    clearTimeout(readyTimer);
    clearTimeout(inputTimer);
    clearTimeout(settleTimer);
    activeListener?.dispose();
    terminal?.dispose();
    output.dispose();
  }
}

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension('local.codex-smart-paste');
  assert.ok(extension, 'The development extension must be installed');
  await extension.activate();
  assert.equal(extension.isActive, true);
  assert.ok((await vscode.commands.getCommands(true)).includes('local.codexSmartPaste.paste'));
  assert.equal(extension.packageJSON.main, 'dist/extension.cjs');
  await access(path.join(extension.extensionPath, extension.packageJSON.main));
  assert.equal(extension.packageJSON.version, '0.2.0');
  assert.deepEqual(extension.packageJSON.extensionKind, ['ui']);
  assert.equal(extension.packageJSON.engines.vscode, '^1.85.0');
  assert.deepEqual(extension.packageJSON.contributes.keybindings, expectedBindings);
  const skipShell = vscode.workspace.getConfiguration('terminal.integrated').get<string[]>('commandsToSkipShell');
  assert.ok(skipShell?.includes('local.codexSmartPaste.paste'), 'Effective terminal defaults must skip the shell');
  console.log('PASS compiled runtime activation, command registration, effective defaults and five manifest bindings');

  for (const binding of extension.packageJSON.contributes.keybindings as Keybinding[]) {
    if (binding.command === 'workbench.action.terminal.sendSequence') await checkSequence(binding);
  }

  const scriptPath = path.join(extension.extensionPath, 'scripts', 'contains-image.ps1');
  await access(scriptPath);
  if (process.platform === 'win32') {
    assert.equal(typeof await containsImage(scriptPath), 'boolean');
    console.log('PASS Windows PowerShell detector returned boolean (clipboard unchanged)');
  } else {
    console.log('SKIP Windows PowerShell detector: requires a Windows extension host');
  }
}
