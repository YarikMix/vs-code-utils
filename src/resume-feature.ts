import type { ExtensionContext, Terminal, TerminalLocation, TerminalOptions } from 'vscode';
import { startSessionBridge, type SessionBridge } from './session-bridge.ts';

type ResumeContext = Pick<ExtensionContext, 'subscriptions' | 'asAbsolutePath' | 'environmentVariableCollection'>;

export interface ResumeFeatureDependencies {
  terminalLocation: TerminalLocation;
  createTerminal(options: TerminalOptions): Pick<Terminal, 'show' | 'sendText'>;
  reportError(message: string): void;
  startBridge?: (launch: (sessionId: string) => void) => Promise<SessionBridge>;
}

export async function activateResumeFeature(context: ResumeContext, dependencies: ResumeFeatureDependencies): Promise<void> {
  const bridge = await (dependencies.startBridge ?? startSessionBridge)((sessionId) => {
    try {
      const terminal = dependencies.createTerminal({ name: 'Codex', location: dependencies.terminalLocation });
      terminal.show();
      terminal.sendText(`codex resume ${sessionId}`, true);
    } catch {
      dependencies.reportError('Codex Terminal Tool: не удалось открыть терминал для сессии Codex.');
      throw new Error('Could not open terminal');
    }
  });
  const variables = context.environmentVariableCollection;
  variables.persistent = false;
  variables.replace('CODEX_TERMINAL_TOOL_ENDPOINT', bridge.endpoint);
  variables.replace('CODEX_TERMINAL_TOOL_HELPER', context.asAbsolutePath('scripts/open-session.ps1'));
  context.subscriptions.push({
    dispose: () => {
      variables.delete('CODEX_TERMINAL_TOOL_ENDPOINT');
      variables.delete('CODEX_TERMINAL_TOOL_HELPER');
      void bridge.close();
    },
  });
}
