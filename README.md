# SnapType

SnapType is a lightweight Windows text expander built with Electron and vanilla web tech. It runs in the system tray, watches for snippet shortcuts globally, and replaces shortcuts with saved text while you work in other apps.

## Features

- Global text expansion while typing in other apps
- Immediate trigger matching: snippets expand as soon as the full shortcut is typed
- Folder-based snippet organization with search
- Placeholder support with `{{name}}` fields and popup input flow
- Built-in system placeholders for date/time:
  - `{{date}}`, `{{time}}`, `{{datetime}}`
  - Custom formats like `{{date:dd/MM/yyyy}}` and `{{time:HH:mm}}`
- Live editor preview with placeholder scan and one-click placeholder insertion
- Snippet targeting (per-snippet app restriction)
- Global allowlist mode (only expand in selected apps)
- Usage analytics dashboard:
  - top snippets
  - folder usage
  - recent activity
  - date-wise trend charts (week, month, year)
- Tray controls for expansion state:
  - Pause for 15 minutes
  - Pause until restart
  - Resume expansion
- Window toggle shortcut: `Ctrl+Shift+Space`
- Theme support: Midnight and Light
- Launch-on-startup support for packaged Windows builds
- Windows installer output through `electron-builder`

## Requirements

- Windows is the target platform for both development and packaging
- A recent Node.js + npm setup

The app depends on native modules such as `uiohook-napi`, `active-win`, and `@nut-tree/nut-js`, and the build config currently targets Windows x64.

## Getting Started

Install dependencies:

```bash
npm install
```

Run the app in development:

```bash
npm run dev
```

The repo also exposes:

```bash
npm start
```

## Build

Create the Windows installer:

```bash
npm run build
```

Packaged output is written to [`dist`](./dist), with an NSIS installer named like `SnapType-Setup-1.0.0.exe`.

## How To Use

1. Launch SnapType.
2. Open the main window with `Ctrl+Shift+Space` or by clicking the tray icon.
3. Create folders and snippets from the sidebar.
4. Give each snippet a shortcut such as `/ty` and a body such as `thank you`.
5. Type that shortcut in another app and SnapType will expand it immediately.

Placeholders use double curly braces:

```text
Hello {{name}},

Thanks for reaching out about {{topic}}.
```

When this snippet is triggered, SnapType prompts for `name` and `topic` before typing the final text.

System placeholders are resolved automatically without popup input:

```text
Today is {{date:dd MMM yyyy}}.
Current time: {{time:HH:mm}}.
```

## Settings

SnapType currently supports:

- Launch on startup
- Custom trigger character
- Theme switching (Midnight / Light)
- Global mode, where snippets work anywhere
- Allowlist mode, where snippets only work in selected apps
- Per-snippet app targeting in the editor

In allowlist mode, you can either choose an `.exe` manually or capture the currently active app from the settings dialog.

## Tray Menu

The tray icon provides quick controls:

- Show SnapType
- Pause for 15 Minutes
- Pause Until Restart
- Resume Expansion
- Quit

## Default Sample Snippets

The initial store ships with a few starter shortcuts:

- `/new`
- `/nme`
- `/ty`

These live in the default `General` folder and can be edited or removed from the UI.

## Behavior Notes

- Closing the main window hides it to the tray instead of quitting the app.
- Snippets and settings are persisted automatically with `electron-store`.
- Launch on startup is only applied for packaged Windows builds, not plain `electron .` development runs.
- Expansion can be paused and resumed from the tray menu.

## Project Structure

```text
app/
  main/       Electron main process, hooks, expansion logic, IPC, tray/window managers
  preload/    Safe renderer bridge
  renderer/   Main UI and placeholder popup
  shared/     Shared constants and placeholder parsing
assets/       App icon
dist/         Build output
```

## License

MIT
