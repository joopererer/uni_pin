import { useState, useRef, useEffect, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

// 预定义的便签颜色主题
const NOTE_THEMES = [
  { name: "yellow", bg: "#fff9c4", header: "#ffee58", text: "#5d4037" },
  { name: "pink", bg: "#f8bbd9", header: "#f48fb1", text: "#880e4f" },
  { name: "blue", bg: "#bbdefb", header: "#64b5f6", text: "#0d47a1" },
  { name: "green", bg: "#c8e6c9", header: "#81c784", text: "#1b5e20" },
  { name: "orange", bg: "#ffe0b2", header: "#ffb74d", text: "#e65100" },
  { name: "purple", bg: "#e1bee7", header: "#ba68c8", text: "#4a148c" },
];

interface NoteProps {
  noteId: string;
}

function Note({ noteId }: NoteProps) {
  const [themeIndex, setThemeIndex] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const theme = NOTE_THEMES[themeIndex];

  // 加载保存的内容和主题
  useEffect(() => {
    const savedContent = localStorage.getItem(`note-content-${noteId}`);
    const savedTheme = localStorage.getItem(`note-theme-${noteId}`);
    
    if (savedContent && contentRef.current) {
      contentRef.current.innerHTML = savedContent;
    }
    if (savedTheme) {
      const idx = parseInt(savedTheme, 10);
      if (!isNaN(idx) && idx >= 0 && idx < NOTE_THEMES.length) {
        setThemeIndex(idx);
      }
    }
  }, [noteId]);

  // 保存内容
  const saveContent = useCallback(() => {
    if (contentRef.current) {
      localStorage.setItem(`note-content-${noteId}`, contentRef.current.innerHTML);
    }
  }, [noteId]);

  // 保存主题
  useEffect(() => {
    localStorage.setItem(`note-theme-${noteId}`, themeIndex.toString());
  }, [themeIndex, noteId]);

  // 处理粘贴事件 - 支持图片粘贴
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      // 检查是否是图片
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          insertImage(file);
        }
        return;
      }
    }
  }, []);

  // 插入图片到编辑器
  const insertImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      
      // 创建图片元素
      const img = document.createElement("img");
      img.src = base64;
      img.className = "note-image";
      img.style.maxWidth = "100%";
      img.style.borderRadius = "4px";
      img.style.margin = "8px 0";
      img.style.cursor = "pointer";
      
      // 点击图片可删除
      img.onclick = () => {
        if (confirm("删除这张图片？")) {
          img.remove();
          saveContent();
        }
      };

      // 插入到光标位置或末尾
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

      saveContent();
    };
    reader.readAsDataURL(file);
  };

  // 处理文件选择
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      insertImage(file);
    }
    // 重置 input 以便可以重复选择同一文件
    e.target.value = "";
  };

  // 窗口操作
  const handleClose = async () => {
    saveContent();
    const window = getCurrentWindow();
    await window.close();
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
      style={{
        "--note-bg": theme.bg,
        "--note-header": theme.header,
        "--note-text": theme.text,
      } as React.CSSProperties}
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
          <button
            className="toolbar-btn"
            onClick={cycleTheme}
            title="切换颜色"
          >
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
        onInput={saveContent}
        onBlur={saveContent}
        data-placeholder="输入便签内容... 支持 Ctrl+V 粘贴图片"
        suppressContentEditableWarning
      />

      {/* 调整大小指示器 */}
      <div className="resize-indicator" />
    </div>
  );
}

export default Note;
