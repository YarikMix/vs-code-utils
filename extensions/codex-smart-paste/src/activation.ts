import type { Disposable, ExtensionContext } from 'vscode';
import { createClipboardProbe } from './clipboard.ts';
import { createSmartPaste, type SmartPasteDependencies } from './smart-paste.ts';

export interface ActivationDependencies extends Omit<SmartPasteDependencies, 'containsImage' | 'pasteText'> {
  registerCommand(id: string, handler: () => Promise<void>): Disposable;
  executeCommand(id: string): PromiseLike<unknown>;
}

export function createActivation(
  dependencies: ActivationDependencies,
  createProbe: (scriptPath: string) => () => Promise<boolean> = createClipboardProbe,
): (context: Pick<ExtensionContext, 'asAbsolutePath' | 'subscriptions'>) => void {
  return (context) => {
    const smartPaste = createSmartPaste({
      getActiveTerminal: dependencies.getActiveTerminal,
      pasteText: () => dependencies.executeCommand('workbench.action.terminal.paste'),
      reportError: dependencies.reportError,
      containsImage: createProbe(context.asAbsolutePath('scripts/contains-image.ps1')),
    });
    context.subscriptions.push(dependencies.registerCommand('local.codexSmartPaste.paste', smartPaste));
  };
}
