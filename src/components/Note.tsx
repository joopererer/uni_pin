import { useState, useRef, useEffect, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

// 预定义的便签颜色主题
const NOTE_THEMES = [
  { name: "yellow", bg: "#fff9c4", header: "#ffee58", text: "#5d4037" },
  { name: "pink", bg: "#f8bbd9", header: "#f48fb1", text: "#880e4f" },
  { name: "blue", bg: "#bbdefb", header: "#64b5f6", text: "#0d47a1" },
  { name: "green", bg: "#c8e6c9", header: "#81c784", text: "#1b5e20" },
  { name: "orange", bg: "#ffe0b2", header: "#ffb74d", text: "#e65100" },
  { name: "purple", bg: "#e1bee7", header: "#ba68c8", text: "#4a148c" },
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
}

interface NoteProps {
  noteId: string;
}

function Note({ noteId }: NoteProps) {
  const [themeIndex, setThemeIndex] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [opacity, setOpacity] = useState(0);
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const [showOpacitySlider, setShowOpacitySlider] = useState(false);
  
  const contentRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opacityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const theme = NOTE_THEMES[themeIndex];

  // 加载便签数据
  useEffect(() => {
    const loadNoteAndShow = async () => {
      try {
        const data = await invoke<NoteData | null>("get_note", { id: noteId });
        if (data && contentRef.current) {
          contentRef.current.innerHTML = data.content || "";
          setThemeIndex(data.theme_index || 0);
          setOpacity(data.opacity || 0);
          setAlwaysOnTop(data.always_on_top !== false);
        }
        setIsLoaded(true);
        await invoke("show_note_window", { id: noteId });
      } catch (e) {
        console.error("加载便签数据失败:", e);
        setIsLoaded(true);
        try {
          await invoke("show_note_window", { id: noteId });
        } catch {}
      }
    };
    loadNoteAndShow();
  }, [noteId]);

  // 防抖保存
  const saveToBackend = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const content = contentRef.current?.innerHTML || "";
        await invoke("save_note", { id: noteId, content, themeIndex });
      } catch (e) {
        console.error("保存便签失败:", e);
      }
    }, 500);
  }, [noteId, themeIndex]);

  const handleContentChange = useCallback(() => {
    saveToBackend();
  }, [saveToBackend]);

  useEffect(() => {
    if (isLoaded) saveToBackend();
  }, [themeIndex, isLoaded, saveToBackend]);

  // 监听窗口位置变化
  useEffect(() => {
    const appWindow = getCurrentWindow();
    let positionTimeout: ReturnType<typeof setTimeout> | null = null;

    const unlistenMove = appWindow.onMoved(async () => {
      if (positionTimeout) clearTimeout(positionTimeout);
      positionTimeout = setTimeout(async () => {
        try {
          const [x, y] = await invoke<[number, number]>("get_window_position", { id: noteId });
          await invoke("update_note_position", { id: noteId, x, y });
        } catch (e) {
          console.error("保存位置失败:", e);
        }
      }, 300);
    });

    return () => {
      unlistenMove.then((fn) => fn());
      if (positionTimeout) clearTimeout(positionTimeout);
    };
  }, [noteId]);

  // 监听窗口大小变化
  useEffect(() => {
    const appWindow = getCurrentWindow();
    let sizeTimeout: ReturnType<typeof setTimeout> | null = null;

    const unlistenResize = appWindow.onResized(async () => {
      if (sizeTimeout) clearTimeout(sizeTimeout);
      sizeTimeout = setTimeout(async () => {
        try {
          const [width, height] = await invoke<[number, number]>("get_window_size", { id: noteId });
          await invoke("update_note_size", { id: noteId, width, height });
        } catch (e) {
          console.error("保存大小失败:", e);
        }
      }, 300);
    });

    return () => {
      unlistenResize.then((fn) => fn());
      if (sizeTimeout) clearTimeout(sizeTimeout);
    };
  }, [noteId]);

  // 处理粘贴事件 - 图片保存到 AppData
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          await insertImage(file);
        }
        return;
      }
    }
  }, []);

  // 插入图片（保存到 AppData）
  const insertImage = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      
      try {
        // 保存到 AppData 并获取路径
        const savedPath = await invoke<string>("save_image", { imageData: base64 });
        
        const img = document.createElement("img");
        img.src = `file://${savedPath}`;
        img.className = "note-image";
        img.style.maxWidth = "100%";
        img.style.borderRadius = "4px";
        img.style.margin = "8px 0";
        img.style.cursor = "pointer";
        img.onclick = () => {
          if (confirm("删除这张图片？")) {
            img.remove();
            handleContentChange();
          }
        };

        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0 && contentRef.current?.contains(selection.anchorNode)) {
          const range = selection.getRangeAt(0);
          range.deleteContents();
          range.insertNode(img);
          range.setStartAfter(img);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
        } else if (contentRef.current) {
          contentRef.current.appendChild(img);
        }

        handleContentChange();
      } catch (err) {
        console.error("保存图片失败:", err);
        // 回退到 base64
        const img = document.createElement("img");
        img.src = base64;
        img.className = "note-image";
        if (contentRef.current) contentRef.current.appendChild(img);
        handleContentChange();
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      insertImage(file);
    }
    e.target.value = "";
  };

  // 右键菜单
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };

  useEffect(() => {
    const handleClick = () => setShowContextMenu(false);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  // 切换置顶
  const handleToggleAlwaysOnTop = async () => {
    try {
      const newState = await invoke<boolean>("toggle_always_on_top", { id: noteId });
      setAlwaysOnTop(newState);
    } catch (e) {
      console.error("切换置顶失败:", e);
    }
    setShowContextMenu(false);
  };

  // 更新透明度
  const handleOpacityChange = (newOpacity: number) => {
    setOpacity(newOpacity);
    
    if (opacityTimeoutRef.current) clearTimeout(opacityTimeoutRef.current);
    opacityTimeoutRef.current = setTimeout(async () => {
      try {
        await invoke("update_note_opacity", { id: noteId, opacity: newOpacity });
      } catch (e) {
        console.error("保存透明度失败:", e);
      }
    }, 200);
  };

  const handleHide = async () => {
    try {
      await invoke("hide_note", { id: noteId });
    } catch (e) {
      console.error("隐藏便签失败:", e);
    }
  };

  const handleDelete = async () => {
    if (confirm("确定要永久删除这个便签吗？\n\n删除后无法恢复！")) {
      try {
        await invoke("delete_note", { id: noteId });
      } catch (e) {
        console.error("删除便签失败:", e);
      }
    }
  };

  const cycleTheme = () => {
    setThemeIndex((prev) => (prev + 1) % NOTE_THEMES.length);
  };

  // 计算实际的背景透明度
  const bgOpacity = (100 - opacity) / 100;
  const bgColor = theme.bg;
  const headerColor = theme.header;

  return (
    <div
      className="note-container"
      onContextMenu={handleContextMenu}
      style={{
        "--note-bg": bgColor,
        "--note-header": headerColor,
        "--note-text": theme.text,
        "--note-opacity": bgOpacity,
      } as React.CSSProperties}
    >
      {/* 顶部拖拽把手 */}
      <div className="note-header" data-tauri-drag-region>
        <div className="drag-indicator" data-tauri-drag-region>
          <span data-tauri-drag-region></span>
          <span data-tauri-drag-region></span>
          <span data-tauri-drag-region></span>
        </div>

        {/* 置顶状态指示 */}
        {!alwaysOnTop && <span className="pin-indicator">📌</span>}

        {/* 工具栏 */}
        <div className="note-toolbar">
          {/* 透明度调节 */}
          <div className="opacity-control">
            <button
              className="toolbar-btn"
              onClick={() => setShowOpacitySlider(!showOpacitySlider)}
              title={`透明度: ${opacity}%`}
            >
              💧
            </button>
            {showOpacitySlider && (
              <div className="opacity-slider-popup">
                <input
                  type="range"
                  min="0"
                  max="90"
                  value={opacity}
                  onChange={(e) => handleOpacityChange(Number(e.target.value))}
                  className="opacity-slider"
                />
                <span className="opacity-value">{opacity}%</span>
              </div>
            )}
          </div>

          <button
            className="toolbar-btn"
            onClick={() => fileInputRef.current?.click()}
            title="添加图片"
          >
            🖼️
          </button>

          <button className="toolbar-btn" onClick={cycleTheme} title="切换颜色">
            🎨
          </button>

          <button className="toolbar-btn hide-btn" onClick={handleHide} title="隐藏便签">
            −
          </button>

          <button className="toolbar-btn delete-btn" onClick={handleDelete} title="删除便签">
            🗑️
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFileSelect}
      />

      <div
        ref={contentRef}
        className="note-content"
        contentEditable
        onPaste={handlePaste}
        onInput={handleContentChange}
        onBlur={handleContentChange}
        data-placeholder="输入便签内容... 支持 Ctrl+V 粘贴图片"
        suppressContentEditableWarning
      />

      <div className="resize-indicator" />

      {/* 右键菜单 */}
      {showContextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
        >
          <button onClick={handleToggleAlwaysOnTop}>
            {alwaysOnTop ? "📌 取消置顶" : "📍 置顶窗口"}
          </button>
          <button onClick={() => { setShowOpacitySlider(true); setShowContextMenu(false); }}>
            💧 调节透明度
          </button>
          <div className="menu-divider" />
          <button onClick={handleHide}>
            🔽 隐藏便签
          </button>
          <button className="danger" onClick={handleDelete}>
            🗑️ 删除便签
          </button>
        </div>
      )}
    </div>
  );
}

export default Note;
