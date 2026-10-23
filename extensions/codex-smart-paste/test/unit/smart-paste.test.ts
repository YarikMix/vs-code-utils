import { expect, test } from 'bun:test';
import { createSmartPaste, type TerminalTarget } from '../../src/smart-paste.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture(containsImage: () => Promise<boolean> = async () => false) {
  const sent: [string, boolean | undefined][] = [];
  const errors: string[] = [];
  const state: { terminal: TerminalTarget | undefined; pasted: number } = {
    terminal: { sendText: (text, addNewLine) => { sent.push([text, addNewLine]); } },
    pasted: 0,
  };
  const paste = createSmartPaste({
    getActiveTerminal: () => state.terminal,
    containsImage,
    pasteText: async () => { state.pasted++; },
    reportError: (message) => errors.push(message),
  });
  return { paste, state, sent, errors };
}

test('image format wins and sends ESC+v without Enter to the captured terminal', async () => {
  const f = fixture(async () => true);
  await f.paste();
  expect(f.sent).toEqual([['\u001bv', false]]);
  expect(f.state.pasted).toBe(0);
});

for (const clipboard of ['text', 'empty']) {
  test(`${clipboard} clipboard uses ordinary terminal paste without injected characters`, async () => {
    const f = fixture();
    await f.paste();
    expect(f.state.pasted).toBe(1);
    expect(f.sent).toEqual([]);
  });
}

for (const image of [true, false]) {
  test(`terminal change cancels ${image ? 'image' : 'text'} dispatch`, async () => {
    const pending = deferred<boolean>();
    const f = fixture(() => pending.promise);
    const result = f.paste();
    const other: [string, boolean | undefined][] = [];
    f.state.terminal = { sendText: (text, addNewLine) => { other.push([text, addNewLine]); } };
    pending.resolve(image);
    await result;
    expect([f.sent, other]).toEqual([[], []]);
    expect(f.state.pasted).toBe(0);
  });
}

test('closed target cancels dispatch and missing terminal skips detection', async () => {
  const pending = deferred<boolean>();
  let detections = 0;
  const f = fixture(() => { detections++; return pending.promise; });
  const result = f.paste();
  f.state.terminal = undefined;
  pending.resolve(true);
  await result;
  await f.paste();
  expect(detections).toBe(1);
  expect(f.sent).toEqual([]);
  expect(f.state.pasted).toBe(0);
});

test('concurrent calls perform one detection and dispatch, then permit another paste', async () => {
  const pending = deferred<boolean>();
  let detections = 0;
  const f = fixture(() => { detections++; return pending.promise; });
  const first = f.paste();
  const second = f.paste();
  expect(detections).toBe(1);
  pending.resolve(true);
  await Promise.all([first, second]);
  expect(f.sent).toEqual([['\u001bv', false]]);
  await f.paste();
  expect(detections).toBe(2);
  expect(f.sent).toHaveLength(2);
});

test('detection rejection reports a safe error without fallback and releases the lock', async () => {
  let detections = 0;
  const f = fixture(async () => {
    if (detections++ === 0) throw new Error('private clipboard data');
    return false;
  });
  await f.paste();
  expect(f.errors).toEqual(['Smart Paste: unable to read the Windows clipboard or paste. Try again.']);
  expect(f.state.pasted).toBe(0);
  expect(f.sent).toEqual([]);
  await f.paste();
  expect(f.state.pasted).toBe(1);
});

test('native text paste stays locked until completion and releases the lock after rejection', async () => {
  const pending = deferred<unknown>();
  let detections = 0;
  let pastes = 0;
  const errors: string[] = [];
  const paste = createSmartPaste({
    getActiveTerminal: () => terminal,
    containsImage: async () => { detections++; return false; },
    pasteText: () => { pastes++; return pending.promise; },
    reportError: (message) => errors.push(message),
  });
  const terminal: TerminalTarget = { sendText() { throw new Error('unexpected image route'); } };
  const first = paste();
  await Promise.resolve();
  await paste();
  expect(detections).toBe(1);
  pending.reject(new Error('private native paste error'));
  await first;
  expect(errors).toEqual(['Smart Paste: unable to read the Windows clipboard or paste. Try again.']);
  await paste();
  expect(pastes).toBe(2);
});
