'use strict';

function createSmartPaste({ getActiveTerminal, containsImage, pasteText, reportError }) {
  let pending = false;

  return async function smartPaste() {
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

module.exports = { createSmartPaste };
