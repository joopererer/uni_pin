use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

/// 窗口位置
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WindowPosition {
    pub x: f64,
    pub y: f64,
}

/// 窗口大小
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowSize {
    pub width: f64,
    pub height: f64,
}

impl Default for WindowSize {
    fn default() -> Self {
        Self {
            width: 280.0,
            height: 320.0,
        }
    }
}

/// 便签数据结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteData {
    /// 唯一标识符 (窗口 label)
    pub id: String,
    /// 文本内容 (HTML 格式，包含内联图片)
    pub content: String,
    /// 颜色主题索引
    pub theme_index: u32,
    /// 窗口位置
    pub position: WindowPosition,
    /// 窗口大小
    pub size: WindowSize,
    /// 是否已关闭
    pub closed: bool,
}

impl NoteData {
    pub fn new(id: String) -> Self {
        Self {
            id,
            content: String::new(),
            theme_index: 0,
            position: WindowPosition::default(),
            size: WindowSize::default(),
            closed: false,
        }
    }
}

/// 所有便签数据的存储结构
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct NotesStore {
    pub notes: HashMap<String, NoteData>,
}

/// 全局便签存储（线程安全）
pub struct NoteStoreState(pub Mutex<NotesStore>);


/// 获取数据存储文件路径
pub fn get_store_path() -> PathBuf {
    let data_dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("sticky-notes");
    
    // 确保目录存在
    if !data_dir.exists() {
        let _ = fs::create_dir_all(&data_dir);
    }
    
    data_dir.join("notes.json")
}

/// 从文件加载便签数据
pub fn load_notes() -> NotesStore {
    let path = get_store_path();
    
    if path.exists() {
        match fs::read_to_string(&path) {
            Ok(content) => {
                match serde_json::from_str::<NotesStore>(&content) {
                    Ok(store) => {
                        println!("📂 已加载 {} 个便签", store.notes.len());
                        return store;
                    }
                    Err(e) => {
                        eprintln!("❌ 解析便签数据失败: {}", e);
                    }
                }
            }
            Err(e) => {
                eprintln!("❌ 读取便签文件失败: {}", e);
            }
        }
    }
    
    NotesStore::default()
}

/// 保存便签数据到文件
pub fn save_notes(store: &NotesStore) -> Result<(), String> {
    let path = get_store_path();
    
    let json = serde_json::to_string_pretty(store)
        .map_err(|e| format!("序列化失败: {}", e))?;
    
    fs::write(&path, json)
        .map_err(|e| format!("写入文件失败: {}", e))?;
    
    println!("💾 已保存 {} 个便签到 {:?}", store.notes.len(), path);
    Ok(())
}
