import { expect, test } from 'bun:test';
import path from 'node:path';
import type { ExtensionContext } from 'vscode';
import { createActivation, type ActivationDependencies } from '../../src/activation.ts';

for (const image of [true, false]) {
  test(`activation resolves PowerShell from extension root despite a dist entrypoint (${image ? 'image' : 'text'})`, async () => {
    const root = path.resolve('/temporary/relocated-extension');
    const bundleDirectory = path.join(root, 'dist');
    const subscriptions: ExtensionContext['subscriptions'] = [];
    const context: Pick<ExtensionContext, 'asAbsolutePath' | 'subscriptions'> = {
      subscriptions,
      asAbsolutePath: (relativePath) => path.join(root, relativePath),
    };
    const sent: [string, boolean | undefined][] = [];
    const pasted: string[] = [];
    let handler: (() => Promise<void>) | undefined;
    let probePath: string | undefined;
    const disposable = { dispose() {} };
    const terminal = { sendText: (text: string, addNewLine?: boolean) => { sent.push([text, addNewLine]); } };
    const dependencies: ActivationDependencies = {
      getActiveTerminal: () => terminal,
      executeCommand: async (id) => { pasted.push(id); },
      reportError: (message) => { throw new Error(message); },
      registerCommand: (id, callback) => {
        expect(id).toBe('local.codexSmartPaste.paste');
        handler = callback;
        return disposable;
      },
    };
    createActivation(dependencies, (scriptPath) => { probePath = scriptPath; return async () => image; })(context);
    expect(probePath).toBe(path.join(root, 'scripts/contains-image.ps1'));
    expect(probePath).not.toBe(path.join(bundleDirectory, 'scripts/contains-image.ps1'));
    expect(subscriptions).toEqual([disposable]);
    expect(handler).toBeDefined();
    await handler!();
    expect(sent).toEqual(image ? [['\u001bv', false]] : []);
    expect(pasted).toEqual(image ? [] : ['workbench.action.terminal.paste']);
  });
}
