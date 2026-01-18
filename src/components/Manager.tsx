import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

const NOTE_THEMES = [
  { name: "yellow", bg: "#fff9c4", header: "#ffee58" },
  { name: "pink", bg: "#f8bbd9", header: "#f48fb1" },
  { name: "blue", bg: "#bbdefb", header: "#64b5f6" },
  { name: "green", bg: "#c8e6c9", header: "#81c784" },
  { name: "orange", bg: "#ffe0b2", header: "#ffb74d" },
  { name: "purple", bg: "#e1bee7", header: "#ba68c8" },
];

interface NoteData {
  id: string;
  content: string;
  theme_index: number;
  position: { x: number; y: number };
  size: { width: number; height: number };
  closed: boolean;
  opacity: number;
  always_on_top: boolean;
  created_at: number;
}

function Manager() {
  const [notes, setNotes] = useState<NoteData[]>([]);
  const [autoStart, setAutoStart] = useState(false);
  const [loading, setLoading] = useState(true);

  // 加载所有便签
  const loadNotes = async () => {
    try {
      const allNotes = await invoke<NoteData[]>("get_all_notes");
      // 按创建时间排序
      allNotes.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      setNotes(allNotes);
    } catch (e) {
      console.error("加载便签列表失败:", e);
    }
  };

  // 加载设置
  const loadSettings = async () => {
    try {
      const isAutoStart = await invoke<boolean>("get_auto_start");
      setAutoStart(isAutoStart);
    } catch (e) {
      console.error("加载设置失败:", e);
    }
  };

  useEffect(() => {
    const init = async () => {
      await loadNotes();
      await loadSettings();
      setLoading(false);
    };
    init();

    // 定时刷新
    const interval = setInterval(loadNotes, 2000);
    return () => clearInterval(interval);
  }, []);

  // 创建新便签
  const handleCreateNote = async () => {
    try {
      await invoke("create_note_window");
      setTimeout(loadNotes, 500);
    } catch (e) {
      console.error("创建便签失败:", e);
    }
  };

  // 显示便签
  const handleShowNote = async (id: string) => {
    try {
      await invoke("show_note", { id });
    } catch (e) {
      console.error("显示便签失败:", e);
    }
  };

  // 隐藏便签
  const handleHideNote = async (id: string) => {
    try {
      await invoke("hide_note", { id });
      setTimeout(loadNotes, 200);
    } catch (e) {
      console.error("隐藏便签失败:", e);
    }
  };

  // 删除便签
  const handleDeleteNote = async (id: string) => {
    if (!confirm("确定要删除这个便签吗？\n\n删除后无法恢复！")) return;
    try {
      await invoke("delete_note", { id });
      setTimeout(loadNotes, 200);
    } catch (e) {
      console.error("删除便签失败:", e);
    }
  };

  // 显示所有便签
  const handleShowAll = async () => {
    for (const note of notes) {
      if (note.closed) {
        await invoke("show_note", { id: note.id });
      }
    }
    setTimeout(loadNotes, 500);
  };

  // 隐藏所有便签
  const handleHideAll = async () => {
    for (const note of notes) {
      if (!note.closed) {
        await invoke("hide_note", { id: note.id });
      }
    }
    setTimeout(loadNotes, 500);
  };

  // 切换自启动
  const handleToggleAutoStart = async () => {
    try {
      const newValue = !autoStart;
      await invoke("set_auto_start", { enabled: newValue });
      setAutoStart(newValue);
    } catch (e) {
      console.error("设置自启动失败:", e);
    }
  };

  // 获取预览文本
  const getPreviewText = (content: string): string => {
    // 移除 HTML 标签
    const text = content
      .replace(/<img[^>]*>/g, "[图片]")
      .replace(/<[^>]+>/g, "")
      .trim();
    return text || "空便签";
  };

  // 格式化时间
  const formatDate = (timestamp: number): string => {
    if (!timestamp) return "未知";
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString("zh-CN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // 检查便签窗口是否可见
  const isNoteVisible = (note: NoteData): boolean => {
    return !note.closed;
  };

  if (loading) {
    return (
      <div className="manager-container">
        <div className="empty-state">
          <span>⏳</span>
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="manager-container">
      <div className="manager-header">
        <h1>
          <span>📋</span>
          便签管理中心
        </h1>
        <div className="manager-actions">
          <button className="manager-btn secondary" onClick={handleShowAll}>
            👁️ 显示全部
          </button>
          <button className="manager-btn secondary" onClick={handleHideAll}>
            🔽 隐藏全部
          </button>
          <button className="manager-btn primary" onClick={handleCreateNote}>
            ➕ 新建便签
          </button>
        </div>
      </div>

      {/* 设置面板 */}
      <div className="settings-panel">
        <h3>⚙️ 设置</h3>
        <div className="setting-item">
          <span className="setting-label">开机自动启动</span>
          <div
            className={`toggle-switch ${autoStart ? "active" : ""}`}
            onClick={handleToggleAutoStart}
          />
        </div>
      </div>

      {/* 便签列表 */}
      {notes.length === 0 ? (
        <div className="empty-state">
          <span>📝</span>
          <p>还没有便签，点击上方按钮创建一个吧！</p>
          <button className="manager-btn primary" onClick={handleCreateNote}>
            ➕ 新建便签
          </button>
        </div>
      ) : (
        <div className="notes-grid">
          {notes.map((note) => {
            const theme = NOTE_THEMES[note.theme_index] || NOTE_THEMES[0];
            const visible = isNoteVisible(note);

            return (
              <div
                key={note.id}
                className="note-card"
                onClick={() => handleShowNote(note.id)}
              >
                <div
                  className="note-card-header"
                  style={{ background: theme.header }}
                >
                  <div
                    className="note-card-color"
                    style={{ background: theme.bg }}
                  />
                  <span
                    className={`note-card-status ${visible ? "" : "hidden"}`}
                  >
                    {visible ? "显示中" : "已隐藏"}
                  </span>
                </div>
                <div className="note-card-content">
                  {getPreviewText(note.content)}
                </div>
                <div className="note-card-footer">
                  <span className="note-card-date">
                    {formatDate(note.created_at)}
                  </span>
                  <div className="note-card-actions">
                    {visible ? (
                      <button
                        className="note-card-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleHideNote(note.id);
                        }}
                        title="隐藏"
                      >
                        🔽
                      </button>
                    ) : (
                      <button
                        className="note-card-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleShowNote(note.id);
                        }}
                        title="显示"
                      >
                        👁️
                      </button>
                    )}
                    <button
                      className="note-card-btn danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteNote(note.id);
                      }}
                      title="删除"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default Manager;
