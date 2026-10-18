'use strict';

const vscode = require('vscode');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { createSmartPaste } = require('./src/smart-paste');

function containsImage() {
  const powershell = path.win32.join(
    process.env.SystemRoot || 'C:\\Windows',
    'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe',
  );
  const script = path.join(__dirname, 'scripts', 'contains-image.ps1');

  return new Promise((resolve, reject) => {
    execFile(powershell, ['-NoProfile', '-NonInteractive', '-STA', '-File', script], {
      timeout: 3000,
      windowsHide: true,
      encoding: 'utf8',
      maxBuffer: 1024,
    }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      const result = stdout.trim();
      if (result !== 'true' && result !== 'false') {
        reject(new Error('Unexpected clipboard format check result'));
        return;
      }
      resolve(result === 'true');
    });
  });
}

function activate(context) {
  const smartPaste = createSmartPaste({
    getActiveTerminal: () => vscode.window.activeTerminal,
    containsImage,
    pasteText: () => vscode.commands.executeCommand('workbench.action.terminal.paste'),
    reportError: (message) => vscode.window.showErrorMessage(message),
  });
  context.subscriptions.push(vscode.commands.registerCommand('local.codexSmartPaste.paste', smartPaste));
}

module.exports = { activate };
