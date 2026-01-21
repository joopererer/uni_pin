# UniPin 📝

A lightweight desktop sticky notes application built with Tauri v2 and React.

**Version: 0.2.0**

## Features

- 🎯 **System Tray Integration** - Runs in the system tray, no taskbar clutter
- 📝 **Borderless Notes** - Create beautiful borderless, transparent sticky note windows
- 🖼️ **Image Support** - Paste or insert images into notes (Ctrl+V)
- 🎨 **Color Themes** - 6 beautiful color themes to choose from
- 💧 **Opacity Control** - Adjust note transparency (0-90%)
- 📍 **Always on Top** - Pin notes to stay above all windows
- 🔍 **Search** - Search through all notes by content
- ⚙️ **Auto Start** - Launch with Windows
- 🌐 **Multi-language** - Supports Chinese and English
- ⌨️ **Global Shortcut** - Press Alt+N to quickly create a new note

## Requirements

- Node.js 18+
- Rust 1.70+
- Windows 10/11 (macOS and Linux support coming soon)

## Installation

### Build from Source

1. Clone the repository:
```bash
git clone https://github.com/joopererer/uni_pin.git
cd uni_pin
```

2. Install dependencies:
```bash
npm install
```

3. Run in development mode:
```bash
npm run tauri dev
```

4. Build for production:
```bash
npm run tauri build
```

The installer will be generated in `src-tauri/target/release/bundle/nsis/`.

## Usage

1. **Launch** - The application runs in the system tray (bottom-right corner)
2. **Create Note** - Left-click the tray icon or press Alt+N
3. **Manage Notes** - Left-click the tray icon to open the Management Center
4. **Edit Notes** - Double-click a note to edit, toolbar appears on hover
5. **Add Images** - Paste images with Ctrl+V or click the image button
6. **Change Theme** - Click the color button to cycle through themes
7. **Adjust Opacity** - Use the opacity slider in the toolbar
8. **Pin Note** - Right-click and select "Pin Window" to keep it on top
9. **Hide Note** - Click the minimize button (-) to hide a note
10. **Delete Note** - Click the delete button (🗑️) to remove a note

### Keyboard Shortcuts

- `Alt + N` - Create a new note

### Management Center

- View all notes (visible and hidden)
- Search notes by content
- Batch operations (show/hide/delete)
- Settings:
  - Auto-start with system
  - Language selection (中文 / English)

## Project Structure

```
uni_pin/
├── src/                    # React frontend
│   ├── components/
│   │   ├── Note.tsx       # Sticky note component
│   │   ├── Manager.tsx    # Management center
│   │   ├── AboutDialog.tsx
│   │   ├── UpdateDialog.tsx
│   │   └── ConfirmDialog.tsx
│   ├── hooks/
│   │   └── useI18n.ts     # Internationalization hook
│   ├── i18n/
│   │   └── index.ts       # Translation files
│   ├── App.tsx
│   ├── main.tsx
│   └── styles.css
├── src-tauri/              # Tauri/Rust backend
│   ├── src/
│   │   ├── lib.rs         # Core logic: tray, windows, commands
│   │   ├── main.rs        # Entry point
│   │   ├── note_store.rs  # Data persistence
│   │   └── updater.rs     # Update checker
│   ├── icons/             # Application icons
│   ├── capabilities/      # Permissions configuration
│   ├── Cargo.toml
│   └── tauri.conf.json
├── package.json
└── vite.config.ts
```

## Core API

### Rust Commands

```rust
// Create a new note window
#[tauri::command]
fn create_note_window(app: AppHandle) -> Result<String, String>

// Save note content
#[tauri::command]
fn save_note(state: State<'_, NoteStoreState>, id: String, content: String, theme_index: u32) -> Result<(), String>

// Update note position
#[tauri::command]
fn update_note_position(state: State<'_, NoteStoreState>, id: String, x: f64, y: f64) -> Result<(), String>

// Get all notes
#[tauri::command]
fn get_all_notes(state: State<'_, NoteStoreState>) -> Vec<NoteData>

// Check for updates
#[tauri::command]
async fn check_update() -> Result<Option<serde_json::Value>, String>
```

### Frontend Usage

```typescript
import { invoke } from "@tauri-apps/api/core";

// Create a new note
const label = await invoke("create_note_window");

// Save note content
await invoke("save_note", { 
  id: "note-1", 
  content: "<p>Hello World</p>", 
  themeIndex: 0 
});

// Get all notes
const notes = await invoke("get_all_notes");
```

## Data Storage

- **Notes Data**: `%LocalAppData%/UniPin/notes.json`
- **Images**: `%LocalAppData%/UniPin/images/`

## Development

### Run Tests

```bash
# Frontend tests
npm run test

# Rust tests
cd src-tauri
cargo test
```

### Build Release

```bash
npm run tauri build
```

This will create a Windows installer in `src-tauri/target/release/bundle/nsis/`.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

Copyright © 2026 UniPin. All rights reserved.

## Author

[joopererer](https://github.com/joopererer)

## Links

- **Repository**: https://github.com/joopererer/uni_pin
- **Issues**: https://github.com/joopererer/uni_pin/issues

## Acknowledgments

Built with:
- [Tauri](https://tauri.app/) - Framework for building desktop applications
- [React](https://react.dev/) - UI library
- [Vite](https://vitejs.dev/) - Build tool
