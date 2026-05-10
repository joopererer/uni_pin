# UniPin 📝

[![CI](https://github.com/joopererer/uni_pin/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/joopererer/uni_pin/actions/workflows/ci.yml)
[![Build and Release](https://github.com/joopererer/uni_pin/actions/workflows/release.yml/badge.svg)](https://github.com/joopererer/uni_pin/actions/workflows/release.yml)
[![GitHub Release](https://img.shields.io/github/v/release/joopererer/uni_pin?sort=semver)](https://github.com/joopererer/uni_pin/releases)
[![Tauri](https://img.shields.io/badge/Tauri-v2-24C8DB?logo=tauri&logoColor=white)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=white)](https://react.dev/)
[![Rust](https://img.shields.io/badge/Rust-stable-dea584?logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Ubuntu%2022.04+%20LTS-informational)](https://github.com/joopererer/uni_pin/releases)

Lightweight sticky notes desktop app built with **Tauri v2** and **React**.

**Version:** 0.2.2 · **Repository:** [joopererer/uni_pin](https://github.com/joopererer/uni_pin)

## Features

- **System Tray** — Runs in the tray instead of clogging the taskbar
- **Borderless Notes** — Transparent sticky windows
- **Images** — Paste or insert images (Ctrl+V); clipboard backed by [**arboard**](https://docs.rs/arboard/) on Linux (X11/Wayland) and Windows
- **Themes & Opacity** — Six themes; opacity slider (0–90%)
- **Always on Top** — Pin important notes
- **Search & Management Center** — List, search, batch show/hide/delete
- **Auto Start** — OS integration via Tauri autostart plugin (where supported)
- **Languages** — 中文 / English  
- **Global Shortcut** — Alt+N creates a note (behavior may vary on some Wayland sessions)

## Download (prebuilt)

Stable builds are attached to [**GitHub Releases**](https://github.com/joopererer/uni_pin/releases).

| OS | Typical files |
|----|----------------|
| Windows 10/11 | NSIS **`.exe`** (optional **`.msi`** if enabled in bundle) |
| Ubuntu 22.04 LTS | **`.deb`** and **`.AppImage`** with suffix **`.ubuntu22.04`** |
| Ubuntu 24.04 LTS | Same with suffix **`.ubuntu24.04`** |

Install the `.deb` that matches your distro; **in-app updates** resolve the correct asset using `/etc/os-release`.

Release workflow produces a **draft** release — publish it manually on GitHub when assets look good.

## CI / Release automation

| Workflow | When | What |
|----------|------|------|
| [**CI**](`.github/workflows/ci.yml`) | Push & PR on `main` (also `master`/`dev`) | Frontend build, Rust **`cargo test`** (Linux), **`cargo check`** (Windows) |
| [**Release**](`.github/workflows/release.yml`) | Tag push **`v*`** **or** *Run workflow* (manual tag input) | Windows (Tauri Action), Ubuntu **22.04 / 24.04** matrix → `.deb` + `.AppImage` |

### Cutting a release (maintainers)

```bash
# sync versions in package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml, then:
git commit -am "chore: release v0.2.2"
git tag -a v0.2.2 -m "v0.2.2"
git push origin main
git push origin v0.2.2
```

Or **Actions → Build and Release → Run workflow**, enter **`v0.2.2`** — the tag must already exist on the remote (`git push origin v0.2.2`).

Optional secrets (Windows signing etc.) are wired through `release.yml`; unsigned builds still work without them.

## Requirements (from source)

- Node.js **18+**
- Rust **stable**
- **Windows** 10/11 — WebView2 (usually preinstalled)
- **Ubuntu** 22.04 / 24.04 — WebKitGTK 4.1 dev packages (see below)

## Installation

### Ubuntu 22.04 / 24.04

```bash
sudo apt update
sudo apt install -y build-essential curl wget libssl-dev libgtk-3-dev \
  libayatana-appindicator3-dev librsvg2-dev libwebkit2gtk-4.1-dev \
  patchelf pkg-config libglib2.0-dev libgdk-pixbuf2.0-dev \
  libpango1.0-dev libatk1.0-dev libcairo2-dev
```

Then:

```bash
git clone https://github.com/joopererer/uni_pin.git
cd uni_pin
npm install
npm run tauri build
```

Artifacts: `src-tauri/target/release/bundle/deb/*.deb`, `bundle/appimage/*.AppImage`.

### Build from Source (any supported host)

```bash
git clone https://github.com/joopererer/uni_pin.git
cd uni_pin
npm install
npm run tauri dev    # development
npm run tauri build  # production installers under src-tauri/target/release/bundle/
```

## Usage

1. **Launch** — Tray icon (Windows: notification area).
2. **New note** — Left-click tray or **Alt+N**.
3. **Management Center** — Left-click tray → manage all notes.
4. **Edit** — Double-click a note.
5. **Images** — Ctrl+V paste or toolbar image button.
6. **Themes / opacity / pin** — Hover toolbar controls.
7. **Hide** — Minimize strip on the note; **Delete** — trash icon.

### Shortcuts

- **Alt+N** — New note (global; may require X11 / compositor cooperation on Linux).

### Management Center

- Search, batch show/hide/delete  
- Settings: language (中文 / English), auto-start  

## Project Structure

```
uni_pin/
├── src/                    # React + Vite
├── src-tauri/              # Rust — tray, IPC, updater, persistence
├── .github/workflows/      # ci.yml, release.yml, test.yml (legacy branches)
├── package.json
└── vite.config.ts
```

## Data storage

| Platform | Notes & settings | Images |
|----------|-----------------|--------|
| Windows | `%LocalAppData%\UniPin\notes.json` | `%LocalAppData%\UniPin\images\` |
| Linux | `~/.local/share/UniPin/notes.json` (via XDG data local) | `~/.local/share/UniPin/images/` |

Paths follow the [`dirs`](https://docs.rs/dirs/) crate (`data_local_dir` + `/UniPin`).

## Core API snapshot

Rust commands (`src-tauri/src/lib.rs`) include `create_note_window`, `save_note`, tray-related flows, **`get_clipboard_image`**, and **`check_update`** (GitHub Releases). Frontend uses `@tauri-apps/api` `invoke()`.

See source for full typings.

## Development

```bash
npm run test        # frontend (Vitest) when enabled
cd src-tauri && cargo test
```

### Build Release locally

```bash
npm run tauri build
```

## Contributing

Pull requests welcome.

## License

Copyright © 2026 UniPin. All rights reserved.

## Author & links

- [joopererer](https://github.com/joopererer)  
- [Issues](https://github.com/joopererer/uni_pin/issues)  

---

Built with [Tauri](https://tauri.app/), [React](https://react.dev/), [Vite](https://vitejs.dev/).
