# 便签应用 (Sticky Notes)

基于 Tauri v2 + React 的 Windows 桌面便签应用。

## 特性

- 🎯 **系统托盘驻留** - 应用启动后驻留在系统托盘，不占用任务栏
- 📝 **无边框便签** - 创建美观的无边框、透明背景便签窗口
- 🔝 **始终置顶** - 便签窗口始终显示在最前面
- 🖱️ **拖拽移动** - 通过标题栏拖拽移动便签位置
- 💾 **自动保存** - 便签内容自动保存到本地存储

## 开发环境要求

- Node.js 18+
- Rust 1.70+
- Windows 10/11

## 安装依赖

```bash
npm install
```

## 开发运行

```bash
npm run tauri dev
```

## 构建发布

```bash
npm run tauri build
```

## 使用说明

1. 启动应用后，程序会驻留在系统托盘（右下角）
2. **左键单击托盘图标** - 创建新便签
3. **右键单击托盘图标** - 打开菜单
   - 📝 新建便签
   - 📋 显示全部
   - 🔽 隐藏全部
   - ❌ 退出

## 项目结构

```
photo_stick/
├── src/                    # React 前端代码
│   ├── components/
│   │   └── StickyNote.tsx  # 便签组件
│   ├── App.tsx
│   ├── main.tsx
│   └── styles.css
├── src-tauri/              # Tauri/Rust 后端代码
│   ├── src/
│   │   ├── lib.rs          # 核心逻辑：托盘、窗口管理
│   │   └── main.rs         # 入口文件
│   ├── icons/              # 应用图标
│   ├── capabilities/       # 权限配置
│   ├── Cargo.toml
│   └── tauri.conf.json
├── package.json
└── vite.config.ts
```

## 核心 API

### Rust 命令

```rust
// 创建新便签窗口
#[tauri::command]
fn create_note_window(app: AppHandle) -> Result<String, String>

// 关闭便签窗口
#[tauri::command]
fn close_note_window(app: AppHandle, label: String) -> Result<(), String>

// 获取所有便签窗口
#[tauri::command]
fn get_all_note_windows(app: AppHandle) -> Vec<String>
```

### 前端调用

```typescript
import { invoke } from "@tauri-apps/api/core";

// 创建新便签
const label = await invoke("create_note_window");

// 关闭便签
await invoke("close_note_window", { label: "note-1" });

// 获取所有便签
const notes = await invoke("get_all_note_windows");
```
