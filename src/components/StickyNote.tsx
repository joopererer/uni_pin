import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface StickyNoteProps {
  noteId: string;
  onClose: () => void;
  onMinimize: () => void;
}

function StickyNote({ noteId, onClose, onMinimize }: StickyNoteProps) {
  const [content, setContent] = useState("");

  // 实现窗口拖拽
  const handleMouseDown = async (e: React.MouseEvent) => {
    // 只在标题栏区域允许拖拽，但排除按钮区域
    const target = e.target as HTMLElement;
    if (target.closest(".title-bar") && !target.closest(".window-controls")) {
      const window = getCurrentWindow();
      await window.startDragging();
    }
  };

  // 保存内容到本地存储
  useEffect(() => {
    const saved = localStorage.getItem(`note-${noteId}`);
    if (saved) {
      setContent(saved);
    }
  }, [noteId]);

  useEffect(() => {
    if (content) {
      localStorage.setItem(`note-${noteId}`, content);
    }
  }, [content, noteId]);

  return (
    <div
      className="sticky-note"
      onMouseDown={handleMouseDown}
    >
      {/* 标题栏 - 可拖拽区域 */}
      <div className="title-bar">
        <div className="title-text">📝 便签</div>
        <div className="window-controls">
          <button
            className="control-btn minimize"
            onClick={onMinimize}
            title="最小化"
          >
            −
          </button>
          <button className="control-btn close" onClick={onClose} title="关闭">
            ×
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      <textarea
        className="note-content"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="在这里输入便签内容..."
      />

      {/* 调整大小手柄 */}
      <div className="resize-handle" data-tauri-drag-region="false" />
    </div>
  );
}

export default StickyNote;
