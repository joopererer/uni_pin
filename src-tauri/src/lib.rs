mod note_store;
pub mod updater;

use note_store::{load_notes, save_notes, NoteData, NoteStoreState, WindowPosition, WindowSize, get_images_dir};
use updater::{check_for_updates, GitHubRelease};
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder, LogicalPosition, LogicalSize,
};
use image::GenericImageView;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use uuid::Uuid;
use base64::Engine;

/// 使用 UUID 生成唯一的窗口标签
fn generate_window_label() -> String {
    format!("note-{}", Uuid::new_v4())
}

/// 创建一个新的便签窗口（内部使用）
fn create_note_window_internal(app: &AppHandle, note_data: Option<&NoteData>) -> Result<String, String> {
    let (window_label, position, size, always_on_top) = match note_data {
        Some(data) => (
            data.id.clone(),
            Some((data.position.x, data.position.y)),
            (data.size.width, data.size.height),
            data.always_on_top,
        ),
        None => (generate_window_label(), None, (280.0, 320.0), false), // 默认不置顶
    };

    let mut builder = WebviewWindowBuilder::new(
        app,
        &window_label,
        WebviewUrl::App("index.html".into()),
    )
    .title("便签")
    .inner_size(size.0, size.1)
    .min_inner_size(200.0, 150.0)
    .decorations(false)
    .transparent(true)
    .always_on_top(always_on_top)
    .skip_taskbar(true)
    .resizable(true)
    .visible(false)
    .focused(true);

    if let Some((x, y)) = position {
        builder = builder.position(x, y);
    } else {
        builder = builder.center();
    }

    let _window = builder
        .build()
        .map_err(|e| format!("创建窗口失败: {}", e))?;

    if note_data.is_none() {
        if let Some(state) = app.try_state::<NoteStoreState>() {
            let mut store = state.0.lock().unwrap();
            store.notes.insert(window_label.clone(), NoteData::new(window_label.clone()));
            let _ = save_notes(&store);
        }
    }

    println!("📝 创建便签窗口: {}", window_label);
    Ok(window_label)
}

/// 创建管理中心窗口
fn create_manager_window(app: &AppHandle) -> Result<(), String> {
    // 检查是否已存在
    if app.get_webview_window("manager").is_some() {
        if let Some(w) = app.get_webview_window("manager") {
            let _ = w.show();
            let _ = w.set_focus();
        }
        return Ok(());
    }

    WebviewWindowBuilder::new(
        app,
        "manager",
        WebviewUrl::App("manager.html".into()),
    )
    .title("UniStick 管理中心")
    .inner_size(600.0, 500.0)
    .min_inner_size(400.0, 300.0)
    .decorations(true)
    .transparent(false)
    .resizable(true)
    .center()
    .build()
    .map_err(|e| format!("创建管理窗口失败: {}", e))?;

    Ok(())
}

#[tauri::command]
fn create_note_window(app: AppHandle) -> Result<String, String> {
    create_note_window_internal(&app, None)
}

#[tauri::command]
fn open_manager(app: AppHandle) -> Result<(), String> {
    create_manager_window(&app)
}

