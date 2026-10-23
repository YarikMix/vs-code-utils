# Split Codex VS Code Extensions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship independently installable Codex Smart Paste and Codex Terminal Tool extensions from the same repository.

**Architecture:** Use `extensions/codex-smart-paste/` and `extensions/codex-terminal-tool/` as separate VS Code extension roots, with a private Bun workspace at repository root for shared development tooling. Each package has its own manifest, bundled entrypoint, PowerShell resource and `.vscodeignore`; the Terminal Tool bundle contains no paste implementation. A root integration runner loads both extensions in an isolated VS Code profile.

**Tech Stack:** TypeScript, Bun 1.4.x, esbuild, VS Code extension API `^1.85.0`, PowerShell, `@vscode/test-electron`, `@vscode/vsce`.

**Spec:** `docs/superpowers/specs/2026-10-24-split-codex-extensions-design.md`

## Global Constraints

- Smart Paste: `publisher: local`, `name: codex-smart-paste`, ID `local.codex-smart-paste`, command `local.codexSmartPaste.paste`, version 0.3.0. Under `terminalFocus`, `ctrl+[KeyV]` runs that command; `alt+[KeyV]` sends `ESC v`; `ctrl+[KeyC]` runs `workbench.action.terminal.copySelection` only with `terminalTextSelected`; `ctrl+enter` and `shift+enter` send `ESC [ 13 ; 2 u`. Its command is the only added default `terminal.integrated.commandsToSkipShell` entry.
- Terminal Tool: `publisher: local`, `name: codex-terminal-tool`, ID `local.codex-terminal-tool`, version 0.5.0, `CODEX_TERMINAL_TOOL_ENDPOINT` and `CODEX_TERMINAL_TOOL_HELPER`; no paste command, `commandsToSkipShell` contribution or keybindings.
- Both use `extensionKind: ["ui"]` and package independent VSIX files with only their own runtime and PowerShell script.
- Keep the existing token-protected, UUID-only per-window bridge and `TerminalLocation.Panel` behavior. Do not add Pi, a Codex proxy, new Codex CLI behavior or changes to user `keybindings.json`.
- Preserve documentation of the shared Codex daemon environment from open PR #6 in the Terminal Tool README when reconciling branches.
- Tests must use an isolated VS Code profile; do not close or alter active Codex sessions. A real two-window WSL check is still required before declaring the feature ready for the user's setup.

## Review Focus

1. Two installed packages must not both bind `Ctrl+[KeyV]`: Task 2 manifest test and Task 3 dual-extension integration check.
2. Image, text and clipboard failure paths must retain v0.2.0 behavior: Task 1 restores and runs the existing `smart-paste.test.ts`, `clipboard.test.ts` and `activation.test.ts` cases.
3. A wrong token or malformed UUID must never open a terminal: Task 2 runs the existing `session-bridge.test.ts` rejection cases.
4. Two windows with the same workspace must still route to their own terminal lists: Task 2 retains the two-endpoint unit test; Task 3 performs the real Windows/WSL check.
5. Neither package may depend on files from the other at runtime: Task 3 inspects both VSIX manifests and file lists and verifies the disable-one-at-a-time behavior in an isolated profile.

## File map

- Root `package.json`, `bun.lock`, `tsconfig*.json`, `scripts/build.ts`: private workspace, common development commands, separate bundles for both packages and the integration runner.
- `extensions/codex-smart-paste/{package.json,.vscodeignore,README.md,src/,scripts/contains-image.ps1,test/unit/}`: restored Smart Paste implementation and its tests.
- `extensions/codex-terminal-tool/{package.json,.vscodeignore,README.md,src/,scripts/open-session.ps1,test/unit/}`: existing session bridge, launcher and their tests, without paste code.
- Root `test/integration/{run.ts,suite.ts}`: stage and activate both extension roots in one temporary VS Code profile; test their coexistence and existing terminal behavior.
- Root `README.md`: repository index, two independent packages, build and upgrade instructions. Old `docs/superpowers/` files remain historical records.

---

### Task 1: Restore Codex Smart Paste as its own package

**Files:** Create `extensions/codex-smart-paste/package.json`, `.vscodeignore`, `README.md`, `src/{extension,activation,clipboard,smart-paste}.ts`, `scripts/contains-image.ps1`, `test/unit/{manifest,activation,clipboard,smart-paste}.test.ts`; modify root `scripts/build.ts`, `tsconfig.json`, `tsconfig.runtime.json` so this package can build and typecheck while the current root extension still works.

**Interfaces:** Produces VS Code extension ID `local.codex-smart-paste`, command `local.codexSmartPaste.paste`, entrypoint `dist/extension.cjs`, and only `scripts/contains-image.ps1`. Task 2 removes the corresponding implementation from Terminal Tool; Task 3 loads both packages together.

- [ ] **Step 1: Write failing package tests.** In `test/unit/manifest.test.ts`, assert `name === 'codex-smart-paste'`, `version === '0.3.0'`, `activationEvents === ['onCommand:local.codexSmartPaste.paste']`, exact five v0.2.0 bindings, and only the Smart Paste command. Port existing behavior tests; in `activation.test.ts`, assert the registered ID is `local.codexSmartPaste.paste` and the clipboard script resolves relative to this package root.
- [ ] **Step 2: Prove red.** Run `bun test extensions/codex-smart-paste/test/unit`; expect failure because the package/entrypoint is not present.
- [ ] **Step 3: Restore the package.** Take v0.2.0 source, manifest behavior and tests from Git tag `v0.2.0`; set version 0.3.0 and package-relative paths. Add an esbuild entrypoint for this package to `scripts/build.ts` and include its sources in typecheck. Do not import Terminal Tool code.
- [ ] **Step 4: Prove green and commit.** Run `bun test extensions/codex-smart-paste/test/unit`, `bun run typecheck`, `bun run build`; expect exit 0 and `extensions/codex-smart-paste/dist/extension.cjs`. Commit package restoration and build wiring.

