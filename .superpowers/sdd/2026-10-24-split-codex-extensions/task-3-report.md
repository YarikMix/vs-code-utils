# Task 3 implementation report

Status: DONE_WITH_CONCERNS. Implementation, independent packaging and automated Windows/WSL routing checks pass. Physical keyboard/image checks and successful resumption of an existing Codex history remain unverified; fresh random test UUIDs deliberately avoid active sessions.

## Implemented

- Integration suite activates both extension IDs, verifies Smart Paste is the sole owner of `local.codexSmartPaste.paste` and its exact five bindings, and verifies Terminal Tool contributes no commands, bindings or skip-shell defaults. Removed assertions for the old combined 0.4.0 extension.
- Three separate isolated profiles load both extensions, Terminal Tool alone, and Smart Paste alone. Terminal-only runs the real PowerShell helper using its actual terminal environment; smart-only still activates the paste command and checks the exact Pseudoterminal ESC bytes. This exercises independence without unreliable in-host disable/reactivation.
- Windows staging copies each package's manifest, README, bundle and own script. Bun's symlink-based test-runner dependencies are materialized as ordinary Windows-readable node_modules packages; otherwise Windows could not resolve the staged launcher.
- Added opt-in coordinated two-window WSL integration. It copies the installed Remote-WSL extension to separate temporary extension directories, opens the same WSL workspace in two isolated Windows dev hosts, verifies `vscode.env.remoteName === 'wsl'`, calls each window's actual helper through a WSL bash terminal with a fresh random UUID, and counts Codex terminal creations in each window. The requests run in a coordinated sequence and each panel must see exactly one terminal. Both resumed terminals are verified as `TerminalLocation.Panel` and disposed by the test.
- Added package tests that build fresh bundles, invoke actual `vsce ls --no-dependencies`, require precisely four extension payload files, and verify separate identities and lack of runtime/extension dependencies.
- Root and package READMEs describe both VSIX files, independent installation/uninstall, updating combined Terminal Tool 0.4.0 to 0.5.0, installing Smart Paste 0.3.0, removing historical `local.codex-ops`, keeping active sessions intact during reload, and interpreting historical root source/script paths. Copied daemon environment guidance from the actual diff of open PR #6 into Terminal Tool README, including `codex --no-daemon`, `codex resume <UUID> --no-daemon` and the Codex CLI 0.164.0 qualification.
- Reused the separate root/package packaging commands already implemented by Tasks 1–2. Produced and committed both new VSIX artifacts; retained historical `codex-terminal-tool-0.4.0.vsix`.

## TDD evidence

RED, after writing coexistence assertions but before updating the runner:

```sh
VSCODE_EXECUTABLE_PATH='/mnt/c/Users/olegg/AppData/Local/Programs/Microsoft VS Code/Code.exe' bun run test:integration
```

Exit 1: `ENOENT: no such file or directory, lstat '/home/oleg/2026_H2/vs-code-utils-split-design/scripts/contains-image.ps1'`. Expected: the old runner still staged the root combined extension and old root scripts, which were removed by package separation.

An intermediate rerun exposed a real staging defect: `Cannot find module '@vscode/test-electron'` under the Windows temporary stage. Materializing dependencies under staged `node_modules/<name>` fixed this Bun-layout mismatch.

GREEN with the same command: exit 0, all three profiles:

```text
PASS isolated extension independence: both
PASS isolated extension independence: terminal-only
PASS isolated extension independence: smart-only
```

Both Smart Paste profiles passed `alt+[KeyV]` = `\u001bv`, `ctrl+enter` and `shift+enter` = `\u001b[13;2u`, without appended Enter. Both Terminal Tool profiles passed the real PowerShell helper bridge. Final regular integration output is preserved locally in `/tmp/codex-split-task3-integration.log`.

Packaging initially caught a broken relative README link (`../../README.md`) because the package intentionally has no repository metadata; replaced it with the real GitHub migration link. `bun run package` then exited 0 for both packages.

## Verification

