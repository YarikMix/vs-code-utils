import { execFile } from 'node:child_process';
import path from 'node:path';

export interface ExecuteFileOptions {
  timeout: number;
  windowsHide: boolean;
  encoding: 'utf8';
  maxBuffer: number;
}

export type ExecuteFile = (
  executable: string,
  args: string[],
  options: ExecuteFileOptions,
  callback: (error: Error | null, stdout: string) => void,
) => void;

const executeFile: ExecuteFile = (executable, args, options, callback) => {
  execFile(executable, args, options, callback);
};

export function createClipboardProbe(scriptPath: string, execute: ExecuteFile = executeFile): () => Promise<boolean> {
  const powershell = path.win32.join(
    process.env.SystemRoot || 'C:\\Windows',
    'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe',
  );

  return () => new Promise<boolean>((resolve, reject) => {
    execute(powershell, ['-NoProfile', '-NonInteractive', '-STA', '-File', scriptPath], {
      timeout: 3000,
      windowsHide: true,
      encoding: 'utf8',
      maxBuffer: 1024,
    }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      const result = stdout.trim();
      if (result !== 'true' && result !== 'false') {
        reject(new Error('Unexpected clipboard format check result'));
        return;
      }
      resolve(result === 'true');
    });
  });
}

export function containsImage(scriptPath: string): Promise<boolean> {
  return createClipboardProbe(scriptPath)();
}
