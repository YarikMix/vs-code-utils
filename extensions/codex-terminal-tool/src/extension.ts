import * as vscode from 'vscode';
import { activateResumeFeature } from './resume-feature.ts';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  try {
    await activateResumeFeature(context, {
      terminalLocation: vscode.TerminalLocation.Panel,
      createTerminal: (options) => vscode.window.createTerminal(options),
      reportError: (message) => { void vscode.window.showErrorMessage(message); },
    });
  } catch {
    void vscode.window.showErrorMessage('Codex Terminal Tool: не удалось запустить канал управления сессиями.');
  }
}
