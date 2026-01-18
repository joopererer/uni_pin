mod note_store;

use note_store::{load_notes, save_notes, NoteData, NoteStoreState, WindowPosition, WindowSize};
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder, LogicalPosition, LogicalSize,
};
use image::GenericImageView;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use uuid::Uuid;

/// 使用 UUID 生成唯一的窗口标签
fn generate_window_label() -> String {
    format!("note-{}", Uuid::new_v4())
}

/// 创建一个新的便签窗口（内部使用）
fn create_note_window_internal(app: &AppHandle, note_data: Option<&NoteData>) -> Result<String, String> {
    let (window_label, position, size) = match note_data {
        Some(data) => (
            data.id.clone(),
            Some((data.position.x, data.position.y)),
            (data.size.width, data.size.height),
        ),
        None => (generate_window_label(), None, (280.0, 320.0)),
    };

    // 创建窗口构建器 - 初始不可见，等前端加载完成后再显示
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
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(true)
    .visible(false)  // 初始不可见
    .focused(true);

    // 设置位置（使用逻辑坐标）
    if let Some((x, y)) = position {
        builder = builder.position(x, y);
    } else {
        builder = builder.center();
    }

    let _window = builder
        .build()
        .map_err(|e| format!("创建窗口失败: {}", e))?;

    // 如果是新便签，添加到存储
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

/// Tauri 命令：创建新便签窗口
#[tauri::command]
fn create_note_window(app: AppHandle) -> Result<String, String> {
    create_note_window_internal(&app, None)
}

/// Tauri 命令：显示窗口（前端加载完成后调用）
#[tauri::command]
fn show_note_window(app: AppHandle, id: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&id) {
        window.show().map_err(|e| format!("显示窗口失败: {}", e))?;
        window.set_focus().map_err(|e| format!("聚焦窗口失败: {}", e))?;
    }
    Ok(())
}

/// Tauri 命令：保存便签数据
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

/// Tauri 命令：更新便签窗口位置（接收逻辑坐标）
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

/// Tauri 命令：更新便签窗口大小
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

/// Tauri 命令：获取便签数据
#[tauri::command]
fn get_note(state: State<'_, NoteStoreState>, id: String) -> Option<NoteData> {
    let store = state.0.lock().unwrap();
    store.notes.get(&id).cloned()
}

/// Tauri 命令：隐藏便签窗口（不删除数据）
#[tauri::command]
fn hide_note(app: AppHandle, id: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&id) {
        window.hide().map_err(|e| format!("隐藏窗口失败: {}", e))?;
    }
    println!("🔽 隐藏便签: {}", id);
    Ok(())
}

/// Tauri 命令：删除便签（永久删除）
#[tauri::command]
fn delete_note(
    app: AppHandle,
    state: State<'_, NoteStoreState>,
    id: String,
) -> Result<(), String> {
    // 关闭窗口
    if let Some(window) = app.get_webview_window(&id) {
        window.close().map_err(|e| format!("关闭窗口失败: {}", e))?;
    }
    
    // 从存储中删除
    let mut store = state.0.lock().unwrap();
    store.notes.remove(&id);
    save_notes(&store)?;
    
    println!("🗑️ 删除便签: {}", id);
    Ok(())
}

/// Tauri 命令：获取窗口的逻辑坐标位置
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

/// Tauri 命令：获取窗口的逻辑尺寸
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

/// Tauri 命令：获取所有便签窗口的标签
#[tauri::command]
fn get_all_note_windows(app: AppHandle) -> Vec<String> {
    app.webview_windows()
        .keys()
        .filter(|label| label.starts_with("note-"))
        .cloned()
        .collect()
}

/// 恢复之前保存的便签窗口
fn restore_saved_notes(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let store = load_notes();
    let notes_to_restore: Vec<NoteData> = store.notes.values()
        .filter(|n| !n.closed)
        .cloned()
        .collect();
    
    // 存储到状态
    app.manage(NoteStoreState(std::sync::Mutex::new(store)));
    
    // 恢复窗口
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

/// 设置全局快捷键
fn setup_global_shortcuts(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let shortcut_alt_n = Shortcut::new(Some(Modifiers::ALT), Code::KeyN);

    app.global_shortcut().on_shortcut(shortcut_alt_n, {
        let app_handle = app.clone();
        move |_app, shortcut, event| {
            if event.state == ShortcutState::Pressed 
                && shortcut == &Shortcut::new(Some(Modifiers::ALT), Code::KeyN) 
            {
                println!("⌨️  快捷键 Alt+N 触发");
                match create_note_window_internal(&app_handle, None) {
                    Ok(label) => println!("✅ 通过快捷键创建便签: {}", label),
                    Err(e) => eprintln!("❌ 创建便签失败: {}", e),
                }
            }
        }
    })?;

    println!("⌨️  已注册全局快捷键: Alt+N (创建新便签)");
    Ok(())
}

/// 设置系统托盘
fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let new_note = MenuItem::with_id(app, "new_note", "📝 新建便签 (Alt+N)", true, None::<&str>)?;
    let show_all = MenuItem::with_id(app, "show_all", "📋 显示全部", true, None::<&str>)?;
    let hide_all = MenuItem::with_id(app, "hide_all", "🔽 隐藏全部", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "❌ 退出", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&new_note, &show_all, &hide_all, &quit])?;

    let png_bytes = include_bytes!("../icons/32x32.png");
    let img = image::load_from_memory(png_bytes).expect("Failed to load icon");
    let (width, height) = img.dimensions();
    let rgba = img.into_rgba8().into_raw();
    let icon = Image::new_owned(rgba, width, height);

    let _tray = TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .tooltip("便签应用 - Alt+N 创建新便签")
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
                let _ = create_note_window_internal(app, None);
            }
        })
        .build(app)?;

    println!("🔔 系统托盘已设置");
    Ok(())
}

/// 处理托盘菜单事件
fn handle_menu_event(app: &AppHandle, menu_id: &str) {
    match menu_id {
        "new_note" => {
            let _ = create_note_window_internal(app, None);
        }
        "show_all" => {
            for (label, window) in app.webview_windows() {
                if label.starts_with("note-") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        }
        "hide_all" => {
            for (label, window) in app.webview_windows() {
                if label.starts_with("note-") {
                    let _ = window.hide();
                }
            }
        }
        "quit" => {
            app.exit(0);
        }
        _ => {}
    }
}

/// 运行 Tauri 应用
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            create_note_window,
            show_note_window,
            save_note,
            update_note_position,
            update_note_size,
            get_note,
            hide_note,
            delete_note,
            get_window_position,
            get_window_size,
            get_all_note_windows
        ])
        .setup(|app| {
            // 恢复保存的便签（这也会初始化状态）
            restore_saved_notes(app.handle())?;
            
            // 设置系统托盘
            setup_tray(app.handle())?;

            // 设置全局快捷键
            setup_global_shortcuts(app.handle())?;
            
            println!("✨ 便签应用已启动！");
            println!("📌 点击系统托盘图标创建新便签");
            println!("⌨️  按 Alt+N 快速创建新便签");
            println!("📋 右键托盘图标查看菜单");
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("运行 Tauri 应用时发生错误");
}
