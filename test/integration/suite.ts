import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { access, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as vscode from 'vscode';
import { containsImage } from '../../extensions/codex-smart-paste/src/clipboard.ts';

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
      name: 'Codex Terminal Tool bridge integration probe',
      shellPath: vscode.env.remoteName === 'wsl' ? '/bin/bash' : path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      shellArgs: vscode.env.remoteName === 'wsl' ? ['--noprofile', '--norc', '-c',
        `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$CODEX_TERMINAL_TOOL_HELPER" -Endpoint "$CODEX_TERMINAL_TOOL_ENDPOINT" -SessionId '${sessionId}'`] : ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
        `& $env:CODEX_TERMINAL_TOOL_HELPER -Endpoint $env:CODEX_TERMINAL_TOOL_ENDPOINT -SessionId '${sessionId}'`],
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

async function checkTwoWindows(mode: string): Promise<void> {
  assert.equal(vscode.env.remoteName, 'wsl', 'Two-window check must run in real WSL windows');
  const directory = process.env.CODEX_INTEGRATION_COORDINATION!;
  const peer = mode === 'window-a' ? 'window-b' : 'window-a';
  let opened = 0;
  const listener = vscode.window.onDidOpenTerminal((terminal) => { if (terminal.name === 'Codex') opened++; });
  const mark = (state: string) => writeFile(path.join(directory, `${mode}-${state}`), 'ready');
  async function waitFor(name: string): Promise<void> {
    const deadline = Date.now() + 30_000;
    while (true) {
      try { await access(path.join(directory, name)); return; } catch {
        if (Date.now() >= deadline) throw new Error(`Timed out waiting for WSL peer ${name}`);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }
  try {
    await mark('ready');
    await waitFor(`${peer}-ready`);
    if (mode === 'window-b') await waitFor('window-a-done');
    await checkResumeTerminal();
    await mark('done');
    await waitFor(`${peer}-done`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(opened, 1, 'Only this window’s helper may create a terminal in this panel');
    console.log(`PASS real two-window WSL panel isolation: ${mode}`);
  } finally {
    listener.dispose();
  }
}

export async function run(): Promise<void> {
  const mode = process.env.CODEX_INTEGRATION_MODE ?? 'both';
  const smart = vscode.extensions.getExtension('local.codex-smart-paste');
  const tool = vscode.extensions.getExtension('local.codex-terminal-tool');
  assert.equal(Boolean(smart), mode !== 'terminal-only', 'Smart Paste presence must match isolated profile');
  assert.equal(Boolean(tool), mode !== 'smart-only', 'Terminal Tool presence must match isolated profile');
  const commands = () => vscode.commands.getCommands(true);
  if (smart) {
    await smart.activate();
    assert.equal(smart.isActive, true);
    assert.equal(smart.packageJSON.version, '0.3.0');
    assert.deepEqual(smart.packageJSON.contributes.keybindings, expectedBindings);
    assert.equal((await commands()).filter((id) => id === 'local.codexSmartPaste.paste').length, 1);
    const owners = vscode.extensions.all.filter((extension) =>
      extension.packageJSON.contributes?.commands?.some((command: { command: string }) => command.command === 'local.codexSmartPaste.paste'));
    assert.deepEqual(owners.map((owner) => owner.id), ['local.codex-smart-paste']);
    const skipShell = vscode.workspace.getConfiguration('terminal.integrated').get<string[]>('commandsToSkipShell');
    assert.ok(skipShell?.includes('local.codexSmartPaste.paste'));
    await access(path.join(smart.extensionPath, smart.packageJSON.main));
    for (const binding of expectedBindings) {
      if (binding.command === 'workbench.action.terminal.sendSequence') await checkSequence(binding);
    }
    const scriptPath = path.join(smart.extensionPath, 'scripts', 'contains-image.ps1');
    await access(scriptPath);
    if (process.platform === 'win32') assert.equal(typeof await containsImage(scriptPath), 'boolean');
  } else {
    assert.equal((await commands()).includes('local.codexSmartPaste.paste'), false);
  }
  if (tool) {
    await tool.activate();
    assert.equal(tool.isActive, true);
    assert.equal(tool.packageJSON.version, '0.5.0');
    assert.deepEqual(tool.packageJSON.activationEvents, ['onStartupFinished']);
    assert.equal(tool.packageJSON.contributes?.commands, undefined);
    assert.equal(tool.packageJSON.contributes?.keybindings, undefined);
    assert.equal(tool.packageJSON.contributes?.configurationDefaults, undefined);
    await access(path.join(tool.extensionPath, tool.packageJSON.main));
    await access(path.join(tool.extensionPath, 'scripts', 'open-session.ps1'));
    if (process.platform === 'win32') {
      if (process.env.CODEX_INTEGRATION_COORDINATION) await checkTwoWindows(mode);
      else await checkResumeTerminal();
    } else console.log('SKIP real PowerShell helper: requires Windows extension host');
  }
  for (const extension of [smart, tool]) {
    if (!extension) continue;
    assert.deepEqual(extension.packageJSON.extensionKind, ['ui']);
    assert.equal(extension.packageJSON.engines.vscode, '^1.85.0');
  }
  assert.equal((await commands()).includes('local.codexTerminalTool.paste'), false);
  console.log(`PASS isolated extension independence: ${mode}`);
}
