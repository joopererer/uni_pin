use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WebviewUrl, WebviewWindowBuilder,
};
use image::GenericImageView;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use uuid::Uuid;

/// 使用 UUID 生成唯一的窗口标签
fn generate_window_label() -> String {
    format!("note-{}", Uuid::new_v4().to_string())
}

/// 创建一个新的便签窗口
fn create_note_window_internal(app: &AppHandle) -> Result<String, String> {
    let window_label = generate_window_label();

    // 创建无边框、透明的便签窗口
    let _window = WebviewWindowBuilder::new(
        app,
        &window_label,
        WebviewUrl::App("index.html".into()),
    )
    .title("便签")
    .inner_size(280.0, 320.0)           // 默认窗口大小
    .min_inner_size(200.0, 150.0)       // 最小窗口大小
    .decorations(false)                  // 无边框
    .transparent(true)                   // 透明背景
    .always_on_top(true)                 // 始终置顶
    .skip_taskbar(true)                  // 不在任务栏显示
    .resizable(true)                     // 可调整大小
    .visible(true)                       // 创建后立即显示
    .focused(true)                       // 创建后获得焦点
    .center()                            // 居中显示
    .build()
    .map_err(|e| format!("创建窗口失败: {}", e))?;

    println!("📝 创建新便签: {}", window_label);
    Ok(window_label)
}

/// Tauri 命令：创建新便签窗口
#[tauri::command]
fn create_note_window(app: AppHandle) -> Result<String, String> {
    create_note_window_internal(&app)
}

/// Tauri 命令：关闭指定的便签窗口
#[tauri::command]
fn close_note_window(app: AppHandle, label: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        window.close().map_err(|e| format!("关闭窗口失败: {}", e))?;
    }
    Ok(())
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

/// 设置全局快捷键
fn setup_global_shortcuts(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    // 定义 Alt+N 快捷键
    let shortcut_alt_n = Shortcut::new(Some(Modifiers::ALT), Code::KeyN);

    // 注册全局快捷键
    app.global_shortcut().on_shortcut(shortcut_alt_n, {
        let app_handle = app.clone();
        move |_app, shortcut, event| {
            // 只在按键按下时触发，忽略释放事件（避免创建两个窗口）
            if event.state == ShortcutState::Pressed 
                && shortcut == &Shortcut::new(Some(Modifiers::ALT), Code::KeyN) 
            {
                println!("⌨️  快捷键 Alt+N 触发");
                match create_note_window_internal(&app_handle) {
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
    // 创建托盘菜单
    let new_note = MenuItem::with_id(app, "new_note", "📝 新建便签 (Alt+N)", true, None::<&str>)?;
    let show_all = MenuItem::with_id(app, "show_all", "📋 显示全部", true, None::<&str>)?;
    let hide_all = MenuItem::with_id(app, "hide_all", "🔽 隐藏全部", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "❌ 退出", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&new_note, &show_all, &hide_all, &quit])?;

    // 从嵌入的 PNG 文件加载图标并转换为 RGBA
    let png_bytes = include_bytes!("../icons/32x32.png");
    let img = image::load_from_memory(png_bytes).expect("Failed to load icon");
    let (width, height) = img.dimensions();
    let rgba = img.into_rgba8().into_raw();
    let icon = Image::new_owned(rgba, width, height);

    // 构建托盘图标
    let _tray = TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .tooltip("便签应用 - Alt+N 创建新便签")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            handle_menu_event(app, event.id.as_ref());
        })
        .on_tray_icon_event(|tray, event| {
            // 左键单击创建新便签
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                let _ = create_note_window_internal(app);
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
            let _ = create_note_window_internal(app);
        }
        "show_all" => {
            // 显示所有便签窗口
            for (label, window) in app.webview_windows() {
                if label.starts_with("note-") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        }
        "hide_all" => {
            // 隐藏所有便签窗口
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
            close_note_window,
            get_all_note_windows
        ])
        .setup(|app| {
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
