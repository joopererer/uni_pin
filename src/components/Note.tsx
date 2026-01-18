import { useState, useRef, useEffect, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import ConfirmDialog from "./ConfirmDialog";
import { useI18n } from "../hooks/useI18n";

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
  const { t } = useI18n();
  const [themeIndex, setThemeIndex] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [opacity, setOpacity] = useState(0);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const [showOpacitySlider, setShowOpacitySlider] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeleteImageConfirm, setShowDeleteImageConfirm] = useState(false);
  const [imageToDelete, setImageToDelete] = useState<HTMLImageElement | null>(null);
  
  // 工具栏自动隐藏相关状态
  const [showToolbar, setShowToolbar] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  
  const contentRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opacityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toolbarHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const theme = NOTE_THEMES[themeIndex];

  // 工具栏显示逻辑
  useEffect(() => {
    if (isEditing || isHovering) {
      setShowToolbar(true);
      if (toolbarHideTimeoutRef.current) {
        clearTimeout(toolbarHideTimeoutRef.current);
        toolbarHideTimeoutRef.current = null;
      }
    } else {
      toolbarHideTimeoutRef.current = setTimeout(() => {
        setShowToolbar(false);
        setShowOpacitySlider(false);
      }, 1500);
    }
    
    return () => {
      if (toolbarHideTimeoutRef.current) {
        clearTimeout(toolbarHideTimeoutRef.current);
      }
    };
  }, [isEditing, isHovering]);

  // 首次加载显示工具栏，2秒后自动隐藏
  useEffect(() => {
    if (isLoaded) {
      const timer = setTimeout(() => {
        if (!isEditing && !isHovering) {
          setShowToolbar(false);
        }
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isLoaded]);

  // 修复已保存图片的路径并绑定点击事件
  const fixSavedImages = useCallback(() => {
    if (!contentRef.current) return;
    
    const images = contentRef.current.querySelectorAll('img');
    images.forEach((img) => {
      // 检查图片路径是否需要转换
      const src = img.src;
      const dataPath = img.getAttribute("data-image-path");
      
      // 优先使用 data-image-path 属性（如果存在）
      if (dataPath) {
        try {
          img.src = convertFileSrc(dataPath);
          return; // 已处理，继续下一个
        } catch (e) {
          console.error("转换图片路径失败:", e);
        }
      }
      
      // 如果图片路径是 file:// 开头的，需要转换为 convertFileSrc
      if (src.startsWith('file://')) {
        try {
          // 提取原始文件路径（去除 file:// 前缀）
          const filePath = src.replace(/^file:\/\/\//, '').replace(/^file:\/\//, '');
          // 在 Windows 上，路径可能包含驱动器字母，需要特殊处理
          const normalizedPath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
          img.src = convertFileSrc(normalizedPath);
          // 保存原始路径到 data 属性
          img.setAttribute("data-image-path", normalizedPath);
        } catch (e) {
          console.error("转换图片路径失败:", e);
        }
      }
      // 如果图片路径是 Tauri 临时 URL（http://localhost），尝试从 src 提取路径
      else if (src.includes('__tauri') || src.includes('localhost')) {
        // Tauri URL 格式：http://localhost:PORT/__tauri_xxx/path/to/file.jpg
        // 我们需要重新生成正确的 URL，但保留原始路径信息
        // 这种情况下，图片路径应该在 HTML 中以某种方式保存
        // 如果 data-image-path 不存在，尝试从 src 中提取
        const urlMatch = src.match(/__tauri[^\/]+\/(.+)$/);
        if (urlMatch && urlMatch[1]) {
          // 解码路径
          const decodedPath = decodeURIComponent(urlMatch[1]);
          try {
            img.src = convertFileSrc(decodedPath);
            img.setAttribute("data-image-path", decodedPath);
          } catch (e) {
            console.error("从 Tauri URL 提取路径失败:", e);
          }
        }
      }
      
      // 为图片添加样式和点击事件
      if (!img.classList.contains('note-image')) {
        img.className = 'note-image';
        img.style.maxWidth = "100%";
        img.style.borderRadius = "4px";
        img.style.margin = "8px 0";
        img.style.cursor = "pointer";
        img.onclick = () => {
          setImageToDelete(img);
          setShowDeleteImageConfirm(true);
        };
      }
    });
  }, []);

  // 加载便签数据
  useEffect(() => {
    const loadNoteAndShow = async () => {
      try {
        const data = await invoke<NoteData | null>("get_note", { id: noteId });
        if (data && contentRef.current) {
          contentRef.current.innerHTML = data.content || "";
          // 修复已保存图片的路径
          fixSavedImages();
          setThemeIndex(data.theme_index || 0);
          setOpacity(data.opacity || 0);
          setAlwaysOnTop(data.always_on_top === true);
          // 确保窗口状态与数据一致
          if (data.always_on_top === true) {
            const appWindow = getCurrentWindow();
            appWindow.setAlwaysOnTop(true).catch(console.error);
          } else {
            const appWindow = getCurrentWindow();
            appWindow.setAlwaysOnTop(false).catch(console.error);
          }
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
  }, [noteId, fixSavedImages]);

  // 处理图片路径，保存原始路径到 data 属性
  const normalizeImagePaths = useCallback((html: string): string => {
    if (!html) return html;
    
    // 创建临时容器来解析 HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    const images = tempDiv.querySelectorAll('img');
    images.forEach((img) => {
      const src = img.src;
      
      // 如果图片有 data-image-path，保持不变
      if (img.getAttribute("data-image-path")) {
        return;
      }
      
      // 如果图片路径是 Tauri URL，尝试提取原始路径
      if (src.includes('__tauri') || src.includes('localhost')) {
        const urlMatch = src.match(/__tauri[^\/]+\/(.+)$/);
        if (urlMatch && urlMatch[1]) {
          const decodedPath = decodeURIComponent(urlMatch[1]);
          img.setAttribute("data-image-path", decodedPath);
        }
      }
      // 如果图片路径是 file://，提取路径
      else if (src.startsWith('file://')) {
        const filePath = src.replace(/^file:\/\/\//, '').replace(/^file:\/\//, '');
        const normalizedPath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
        img.setAttribute("data-image-path", normalizedPath);
      }
      // 如果是 base64，不处理（不应该出现，因为我们已经移除了 base64 回退）
      else if (src.startsWith('data:')) {
        console.warn("发现 base64 图片，这不应该发生");
      }
    });
    
    return tempDiv.innerHTML;
  }, []);

  // 防抖保存
  const saveToBackend = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        let content = contentRef.current?.innerHTML || "";
        // 在保存前规范化图片路径
        content = normalizeImagePaths(content);
        await invoke("save_note", { id: noteId, content, themeIndex });
      } catch (e) {
        console.error("保存便签失败:", e);
      }
    }, 500);
  }, [noteId, themeIndex, normalizeImagePaths]);

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

  // 处理粘贴事件
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    let foundImage = false;
    
    // 调试：打印所有剪贴板项目
    if (items && items.length > 0) {
      console.log("剪贴板项目数量:", items.length);
      for (let i = 0; i < items.length; i++) {
        console.log(`项目 ${i}: type="${items[i].type}", kind="${items[i].kind}"`);
      }
    }
    
    // 先尝试使用浏览器的 Clipboard API 检测图片
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const type = item.type.toLowerCase();
        
        // 检查是否是图片类型（扩展检测范围）
        if (item.kind === "file" && (
          type.startsWith("image/") ||
          type.includes("png") ||
          type.includes("jpeg") ||
          type.includes("jpg") ||
          type.includes("gif") ||
          type.includes("webp")
        )) {
          // 找到图片时才阻止默认行为
          e.preventDefault();
          try {
            const file = item.getAsFile();
            if (file && file.size > 0) {
              console.log("从浏览器剪贴板读取到图片文件:", {
                name: file.name || "未命名",
                type: file.type,
                size: file.size
              });
              await insertImage(file);
              foundImage = true;
              return;
            }
          } catch (err) {
            console.error("读取图片文件失败:", err);
            // 如果读取失败，不阻止默认行为，让文本继续粘贴
            foundImage = false;
          }
        }
      }
    }
    
    // 如果浏览器 API 没有找到图片，尝试使用 Windows 系统剪贴板 API
    // 只有在确认可能包含图片时才调用（避免不必要的 API 调用影响文本粘贴）
    if (!foundImage) {
      // 检查是否可能是图片（检查是否有文件类型但浏览器 API 没识别）
      const hasFileType = items && Array.from(items).some(item => item.kind === "file");
      
      if (hasFileType) {
        // 只有在有文件类型时才尝试 Windows API
        try {
          console.log("尝试使用 Windows 系统剪贴板 API...");
          const clipboardImage = await invoke<string | null>("get_clipboard_image");
          if (clipboardImage) {
            e.preventDefault();
            console.log("从 Windows 剪贴板读取到图片");
            // 将 base64 数据转换为 Blob 并插入
            const response = await fetch(clipboardImage);
            const blob = await response.blob();
            const file = new File([blob], "clipboard-image.png", { type: "image/png" });
            await insertImage(file);
            foundImage = true;
            return;
          }
        } catch (err) {
          console.error("从 Windows 剪贴板读取图片失败:", err);
        }
      }
    }
    
    // 如果没有找到图片，不调用 preventDefault，让文本正常粘贴
    if (!foundImage) {
      console.log("未找到图片，允许默认粘贴行为（文本等）");
    }
  }, []);

  // 插入图片
  const insertImage = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      
      try {
        const savedPath = await invoke<string>("save_image", { imageData: base64 });
        
        const img = document.createElement("img");
        // 使用 convertFileSrc 转换文件路径为可访问的 URL
        img.src = convertFileSrc(savedPath);
        // 保存原始文件路径作为 data 属性，方便后续处理
        img.setAttribute("data-image-path", savedPath);
        img.className = "note-image";
        img.style.maxWidth = "100%";
        img.style.borderRadius = "4px";
        img.style.margin = "8px 0";
        img.style.cursor = "pointer";
        img.onclick = () => {
          setImageToDelete(img);
          setShowDeleteImageConfirm(true);
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
        // 如果保存失败，显示错误提示，不插入图片
        alert(t("note.imageSaveFailed") || "保存图片失败，请重试");
      }
    };
    reader.readAsDataURL(file);
  };

  // 确认删除图片
  const confirmDeleteImage = () => {
    if (imageToDelete) {
      imageToDelete.remove();
      handleContentChange();
    }
    setShowDeleteImageConfirm(false);
    setImageToDelete(null);
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
      // 同步窗口状态
      const appWindow = getCurrentWindow();
      await appWindow.setAlwaysOnTop(newState);
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

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    try {
      await invoke("delete_note", { id: noteId });
    } catch (e) {
      console.error("删除便签失败:", e);
    }
    setShowDeleteConfirm(false);
  };

  const cycleTheme = () => {
    setThemeIndex((prev) => (prev + 1) % NOTE_THEMES.length);
  };

  // 编辑状态处理
  const handleContentFocus = () => {
    setIsEditing(true);
  };

  const handleContentBlur = () => {
    setIsEditing(false);
    handleContentChange();
  };

  // 鼠标进入/离开
  const handleMouseEnter = () => {
    setIsHovering(true);
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
    setShowOpacitySlider(false);
  };

  // 计算实际的背景透明度
  const bgOpacity = (100 - opacity) / 100;

  return (
    <>
      <div
        ref={containerRef}
        className={`note-container ${showToolbar ? 'toolbar-visible' : 'toolbar-hidden'}`}
        onContextMenu={handleContextMenu}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          "--note-bg": theme.bg,
          "--note-header": theme.header,
          "--note-text": theme.text,
          "--note-opacity": bgOpacity,
        } as React.CSSProperties}
      >
        {/* 顶部拖拽把手 */}
        <div className={`note-header ${showToolbar ? 'visible' : ''}`} data-tauri-drag-region>
          <div className="drag-indicator" data-tauri-drag-region>
            <span data-tauri-drag-region></span>
            <span data-tauri-drag-region></span>
            <span data-tauri-drag-region></span>
          </div>

          {alwaysOnTop && <span className="pin-indicator" title="已置顶">📍</span>}

          {/* 工具栏 */}
          <div className="note-toolbar">
            <button
              className="toolbar-btn"
              onClick={() => fileInputRef.current?.click()}
              title={t("note.addImage")}
            >
              🖼️
            </button>

            <button className="toolbar-btn" onClick={cycleTheme} title="切换颜色">
              🎨
            </button>

            {/* 透明度调节 */}
            <div className="opacity-control">
              <button
                className="toolbar-btn"
                onClick={() => setShowOpacitySlider(!showOpacitySlider)}
                title={`${t("note.opacity")}: ${opacity}%`}
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
          onFocus={handleContentFocus}
          onBlur={handleContentBlur}
          data-placeholder={t("note.placeholder")}
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
            <button onClick={() => { setShowOpacitySlider(true); setShowContextMenu(false); setShowToolbar(true); }}>
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

      {/* 删除便签确认对话框 */}
      <ConfirmDialog
        open={showDeleteConfirm}
        title={t("confirm.deleteNote")}
        message={t("confirm.deleteNoteWarning")}
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
        confirmText={t("common.delete")}
        cancelText={t("common.cancel")}
        danger={true}
      />

      {/* 删除图片确认对话框 */}
      <ConfirmDialog
        open={showDeleteImageConfirm}
        title={t("confirm.deleteImage")}
        message={t("confirm.deleteImageWarning")}
        onConfirm={confirmDeleteImage}
        onCancel={() => {
          setShowDeleteImageConfirm(false);
          setImageToDelete(null);
        }}
        confirmText={t("common.delete")}
        cancelText={t("common.cancel")}
        danger={true}
      />
    </>
  );
}

export default Note;
