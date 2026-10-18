import { expect, test } from 'bun:test';
import { containsImage, createClipboardProbe, type ExecuteFile } from '../../src/clipboard.ts';
import { createSmartPaste } from '../../src/smart-paste.ts';

const script = 'C:\\extension root\\scripts\\contains-image.ps1';

for (const [systemRoot, executablePath] of [
  [undefined, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'],
  ['D:\\WinRoot', 'D:\\WinRoot\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'],
] as const) {
  test(`probe uses ${systemRoot ?? 'fallback Windows root'} with the fixed STA script and bounded options`, async () => {
    const previousRoot = process.env.SystemRoot;
    try {
      if (systemRoot === undefined) delete process.env.SystemRoot;
      else process.env.SystemRoot = systemRoot;
      const execute: ExecuteFile = (executable, args, options, callback) => {
        expect(executable).toBe(executablePath);
        expect(args).toEqual(['-NoProfile', '-NonInteractive', '-STA', '-File', script]);
        expect(options).toEqual({ timeout: 3000, windowsHide: true, encoding: 'utf8', maxBuffer: 1024 });
        callback(null, 'false\r\n');
      };
      expect(await createClipboardProbe(script, execute)()).toBe(false);
    } finally {
      if (previousRoot === undefined) delete process.env.SystemRoot;
      else process.env.SystemRoot = previousRoot;
    }
  });
}

for (const [stdout, expected] of [['true\r\n', true], ['false\r\n', false]] as const) {
  test(`probe parses ${JSON.stringify(stdout)} as a boolean`, async () => {
    expect(await createClipboardProbe(script, (_file, _args, _options, callback) => callback(null, stdout))()).toBe(expected);
  });
}

for (const stdout of ['', 'TRUE', 'private stdout', 'true\r\nfalse']) {
  test(`probe rejects invalid output ${JSON.stringify(stdout)} without leaking it`, async () => {
    await expect(createClipboardProbe(script, (_file, _args, _options, callback) => callback(null, stdout))()).rejects.toThrow('Unexpected clipboard format check result');
  });
}

for (const [label, error] of [
  ['process error', new Error('private stdout and private stderr')],
  ['timeout', Object.assign(new Error('private stdout and private stderr'), { killed: true, signal: 'SIGTERM' })],
] as const) {
  test(`${label} fails closed with a safe notification and no clipboard output`, async () => {
    const errors: string[] = [];
    const sent: string[] = [];
    let pasted = 0;
    const terminal = { sendText: (text: string) => { sent.push(text); } };
    const paste = createSmartPaste({
      getActiveTerminal: () => terminal,
      containsImage: createClipboardProbe(script, (_file, _args, _options, callback) => callback(error, 'private stdout')),
      pasteText: async () => { pasted++; },
      reportError: (message) => errors.push(message),
    });
    await paste();
    expect(errors).toEqual(['Smart Paste: unable to read the Windows clipboard or paste. Try again.']);
    expect(sent).toEqual([]);
    expect(pasted).toBe(0);
  });
}

test('invalid output cannot become a user notification or trigger native paste', async () => {
  const errors: string[] = [];
  let pasted = 0;
  const paste = createSmartPaste({
    getActiveTerminal: () => ({ sendText() { throw new Error('unexpected image route'); } }),
    containsImage: createClipboardProbe(script, (_file, _args, _options, callback) => callback(null, 'private stdout')),
    pasteText: async () => { pasted++; },
    reportError: (message) => errors.push(message),
  });
  await paste();
  expect(errors).toEqual(['Smart Paste: unable to read the Windows clipboard or paste. Try again.']);
  expect(pasted).toBe(0);
});

test('containsImage uses the real process adapter and rejects an unavailable Windows executable on non-Windows', async () => {
  if (process.platform === 'win32') return; // Unit tests never inspect a real user clipboard.
  await expect(containsImage(script)).rejects.toThrow();
});
