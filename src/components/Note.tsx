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

// Rust 返回的便签数据类型
interface NoteData {
  id: string;
  content: string;
  theme_index: number;
  position: { x: number; y: number };
  size: { width: number; height: number };
  closed: boolean;
}

interface NoteProps {
  noteId: string;
}

function Note({ noteId }: NoteProps) {
  const [themeIndex, setThemeIndex] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<number | null>(null);

  const theme = NOTE_THEMES[themeIndex];

  // 从 Rust 后端加载保存的数据
  useEffect(() => {
    const loadNote = async () => {
      try {
        const data = await invoke<NoteData | null>("get_note", { id: noteId });
        if (data && contentRef.current) {
          contentRef.current.innerHTML = data.content || "";
          setThemeIndex(data.theme_index || 0);
        }
        setIsLoaded(true);
      } catch (e) {
        console.error("加载便签数据失败:", e);
        setIsLoaded(true);
      }
    };
    loadNote();
  }, [noteId]);

  // 防抖保存到 Rust 后端
  const saveToBackend = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = window.setTimeout(async () => {
      try {
        const content = contentRef.current?.innerHTML || "";
        await invoke("save_note", {
          id: noteId,
          content,
          themeIndex,
        });
      } catch (e) {
        console.error("保存便签失败:", e);
      }
    }, 500); // 500ms 防抖
  }, [noteId, themeIndex]);

  // 内容变化时保存
  const handleContentChange = useCallback(() => {
    saveToBackend();
  }, [saveToBackend]);

  // 主题变化时保存
  useEffect(() => {
    if (isLoaded) {
      saveToBackend();
    }
  }, [themeIndex, isLoaded, saveToBackend]);

  // 监听窗口位置变化
  useEffect(() => {
    const appWindow = getCurrentWindow();
    let lastPosition = { x: 0, y: 0 };
    let positionTimeout: ReturnType<typeof setTimeout> | null = null;

    const unlistenMove = appWindow.onMoved(({ payload }) => {
      const { x, y } = payload;
      // 防抖保存位置
      if (positionTimeout) clearTimeout(positionTimeout);
      positionTimeout = setTimeout(async () => {
        if (x !== lastPosition.x || y !== lastPosition.y) {
          lastPosition = { x, y };
          try {
            await invoke("update_note_position", { id: noteId, x, y });
          } catch (e) {
            console.error("保存位置失败:", e);
          }
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
    let lastSize = { width: 0, height: 0 };
    let sizeTimeout: ReturnType<typeof setTimeout> | null = null;

    const unlistenResize = appWindow.onResized(({ payload }) => {
      const { width, height } = payload;
      // 防抖保存大小
      if (sizeTimeout) clearTimeout(sizeTimeout);
      sizeTimeout = setTimeout(async () => {
        if (width !== lastSize.width || height !== lastSize.height) {
          lastSize = { width, height };
          try {
            await invoke("update_note_size", { id: noteId, width, height });
          } catch (e) {
            console.error("保存大小失败:", e);
          }
        }
      }, 300);
    });

    return () => {
      unlistenResize.then((fn) => fn());
      if (sizeTimeout) clearTimeout(sizeTimeout);
    };
  }, [noteId]);

  // 处理粘贴事件 - 支持图片粘贴
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            insertImage(file);
          }
          return;
        }
      }
    },
    []
  );

  // 插入图片到编辑器
  const insertImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;

      const img = document.createElement("img");
      img.src = base64;
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
      if (
        selection &&
        selection.rangeCount > 0 &&
        contentRef.current?.contains(selection.anchorNode)
      ) {
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
    };
    reader.readAsDataURL(file);
  };

  // 处理文件选择
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      insertImage(file);
    }
    e.target.value = "";
  };

  // 窗口操作 - 关闭时删除便签
  const handleClose = async () => {
    try {
      await invoke("delete_note", { id: noteId });
    } catch (e) {
      console.error("删除便签失败:", e);
      // 备用方案：直接关闭窗口
      const window = getCurrentWindow();
      await window.close();
    }
  };

  const handleMinimize = async () => {
    const window = getCurrentWindow();
    await window.minimize();
  };

  // 切换颜色
  const cycleTheme = () => {
    setThemeIndex((prev) => (prev + 1) % NOTE_THEMES.length);
  };

  return (
    <div
      className="note-container"
      style={
        {
          "--note-bg": theme.bg,
          "--note-header": theme.header,
          "--note-text": theme.text,
        } as React.CSSProperties
      }
    >
      {/* 极简拖拽把手 */}
      <div className="note-header" data-tauri-drag-region>
        <div className="drag-indicator" data-tauri-drag-region>
          <span data-tauri-drag-region></span>
          <span data-tauri-drag-region></span>
          <span data-tauri-drag-region></span>
        </div>

        {/* 工具栏 */}
        <div className="note-toolbar">
          {/* 添加图片按钮 */}
          <button
            className="toolbar-btn"
            onClick={() => fileInputRef.current?.click()}
            title="添加图片"
          >
            🖼️
          </button>

          {/* 颜色选择 */}
          <button className="toolbar-btn" onClick={cycleTheme} title="切换颜色">
            🎨
          </button>

          {/* 最小化 */}
          <button
            className="toolbar-btn minimize-btn"
            onClick={handleMinimize}
            title="最小化"
          >
            −
          </button>

          {/* 关闭 */}
          <button
            className="toolbar-btn close-btn"
            onClick={handleClose}
            title="关闭"
          >
            ×
          </button>
        </div>
      </div>

      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFileSelect}
      />

      {/* 可编辑内容区域 */}
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

      {/* 调整大小指示器 */}
      <div className="resize-indicator" />
    </div>
  );
}

export default Note;
