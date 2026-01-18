import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import ConfirmDialog from "./ConfirmDialog";
import AboutDialog from "./AboutDialog";
import UpdateDialog from "./UpdateDialog";
import { useI18n } from "../hooks/useI18n";

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

const APP_VERSION = "0.1.0";

function Manager() {
  const { t, tWith, language, changeLanguage } = useI18n();
  const [notes, setNotes] = useState<NoteData[]>([]);
  const [autoStart, setAutoStart] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteNoteId, setDeleteNoteId] = useState<string | null>(null);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showUpdate, setShowUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ version: string; url: string; notes?: string } | null>(null);

  // 加载所有便签
  const loadNotes = useCallback(async () => {
    try {
      const allNotes = await invoke<NoteData[]>("get_all_notes");
      allNotes.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      setNotes(allNotes);
    } catch (e) {
      console.error("加载便签列表失败:", e);
    }
  }, []);

  // 加载设置
  const loadSettings = useCallback(async () => {
    try {
      const isAutoStart = await invoke<boolean>("get_auto_start");
      setAutoStart(isAutoStart);
    } catch (e) {
      console.error("加载设置失败:", e);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      await loadNotes();
      await loadSettings();
      setLoading(false);
    };
    init();

    const interval = setInterval(loadNotes, 1000);
    
    // 监听自定义事件，支持从托盘菜单打开关于
    const handleShowAbout = () => {
      setShowAbout(true);
    };
    window.addEventListener("showAbout", handleShowAbout);
    
    // 监听更新可用事件
    const handleUpdateAvailable = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.version && detail.url) {
        setUpdateInfo({
          version: detail.version,
          url: detail.url,
          notes: detail.notes,
        });
        setShowUpdate(true);
      }
    };
    window.addEventListener("updateAvailable", handleUpdateAvailable);
    
    // 暴露全局方法供 Rust 调用
    (window as any).showAboutDialog = () => {
      setShowAbout(true);
    };
    
    return () => {
      clearInterval(interval);
      window.removeEventListener("showAbout", handleShowAbout);
      window.removeEventListener("updateAvailable", handleUpdateAvailable);
      delete (window as any).showAboutDialog;
    };
  }, [loadNotes, loadSettings]);

  // 显示便签
  const handleShowNote = async (id: string) => {
    if (selectMode) {
      toggleSelect(id);
      return;
    }
    try {
      await invoke("show_note", { id });
      setTimeout(() => loadNotes(), 200);
    } catch (e) {
      console.error("显示便签失败:", e);
    }
  };

  // 隐藏便签
  const handleHideNote = async (id: string) => {
    try {
      await invoke("hide_note", { id });
      setTimeout(() => loadNotes(), 200);
    } catch (e) {
      console.error("隐藏便签失败:", e);
    }
  };

  // 删除便签
  const handleDeleteNote = (id: string) => {
    setDeleteNoteId(id);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteNote = async () => {
    if (!deleteNoteId) return;
    try {
      await invoke("delete_note", { id: deleteNoteId });
      setDeleteNoteId(null);
      setShowDeleteConfirm(false);
      await loadNotes();
    } catch (e) {
      console.error("删除便签失败:", e);
    }
  };

  // 显示所有便签
  const handleShowAll = async () => {
    try {
      for (const note of notes) {
        await invoke("show_note", { id: note.id });
      }
      setTimeout(() => loadNotes(), 300);
    } catch (e) {
      console.error("显示全部失败:", e);
    }
  };

  // 隐藏所有便签
  const handleHideAll = async () => {
    try {
      for (const note of notes) {
        if (!note.closed) {
          await invoke("hide_note", { id: note.id });
        }
      }
      setTimeout(() => loadNotes(), 300);
    } catch (e) {
      console.error("隐藏全部失败:", e);
    }
  };

  // 切换自启动
  const handleToggleAutoStart = async () => {
    const newValue = !autoStart;
    // 先更新 UI（乐观更新）
    setAutoStart(newValue);
    try {
      await invoke("set_auto_start", { enabled: newValue });
      // 注册表操作在后台执行，这里不等待完成
    } catch (e) {
      console.error("设置自启动失败:", e);
      // 如果失败，回滚 UI 状态
      setAutoStart(autoStart);
      alert("设置自启动失败，请稍后重试");
    }
  };

  // 选择相关
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // 搜索过滤 - 使用 useMemo
  const filteredNotes = useMemo(() => {
    return notes.filter(note => {
      if (!searchTerm.trim()) return true;
      const text = note.content
        .replace(/<img[^>]*>/g, "[图片]")
        .replace(/<[^>]+>/g, "")
        .trim()
        .toLowerCase();
      return text.includes(searchTerm.toLowerCase());
    });
  }, [notes, searchTerm]);

  const selectAll = () => {
    setSelectedIds(new Set(filteredNotes.map(n => n.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const toggleSelectMode = () => {
    setSelectMode(!selectMode);
    if (selectMode) {
      setSelectedIds(new Set());
    }
  };

  // 批量删除
  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    setShowBatchDeleteConfirm(true);
  };

  const confirmBatchDelete = async () => {
    try {
      for (const id of selectedIds) {
        await invoke("delete_note", { id });
      }
      setSelectedIds(new Set());
      setShowBatchDeleteConfirm(false);
      await loadNotes();
    } catch (e) {
      console.error("批量删除失败:", e);
    }
  };

  // 批量显示
  const handleBatchShow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (selectedIds.size === 0) {
      return;
    }
    try {
      const ids = Array.from(selectedIds);
      console.log("批量显示便签:", ids);
      for (const id of ids) {
        console.log("显示便签:", id);
        await invoke("show_note", { id });
      }
      // 等待一下再刷新
      setTimeout(() => {
        loadNotes();
      }, 500);
    } catch (err) {
      console.error("批量显示失败:", err);
      alert("批量显示失败: " + err);
    }
  };

  // 批量隐藏
  const handleBatchHide = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (selectedIds.size === 0) {
      return;
    }
    try {
      const ids = Array.from(selectedIds);
      console.log("批量隐藏便签:", ids);
      for (const id of ids) {
        console.log("隐藏便签:", id);
        await invoke("hide_note", { id });
      }
      // 等待一下再刷新
      setTimeout(() => {
        loadNotes();
      }, 500);
    } catch (err) {
      console.error("批量隐藏失败:", err);
      alert("批量隐藏失败: " + err);
    }
  };

  // 获取预览文本
  const getPreviewText = (content: string): string => {
    const text = content
      .replace(/<img[^>]*>/g, "[图片]")
      .replace(/<[^>]+>/g, "")
      .trim();
    return text || t("manager.emptyNote") || "空便签";
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
    <>
      <div className="manager-container">
        <div className="manager-header">
          <h1>
            <span>📋</span>
            {t("manager.title")}
          </h1>
          <div className="manager-actions">
            <button className="manager-btn secondary" onClick={handleShowAll}>
              👁️ {t("manager.showAll")}
            </button>
            <button className="manager-btn secondary" onClick={handleHideAll}>
              🔽 {t("manager.hideAll")}
            </button>
            <button className="manager-btn secondary" onClick={() => setShowAbout(true)}>
              ℹ️ {t("manager.about")}
            </button>
          </div>
        </div>

        {/* 设置面板 */}
        <div className="settings-panel">
          <h3>⚙️ {t("manager.settings")}</h3>
          <div className="setting-item">
            <span className="setting-label">{t("manager.autoStart")}</span>
            <div
              className={`toggle-switch ${autoStart ? "active" : ""}`}
              onClick={handleToggleAutoStart}
            />
          </div>
          <div className="setting-item setting-item-spaced">
            <span className="setting-label">{t("manager.language")}</span>
            <select
              className="language-select"
              value={language}
              onChange={async (e) => {
                const newLang = e.target.value as "zh" | "en";
                await changeLanguage(newLang);
                // 强制刷新页面以确保语言更新
                window.location.reload();
              }}
            >
              <option value="zh">中文</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>

        {/* 搜索和多选控制 */}
        <div className="search-bar">
          <div className="search-input-wrapper">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              className="search-input"
              placeholder={t("manager.searchPlaceholder")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button className="search-clear" onClick={() => setSearchTerm("")}>
                ✕
              </button>
            )}
          </div>
          <button 
            className={`manager-btn ${selectMode ? 'primary' : 'secondary'}`}
            onClick={toggleSelectMode}
          >
            {selectMode ? `✓ ${t("manager.finishSelection")}` : `☐ ${t("manager.selectMode")}`}
          </button>
        </div>

        {/* 多选操作栏 */}
        {selectMode && (
          <div className="batch-actions">
            <span className="selected-count">{tWith("manager.selectedCount", { count: selectedIds.size })}</span>
            <button className="batch-btn" onClick={selectAll}>{t("manager.selectAll")}</button>
            <button className="batch-btn" onClick={deselectAll}>{t("manager.deselectAll")}</button>
            <button 
              className="batch-btn" 
              onClick={handleBatchShow}
              disabled={selectedIds.size === 0}
            >
              👁️ {t("manager.batchShow")}
            </button>
            <button 
              className="batch-btn" 
              onClick={handleBatchHide}
              disabled={selectedIds.size === 0}
            >
              🔽 {t("manager.batchHide")}
            </button>
            <button 
              className="batch-btn danger" 
              onClick={handleBatchDelete}
              disabled={selectedIds.size === 0}
            >
              🗑️ {t("manager.batchDelete")}
            </button>
          </div>
        )}

        {/* 便签列表 */}
        {filteredNotes.length === 0 ? (
          <div className="empty-state">
            <span>{searchTerm ? "🔍" : "📝"}</span>
            <p>{searchTerm ? tWith("manager.emptySearch", { term: searchTerm }) : t("manager.emptyState")}</p>
          </div>
        ) : (
          <div className="notes-grid">
            {filteredNotes.map((note) => {
              const theme = NOTE_THEMES[note.theme_index] || NOTE_THEMES[0];
              const visible = !note.closed;
              const isSelected = selectedIds.has(note.id);

              return (
                <div
                  key={note.id}
                  className={`note-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleShowNote(note.id)}
                >
                  {selectMode && (
                    <div className={`select-checkbox ${isSelected ? 'checked' : ''}`}>
                      {isSelected && '✓'}
                    </div>
                  )}
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
                      {visible ? t("manager.visible") : t("manager.hidden")}
                    </span>
                  </div>
                  <div className="note-card-content">
                    {getPreviewText(note.content)}
                  </div>
                  <div className="note-card-footer">
                    <span className="note-card-date">
                      {formatDate(note.created_at)}
                    </span>
                    {!selectMode && (
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
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 删除确认对话框 */}
      <ConfirmDialog
        open={showDeleteConfirm}
        title={t("confirm.deleteNote")}
        message={t("confirm.deleteNoteWarning")}
        onConfirm={confirmDeleteNote}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setDeleteNoteId(null);
        }}
        confirmText="删除"
        cancelText="取消"
        danger={true}
      />

      {/* 批量删除确认对话框 */}
      <ConfirmDialog
        open={showBatchDeleteConfirm}
        title={t("confirm.batchDelete")}
        message={tWith("confirm.batchDeleteWarning", { count: selectedIds.size })}
        onConfirm={confirmBatchDelete}
        onCancel={() => setShowBatchDeleteConfirm(false)}
        confirmText={t("common.delete")}
        cancelText={t("common.cancel")}
        danger={true}
      />

      {/* 关于对话框 */}
      <AboutDialog
        open={showAbout}
        onClose={() => setShowAbout(false)}
        version={APP_VERSION}
        onCheckUpdate={async () => {
          try {
            const result = await invoke<{ version: string; downloadUrl: string; notes?: string } | null>("check_update");
            if (result) {
              setUpdateInfo({
                version: result.version,
                url: result.downloadUrl,
                notes: result.notes,
              });
              setShowUpdate(true);
              setShowAbout(false);
            } else {
              alert(t("update.latest"));
            }
          } catch (e) {
            console.error("检查更新失败:", e);
            alert(t("update.checkFailed"));
          }
        }}
      />

      {/* 更新提示对话框 */}
      {updateInfo && (
        <UpdateDialog
          open={showUpdate}
          version={updateInfo.version}
          downloadUrl={updateInfo.url}
          releaseNotes={updateInfo.notes}
          onClose={() => setShowUpdate(false)}
        />
      )}
    </>
  );
}

export default Manager;
