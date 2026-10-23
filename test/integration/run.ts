import { runTests } from '@vscode/test-electron';
import { execFileSync, spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// This file is compiled as ordinary Node CommonJS; neither launcher nor suite uses Bun APIs.
const root = path.resolve(__dirname, '../../..');
const executable = process.env.VSCODE_EXECUTABLE_PATH;

async function waitForChild(command: string, args: string[], env = process.env, timeout = false): Promise<void> {
  const child = spawn(command, args, { stdio: 'inherit', env, detached: timeout && process.platform !== 'win32' });
  let timedOut = false;
  const timer = timeout ? setTimeout(() => {
    timedOut = true;
    if (child.pid) {
      if (process.platform === 'win32') {
        execFileSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
      } else {
        process.kill(-child.pid, 'SIGKILL');
      }
    }
  }, 90_000) : undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => {
        if (timedOut) reject(new Error('VS Code integration exceeded 90000 ms; test process tree terminated'));
        else if (code === 0) resolve();
        else reject(new Error(`VS Code integration exited with ${signal ?? code}`));
      });
    });
  } finally {
    clearTimeout(timer);
  }
}

// Copy only the pure-JS runtime dependency closure of the external test launcher.
async function stageRunnerDependencies(destination: string): Promise<void> {
  const copied = new Set<string>();
  async function copyDependency(name: string, from: string): Promise<void> {
    let entry: string;
    try {
      // Prefer package.json: some npm packages (e.g. string_decoder) share a Node builtin's name.
      entry = require.resolve(`${name}/package.json`, { paths: [from] });
    } catch (error: unknown) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED')) throw error;
      entry = require.resolve(name, { paths: [from] });
    }
    let directory = path.dirname(entry);
    let manifest: { name?: string; dependencies?: Record<string, string> };
    while (true) {
      try {
        manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
        if (manifest.name === name) break;
      } catch (error: unknown) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      }
      const parent = path.dirname(directory);
      if (parent === directory) throw new Error(`Cannot locate dependency package ${name}`);
      directory = parent;
    }
    if (copied.has(directory)) return;
    copied.add(directory);
    const relative = path.relative(root, directory);
    if (relative.startsWith('..')) throw new Error(`Runner dependency is outside the repository: ${name}`);
    await cp(directory, path.join(destination, relative), { recursive: true });
    for (const dependency of Object.keys(manifest.dependencies ?? {})) await copyDependency(dependency, directory);
  }
  await copyDependency('@vscode/test-electron', root);
}

async function runWindowsFromWsl(windowsExecutable: string): Promise<void> {
  const powershell = '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';
  const windowsTemp = execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', '[IO.Path]::GetTempPath()'], { encoding: 'utf8' }).trim();
  const toWindows = (file: string) => execFileSync('wslpath', ['-w', file], { encoding: 'utf8' }).trim();
  const temp = execFileSync('wslpath', ['-u', windowsTemp], { encoding: 'utf8' }).trim();
  const stage = await mkdtemp(path.join(temp, 'codex-terminal-tool-integration-'));
  console.log(`Windows integration staging: ${stage}`);
  try {
    for (const file of ['package.json', 'README.md', 'dist/extension.cjs', 'dist/test/integration/run.cjs', 'dist/test/integration/suite.cjs', 'scripts/contains-image.ps1', 'scripts/open-session.ps1']) {
      const target = path.join(stage, file);
      await mkdir(path.dirname(target), { recursive: true });
      await cp(path.join(root, file), target);
    }
    await stageRunnerDependencies(stage);
    const forwarded = new Set((process.env.WSLENV ?? '').split(':').filter(Boolean));
    forwarded.add('ELECTRON_RUN_AS_NODE');
    forwarded.add('VSCODE_EXECUTABLE_PATH');
    await waitForChild(windowsExecutable, [toWindows(path.join(stage, 'dist/test/integration/run.cjs'))], {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      VSCODE_EXECUTABLE_PATH: toWindows(windowsExecutable),
      WSLENV: [...forwarded].join(':'),
    });
  } finally {
    await rm(stage, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    console.log(`Removed Windows integration staging: ${stage}`);
  }
}

async function main(): Promise<void> {
  if (process.platform === 'linux' && executable?.toLowerCase().endsWith('.exe')) {
    await runWindowsFromWsl(executable);
    return;
  }
  const scratch = await mkdtemp(path.join(os.tmpdir(), 'codex-terminal-tool-profile-'));
  console.log(`Isolated VS Code integration profile: ${scratch}`);
  try {
    const user = path.join(scratch, 'user-data', 'User');
    await mkdir(user, { recursive: true });
    await mkdir(path.join(scratch, 'extensions'));
    await writeFile(path.join(user, 'settings.json'), JSON.stringify({
      'workbench.startupEditor': 'none',
      'update.mode': 'none',
      'extensions.autoCheckUpdates': false,
      'extensions.autoUpdate': false,
      'telemetry.telemetryLevel': 'off',
      'security.workspace.trust.enabled': false,
      'terminal.integrated.enablePersistentSessions': false,
    }));
    // A separate worker lets the watchdog kill only this test's process tree.
    await waitForChild(process.execPath, [__filename, '--worker', scratch], process.env, true);
  } finally {
    await rm(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    console.log(`Removed isolated VS Code integration profile: ${scratch}`);
  }
}

async function worker(scratch: string): Promise<void> {
  // Code.exe runs the launcher as Node; the Extension Development Host must run as Electron.
  delete process.env.ELECTRON_RUN_AS_NODE;
  await runTests({
    vscodeExecutablePath: executable,
    extensionDevelopmentPath: root,
    extensionTestsPath: path.join(__dirname, 'suite.cjs'),
    extensionTestsEnv: { ELECTRON_RUN_AS_NODE: undefined },
    launchArgs: [
      '--new-window', '--disable-extensions', '--disable-gpu', '--disable-updates',
      '--skip-welcome', '--skip-release-notes',
      `--user-data-dir=${path.join(scratch, 'user-data')}`,
      `--extensions-dir=${path.join(scratch, 'extensions')}`,
    ],
  });
}

const scratch = process.argv[3];
const operation = process.argv[2] === '--worker' && scratch ? worker(scratch) : main();
operation.catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
