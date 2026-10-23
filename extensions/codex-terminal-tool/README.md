# Codex Terminal Tool

Локальное расширение Windows VS Code для работы с Codex во встроенных терминалах, включая WSL. Оно позволяет агенту открыть найденную сессию Codex в новой вкладке нижней панели Terminal текущего окна VS Code.

## Запуск сессии из терминала WSL

В терминале, созданном после активации расширения, агент выполняет:

```sh
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$CODEX_TERMINAL_TOOL_HELPER" -Endpoint "$CODEX_TERMINAL_TOOL_ENDPOINT" -SessionId 01a14ff0-3f2d-7d71-b4e5-0b63839ec381
```

Замените UUID на ID нужной сессии. Расширение создаст новый терминал в **нижней панели Terminal того же окна VS Code**, покажет его в списке вкладок справа и запустит `codex resume <UUID>`. Команда PowerShell возвращает ошибку, если запрос не дошёл до расширения. Агент может вызывать её через обычный shell tool; изменения Codex CLI не требуются.

Для каждого окна расширение поднимает собственный локальный канал на `127.0.0.1` со случайным токеном. Адрес передаётся только новым терминалам этого окна через `CODEX_TERMINAL_TOOL_ENDPOINT`; путь к скрипту — через `CODEX_TERMINAL_TOOL_HELPER`. Запрос принимает только UUID, поэтому в терминал нельзя передать произвольную команду через этот канал. Переменные отсутствуют в уже работающих терминалах: после установки и **Developer: Reload Window** откройте новый терминал или новую сессию Codex. При нескольких окнах запускайте команду из терминала нужного окна.

Новый терминал использует профиль и рабочую папку, заданные VS Code для этого окна. В WSL-окне с профилем WSL `codex resume` запускается в WSL. Если переменные пусты, проверьте, что `Codex Terminal Tool` установлен в **Local — Installed**, расширение активно и терминал был создан после его активации.

## Установка

Установите `codex-terminal-tool-0.5.0.vsix` через **Extensions: Install from VSIX...** в локальном Windows VS Code либо Windows CLI `code.cmd --install-extension <путь-к-vsix> --force`. Технический ID нового расширения — `local.codex-terminal-tool`. Прежнее расширение `local.codex-ops` удалите, иначе его Ctrl+V-привязка останется конкурентом новой команды. После установки выполните **Developer: Reload Window** и откройте новый WSL-терминал. Bun и Node.js пользователю расширения не нужны.

Если VSIX собран в WSL, скопируйте его в обычный каталог Windows перед установкой. Прямой UNC-путь `\\wsl.localhost` может блокироваться Windows CLI. Не завершайте работающие сессии Codex ради миграции: установку и **Developer: Reload Window** выполняйте, когда они не прервут текущую работу. После перезагрузки создайте новый WSL-терминал, чтобы получить новые переменные окружения.

## Разработка

Нужны Bun 1.4.x и Node.js 22+ для тестового VS Code и упаковки.

```sh
bun install --frozen-lockfile
bun run typecheck
bun run test:unit
bun run build
VSCODE_EXECUTABLE_PATH='/mnt/c/Users/olegg/AppData/Local/Programs/Microsoft VS Code/Code.exe' bun run test:integration
bun run package
```

Для интеграции замените путь на установленный Windows `Code.exe`. Тест запускает отдельный Extension Development Host с временным профилем и не использует текущий профиль VS Code. Unit-тесты проверяют локальный канал, валидацию запроса, выбор вкладки и окружение; Electron-тест проверяет активацию и переменные моста. Реальное взаимодействие WSL, PowerShell и нескольких окон нужно проверить вручную после установки.

Команды разработки выполняются из корня репозитория. Исходники — `extensions/codex-terminal-tool/src/*.ts`, Windows-скрипт — `extensions/codex-terminal-tool/scripts/open-session.ps1`. Runtime собирается как CommonJS для Node 18 с внешним модулем `vscode`; расширение требует VS Code `^1.85.0`.

Smart Paste устанавливается отдельно как `local.codex-smart-paste`. Terminal Tool не добавляет команды вставки, привязки клавиш или настройки commandsToSkipShell. Удаление любого из двух расширений сохраняет функцию другого.
