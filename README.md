# SnapType

SnapType is a lightweight Windows text expander built with Electron and vanilla web tech. It runs in the system tray, watches for snippet shortcuts as you type, and replaces them with saved text. If a snippet contains placeholders, SnapType opens a small popup near the cursor so you can fill them before insertion.

## Features

- Global text expansion while typing in other apps
- Folder-based snippet organization
- Placeholder support with `{{name}}` style tokens
- Tray app with a quick toggle shortcut: `Ctrl+Shift+Space`
- Optional app allowlist mode for limiting where expansion runs
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
5. Type that shortcut in another app and SnapType will erase it and insert the full text.

Placeholders use double curly braces:

```text
Hello {{name}},

Thanks for reaching out about {{topic}}.
```

When this snippet is triggered, SnapType prompts for `name` and `topic` before typing the final text.

## Settings

SnapType currently supports:

- Launch on startup
- Custom trigger character
- Global mode, where snippets work anywhere
- Allowlist mode, where snippets only work in selected apps

In allowlist mode, you can either choose an `.exe` manually or capture the currently active app from the settings dialog.

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
