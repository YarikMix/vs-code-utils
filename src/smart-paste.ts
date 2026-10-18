export type TerminalTarget = Pick<import('vscode').Terminal, 'sendText'>;

export interface SmartPasteDependencies {
  getActiveTerminal(): TerminalTarget | undefined;
  containsImage(): Promise<boolean>;
  pasteText(): PromiseLike<unknown>;
  reportError(message: string): unknown;
}

export function createSmartPaste({
  getActiveTerminal,
  containsImage,
  pasteText,
  reportError,
}: SmartPasteDependencies): () => Promise<void> {
  let pending = false;

  return async function smartPaste(): Promise<void> {
    if (pending) return;
    const terminal = getActiveTerminal();
    if (!terminal) return;

    pending = true;
    try {
      const image = await containsImage();
      if (getActiveTerminal() !== terminal) return;

      if (image) {
        terminal.sendText('\u001bv', false);
      } else {
        await pasteText();
      }
    } catch {
      reportError('Smart Paste: unable to read the Windows clipboard or paste. Try again.');
    } finally {
      pending = false;
    }
  };
}
