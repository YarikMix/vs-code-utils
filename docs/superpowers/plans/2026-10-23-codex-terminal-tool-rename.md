# Codex Terminal Tool Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans, whichever the user selects for this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Полностью переименовать установленное расширение Codex Ops в Codex Terminal Tool с новым техническим ID, не меняя работу терминальных функций.

**Architecture:** Существующие модули остаются на месте. Переименовываются публичные идентификаторы в манифесте и runtime, проверяемые тестами; выпуск `0.4.0` заменяет старый VSIX. После ревью контроллер устанавливает новый ID локально и удаляет старое расширение.

**Tech Stack:** TypeScript, Bun, VS Code Extension API `^1.85.0`, Windows PowerShell, VSIX.

**Spec:** `docs/superpowers/specs/2026-10-23-codex-terminal-tool-rename-design.md`

## Global Constraints

- `displayName: Codex Terminal Tool`, `name: codex-terminal-tool`, `publisher: local`, ID `local.codex-terminal-tool`.
- Команда `local.codexTerminalTool.paste`; переменные `CODEX_TERMINAL_TOOL_ENDPOINT` и `CODEX_TERMINAL_TOOL_HELPER`.
- Версия `0.4.0`, артефакт `codex-terminal-tool-0.4.0.vsix`; старые имена без aliases.
- Сохранить `extensionKind: ["ui"]`, `engines.vscode: ^1.85.0`, `TerminalLocation.Panel`, отдельный оконный bridge, проверку UUID и сочетания клавиш.
- Сохранить файл `scripts/open-session.ps1`, репозиторий `vs-code-utils` и исторические спеки/планы прежних релизов.
- Не завершать работающие Codex-сессии при локальной миграции.

## Review Focus

- Старый `local.codex-ops` и новый ID одновременно установлены: после миграции остается только новый, иначе Ctrl+V может вызывать две команды. Проверка списка расширений после установки.
- Существующий терминал сохранил `CODEX_OPS_*`: старый endpoint не должен считаться рабочим после перезагрузки; README требует новый WSL-терминал. Unit-тест проверяет новые имена переменных, интеграционный тест вызывает helper с новыми именами.
- Манифест и runtime используют разные command ID: Smart Paste перестает срабатывать. Unit и Electron тесты проверяют регистрацию и keybindings одним новым ID.
- Новый VSIX содержит старый манифест или имя: установка создаёт неверный ID. Проверка package.json, extension.vsixmanifest и bundle внутри VSIX.
- Переименование меняет терминальное поведение: regression suites проверяют Smart Paste, оконный bridge и `TerminalLocation.Panel` в Windows Electron host.

---

### Task 1: Переименовать расширение и выпустить новый VSIX

**Files:**
- Modify: `package.json`, `bun.lock`, `README.md`
- Modify: `src/activation.ts`, `src/extension.ts`, `src/resume-feature.ts`, `scripts/open-session.ps1`
- Modify: `test/unit/activation.test.ts`, `test/unit/manifest.test.ts`, `test/unit/resume-feature.test.ts`
- Modify: `test/integration/run.ts`, `test/integration/suite.ts`
- Replace: `codex-ops-0.3.1.vsix` → `codex-terminal-tool-0.4.0.vsix`
- Include: this plan and its spec

**Interfaces:**
- `createActivation` registers `local.codexTerminalTool.paste` and the manifest uses the same ID for activation, command, keybinding and `commandsToSkipShell`.
- `activateResumeFeature` sets and deletes `CODEX_TERMINAL_TOOL_ENDPOINT` and `CODEX_TERMINAL_TOOL_HELPER`; integration probe invokes the existing PowerShell helper through these variables.

- [ ] **Step 1: Write RED assertions.** Update unit expectations for package name/version, command ID and environment variables; update the Windows integration probe to read the new variables and expect the new extension ID. Keep assertions for all current keyboard shortcuts and panel terminal location.
- [ ] **Step 2: Verify RED.** Run focused `bun test test/unit/manifest.test.ts test/unit/activation.test.ts test/unit/resume-feature.test.ts`; expect failures on old IDs/names before runtime changes.
- [ ] **Step 3: Rename runtime and manifest.** Change all current public identifiers to the exact values in Global Constraints; update error messages and temporary integration directory prefixes. Update `bun.lock` from the changed root package name without altering dependency versions. Keep helper filename and terminal behavior.
- [ ] **Step 4: Verify GREEN.** Run the focused tests again; expect all pass.
- [ ] **Step 5: Update distribution and documentation.** README describes the new helper variables, command ID, VSIX, removal of `local.codex-ops`, Reload Window and new WSL terminal. Package `0.4.0` into `codex-terminal-tool-0.4.0.vsix`, remove the tracked `0.3.1` VSIX, inspect manifest and bundle in new VSIX.
- [ ] **Step 6: Verify behavior.** Run `bun test`, `bun run typecheck`, `bun run package` and Windows `bun run test:integration` with the available official VS Code 1.142.0 portable executable. Confirm current source and tests do not use `Codex Ops`, `codex-ops`, `codexOps` or `CODEX_OPS`; README may mention `local.codex-ops` only to instruct removal of the former extension, and historical specs/plans are exempt.
- [ ] **Step 7: Self-review and commit.** Review the complete diff for unrelated behavior changes and commit with `refactor: rename extension to Codex Terminal Tool`.

After task and whole-branch reviews, install the new VSIX in Local — Installed, uninstall `local.codex-ops`, verify only `local.codex-terminal-tool@0.4.0` appears, and avoid terminating active Codex sessions.
