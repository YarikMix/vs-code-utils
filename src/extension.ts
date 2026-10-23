import * as vscode from 'vscode';
import { createActivation } from './activation.ts';
import { activateResumeFeature } from './resume-feature.ts';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  createActivation({
    getActiveTerminal: () => vscode.window.activeTerminal,
    executeCommand: (id) => vscode.commands.executeCommand(id),
    reportError: (message) => vscode.window.showErrorMessage(message),
    registerCommand: (id, handler) => vscode.commands.registerCommand(id, handler),
  })(context);
  try {
    await activateResumeFeature(context, {
      terminalLocation: vscode.TerminalLocation.Panel,
      createTerminal: (options) => vscode.window.createTerminal(options),
      reportError: (message) => { void vscode.window.showErrorMessage(message); },
    });
  } catch {
    void vscode.window.showErrorMessage('Codex Ops: не удалось запустить канал управления сессиями.');
  }
}
