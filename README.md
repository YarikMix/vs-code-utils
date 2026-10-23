# Codex extensions for Windows VS Code

Два независимых расширения для Codex во встроенном терминале Windows VS Code, включая WSL:

| Расширение | ID | VSIX | Назначение |
| --- | --- | --- | --- |
| [Codex Smart Paste](extensions/codex-smart-paste/README.md) | `local.codex-smart-paste` | `codex-smart-paste-0.3.0.vsix` | Буфер обмена и пять терминальных привязок |
| [Codex Terminal Tool](extensions/codex-terminal-tool/README.md) | `local.codex-terminal-tool` | `codex-terminal-tool-0.5.0.vsix` | `codex resume <UUID>` в новой вкладке панели текущего окна |

Для обеих функций установите оба VSIX через **Extensions: Install from VSIX...** в локальном Windows VS Code (**Local — Installed**). Оба расширения работают в Windows UI extension host; установка только в WSL не подходит. Bun и Node.js нужны только разработчику. Инструкции сочетаний клавиш и helper находятся в README соответствующего пакета.

## Миграция

Обновите прежний объединённый `local.codex-terminal-tool` 0.4.0 до 0.5.0 и отдельно установите `local.codex-smart-paste` 0.3.0. Версия Terminal Tool 0.5.0 больше не содержит Smart Paste, его команду и привязки. Не оставляйте старую объединённую версию рядом с новым Smart Paste. Если установлен исторический `local.codex-ops`, удалите его: его Ctrl+V конкурирует с новой командой.

```powershell
& "$env:LOCALAPPDATA\Programs\Microsoft VS Code\bin\code.cmd" --uninstall-extension local.codex-ops
& "$env:LOCALAPPDATA\Programs\Microsoft VS Code\bin\code.cmd" --install-extension 'C:\path\to\codex-terminal-tool-0.5.0.vsix' --force
& "$env:LOCALAPPDATA\Programs\Microsoft VS Code\bin\code.cmd" --install-extension 'C:\path\to\codex-smart-paste-0.3.0.vsix' --force
& "$env:LOCALAPPDATA\Programs\Microsoft VS Code\bin\code.cmd" --list-extensions --show-versions
```

Команда удаления нужна, только если старый ID установлен. Если сборка находится в WSL, сначала скопируйте VSIX в обычный каталог Windows, например `%TEMP%`: прямой UNC-путь может блокироваться CLI. Выполните **Developer: Reload Window**, когда это не прервёт активные сессии Codex, затем создайте новый WSL-терминал для переменных Terminal Tool. Рабочий `keybindings.json` менять не требуется; проверьте собственные переопределения при конфликте сочетаний.

Расширения удаляются независимо: `code.cmd --uninstall-extension local.codex-smart-paste` оставляет мост Terminal Tool; `code.cmd --uninstall-extension local.codex-terminal-tool` оставляет Smart Paste. После удаления перезагрузите окно в удобный момент. Ограничение окружения общего daemon Codex и вариант `--no-daemon` описаны в [Terminal Tool](extensions/codex-terminal-tool/README.md).

## Разработка

Нужны Bun 1.4.x и Node.js 22+. Все команды выполняются из корня:

```sh
bun install --frozen-lockfile
bun run typecheck
bun run test:unit
bun run build
VSCODE_EXECUTABLE_PATH='/mnt/c/Users/olegg/AppData/Local/Programs/Microsoft VS Code/Code.exe' bun run test:integration
bun run package
```

`bun run package` создаёт оба VSIX в корне. Для отдельной упаковки после сборки используйте `bun run package:smart-paste` или `bun run package:terminal-tool`. Runtime каждого пакета собирается отдельно в `extensions/<name>/dist/extension.cjs`, CommonJS для Node 18, с внешним модулем `vscode`; требуется VS Code `^1.85.0`. Каждый пакет содержит только свой runtime и один PowerShell-скрипт.

Интеграционный runner загружает оба пакета, затем каждый отдельно, в трёх временных профилях с отдельными каталогами расширений. На Windows он проверяет реальные PowerShell-ресурсы и мост; Pseudoterminal проверяет точные ESC-последовательности. Runner не меняет рабочий профиль или настройки обновлений пользователя. В WSL задайте путь к установленному Windows `Code.exe`, как в примере. Физические клавиши, изображение в Codex и маршрутизацию в двух WSL-окнах одного workspace проверяйте отдельно, сохраняя активные сессии.

Исторические документы в `docs/superpowers/` сохранены. Упомянутые в старых спеках и планах корневые `src/` и `scripts/*.ps1` относятся к прежнему единому расширению; актуальные пути находятся в `extensions/codex-smart-paste/` и `extensions/codex-terminal-tool/`.

Для автоматической проверки двух WSL-окон создайте временную пустую папку и укажите установленное локальное расширение Remote-WSL. Оба тестовых окна используют один workspace, отдельные профили и свежие случайные UUID; чужие сессии не возобновляются. Проверка подтверждает маршрутизацию helper в свою панель, но не успешное возобновление существующей истории Codex.

```sh
mkdir -p /tmp/codex-split-wsl-check
CODEX_INTEGRATION_WSL_DISTRO=Ubuntu \
CODEX_INTEGRATION_WSL_WORKSPACE=/tmp/codex-split-wsl-check \
CODEX_INTEGRATION_WSL_EXTENSION='/mnt/c/Users/olegg/.vscode/extensions/ms-vscode-remote.remote-wsl-1.104.6' \
VSCODE_EXECUTABLE_PATH='/mnt/c/Users/olegg/AppData/Local/Programs/Microsoft VS Code/Code.exe' \
bun run test:integration
```

Замените дистрибутив и пути на свои. Runner копирует Remote-WSL во временные каталоги расширений; рабочий профиль не используется. После проверки удалите созданную пустую папку.
