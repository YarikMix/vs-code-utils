# Codex Terminal Tool: полное переименование

## Намерение

Расширение для терминалов VS Code получает согласованное имя **Codex Terminal Tool** вместо **Codex Ops**. Пользователь разрешил сменить технический ID и не требует совместимости со старым расширением. Smart Paste и запуск найденной сессии в нижней Terminal-панели текущего окна сохраняют поведение.

## Публичные имена

| Область | Новое значение |
| --- | --- |
| Отображаемое имя | `Codex Terminal Tool` |
| Имя пакета | `codex-terminal-tool` |
| ID расширения | `local.codex-terminal-tool` |
| Команда Smart Paste | `local.codexTerminalTool.paste` |
| Переменные новых терминалов | `CODEX_TERMINAL_TOOL_ENDPOINT`, `CODEX_TERMINAL_TOOL_HELPER` |
| VSIX и версия | `codex-terminal-tool-0.4.0.vsix`, `0.4.0` |

Ошибки, README и тестовые сообщения должны использовать новое имя. Привязки клавиш и сам PowerShell helper сохраняют поведение и имя файла `scripts/open-session.ps1`. Старые command ID и переменные окружения не поддерживаются как alias: после обновления нужен Reload Window и новый терминал, чтобы получить новые переменные. При локальной установке удалить `local.codex-ops`, чтобы его привязки не конкурировали с новыми.

## Границы

Сохранить репозиторий `vs-code-utils`, UI extension host (`extensionKind: ["ui"]`), минимальную версию VS Code `^1.85.0`, отдельный оконный bridge, строгую проверку UUID, Smart Paste и `TerminalLocation.Panel`. Исторические спецификации и планы прежних релизов не переписывать.

Обновить имя корневого workspace в `bun.lock`, манифест, исходники, текущий README, unit и Electron integration tests, а также заменить отслеживаемый VSIX. После сборки проверить содержимое VSIX и локальную установку. Работающие сессии Codex не завершать ради миграции.