#[tauri::command]
fn show_note_window(app: AppHandle, id: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&id) {
        window.show().map_err(|e| format!("显示窗口失败: {}", e))?;
        window.set_focus().map_err(|e| format!("聚焦窗口失败: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn save_note(
    state: State<'_, NoteStoreState>,
    id: String,
    content: String,
    theme_index: u32,
) -> Result<(), String> {
    let mut store = state.0.lock().unwrap();
    
    if let Some(note) = store.notes.get_mut(&id) {
        note.content = content;
        note.theme_index = theme_index;
        save_notes(&store)?;
    } else {
        let mut note = NoteData::new(id.clone());
        note.content = content;
        note.theme_index = theme_index;
        store.notes.insert(id, note);
        save_notes(&store)?;
    }
    
    Ok(())
}

#[tauri::command]
fn update_note_position(
    state: State<'_, NoteStoreState>,
    id: String,
    x: f64,
    y: f64,
) -> Result<(), String> {
    let mut store = state.0.lock().unwrap();
    if let Some(note) = store.notes.get_mut(&id) {
        note.position = WindowPosition { x, y };
        save_notes(&store)?;
    }
    Ok(())
}

#[tauri::command]
fn update_note_size(
    state: State<'_, NoteStoreState>,
    id: String,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let mut store = state.0.lock().unwrap();
    if let Some(note) = store.notes.get_mut(&id) {
        note.size = WindowSize { width, height };
        save_notes(&store)?;
    }
    Ok(())
}

#[tauri::command]
fn update_note_opacity(
    _app: AppHandle,
    state: State<'_, NoteStoreState>,
    id: String,
    opacity: u32,
) -> Result<(), String> {
    let opacity = opacity.min(90); // 最大90%透明
    let mut store = state.0.lock().unwrap();
    if let Some(note) = store.notes.get_mut(&id) {
        note.opacity = opacity;
    }
    save_notes(&store)?;
    Ok(())
}

#[tauri::command]
fn toggle_always_on_top(
    app: AppHandle,
    state: State<'_, NoteStoreState>,
    id: String,
) -> Result<bool, String> {
    let new_state = {
        let mut store = state.0.lock().unwrap();
        if let Some(note) = store.notes.get_mut(&id) {
            note.always_on_top = !note.always_on_top;
            let state = note.always_on_top;
            save_notes(&store)?;
            state
        } else {
            return Err("便签不存在".to_string());
        }
    };
    
    // 更新窗口状态
    if let Some(window) = app.get_webview_window(&id) {
        window.set_always_on_top(new_state)
            .map_err(|e| format!("设置置顶失败: {}", e))?;
    }
    
    Ok(new_state)
}

#[tauri::command]
fn get_note(state: State<'_, NoteStoreState>, id: String) -> Option<NoteData> {
    let store = state.0.lock().unwrap();
    store.notes.get(&id).cloned()
}

#[tauri::command]
fn get_all_notes(state: State<'_, NoteStoreState>) -> Vec<NoteData> {
    let store = state.0.lock().unwrap();
    store.notes.values().cloned().collect()
}

#[tauri::command]
fn hide_note(app: AppHandle, state: State<'_, NoteStoreState>, id: String) -> Result<(), String> {
    // 隐藏窗口
    if let Some(window) = app.get_webview_window(&id) {
        window.hide().map_err(|e| format!("隐藏窗口失败: {}", e))?;
    }
    
    // 更新存储中的状态
    let mut store = state.0.lock().unwrap();
    if let Some(note) = store.notes.get_mut(&id) {
        note.closed = true;
        let _ = save_notes(&store);
    }
    
    Ok(())
}

#[tauri::command]
fn show_note(app: AppHandle, state: State<'_, NoteStoreState>, id: String) -> Result<(), String> {
    // 先更新存储中的状态
    {
        let mut store = state.0.lock().unwrap();
        if let Some(note) = store.notes.get_mut(&id) {
            note.closed = false;
            let _ = save_notes(&store);
        }
    }
    
    // 检查窗口是否存在
    if let Some(window) = app.get_webview_window(&id) {
        window.show().map_err(|e| format!("显示窗口失败: {}", e))?;
        window.set_focus().map_err(|e| format!("聚焦窗口失败: {}", e))?;
    } else {
        // 窗口不存在，需要重新创建
        let store = state.0.lock().unwrap();
        if let Some(note) = store.notes.get(&id) {
            let note_clone = note.clone();
            drop(store);
            create_note_window_internal(&app, Some(&note_clone))?;
        }
    }
    Ok(())
}

#[tauri::command]
fn delete_note(
    app: AppHandle,
    state: State<'_, NoteStoreState>,
    id: String,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&id) {
        window.close().map_err(|e| format!("关闭窗口失败: {}", e))?;
    }
    
    let mut store = state.0.lock().unwrap();
    store.notes.remove(&id);
    save_notes(&store)?;
    
    println!("🗑️ 删除便签: {}", id);
    Ok(())
}

#[tauri::command]
fn get_window_position(app: AppHandle, id: String) -> Result<(f64, f64), String> {
    if let Some(window) = app.get_webview_window(&id) {
        let physical_pos = window.outer_position()
            .map_err(|e| format!("获取位置失败: {}", e))?;
        let scale_factor = window.scale_factor()
            .map_err(|e| format!("获取缩放因子失败: {}", e))?;
        let logical_pos: LogicalPosition<f64> = physical_pos.to_logical(scale_factor);
        Ok((logical_pos.x, logical_pos.y))
    } else {
        Err("窗口不存在".to_string())
    }
}

#[tauri::command]
fn get_window_size(app: AppHandle, id: String) -> Result<(f64, f64), String> {
    if let Some(window) = app.get_webview_window(&id) {
        let physical_size = window.inner_size()
            .map_err(|e| format!("获取尺寸失败: {}", e))?;
        let scale_factor = window.scale_factor()
            .map_err(|e| format!("获取缩放因子失败: {}", e))?;
        let logical_size: LogicalSize<f64> = physical_size.to_logical(scale_factor);
        Ok((logical_size.width, logical_size.height))
    } else {
        Err("窗口不存在".to_string())
    }
}

#[tauri::command]
fn get_all_note_windows(app: AppHandle) -> Vec<String> {
    app.webview_windows()
        .keys()
        .filter(|label| label.starts_with("note-"))
        .cloned()
        .collect()
}

/// 保存图片到 AppData 目录（带压缩）
#[tauri::command]
fn save_image(image_data: String) -> Result<String, String> {
    // 解析 base64 数据
    let parts: Vec<&str> = image_data.split(',').collect();
    if parts.len() != 2 {
        return Err("无效的图片数据".to_string());
    }
    
    let base64_data = parts[1];
    let image_bytes = base64::engine::general_purpose::STANDARD.decode(base64_data)
        .map_err(|e| format!("解码失败: {}", e))?;
    
    // 加载图片
    let img = image::load_from_memory(&image_bytes)
        .map_err(|e| format!("加载图片失败: {}", e))?;
    
    // 限制最大尺寸 (800x800)
    let max_size = 800;
    let (width, height) = img.dimensions();
    let img = if width > max_size || height > max_size {
        let ratio = (max_size as f32 / width.max(height) as f32).min(1.0);
        let new_width = (width as f32 * ratio) as u32;
        let new_height = (height as f32 * ratio) as u32;
        img.resize(new_width, new_height, image::imageops::FilterType::Lanczos3)
    } else {
        img
    };
    
    // 生成文件名
    let filename = format!("{}.jpg", Uuid::new_v4());
    let filepath = get_images_dir().join(&filename);
    
    // 保存为 JPEG（压缩）
    img.save(&filepath)
        .map_err(|e| format!("保存图片失败: {}", e))?;
    
    // 返回文件路径
    Ok(filepath.to_string_lossy().to_string())
}

/// 获取自启动状态
#[tauri::command]
fn get_auto_start(state: State<'_, NoteStoreState>) -> bool {
    let store = state.0.lock().unwrap();
    store.settings.auto_start
}

/// 检查更新
#[tauri::command]
async fn check_update() -> Result<Option<GitHubRelease>, String> {
    check_for_updates().await
}

/// 设置自启动
#[tauri::command]
fn set_auto_start(state: State<'_, NoteStoreState>, enabled: bool) -> Result<(), String> {
    // 更新存储
    {
        let mut store = state.0.lock().unwrap();
        store.settings.auto_start = enabled;
        save_notes(&store)?;
    }
    
    // 配置 Windows 自启动
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let exe_path = std::env::current_exe()
            .map_err(|e| format!("获取程序路径失败: {}", e))?;
        
        if enabled {
            // 添加到注册表
            let _ = Command::new("reg")
                .args([
                    "add",
                    r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                    "/v", "StickyNotes",
                    "/t", "REG_SZ",
                    "/d", &exe_path.to_string_lossy(),
                    "/f"
                ])
                .output();
        } else {
            // 从注册表移除
            let _ = Command::new("reg")
                .args([
                    "delete",
                    r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                    "/v", "StickyNotes",
                    "/f"
                ])
                .output();
        }
    }
    
    Ok(())
}

