import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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
  { key: 'ctrl+[KeyV]', command: 'local.codexOps.paste', when: 'terminalFocus' },
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

async function checkResumeTerminal(): Promise<void> {
  let probe: vscode.Terminal | undefined;
  let resumed: vscode.Terminal | undefined;
  let listener: vscode.Disposable | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const opened = new Promise<vscode.Terminal>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Window bridge did not open a Codex terminal in this Extension Host')), 15_000);
      listener = vscode.window.onDidOpenTerminal((terminal) => {
        if (terminal.name === 'Codex') {
          resumed = terminal;
          resolve(terminal);
        }
      });
    });
    // A real shell receives this window's environmentVariableCollection; the
    // helper therefore exercises activation wiring and the actual window bridge.
    const sessionId = randomUUID();
    probe = vscode.window.createTerminal({
      name: 'Codex Ops bridge integration probe',
      shellPath: path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      shellArgs: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
        `& $env:CODEX_OPS_HELPER -Endpoint $env:CODEX_OPS_ENDPOINT -SessionId '${sessionId}'`],
      location: vscode.TerminalLocation.Panel,
    });
    probe.show();
    const terminal = await opened;
    assert.ok(vscode.window.terminals.includes(terminal), 'Resumed terminal must belong to this Extension Host');
    assert.equal(terminal.creationOptions.location, vscode.TerminalLocation.Panel, 'Window bridge must create a bottom-panel terminal');
    console.log('PASS real per-window helper bridge opens a Codex terminal in this Extension Host with TerminalLocation.Panel');
  } finally {
    clearTimeout(timer);
    listener?.dispose();
    resumed?.dispose();
    probe?.dispose();
  }
}

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension('local.codex-ops');
  assert.ok(extension, 'The development extension must be installed');
  await extension.activate();
  assert.equal(extension.isActive, true);
  assert.ok((await vscode.commands.getCommands(true)).includes('local.codexOps.paste'));
  assert.equal(extension.packageJSON.main, 'dist/extension.cjs');
  await access(path.join(extension.extensionPath, extension.packageJSON.main));
  assert.equal(extension.packageJSON.version, '0.3.1');
  assert.deepEqual(extension.packageJSON.extensionKind, ['ui']);
  assert.deepEqual(extension.packageJSON.activationEvents, ['onStartupFinished', 'onCommand:local.codexOps.paste']);
  assert.equal(extension.packageJSON.engines.vscode, '^1.85.0');
  assert.deepEqual(extension.packageJSON.contributes.keybindings, expectedBindings);
  const skipShell = vscode.workspace.getConfiguration('terminal.integrated').get<string[]>('commandsToSkipShell');
  assert.ok(skipShell?.includes('local.codexOps.paste'), 'Effective terminal defaults must skip the shell');
  console.log('PASS compiled runtime activation, command registration, effective defaults and five manifest bindings');

  for (const binding of extension.packageJSON.contributes.keybindings as Keybinding[]) {
    if (binding.command === 'workbench.action.terminal.sendSequence') await checkSequence(binding);
  }

  const scriptPath = path.join(extension.extensionPath, 'scripts', 'contains-image.ps1');
  await access(scriptPath);
  await access(path.join(extension.extensionPath, 'scripts', 'open-session.ps1'));
  if (process.platform === 'win32') {
    await checkResumeTerminal();
    assert.equal(typeof await containsImage(scriptPath), 'boolean');
    console.log('PASS Windows PowerShell detector returned boolean (clipboard unchanged)');
  } else {
    console.log('SKIP Windows PowerShell detector: requires a Windows extension host');
  }
}