- `bun run typecheck`: exit 0, including a final rerun after integration cleanup.
- `bun run test:unit`: **38 pass, 0 fail, 133 assertions**, across eight files. Includes all Smart Paste clipboard/error/activation regressions, bridge authentication/UUID rejection/two-endpoint checks, and four new package checks.
- `bun run build`: exit 0.
- `bun run package`: exit 0; two six-entry VSIX archives produced.
- Final focused `bun test test/unit/packages.test.ts`: **4 pass, 0 fail, 16 assertions**.
- Regular installed Windows Electron integration: **exit 0, three isolated hosts**. Electron startup was available; no update blockage. VS Code itself logs unrelated mutex/API-proposal/agent-host messages, so Electron output is not pristine even though every test and host exits 0.
- Real two-window WSL routing: **exit 0 twice**, including final code rerun using:

```sh
mkdir -p /tmp/codex-split-task3-wsl-workspace
CODEX_INTEGRATION_WSL_DISTRO=Ubuntu \
CODEX_INTEGRATION_WSL_EXTENSION='/mnt/c/Users/olegg/.vscode/extensions/ms-vscode-remote.remote-wsl-1.104.6' \
CODEX_INTEGRATION_WSL_WORKSPACE=/tmp/codex-split-task3-wsl-workspace \
VSCODE_EXECUTABLE_PATH='/mnt/c/Users/olegg/AppData/Local/Programs/Microsoft VS Code/Code.exe' \
bun run test:integration
```

```text
PASS real per-window helper bridge opens a Codex terminal in this Extension Host with TerminalLocation.Panel
PASS real two-window WSL panel isolation: window-b
PASS isolated extension independence: window-b
PASS real two-window WSL panel isolation: window-a
PASS isolated extension independence: window-a
Exit code: 0
Exit code: 0
```

Final WSL output is preserved locally in `/tmp/codex-split-task3-wsl-final.log`. Both hosts used the same temporary WSL folder and separate test profiles. The test never sends commands to existing terminals or resumes an existing session.

## VSIX inspection and SHA-256

Inspected both ZIP file lists, parsed `extension/package.json` and `extension.vsixmanifest`, and asserted exact archive entries plus runtime boundaries with Python zipfile/XML/JSON checks.

Both contain `[Content_Types].xml`, `extension.vsixmanifest`, `extension/package.json`, `extension/readme.md`, and `extension/dist/extension.cjs`. The only sixth file is:

- Smart Paste: `extension/scripts/contains-image.ps1`.
- Terminal Tool: `extension/scripts/open-session.ps1`.

Both VSIX XML identities use publisher `local`, their respective package names and versions. Smart Paste has exactly five bindings and no `CODEX_TERMINAL_TOOL` bridge code. Terminal Tool has no contributes block, no Smart Paste command/detector implementation and no clipboard helper. Neither archive includes source, tests, node_modules or the other's helper/runtime.

| Artifact | SHA-256 |
| --- | --- |
| `codex-smart-paste-0.3.0.vsix` | `487821499fbc8d05cc54ba1245c9409832e498017c1ec3d5258415d1c83f64e4` |
| `codex-terminal-tool-0.5.0.vsix` | `7049cf9eea21dce62dfbcdd656e539881326b59e5a92fcf4bae17cf43870fea5` |

## Cleanup and limitations

Every integration run logged removal of its temporary Windows profile(s) and stage. A separate filesystem check confirmed all logged stage/profile paths from the final regular run and both WSL runs no longer exist. A Windows `Win32_Process` query returned **0 Code.exe processes** matching those test stage/profile paths. Removed the empty `/tmp/codex-split-task3-wsl-workspace` folder. Coordination folders are removed in the runner's finally block. Existing VS Code profiles, update settings, keybindings, terminals and Codex sessions were not changed.

The two-window WSL test proves real helper environment propagation and panel routing; its UUIDs are syntactically valid random IDs and do **not** prove successful `codex resume` of an existing history. No independently created real test-session history was available; reusing a user's active history would violate the preservation constraint. The runtime's `codex resume <UUID>` dispatch remains covered by the retained resume-feature unit test. Physical English/Russian keyboard combinations, clipboard image attachment display and successful existing-session resume still require a suitable manual test; no claim that these passed is made.

## Files changed and self-review

Changed root README, both package READMEs, integration runner/suite; added `test/unit/packages.test.ts`, both VSIX artifacts and this report. No runtime behavior or extension manifests changed in Task 3.

Self-reviewed complete diff, isolated cleanup paths, per-window test coordination, Windows dependency staging and package payloads. Improved long runner expressions and awaited both WSL workers with `Promise.allSettled` before shared cleanup. `git diff --check` passes. No unresolved implementation defect found; remaining concerns are the explicit manual verification limits above.
