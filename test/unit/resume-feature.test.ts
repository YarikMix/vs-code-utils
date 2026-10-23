import { expect, test } from 'bun:test';
import type { ExtensionContext } from 'vscode';
import { activateResumeFeature, type ResumeFeatureDependencies } from '../../src/resume-feature.ts';

test('activation exposes a window-specific bridge and resumes into a panel terminal', async () => {
  const variables = new Map<string, string>();
  let persistent = true;
  let closed = false;
  let launch: ((id: string) => void) | undefined;
  const actions: unknown[] = [];
  const context = {
    subscriptions: [] as ExtensionContext['subscriptions'],
    asAbsolutePath: (relative: string) => `C:\\Extensions\\Codex Terminal Tool\\${relative.replaceAll('/', '\\')}`,
    environmentVariableCollection: {
      get persistent() { return persistent; },
      set persistent(value: boolean) { persistent = value; },
      replace: (key: string, value: string) => { variables.set(key, value); },
      delete: (key: string) => { variables.delete(key); },
    },
  } as unknown as Pick<ExtensionContext, 'subscriptions' | 'asAbsolutePath' | 'environmentVariableCollection'>;
  const dependencies: ResumeFeatureDependencies = {
    terminalLocation: 1,
    createTerminal: (options) => {
      actions.push(options);
      return {
        show: () => { actions.push('show'); },
        sendText: (text, addNewLine) => { actions.push([text, addNewLine]); },
      };
    },
    reportError: (message) => { throw new Error(message); },
    startBridge: async (callback) => {
      launch = callback;
      return { endpoint: 'http://127.0.0.1:12345/token', close: async () => { closed = true; } };
    },
  };
  await activateResumeFeature(context, dependencies);
  expect(persistent).toBe(false);
  expect(variables.get('CODEX_TERMINAL_TOOL_ENDPOINT')).toBe('http://127.0.0.1:12345/token');
  expect(variables.get('CODEX_TERMINAL_TOOL_HELPER')).toBe('C:\\Extensions\\Codex Terminal Tool\\scripts\\open-session.ps1');
  expect(launch).toBeDefined();
  launch!('01a14ff0-3f2d-7d71-b4e5-0b63839ec381');
  expect(actions).toEqual([
    { name: 'Codex', location: 1 },
    'show',
    ['codex resume 01a14ff0-3f2d-7d71-b4e5-0b63839ec381', true],
  ]);
  expect(context.subscriptions).toHaveLength(1);
  context.subscriptions[0]!.dispose();
  await Bun.sleep(0);
  expect(closed).toBe(true);
  expect(variables.size).toBe(0);
});
