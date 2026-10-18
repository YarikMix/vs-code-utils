# TypeScript and Bun Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Codex Smart Paste to strict TypeScript, Bun and esbuild, add real VS Code integration checks, and update PR #1 with a tested VSIX 0.2.0.

**Architecture:** Keep the existing clipboard router and Windows UI host behavior. Build TypeScript to a Node-compatible CommonJS bundle, keep Bun confined to development, and run a separately compiled integration suite inside an isolated VS Code Extension Development Host.

**Tech Stack:** TypeScript, Bun 1.4.2 (available locally; pin packageManager), esbuild, @types/vscode, @types/node, @types/bun, @vscode/test-electron, @vscode/vsce; Node runtime supplied by VS Code.

**Spec:** ../specs/2026-10-18-typescript-bun-design.md

## Global Constraints
- Repository: YarikMix/vs-code-utils; update existing PR #1 on feat/codex-smart-paste. No merge or Marketplace publication.
- `strict: true`; errors on boundaries are `unknown`. Runtime has no Bun API dependency.
- Output: `dist/extension.cjs`, CommonJS, platform node, external `vscode`; `main` points to this file.
- Preserve `engines.vscode: ^1.85.0`; compile runtime with target node18 and use compatible VS Code API types.
- Preserve extension ID `local.codex-smart-paste`, command ID `local.codexSmartPaste.paste`, `extensionKind: ["ui"]`; version `0.2.0`.
- Preserve the five bindings, their exact terminalFocus conditions, ESC+v/ESC[13;2u sequences and commandsToSkipShell default.
- Preserve image priority, timeout 3000 ms, concurrent-call exclusion and active-terminal identity check.
- No clipboard content logging, persistent PowerShell policy changes, global package installation, or user keybinding/backup changes.
- Commit `bun.lock`; scripts: `typecheck`, `build`, `test:unit`, `test:integration`, `package`; typecheck is `tsc --noEmit`.
- Bun unit discovery excludes Electron suites. VSIX includes runtime/PowerShell/README and excludes tests, development docs, node_modules and lockfile.
- Real integration runs use temporary user-data/extensions directories and do not automate Telegram/Codex messages or change the clipboard.
- Physical keys, keyboard layouts and image attachment appearance require explicit manual acceptance; do not claim Electron command tests prove them.
- No GitHub Actions workflow changes: current OAuth token lacks workflow scope.

## Review Focus
- Moving entrypoint into dist must not break PowerShell resource location: Task 1 tests context-relative resolution; Task 2 executes the packaged script on Windows.
- Bun success does not prove Node extension-host compatibility: Task 2 activates the esbuild output in real VS Code.
- Terminal interception must not bypass smart paste: Task 1 pins contributed default; Task 2 checks the effective real VS Code setting and command registration.
- An integration runner must not use personal VS Code settings/extensions or a shell that can execute pasted text: Task 2 asserts isolated paths and captures input in Pseudoterminal.
- A passing source suite must not mask a stale VSIX: Task 3 compares bundle/resource bytes across source build, archive and installed extension.

## File Map
- `src/extension.ts`: activation, VS Code adapters and resource path from ExtensionContext.
- `src/smart-paste.ts`: pure typed router; no vscode runtime import.
- `src/clipboard.ts`: fixed-script process invocation and boolean validation; no vscode runtime import.
- `test/unit/*.test.ts`: Bun tests for routing, process adapter, activation adapters and manifest.
- `test/integration/run.ts`: @vscode/test-electron launcher; optional executable path from environment.
- `test/integration/suite.ts`: exported `run(): Promise<void>` executed by VS Code, using node:assert.
- `scripts/build.ts`: esbuild runtime plus integration entrypoints with distinct external rules.
- `tsconfig.json`, `bunfig.toml`, `package.json`, `bun.lock`: typed development and reproducible commands.
- `.vscodeignore`, `.gitignore`, `README.md`: packaging, generated-artifact hygiene and user/developer instructions.

### Task 1: Typed runtime, Bun tests and esbuild output

**Files:** Create src/extension.ts, src/clipboard.ts, test/unit/smart-paste.test.ts, test/unit/clipboard.test.ts, test/unit/manifest.test.ts, scripts/build.ts, tsconfig.json, bunfig.toml, bun.lock. Replace src/smart-paste.js with src/smart-paste.ts; remove root extension.js and test/smart-paste.test.js after equivalent coverage passes. Modify package.json and .gitignore.

**Interfaces:**
- `TerminalTarget = Pick<import('vscode').Terminal, 'sendText'>`.
- `SmartPasteDependencies`: getActiveTerminal(): TerminalTarget | undefined; containsImage(): Promise<boolean>; pasteText(): PromiseLike<unknown>; reportError(message: string): unknown.
- `createSmartPaste(dependencies: SmartPasteDependencies): () => Promise<void>` preserves existing behavior and safe error text.
- `containsImage(scriptPath: string): Promise<boolean>`; `createClipboardProbe(scriptPath: string, execute: ExecuteFile = executeFile): () => Promise<boolean>` supports typed injection of the process boundary, with no module-loader patching. `ExecuteFile` accepts executable, string arguments, options and callback(error: Error | null, stdout: string): void; expose only options needed by the adapter, including 3000 ms timeout.
- `activate(context: vscode.ExtensionContext): void`; script path is `context.asAbsolutePath('scripts/contains-image.ps1')`.
- Build exports only normal extension activation; do not add production-only-for-tests commands.

- [ ] **Step 1: Prepare typed test infrastructure and dependencies.** Use Bun local devDependencies with exact resolved versions in bun.lock; @types/vscode must be 1.85-compatible, runtime @types/node from major 18. Configure strict checking for runtime, scripts and tests; separate type environments if needed. Set bunfig test root to test/unit. Pin VSIX version/main and package scripts, initially failing until source/build exists.
- [ ] **Step 2: Port router tests first and record RED.** Preserve assertions for image sendText("\u001bv", false), ordinary text and empty routes, changed terminal for both formats, closed/no target, concurrent exclusion/retry, safe notification and lock release. Import the new TS path before implementation; run `bun run test:unit`, expecting missing implementation failure.
- [ ] **Step 3: Implement typed router and Windows adapter.** Add adapter tests for exact Windows executable, fixed STA script, timeout 3000, windowsHide, true/false CRLF parsing, invalid output, process error and timeout. Assert untrusted stdout/stderr never appear in user error text. Test activation resource resolution using an ExtensionContext-shaped typed adapter and a different dist directory; do not mock the module loader.
- [ ] **Step 4: Add manifest and build regression tests.** Assert exact existing five binding objects and commandsToSkipShell, extensionKind ui, version 0.2.0, main dist/extension.cjs. Build with esbuild node18/cjs and external vscode. Assert dist bundle exists and PowerShell is resolved from extension root, not dist. Keep scripts/contains-image.ps1 unchanged.
- [ ] **Step 5: Verify and commit.** Run `bun install --frozen-lockfile`, `bun run typecheck`, `bun run test:unit`, `bun run build`; all must exit 0. Confirm no runtime imports of bun/bun:test, no any-based bypass of new interfaces, no remaining JS implementation or old Node tests. Commit `refactor: migrate smart paste to strict TypeScript and Bun`.

### Task 2: Real VS Code integration tests

**Files:** Create test/integration/run.ts and test/integration/suite.ts; modify scripts/build.ts and package.json for integration compilation/launch; extend test/unit runner configuration tests only where necessary.

**Interfaces:** Consumes Task 1 runtime bundle and clipboard probe. Produces `bun run test:integration`, launcher `dist/test/integration/run.cjs`, suite `dist/test/integration/suite.cjs`, and an accurate integration result report. Runner accepts optional `VSCODE_EXECUTABLE_PATH`; computes extensionDevelopmentPath from repository root and extensionTestsPath from compiled suite. Suite exports async `run()` and must fail process execution on assertion failure.

- [ ] **Step 1: Write and run the integration suite before implementation adjustments.** Resolve extension with `vscode.extensions.getExtension('local.codex-smart-paste')`, activate it, assert isActive and registered command ID, read effective terminal commandsToSkipShell and compare five manifest bindings. Add actual Pseudoterminal input tests: invoke built-in sendSequence with each manifest ESC sequence; assert received bytes exactly, with no CR/LF. Use bounded event promises and dispose resources in finally.
- [ ] **Step 2: Implement isolated launcher.** Use @vscode/test-electron runTests with separate fresh user-data and extensions directories, welcome/updates disabled, other extensions disabled. Include timeout/error propagation. Compile launcher as ordinary Node CJS (external @vscode/test-electron); compile suite with external vscode. Keep Electron tests outside Bun unit discovery. Do not introduce a test framework when node:assert and exported run suffice.
- [ ] **Step 3: Prepare Windows execution from WSL.** Stage repository runtime, suite, resources, package manifest and JS runner dependencies under a fresh Windows Temp directory. Use existing Windows Code.exe as Node (ELECTRON_RUN_AS_NODE scoped to launcher only); pass installed Windows Code.exe to runTests, ensuring child Electron does NOT inherit ELECTRON_RUN_AS_NODE. Alternative: use a downloaded test-electron Windows installation if needed. Windows path conversion uses wslpath. Do not install global tooling or mutate user's Code profile. Document reproducible invocation.
- [ ] **Step 4: Run real Windows acceptance.** Use separate development window; assert compiled runtime activation/command/defaults and captured Pseudoterminal sequences. On Windows call `containsImage(path.join(extension.extensionPath, 'scripts', 'contains-image.ps1'))` from a test-bundled clipboard module and assert typeof result === 'boolean'; no clipboard changes or content output. Script path must exist in staged package. Integration bundle must not import Bun runtime APIs. Run against available Windows Code; if it cannot run, retain exact failure evidence, report blocked coverage and continue other checks without claiming success.
- [ ] **Step 5: Verify and commit.** Run `bun run typecheck`, `bun run test:unit`, `bun run build`, `bun run test:integration` with explicit executable/platform environment as documented. Verify an intentionally wrong expected sequence produces nonzero result, restore it and obtain GREEN. Commit `test: exercise smart paste integration in real VS Code`.

### Task 3: Package, local upgrade and PR update

**Files:** Modify README.md, .vscodeignore, package.json package scripts; remove codex-smart-paste-0.1.0.vsix; add codex-smart-paste-0.2.0.vsix. Keep user keybindings and backups unchanged.

**Interfaces:** Consumes built runtime and test evidence. `bun run package` runs typecheck/build then local @vscode/vsce with no runtime dependencies and output codex-smart-paste-0.2.0.vsix. Produces reviewed VSIX, Windows local installation and updated PR #1.

- [ ] **Step 1: Update instructions.** Document bun install --frozen-lockfile and each script, Node extension-host/Bun tooling distinction, real Electron checks and manual keyboard/layout limits, Windows-local UI installation, and rollback. Remove obsolete Node-test/JS source instructions.
- [ ] **Step 2: Package and inspect.** Update .vscodeignore to allow only package.json, README.md, dist/extension.cjs and scripts/contains-image.ps1 (plus packaging metadata); exclude dist/test. Run `bun run package`. Inspect archive manifest version/main/defaults and runtime/resource bytes. Assert no development docs, tests, dependencies, lockfile or credentials in VSIX; remove old 0.1.0 artifact.
- [ ] **Step 3: Upgrade Windows local extension.** Reuse Windows Code CLI path and scoped environment from prior installation evidence; force-install the new VSIX, list versions and compare installed manifest/runtime/resource bytes. Hash user's keybindings.json and existing backups before and after; assert unchanged. Do not claim physical keyboard acceptance from these checks.
- [ ] **Step 4: Verify final source and review.** Run frozen install, typecheck, unit, build, package validation and real integration once after relevant final changes. Record actual outputs, counts and limitations for reviewers. Commit `build: package TypeScript extension and document Bun workflow`.
- [ ] **Step 5: Update remote PR after task and whole-branch review.** Push the feature branch without force; update title/body of PR #1 around the final implementation and exact verified results, preserving runtime behavior description. Use gh structured body-file. Check remote PR head equals local HEAD and state is OPEN. Do not merge, add workflow files or publish to Marketplace. Tell user Reload Window is required for local upgrade.

## Execution handoff
Use SDD as already requested: one implementer per task, separate task review after each, then whole-branch review before the authorized push. Establish the plan-owned ledger at execution time. Work on the existing dedicated feature branch, with clean baseline, preserving user files; if isolation is needed use an isolated checkout without changing the planned PR head. Report blockers as missing evidence, not successful coverage.
