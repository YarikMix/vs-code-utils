import * as vscode from 'vscode';
import { createActivation } from './activation.ts';

export function activate(context: vscode.ExtensionContext): void {
  createActivation({
    getActiveTerminal: () => vscode.window.activeTerminal,
    executeCommand: (id) => vscode.commands.executeCommand(id),
    reportError: (message) => vscode.window.showErrorMessage(message),
    registerCommand: (id, handler) => vscode.commands.registerCommand(id, handler),
  })(context);
}
