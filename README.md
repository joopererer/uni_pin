# UniStick 📝

基于 Tauri v2 + React 的 Windows 桌面便签应用。

## ✨ 特性

### 核心功能
- 🎯 **系统托盘驻留** - 应用启动后驻留在系统托盘，不占用任务栏
- ⌨️ **全局快捷键** - 按 `Alt+N` 快速创建新便签（任何应用下都可用）
- 📝 **无边框便签** - 创建美观的无边框、透明背景便签窗口
- 📍 **窗口置顶** - 支持便签窗口置顶（默认不置顶）
- 🖱️ **拖拽移动** - 通过标题栏拖拽移动便签位置
- 🔍 **内容搜索** - 在管理中心搜索便签内容

### 便签功能
- 📝 **富文本编辑** - 支持文本编辑和格式化
- 🖼️ **图片支持** - 支持 Ctrl+V 粘贴图片或选择本地图片
- 🎨 **6种颜色主题** - 黄色、粉色、蓝色、绿色、橙色、紫色
- 💧 **透明度调节** - 0-90% 透明度可调
- 📦 **数据持久化** - 自动保存内容、位置、大小、主题、透明度
- 🔄 **自动恢复** - 启动时自动恢复未关闭的便签

### 管理功能
- 📋 **管理中心** - 集中管理所有便签
- ☑️ **批量操作** - 支持多选、全选、批量显示/隐藏/删除
- 🔍 **智能搜索** - 快速查找包含特定内容的便签
- ⚙️ **开机自启** - 支持设置开机自动启动

## 🛠️ 开发环境要求

- Node.js 18+
- Rust 1.70+
- Windows 10/11

## 📦 安装依赖

```bash
npm install
```

## 🚀 开发运行

```bash
npm run tauri dev
```

## 📦 构建发布

```bash
npm run tauri build
```

构建产物位于 `src-tauri/target/release/bundle/`

## 🔄 自动更新

应用会自动检查更新（启动 5 秒后后台检查）：
- 从 GitHub Releases 检查最新版本
- 发现新版本时会在管理中心显示更新提示
- 也可以在"关于"对话框中手动检查更新

## 🚢 CI/CD

项目配置了 GitHub Actions 自动构建和发布：

- **测试工作流** (`.github/workflows/test.yml`):
  - 在推送到 `master` 或 `dev` 分支时自动运行
  - 运行 Rust 单元测试
  - 运行前端 TypeScript 类型检查

- **发布工作流** (`.github/workflows/release.yml`):
  - 在推送到 `master` 分支或创建新 tag (`v*`) 时自动构建
  - 目前支持 Windows 平台
  - Mac 和 Linux 支持已配置但暂时禁用（等有对应开发者时启用）
  - 自动创建 GitHub Release 并上传安装包

### 手动触发发布

1. 更新版本号：
   - `package.json`: `version`
   - `src-tauri/Cargo.toml`: `version`
   - `src-tauri/tauri.conf.json`: `version`

2. 创建 Git tag:
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

3. GitHub Actions 会自动构建并创建 Release（Draft 状态）

4. 编辑 Release 说明后发布

## 🧪 测试

### Rust 测试

```bash
cd src-tauri
cargo test
```

### 前端测试

```bash
npm test              # 运行测试
npm run test:ui       # 运行测试 UI
npm run test:coverage # 生成覆盖率报告
```

## 📊 Firebase 集成

目前**未集成 Firebase**，原因请参考 [`.github/FIREBASE.md`](.github/FIREBASE.md)。

如果未来需要，可以考虑：
- 可选的匿名使用统计（需用户明确同意）
- 崩溃报告（仅在用户允许时收集）

## 📖 使用说明

### 基本操作

1. **启动应用** - 程序会驻留在系统托盘（右下角），点击托盘图标打开管理中心
2. **创建便签** - 
   - 按 `Alt+N` 快捷键（全局，任何应用下都可用）
   - 点击托盘图标
   - 在管理中心点击"新建便签"按钮
3. **编辑便签** - 
   - 直接点击便签内容区域即可编辑
   - 支持 Ctrl+V 粘贴图片
   - 点击工具栏 🖼️ 按钮选择本地图片
4. **管理便签** - 
   - 点击托盘图标打开管理中心
   - 搜索、批量操作、查看状态

### 快捷键

- `Alt+N` - 快速创建新便签
- `ESC` - 关闭确认对话框
- `双击便签` - 进入编辑模式

### 工具栏按钮

- 🖼️ - 添加图片
- 🎨 - 切换颜色主题
- 💧 - 调节透明度（0-90%）
- − - 隐藏便签（保留数据）
- 🗑️ - 删除便签（永久删除）

### 右键菜单

右键点击便签可访问：
- 📌 置顶/取消置顶
- 💧 调节透明度
- 🔽 隐藏便签
- 🗑️ 删除便签

## 📁 项目结构

```
uni-stick/
├── src/                      # React 前端代码
│   ├── components/
│   │   ├── Note.tsx          # 便签组件
│   │   ├── Manager.tsx       # 管理中心组件
│   │   ├── ConfirmDialog.tsx # 确认对话框
│   │   └── AboutDialog.tsx   # 关于对话框
│   ├── App.tsx
│   ├── main.tsx
│   ├── manager.tsx           # 管理中心入口
│   └── styles.css
├── src-tauri/                # Tauri/Rust 后端代码
│   ├── src/
│   │   ├── lib.rs            # 核心逻辑
│   │   ├── main.rs           # 入口文件
│   │   └── note_store.rs     # 数据存储
│   ├── icons/                # 应用图标
│   ├── capabilities/         # 权限配置
│   ├── Cargo.toml
│   └── tauri.conf.json
├── package.json
├── vite.config.ts
└── README.md
```

## 🔧 技术栈

- **前端**: React + TypeScript + Vite
- **后端**: Rust + Tauri v2
- **存储**: JSON 文件（本地 AppData 目录）
- **图片处理**: image 库（自动压缩、格式转换）

## 📝 数据存储

应用数据存储在：
- Windows: `%LOCALAPPDATA%\sticky-notes\`
  - `notes.json` - 便签数据
  - `images/` - 图片文件（自动压缩保存）

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

---

**UniStick** - 简洁、高效的桌面便签应用