### Task 2: Isolate Codex Terminal Tool and remove its paste feature

**Files:** Create `extensions/codex-terminal-tool/package.json`, `.vscodeignore`, `README.md`, `src/{extension,resume-feature,session-bridge}.ts`, `scripts/open-session.ps1`, `test/unit/{manifest,resume-feature,session-bridge}.test.ts`; modify root `package.json`, `bun.lock`, `scripts/build.ts`, `tsconfig*.json`; remove old root `src/`, root `scripts/{contains-image,open-session}.ps1`, root `.vscodeignore`, and superseded root unit tests.

**Interfaces:** Consumes the root build layout from Task 1. Produces independent `local.codex-terminal-tool` version 0.5.0, `activateResumeFeature(context, dependencies): Promise<void>`, and terminal variables `CODEX_TERMINAL_TOOL_ENDPOINT` and `CODEX_TERMINAL_TOOL_HELPER`; no command or binding. Task 3 consumes both extension roots.

- [ ] **Step 1: Write failing isolation tests.** In Terminal Tool `manifest.test.ts`, assert `activationEvents === ['onStartupFinished']`, `contributes.commands` and `contributes.keybindings` are absent, no `commandsToSkipShell` contribution, and the exact package ID/version/UI kind. Retain `resume-feature.test.ts` assertions for `TerminalLocation.Panel`, `codex resume <UUID>`, variable cleanup and bridge close; retain the wrong-token, malformed-UUID and two-endpoint tests from `session-bridge.test.ts`.
- [ ] **Step 2: Prove red.** Run `bun test extensions/codex-terminal-tool/test/unit`; expect missing package or manifest mismatch.
- [ ] **Step 3: Move and prune.** Move the current bridge files and `open-session.ps1` into the Terminal Tool package. Its `extension.ts` activates only `activateResumeFeature`; remove paste imports, code, script, command and all bindings. Make root `package.json` private with `workspaces: ["extensions/*"]` and common build/test/package commands; build both entrypoints separately. Reconcile lockfile with `bun install --frozen-lockfile` after editing workspace metadata appropriately (update the lockfile first with `bun install`, then check frozen install).
- [ ] **Step 4: Prove green and commit.** Run `bun test extensions/codex-terminal-tool/test/unit`, `bun run typecheck`, `bun run build`, `bun install --frozen-lockfile`; expect exit 0 and both package bundles. Commit extraction and root workspace conversion.

### Task 3: Verify coexistence, package both VSIX files and document migration

**Files:** Modify root `test/integration/{run,suite}.ts`, root `README.md`, both package README files, root/package scripts as needed; add a focused package-content verification test under root `test/unit/packages.test.ts` if inspection cannot be expressed by a package command.

**Interfaces:** Consumes both package roots, launches both as `extensionDevelopmentPath: [smartPasteRoot, terminalToolRoot]`, and outputs `codex-smart-paste-0.3.0.vsix` plus `codex-terminal-tool-0.5.0.vsix` with separate SHA-256 values for later release.

- [ ] **Step 1: Write failing coexistence checks.** Update the integration suite to activate both IDs, assert Smart Paste is the only owner of `local.codexSmartPaste.paste` and five bindings, assert Terminal Tool has none, test the existing Pseudoterminal escape bytes, and run the real PowerShell helper through Terminal Tool's variables. Add a test that disabling Smart Paste leaves Terminal Tool active, and vice versa, using separate isolated profiles if VS Code does not support reliable reactivation in one host. Update the runner to stage both roots for Windows Electron.
- [ ] **Step 2: Prove red.** Run `VSCODE_EXECUTABLE_PATH='<installed Windows Code.exe>' bun run test:integration`; expect failure while the runner still loads the old root. If current VS Code update blocks Electron startup, record that environmental failure and keep unit/package verification moving; do not change the user's update settings.
- [ ] **Step 3: Finish integration, package and docs.** Point `extensionDevelopmentPath` at the two package roots, retain isolated temporary user-data/extensions directories, add root `package` command that writes both VSIX outputs, and inspect each with `vsce ls` or archive listing. Move the daemon guidance from PR #6 into the Terminal Tool README. Document installation of both IDs, removal of historical `local.codex-ops`, the old combined Terminal Tool replacement, independent uninstall, and old docs paths.
- [ ] **Step 4: Prove green.** Run `bun run typecheck`, `bun run test:unit`, `bun run build`, `bun run package`, then inspect both VSIX manifests and file lists: Smart Paste has only `contains-image.ps1`, Terminal Tool only `open-session.ps1`, and neither bundles the other's runtime. Run `bun run test:integration` with the installed Windows VS Code executable when it can start. Record exact results and SHA-256 hashes.
- [ ] **Step 5: Check the real workflow and commit.** In two Windows VS Code WSL windows on the same workspace, check Smart Paste bindings and call each window's helper with a valid session UUID; verify a new terminal appears only in the calling window's panel list and runs `codex resume`. Keep active sessions intact. Commit integration, documentation and packaging updates; report any unavailable physical-keyboard or Electron check explicitly.
