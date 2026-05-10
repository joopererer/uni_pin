mod note_store;
pub mod updater;

use note_store::{load_notes, save_notes, NoteData, NoteStoreState, WindowPosition, WindowSize, get_images_dir, write_log as write_log_file, get_log_path as get_log_file_path};
use updater::{check_for_updates, download_url_for_current_platform};
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder, LogicalPosition, LogicalSize,
};
use image::GenericImageView;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use uuid::Uuid;
use base64::Engine;

/// 使用 UUID 生成唯一的窗口标签
fn generate_window_label() -> String {
    format!("note-{}", Uuid::new_v4())
}

/// 创建一个新的便签窗口（内部使用）
fn create_note_window_internal(app: &AppHandle, note_data: Option<&NoteData>) -> Result<String, String> {
    let (window_label, position, size, always_on_top, should_show) = match note_data {
        Some(data) => (
            data.id.clone(),
            Some((data.position.x, data.position.y)),
            (data.size.width, data.size.height),
            data.always_on_top,
            !data.closed, // 如果便签状态是未关闭，应该显示
        ),
        None => (generate_window_label(), None, (280.0, 320.0), false, true), // 新创建的便签默认显示
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
    .visible(should_show) // 根据便签状态决定是否显示
    .focused(should_show); // 如果需要显示，也聚焦

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

    println!("📝 创建便签窗口: {} (显示: {})", window_label, should_show);
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
    .title("管理中心") // 标题将通过 i18n 在前端设置
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
        // 窗口存在，直接显示
        window.show().map_err(|e| format!("显示窗口失败: {}", e))?;
        window.set_focus().map_err(|e| format!("聚焦窗口失败: {}", e))?;
        println!("✅ 显示便签窗口: {}", id);
    } else {
        // 窗口不存在，需要重新创建
        println!("⚠️ 窗口不存在，重新创建: {}", id);
        let store = state.0.lock().unwrap();
        if let Some(note) = store.notes.get(&id) {
            let note_clone = note.clone();
            drop(store);
            let window_label = create_note_window_internal(&app, Some(&note_clone))?;
            // 创建后等待一小段时间再显示，确保窗口完全初始化
            std::thread::sleep(std::time::Duration::from_millis(150));
            if let Some(window) = app.get_webview_window(&window_label) {
                window.show().map_err(|e| format!("显示新创建的窗口失败: {}", e))?;
                window.set_focus().map_err(|e| format!("聚焦窗口失败: {}", e))?;
                println!("✅ 新窗口已显示: {}", window_label);
            } else {
                return Err(format!("窗口创建后立即查找失败: {}", window_label));
            }
        } else {
            return Err(format!("便签数据不存在: {}", id));
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
    // 先移除焦点，避免关闭窗口后自动focus到其他窗口
    if let Some(window) = app.get_webview_window(&id) {
        // 先隐藏窗口，这样关闭时不会触发焦点转移
        let _ = window.hide();
        // 等待一小段时间，确保窗口隐藏后再关闭
        std::thread::sleep(std::time::Duration::from_millis(50));
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

/// 从系统剪贴板读取图片（Windows / Linux / macOS，含 Ubuntu X11 与 Wayland）
#[tauri::command]
fn get_clipboard_image() -> Result<Option<String>, String> {
    println!("[后端] === get_clipboard_image 开始 ===");

    let mut clipboard = match arboard::Clipboard::new() {
        Ok(c) => c,
        Err(e) => {
            println!("[后端] ✗ 无法打开剪贴板: {:?}", e);
            return Ok(None);
        }
    };

    let img = match clipboard.get_image() {
        Ok(i) => i,
        Err(arboard::Error::ContentNotAvailable) => {
            println!("[后端] 剪贴板中无图片");
            return Ok(None);
        }
        Err(e) => {
            println!("[后端] ✗ 读取剪贴板图片失败: {:?}", e);
            return Ok(None);
        }
    };

    let width = img.width as u32;
    let height = img.height as u32;
    let expected = (width as usize).saturating_mul(height as usize).saturating_mul(4);

    if width == 0 || height == 0 || img.bytes.len() < expected {
        println!(
            "[后端] ✗ RGBA 数据无效 ({}x{}, {} 字节)",
            width,
            height,
            img.bytes.len()
        );
        return Ok(None);
    }

    let mut raw: Vec<u8> = img.bytes.into_owned();
    if raw.len() > expected {
        raw.truncate(expected);
    }

    let rgba = match image::RgbaImage::from_raw(width, height, raw) {
        Some(i) => i,
        None => {
            println!("[后端] ✗ 无法构造 RGBA 图像");
            return Ok(None);
        }
    };

    let dynamic = image::DynamicImage::ImageRgba8(rgba);
    let (w, h) = dynamic.dimensions();
    let max_size = 800_u32;
    let processed_img = if w > max_size || h > max_size {
        let ratio = (max_size as f32 / w.max(h) as f32).min(1.0);
        let new_width = (w as f32 * ratio) as u32;
        let new_height = (h as f32 * ratio) as u32;
        println!(
            "[后端] 图片过大，缩放至: {}x{} 像素",
            new_width, new_height
        );
        dynamic.resize(
            new_width,
            new_height,
            image::imageops::FilterType::Lanczos3,
        )
    } else {
        println!("[后端] ✓ 图片: {}x{} 像素", w, h);
        dynamic
    };

    let mut png_bytes = Vec::new();
    {
        use image::ImageEncoder;
        let encoder = image::codecs::png::PngEncoder::new(&mut png_bytes);
        encoder
            .write_image(
                processed_img.as_bytes(),
                processed_img.width(),
                processed_img.height(),
                processed_img.color(),
            )
            .map_err(|e| {
                println!("[后端] ✗ PNG 编码失败: {}", e);
                format!("编码 PNG 失败: {}", e)
            })?;
    }

    let base64_data = base64::engine::general_purpose::STANDARD.encode(&png_bytes);
    println!(
        "[后端] ✓ get_clipboard_image 完成，PNG {} 字节",
        png_bytes.len()
    );
    Ok(Some(format!(
        "data:image/png;base64,{}",
        base64_data
    )))
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

/// 写入日志到文件（前端调用）
#[tauri::command]
fn write_log(message: String) -> Result<(), String> {
    write_log_file(&message);
    Ok(())
}

/// 获取日志文件路径（前端调用）
#[tauri::command]
fn get_log_path() -> Result<String, String> {
    Ok(get_log_file_path().to_string_lossy().to_string())
}

/// 读取图片文件并返回 base64 数据（用于创建 Blob URL）
#[tauri::command]
fn read_image_file(file_path: String) -> Result<String, String> {
    use std::fs;
    use std::path::Path;
    use base64::Engine;
    
    println!("[后端] read_image_file: 读取文件: {}", file_path);
    
    // 规范化路径：处理 Windows 路径格式
    let path = Path::new(&file_path);
    
    // 检查文件是否存在
    if !path.exists() {
        return Err(format!("文件不存在: {}", file_path));
    }
    
    // 检查是否是文件（不是目录）
    if !path.is_file() {
        return Err(format!("路径不是文件: {}", file_path));
    }
    
    // 读取文件
    let file_bytes = fs::read(&file_path)
        .map_err(|e| format!("读取文件失败: {} (路径: {})", e, file_path))?;
    
    if file_bytes.is_empty() {
        return Err(format!("文件为空: {}", file_path));
    }
    
    println!("[后端] read_image_file: 成功读取文件，大小: {} 字节", file_bytes.len());
    
    // 转换为 base64
    let base64_data = base64::engine::general_purpose::STANDARD.encode(&file_bytes);
    
    // 根据文件扩展名确定 MIME 类型
    let mime_type = if let Some(ext) = path.extension() {
        let ext_lower = ext.to_string_lossy().to_lowercase();
        match ext_lower.as_str() {
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "gif" => "image/gif",
            "webp" => "image/webp",
            _ => "image/jpeg", // 默认
        }
    } else {
        "image/jpeg" // 默认
    };
    
    println!("[后端] read_image_file: MIME 类型: {}, base64 长度: {}", mime_type, base64_data.len());
    
    // 返回 data URL 格式
    Ok(format!("data:{};base64,{}", mime_type, base64_data))
}

/// 获取自启动状态
#[tauri::command]
fn get_auto_start(app: AppHandle) -> Result<bool, String> {
    let autostart_manager = app.autolaunch();
    autostart_manager.is_enabled().map_err(|e| format!("检查自启动状态失败: {}", e))
}

/// 获取语言设置
#[tauri::command]
fn get_language(state: State<'_, NoteStoreState>) -> String {
    let store = state.0.lock().unwrap();
    store.settings.language.clone()
}

/// 设置语言
#[tauri::command]
fn set_language(state: State<'_, NoteStoreState>, language: String) -> Result<(), String> {
    // 验证语言代码
    if language != "zh" && language != "en" {
        return Err("不支持的语言代码，仅支持 zh 和 en".to_string());
    }
    
    {
        let mut store = state.0.lock().unwrap();
        store.settings.language = language;
        save_notes(&store)?;
    }
    
    Ok(())
}

/// 获取菜单栏自动显示模式
#[tauri::command]
fn get_auto_show_toolbar(state: State<'_, NoteStoreState>) -> bool {
    let store = state.0.lock().unwrap();
    store.settings.auto_show_toolbar
}

/// 设置菜单栏自动显示模式
#[tauri::command]
fn set_auto_show_toolbar(app: AppHandle, state: State<'_, NoteStoreState>, enabled: bool) -> Result<(), String> {
    {
        let mut store = state.0.lock().unwrap();
        store.settings.auto_show_toolbar = enabled;
        save_notes(&store)?;
    }
    
    // 通知所有便签窗口设置已更改
    for (label, window) in app.webview_windows() {
        if label.starts_with("note-") {
            let _ = window.eval(&format!(
                "window.dispatchEvent(new CustomEvent('toolbarSettingChanged', {{ detail: {{ autoShow: {} }} }}));",
                enabled
            ));
        }
    }
    
    println!("✅ 菜单栏自动显示模式已设置为: {}", enabled);
    Ok(())
}

/// 检查更新
#[tauri::command]
async fn check_update() -> Result<Option<serde_json::Value>, String> {
    match check_for_updates().await {
        Ok(Some(release)) => {
            let download_url = download_url_for_current_platform(&release).unwrap_or_default();
            
            Ok(Some(serde_json::json!({
                "version": release.tag_name,
                "downloadUrl": download_url,
                "notes": release.body
            })))
        }
        Ok(None) => Ok(None),
        Err(e) => Err(e),
    }
}

/// 设置自启动
#[tauri::command]
fn set_auto_start(app: AppHandle, state: State<'_, NoteStoreState>, enabled: bool) -> Result<(), String> {
    let autostart_manager = app.autolaunch();
    
    // 使用 Tauri autostart 插件设置自启动
    if enabled {
        autostart_manager
            .enable()
            .map_err(|e| format!("启用自启动失败: {}", e))?;
        println!("✅ 已启用自启动");
    } else {
        autostart_manager
            .disable()
            .map_err(|e| format!("禁用自启动失败: {}", e))?;
        println!("✅ 已禁用自启动");
    }
    
    // 更新存储中的设置状态
    {
        let mut store = state.0.lock().unwrap();
        store.settings.auto_start = enabled;
        save_notes(&store)?;
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
            Ok(window_label) => {
                println!("✅ 已恢复便签窗口: {} (应该已显示)", window_label);
            }
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

    let menu = Menu::with_items(
        app,
        &[&new_note, &manager, &show_all, &hide_all, &about, &quit],
    )?;

    let png_bytes = include_bytes!("../icons/32x32.png");
    let img = image::load_from_memory(png_bytes).expect("Failed to load icon");
    let (width, height) = img.dimensions();
    let rgba = img.into_rgba8().into_raw();
    let icon = Image::new_owned(rgba, width, height);

    let _tray = TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .tooltip("UniPin - 点击打开管理中心")
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
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![])))
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
            read_image_file,
            get_clipboard_image,
            get_auto_start,
            set_auto_start,
            get_language,
            set_language,
            get_auto_show_toolbar,
            set_auto_show_toolbar,
            check_update,
            write_log,
            get_log_path
        ])
        .setup(|app| {
            // 测试日志系统是否正常工作
            let log_path = get_log_file_path();
            write_log_file(&format!("✨ UniPin 应用启动 - 日志系统测试 (日志文件路径: {})", log_path.display()));
            
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
                            write_log_file(&format!("🆕 发现新版本: {}", release.tag_name));
                            // 可以发送事件到前端显示更新提示
                            if let Some(window) = app_handle.get_webview_window("manager") {
                                let download_url =
                                    download_url_for_current_platform(&release).unwrap_or_default();
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
                            write_log_file("✅ 已是最新版本");
                        }
                        Err(e) => {
                            println!("⚠️ 检查更新失败: {}", e);
                            write_log_file(&format!("⚠️ 检查更新失败: {}", e));
                        }
                    }
                });
            });
            
            println!("✨ UniPin 已启动！");
            write_log_file("✨ UniPin 已启动！");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("运行 Tauri 应用时发生错误");
}
