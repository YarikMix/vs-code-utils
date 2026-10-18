'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createSmartPaste } = require('../src/smart-paste');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture(containsImage = async () => false) {
  const sent = [];
  const errors = [];
  const state = { terminal: { sendText: (...args) => sent.push(args) }, pasted: 0 };
  const paste = createSmartPaste({
    getActiveTerminal: () => state.terminal,
    containsImage,
    pasteText: async () => { state.pasted++; },
    reportError: (message) => errors.push(message),
  });
  return { paste, state, sent, errors };
}

test('image format wins and sends ESC+v without Enter to captured terminal', async () => {
  const f = fixture(async () => true);
  await f.paste();
  assert.deepEqual(f.sent, [['\u001bv', false]]);
  assert.equal(f.state.pasted, 0);
});

for (const clipboard of ['text', 'empty']) {
  test(`${clipboard} clipboard uses ordinary terminal paste without injected characters`, async () => {
    const f = fixture(async () => false);
    await f.paste();
    assert.equal(f.state.pasted, 1);
    assert.deepEqual(f.sent, []);
  });
}

for (const image of [true, false]) {
  test(`terminal change cancels ${image ? 'image' : 'text'} dispatch`, async () => {
    const pending = deferred();
    const f = fixture(() => pending.promise);
    const result = f.paste();
    const other = [];
    f.state.terminal = { sendText: (...args) => other.push(args) };
    pending.resolve(image);
    await result;
    assert.deepEqual([f.sent, other], [[], []]);
    assert.equal(f.state.pasted, 0);
  });
}

test('closed target cancels dispatch and missing terminal skips detection', async () => {
  const pending = deferred();
  let detections = 0;
  const f = fixture(() => { detections++; return pending.promise; });
  const result = f.paste();
  f.state.terminal = undefined;
  pending.resolve(true);
  await result;
  await f.paste();
  assert.equal(detections, 1);
  assert.deepEqual(f.sent, []);
  assert.equal(f.state.pasted, 0);
});

test('concurrent calls perform one detection and one dispatch, then permit another paste', async () => {
  const pending = deferred();
  let detections = 0;
  const f = fixture(() => { detections++; return pending.promise; });
  const first = f.paste();
  const second = f.paste();
  assert.equal(detections, 1);
  pending.resolve(true);
  await Promise.all([first, second]);
  assert.deepEqual(f.sent, [['\u001bv', false]]);
  await f.paste();
  assert.equal(detections, 2);
  assert.equal(f.sent.length, 2);
});

test('detection rejection reports a safe error with no fallback and releases lock', async () => {
  let detections = 0;
  const f = fixture(async () => {
    if (detections++ === 0) throw new Error('private clipboard data');
    return false;
  });
  await f.paste();
  assert.equal(f.errors.length, 1);
  assert.match(f.errors[0], /clipboard/i);
  assert.doesNotMatch(f.errors[0], /private clipboard data/);
  assert.equal(f.state.pasted, 0);
  assert.deepEqual(f.sent, []);
  await f.paste();
  assert.equal(f.state.pasted, 1);
});

function activateExtension(execFile) {
  let command;
  const sent = [];
  const pasted = [];
  const errors = [];
  const vscode = {
    window: {
      activeTerminal: { sendText: (...args) => sent.push(args) },
      showErrorMessage: (message) => errors.push(message),
    },
    commands: {
      registerCommand: (id, handler) => {
        assert.equal(id, 'local.codexSmartPaste.paste');
        command = handler;
        return { dispose() {} };
      },
      executeCommand: async (id) => pasted.push(id),
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../extension.js'), 'utf8'), {
    module,
    __dirname: path.resolve(__dirname, '..'),
    process: { env: { SystemRoot: 'C:\\Windows' } },
    require: (id) => id === 'vscode' ? vscode
      : id === 'node:child_process' ? { execFile } : require(id === './src/smart-paste' ? '../src/smart-paste' : id),
  });
  const subscriptions = [];
  module.exports.activate({ subscriptions });
  assert.equal(subscriptions.length, 1);
  return { run: () => command(), sent, pasted, errors };
}

test('extension uses Windows PowerShell, fixed STA script, 3000ms timeout and native text paste', async () => {
  let calls = 0;
  const f = activateExtension((file, args, options, callback) => {
    calls++;
    assert.equal(file, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
    assert.deepEqual(Array.from(args), ['-NoProfile', '-NonInteractive', '-STA', '-File', path.resolve(__dirname, '../scripts/contains-image.ps1')]);
    assert.equal(options.timeout, 3000);
    assert.equal(options.windowsHide, true);
    callback(null, 'false\r\n', '');
  });
  await f.run();
  assert.equal(calls, 1);
  assert.deepEqual(f.pasted, ['workbench.action.terminal.paste']);
  assert.deepEqual(f.errors, []);
});

test('PowerShell true output routes to image dispatch', async () => {
  const f = activateExtension((file, args, options, callback) => callback(null, 'true\r\n', ''));
  await f.run();
  assert.deepEqual(f.sent, [['\u001bv', false]]);
  assert.deepEqual(f.pasted, []);
});

test('PowerShell timeout notifies without pasting or exposing process output', async () => {
  const f = activateExtension((file, args, options, callback) => {
    callback(Object.assign(new Error('private process output'), { killed: true, signal: 'SIGTERM' }), '', 'private stderr');
  });
  await f.run();
  assert.equal(f.errors.length, 1);
  assert.match(f.errors[0], /clipboard/i);
  assert.doesNotMatch(f.errors[0], /private/);
  assert.deepEqual([f.sent, f.pasted], [[], []]);
});

test('invalid PowerShell output fails closed', async () => {
  const f = activateExtension((file, args, options, callback) => callback(null, 'unexpected', ''));
  await f.run();
  assert.equal(f.errors.length, 1);
  assert.deepEqual([f.sent, f.pasted], [[], []]);
});

test('manifest exempts smart paste from terminal shell key handling by default', () => {
  const manifest = require('../package.json');
  assert.deepEqual(manifest.contributes.configurationDefaults?.['terminal.integrated.commandsToSkipShell'], [
    'local.codexSmartPaste.paste',
  ]);
});

test('manifest activates a UI extension with exact terminal-only physical shortcuts', () => {
  const manifest = require('../package.json');
  assert.equal(manifest.main, './extension.js');
  assert.deepEqual(manifest.extensionKind, ['ui']);
  assert.deepEqual(manifest.activationEvents, ['onCommand:local.codexSmartPaste.paste']);
  assert.equal(manifest.name, 'codex-smart-paste');
  assert.equal(manifest.publisher, 'local');
  assert.equal(manifest.version, '0.1.0');
  assert.equal(manifest.contributes.commands[0].command, 'local.codexSmartPaste.paste');
  assert.deepEqual(manifest.contributes.keybindings, [
    { key: 'ctrl+[KeyV]', command: 'local.codexSmartPaste.paste', when: 'terminalFocus' },
    { key: 'alt+[KeyV]', command: 'workbench.action.terminal.sendSequence', args: { text: '\u001bv' }, when: 'terminalFocus' },
    { key: 'ctrl+[KeyC]', command: 'workbench.action.terminal.copySelection', when: 'terminalFocus && terminalTextSelected' },
    { key: 'ctrl+enter', command: 'workbench.action.terminal.sendSequence', args: { text: '\u001b[13;2u' }, when: 'terminalFocus' },
    { key: 'shift+enter', command: 'workbench.action.terminal.sendSequence', args: { text: '\u001b[13;2u' }, when: 'terminalFocus' },
  ]);
});