fn restore_saved_notes(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let store = load_notes();
    let notes_to_restore: Vec<NoteData> = store.notes.values()
        .filter(|n| !n.closed)
        .cloned()
        .collect();
    
    app.manage(NoteStoreState(std::sync::Mutex::new(store)));
    
    let count = notes_to_restore.len();
    for note in notes_to_restore {
        match create_note_window_internal(app, Some(&note)) {
            Ok(_) => {}
            Err(e) => eprintln!("❌ 恢复便签 {} 失败: {}", note.id, e),
        }
    }
    
    if count > 0 {
        println!("🔄 已恢复 {} 个便签", count);
    }
    
    Ok(())
}

fn setup_global_shortcuts(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let shortcut_alt_n = Shortcut::new(Some(Modifiers::ALT), Code::KeyN);

    // 先检查并尝试注销可能已存在的快捷键
    let _ = app.global_shortcut().unregister(shortcut_alt_n);

    app.global_shortcut().on_shortcut(shortcut_alt_n, {
        let app_handle = app.clone();
        move |_app, shortcut, event| {
            if event.state == ShortcutState::Pressed 
                && shortcut == &Shortcut::new(Some(Modifiers::ALT), Code::KeyN) 
            {
                let _ = create_note_window_internal(&app_handle, None);
            }
        }
    })?;

    Ok(())
}

fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let new_note = MenuItem::with_id(app, "new_note", "📝 新建便签 (Alt+N)", true, None::<&str>)?;
    let manager = MenuItem::with_id(app, "manager", "📋 管理中心", true, None::<&str>)?;
    let show_all = MenuItem::with_id(app, "show_all", "👁️ 显示全部", true, None::<&str>)?;
    let hide_all = MenuItem::with_id(app, "hide_all", "🔽 隐藏全部", true, None::<&str>)?;
    let about = MenuItem::with_id(app, "about", "ℹ️ 关于", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "❌ 退出", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&new_note, &manager, &show_all, &hide_all, &about, &quit])?;

    let png_bytes = include_bytes!("../icons/32x32.png");
    let img = image::load_from_memory(png_bytes).expect("Failed to load icon");
    let (width, height) = img.dimensions();
    let rgba = img.into_rgba8().into_raw();
    let icon = Image::new_owned(rgba, width, height);

    let _tray = TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .tooltip("UniStick - 点击打开管理中心")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            handle_menu_event(app, event.id.as_ref());
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                let _ = create_manager_window(app);
            }
        })
        .build(app)?;

    Ok(())
}

fn handle_menu_event(app: &AppHandle, menu_id: &str) {
    match menu_id {
        "new_note" => {
            let _ = create_note_window_internal(app, None);
        }
        "manager" => {
            let _ = create_manager_window(app);
        }
        "show_all" => {
            // 显示所有便签并更新状态
            if let Some(state) = app.try_state::<NoteStoreState>() {
                let mut store = state.0.lock().unwrap();
                for (label, window) in app.webview_windows() {
                    if label.starts_with("note-") {
                        let _ = window.show();
                        if let Some(note) = store.notes.get_mut(&label) {
                            note.closed = false;
                        }
                    }
                }
                let _ = save_notes(&store);
            }
        }
        "hide_all" => {
            // 隐藏所有便签并更新状态
            if let Some(state) = app.try_state::<NoteStoreState>() {
                let mut store = state.0.lock().unwrap();
                for (label, window) in app.webview_windows() {
                    if label.starts_with("note-") {
                        let _ = window.hide();
                        if let Some(note) = store.notes.get_mut(&label) {
                            note.closed = true;
                        }
                    }
                }
                let _ = save_notes(&store);
            }
        }
        "about" => {
            let _ = create_manager_window(app);
            // 等待窗口加载后发送消息
            std::thread::spawn({
                let app = app.clone();
                move || {
                    std::thread::sleep(std::time::Duration::from_millis(300));
                    if let Some(window) = app.get_webview_window("manager") {
                        let _ = window.eval("if (window.showAboutDialog) window.showAboutDialog(); else window.dispatchEvent(new CustomEvent('showAbout'));");
                    }
                }
            });
        }
        "quit" => {
            app.exit(0);
        }
        _ => {}
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            create_note_window,
            open_manager,
            show_note_window,
            save_note,
            update_note_position,
            update_note_size,
            update_note_opacity,
            toggle_always_on_top,
            get_note,
            get_all_notes,
            hide_note,
            show_note,
            delete_note,
            get_window_position,
            get_window_size,
            get_all_note_windows,
            save_image,
            get_auto_start,
            set_auto_start,
            check_update
        ])
        .setup(|app| {
            restore_saved_notes(app.handle())?;
            setup_tray(app.handle())?;
            setup_global_shortcuts(app.handle())?;
            
            // 后台检查更新（非阻塞）
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                // 使用 tokio runtime 执行异步任务
                let rt = tokio::runtime::Runtime::new().unwrap();
                rt.block_on(async {
                    // 延迟 5 秒后检查更新，避免影响启动速度
                    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                    match check_for_updates().await {
                        Ok(Some(release)) => {
                            println!("🆕 发现新版本: {}", release.tag_name);
                            // 可以发送事件到前端显示更新提示
                            if let Some(window) = app_handle.get_webview_window("manager") {
                                let download_url = release.assets.first()
                                    .map(|a| a.browser_download_url.clone())
                                    .unwrap_or_default();
                                let _ = window.eval(&format!(
                                    "window.dispatchEvent(new CustomEvent('updateAvailable', {{ detail: {{ version: '{}', url: '{}', notes: '{}' }} }}));",
                                    release.tag_name,
                                    download_url,
                                    release.body.replace('\'', "\\'").replace('\n', "\\n")
                                ));
                            }
                        }
                        Ok(None) => {
                            println!("✅ 已是最新版本");
                        }
                        Err(e) => {
                            println!("⚠️ 检查更新失败: {}", e);
                        }
                    }
                });
            });
            
            println!("✨ UniStick 已启动！");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("运行 Tauri 应用时发生错误");
}
