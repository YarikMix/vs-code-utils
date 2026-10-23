# Codex Ops Panel Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Новые сессии Codex открываются в нижней панели терминала текущего окна и появляются в её правом списке вкладок.

**Architecture:** Существующий оконный bridge по-прежнему принимает UUID и вызывает `activateResumeFeature`. Меняется только `location` при создании терминала через публичный VS Code API; выпуск `0.3.1` позволяет установить исправление поверх `0.3.0`.

**Tech Stack:** TypeScript, VS Code Extension API `^1.85.0`, Bun, Windows VSIX.

**Spec:** `docs/superpowers/specs/2026-10-23-codex-ops-panel-tabs-design.md`

## Global Constraints

- Использовать `vscode.TerminalLocation.Panel` (`1`); не создавать редакторскую вкладку для новых запросов.
- Сохранить точное окно запроса, вызовы `show()` и `sendText` с командой `codex resume <UUID>` и аргументом `true`.
- Не менять оконный bridge, строгую проверку UUID, Smart Paste, Codex CLI или статусы сессий.
- Сохранить `engines.vscode: ^1.85.0` и `extensionKind: ["ui"]`.
- Пакет и документация должны указывать `0.3.1` и `codex-ops-0.3.1.vsix`.
- Не перезагружать существующие окна VS Code с активными сессиями при проверке.

## Review Focus

- Два открытых WSL-окна: запрос из одного окна открывает терминал в том же окне. Ручной UI smoke после установки; существующий оконный bridge не меняется.
- Новый терминал виден справа в нижней Terminal-панели, а не среди editor tabs. Регрессионный unit-тест проверяет `location: 1`; ручной UI smoke проверяет фактическое расположение.
- UUID передаётся в `codex resume` без изменения и терминал показывается. Существующий unit-тест сохраняет эти проверки.
- Smart Paste и активация расширения остаются рабочими. Полный unit suite и доступный Electron integration suite.
- Устанавливаемый VSIX и README соответствуют версии. Проверка содержимого VSIX и локальной установки.

---

### Task 1: Открывать возобновлённые сессии в Terminal-панели

**Files:**
- Modify: `test/unit/resume-feature.test.ts`
- Modify: `src/resume-feature.ts`
- Modify: `src/extension.ts`
- Modify: `package.json`
- Modify: `test/integration/suite.ts`
- Modify: `README.md`
- Replace: `codex-ops-0.3.0.vsix` → `codex-ops-0.3.1.vsix`
- Include: this plan and its spec

**Interfaces:**
- Consumes: `activateResumeFeature(context, dependencies)` and the current per-window bridge.
- Produces: `ResumeFeatureDependencies.terminalLocation: TerminalLocation`; `activate()` passes `vscode.TerminalLocation.Panel`.

- [x] **Step 1: Change the regression test first.** Rename the test to say panel terminal, rename the fake dependency to `terminalLocation: 1`, and assert `createTerminal({ name: 'Codex', location: 1 })`, followed by `show()` and `sendText('codex resume 01a14ff0-3f2d-7d71-b4e5-0b63839ec381', true)`.
- [x] **Step 2: Verify RED.** Run `bun test test/unit/resume-feature.test.ts`; expect failure because `editorLocation` is still the implementation contract or because the created terminal still uses `2`.
- [x] **Step 3: Implement the API change.** Rename `ResumeFeatureDependencies.editorLocation` to `terminalLocation`, use it in `createTerminal`, and pass `vscode.TerminalLocation.Panel` from `src/extension.ts`; retain bridge and command behavior.
- [x] **Step 4: Verify GREEN.** Run `bun test test/unit/resume-feature.test.ts`; expect pass.
- [x] **Step 5: Update distribution.** Set `package.json` version and package output to `0.3.1` / `codex-ops-0.3.1.vsix`, update the integration version assertion, and make README explicitly name the bottom Terminal panel and `0.3.1` installation. Remove the tracked `0.3.0` VSIX when the new one is built.
- [x] **Step 6: Verify.** Run `bun test`, `bun run typecheck`, `bun run package`; inspect that `codex-ops-0.3.1.vsix` contains extension version `0.3.1`. Run Electron integration if a usable executable is available without disrupting the installed VS Code update; report any environment blocker precisely.
- [x] **Step 7: Self-review and commit.** Review the diff for unrelated changes, then commit the code, docs, plan/spec, and new VSIX with `fix: open resumed Codex sessions in terminal panel`.

After task review and whole-branch review, the controller installs `0.3.1` locally and runs a manual WSL-window smoke test without reloading the user's active window.
