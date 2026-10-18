# Codex Smart Paste

Локальное расширение Windows VS Code для Codex во встроенном терминале, включая терминалы WSL. Проверка формата Windows-буфера выполняется на Windows в UI extension host (`extensionKind: ui`). Внешние сервисы и зависимости времени выполнения не нужны.

| Сочетание в терминале | Действие |
| --- | --- |
| Ctrl+V / Ctrl+М | Если в буфере есть изображение — отправить Codex Alt+v; иначе — штатная вставка текста VS Code |
| Alt+V / Alt+М | Отправить Codex Alt+v для вставки изображения |
| Ctrl+C / Ctrl+С с выделением | Копировать выделенный текст терминала |
| Ctrl+C без выделения | Сохраняется штатное прерывание |
| Ctrl+Enter, Shift+Enter | Отправить `ESC[13;2u` для переноса строки в Codex, без отправки промпта |
| Ctrl+Shift+V | Сохраняется штатная вставка текста VS Code |

V и C заданы физическими клавишами `[KeyV]` и `[KeyC]`, предназначенными для английской и русской раскладок. Все пять привязок расширения ограничены фокусом терминала. Фактическую работу клавиатуры в обеих раскладках нужно проверить вручную. Расширение не проверяет, запущен ли Codex: команды вставки изображения предназначены для терминала с Codex.

Расширение добавляет `local.codexSmartPaste.paste` в значение по умолчанию `terminal.integrated.commandsToSkipShell`, чтобы терминал передавал Ctrl+V команде VS Code. Встроенные исключения VS Code сохраняются. Если вы задаёте собственный массив этой настройки в пользовательских настройках или настройках рабочей области, включите в него `local.codexSmartPaste.paste`. Настройка `terminal.integrated.sendKeybindingsToShell: true` имеет приоритет над этим списком и может передавать сочетание оболочке; для работы Smart Paste оставьте её выключенной.

Изображение имеет приоритет, если буфер содержит и изображение, и текст. PowerShell в STA-режиме возвращает только `true`/`false`; содержимое буфера не сохраняется, не логируется и не меняется. При ошибке или таймауте 3 секунды показывается сообщение без автоматической вставки. Повторное нажатие во время проверки игнорируется; смена активного терминала отменяет вставку. Буфер может измениться между проверкой и вставкой.

## Установка и обновление

Установите готовый `codex-smart-paste-0.2.0.vsix` через **Extensions: Install from VSIX...** в локальном Windows VS Code, в разделе **Local — Installed**. Идентификатор: `local.codex-smart-paste`. Установка в WSL extension host не подходит: проверка использует Windows-буфер обмена.

При установке из Windows CLI:

```powershell
& "$env:LOCALAPPDATA\Programs\Microsoft VS Code\bin\code.cmd" --install-extension 'C:\path\to\codex-smart-paste-0.2.0.vsix' --force
& "$env:LOCALAPPDATA\Programs\Microsoft VS Code\bin\code.cmd" --list-extensions --show-versions
```

Если сборка находится в WSL, сначала скопируйте VSIX в локальный каталог Windows (например, `%TEMP%`), затем используйте **Install from VSIX...** или Windows CLI с локальным Windows-путём. CLI может блокировать доступ к UNC-пути `\\wsl.localhost`; изменение настроек безопасности для установки не требуется. Существующую версию можно оставить установленной до готовности нового VSIX. Обновление расширения не требует изменения `keybindings.json` и его резервных копий. Пользовательские привязки имеют приоритет над привязками расширения; при конфликте проверьте их вручную.

После установки выполните **Developer: Reload Window**. Проверьте в Codex текст и скриншот через Ctrl+V в английской и русской раскладках, Alt+V, Ctrl+C с выделением и без, Ctrl+Enter и Shift+Enter. Последние два сочетания должны переносить строку без отправки промпта. Автоматические тесты не заменяют эту проверку клавиатуры и отображения вложения.

## Разработка и проверки

Нужны Bun 1.4.2 и Node.js 22+ для инструментов VS Code (`@vscode/test-electron`, `@vscode/vsce`). Зависимости устанавливаются локально из `bun.lock`; глобальные пакеты и постоянное изменение политики PowerShell не нужны.

```sh
bun install --frozen-lockfile
bun run typecheck
bun run test:unit
bun run build
bun run test:integration
bun run package
```

| Команда | Результат |
| --- | --- |
| `bun run typecheck` | `tsc --noEmit` для проекта и отдельная проверка runtime с типами Node 18 / VS Code 1.85 без типов Bun |
| `bun run test:unit` (или `bun test`, `bun run test`) | Модульные тесты Bun из `test/unit`; Electron suite не попадает в автоматический поиск |
| `bun run build` | esbuild собирает `dist/extension.cjs` и отдельные интеграционные runner/suite |
| `bun run test:integration` | Сборка и запуск отдельного настоящего VS Code Extension Development Host |
| `bun run package` | Проверка типов, сборка и локальный `@vscode/vsce`; создаёт `codex-smart-paste-0.2.0.vsix` без runtime-зависимостей |

Исходники расширения находятся в `src/*.ts`, PowerShell-ресурс — в `scripts/contains-image.ps1`. Runtime выполняется в Node extension host VS Code, собирается как CommonJS с целью Node 18 и внешним `vscode`; Bun используется для разработки и не требуется пользователю расширения. Минимум VS Code сохраняется: `^1.85.0`. VSIX содержит только манифест, README, `dist/extension.cjs`, PowerShell-ресурс и служебные метаданные упаковки; тесты, исходники TypeScript, документы разработки, `node_modules` и lockfile исключены.

По умолчанию `@vscode/test-electron` загружает тестовый VS Code. Можно выбрать имеющийся исполняемый файл через `VSCODE_EXECUTABLE_PATH`. Для проверки Windows VS Code из WSL:

```sh
VSCODE_EXECUTABLE_PATH='/mnt/c/Users/olegg/AppData/Local/Programs/Microsoft VS Code/Code.exe' bun run test:integration
```

Замените путь на свой Windows `Code.exe`. Launcher автоматически переносит необходимые файлы во временный каталог Windows, запускает native Windows Electron с временными user-data/extensions directories и удаляет их после завершения. Существующий профиль пользователя не используется. Ненулевой результат тестов передаётся вызывающему процессу; ожидание ограничено watchdog.

Интеграционная suite проверяет активацию собранного entrypoint, регистрацию команды, эффективное `commandsToSkipShell`, пять точных привязок и байты трёх последовательностей через настоящий Pseudoterminal. На Windows она также запускает PowerShell-ресурс и проверяет boolean-результат без изменения буфера. Эти проверки не имитируют физические нажатия, переключение раскладок или появление изображения в Codex; ручная проверка выше остаётся обязательной. Suite не отправляет сообщения в Codex или Telegram.

## Откат

Для возврата к предыдущей версии сохраните прежний VSIX до обновления и установите его через **Install from VSIX...** либо Windows CLI с `--force`; затем выполните **Developer: Reload Window**. Для 0.1.0 пакет можно взять из предыдущего коммита репозитория. Пользовательские привязки при обновлении и откате версии менять не требуется.

Чтобы полностью удалить расширение, используйте **Uninstall** в локальном Windows VS Code или `code.cmd --uninstall-extension local.codex-smart-paste`. Если до первоначальной установки сочетания были настроены вручную, восстановите только нужные записи из своей резервной копии `keybindings.json`, сохранив остальные текущие изменения. Для обычной вставки Ctrl+V должна указывать на `workbench.action.terminal.paste` при `terminalFocus`. Выполните **Developer: Reload Window**.
