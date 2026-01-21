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
  const [autoShowToolbar, setAutoShowToolbar] = useState(false); // 菜单栏自动显示模式
  const [isFocused, setIsFocused] = useState(false); // 便签是否获得焦点
  
  const contentRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opacityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toolbarHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const theme = NOTE_THEMES[themeIndex];

  // 加载菜单栏显示模式设置，并监听设置变化事件
  useEffect(() => {
    const loadToolbarSetting = async () => {
      try {
        const setting = await invoke<boolean>("get_auto_show_toolbar");
        setAutoShowToolbar(setting);
      } catch (e) {
        console.error("加载菜单栏显示模式设置失败:", e);
      }
    };
    
    // 立即加载一次
    loadToolbarSetting();
    
    // 监听设置变化事件（从管理器窗口触发）
    const handleToolbarSettingChanged = (e: Event) => {
      const customEvent = e as CustomEvent<{ autoShow: boolean }>;
      if (customEvent.detail) {
        setAutoShowToolbar(customEvent.detail.autoShow);
        console.log("菜单栏显示模式设置已更新:", customEvent.detail.autoShow);
      }
    };
    window.addEventListener("toolbarSettingChanged", handleToolbarSettingChanged);
    
    // 定期检查设置变化作为备用（每3秒检查一次，防止事件系统失效）
    const interval = setInterval(loadToolbarSetting, 3000);
    
    return () => {
      window.removeEventListener("toolbarSettingChanged", handleToolbarSettingChanged);
      clearInterval(interval);
    };
  }, []);

  // 工具栏显示逻辑
  useEffect(() => {
    // 如果启用了自动显示模式，鼠标悬停或编辑时显示
    // 如果未启用，只有编辑时显示（通过单击获取焦点）
    // 但首次加载时总是显示（由首次加载 useEffect 控制隐藏）
    const shouldShow = autoShowToolbar 
      ? (isEditing || isHovering || isFocused)
      : (isEditing || isFocused);
    
    if (shouldShow) {
      setShowToolbar(true);
      if (toolbarHideTimeoutRef.current) {
        clearTimeout(toolbarHideTimeoutRef.current);
        toolbarHideTimeoutRef.current = null;
      }
    } else if (isLoaded) {
      // 只有在已加载后才开始隐藏倒计时
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
  }, [isEditing, isHovering, isFocused, autoShowToolbar, isLoaded]);

  // 当失去焦点时，自动隐藏工具栏（无论哪种模式）
  useEffect(() => {
    if (!isFocused && !isEditing && !isHovering && isLoaded) {
      const timer = setTimeout(() => {
        setShowToolbar(false);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isFocused, isEditing, isHovering, isLoaded]);

  // 首次加载显示工具栏，2秒后自动隐藏（仅在未启用自动显示模式时）
  useEffect(() => {
    if (isLoaded && !autoShowToolbar) {
      const timer = setTimeout(() => {
        if (!isEditing && !isHovering && !isFocused) {
          setShowToolbar(false);
        }
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isLoaded, autoShowToolbar, isEditing, isHovering, isFocused]);

  // 修复已保存图片的路径并绑定点击事件
  const fixSavedImages = useCallback(async () => {
    if (!contentRef.current) return;
    
    const images = contentRef.current.querySelectorAll('img');
    
    for (const img of Array.from(images)) {
      // 检查图片路径是否需要转换
      const src = img.src;
      const dataPath = img.getAttribute("data-image-path");
      
      // 辅助函数：从文件路径创建 Blob URL
      // 在生产环境中，直接使用 Tauri 命令读取文件，确保兼容性
      const createBlobUrlFromPath = async (filePath: string): Promise<string | null> => {
        try {
          console.log(`[修复图片] 从文件路径创建 Blob URL: ${filePath}`);
          
          // 直接使用 Tauri 命令读取文件并创建 Blob URL
          // 这样可以确保在开发和生产环境中都能正常工作
          try {
            const base64DataUrl = await invoke<string>("read_image_file", { filePath });
            console.log(`[修复图片] ✓ 成功读取文件，base64 长度: ${base64DataUrl.length}`);
            
            // 将 base64 数据 URL 转换为 Blob
            const response = await fetch(base64DataUrl);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            console.log(`[修复图片] ✓ 成功创建 Blob URL: ${blobUrl}`);
            return blobUrl;
          } catch (readError) {
            console.error(`[修复图片] ✗ 读取文件失败，尝试使用 convertFileSrc: ${readError}`);
            // 如果读取失败，尝试使用 convertFileSrc
            const normalizedPath = filePath.replace(/\\/g, '/');
            const convertedUrl = convertFileSrc(normalizedPath);
            console.log(`[修复图片] 使用 convertFileSrc URL: ${convertedUrl}`);
            return convertedUrl;
          }
        } catch (e) {
          console.error("[修复图片] 转换路径失败:", e);
          return null;
        }
      };
      
      // 优先使用 data-image-path 属性（如果存在）
      if (dataPath) {
        console.log(`[修复图片] 发现 data-image-path: ${dataPath}`);
        
        // 检查当前 src 是否已经有效（比如已经是有效的 Blob URL）
        // 如果当前 src 是有效的 Blob URL 且已加载，不需要重新加载
        if (src.startsWith('blob:') && img.complete && img.naturalWidth > 0) {
          console.log("[修复图片] 图片已经是有效的 Blob URL 且已加载，跳过重新加载");
          // 即使不重新加载，也要确保有正确的样式和点击事件（在下面处理）
        } else {
          // 无论之前使用的是什么，都通过 createBlobUrlFromPath 重新创建
          // 这样可以确保 asset.localhost URL 被正确处理（使用 Tauri 命令读取文件）
          console.log("[修复图片] 从文件路径创建图片 URL");
          const imageUrl = await createBlobUrlFromPath(dataPath);
          if (imageUrl) {
            img.src = imageUrl;
            // 如果是 Blob URL，设置标记
            if (imageUrl.startsWith('blob:')) {
              img.setAttribute("data-use-blob", "true");
            }
          }
        }
      }
      // 如果图片路径是 file:// 开头的，需要转换为 convertFileSrc
      else if (src.startsWith('file://')) {
        try {
          // 提取原始文件路径（去除 file:// 前缀）
          const filePath = src.replace(/^file:\/\/\//, '').replace(/^file:\/\//, '');
          // 在 Windows 上，路径可能包含驱动器字母，需要特殊处理
          const normalizedPath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
          const blobUrl = await createBlobUrlFromPath(normalizedPath);
          if (blobUrl) {
            img.src = blobUrl;
          } else {
            img.src = convertFileSrc(normalizedPath);
          }
          // 保存原始路径到 data 属性
          img.setAttribute("data-image-path", normalizedPath);
        } catch (e) {
          console.error("[修复图片] 转换 file:// 路径失败:", e);
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
          const blobUrl = await createBlobUrlFromPath(decodedPath);
          if (blobUrl) {
            img.src = blobUrl;
            img.setAttribute("data-use-blob", "true");
          } else {
            try {
              img.src = convertFileSrc(decodedPath);
            } catch (e) {
              console.error("[修复图片] 从 Tauri URL 提取路径失败:", e);
            }
          }
          img.setAttribute("data-image-path", decodedPath);
        }
      }
      // 如果图片是 Blob URL 但没有 data-image-path，无法修复
      else if (src.startsWith('blob:')) {
        console.warn("[修复图片] 发现 Blob URL 但没有 data-image-path，无法修复:", src);
        // 即使无法修复，也要确保图片有正确的样式和点击事件
      }
      
      // 如果图片已经有正确的 src（比如已经是有效的 Blob URL 或 asset URL），不需要重新处理
      // 但需要确保图片有正确的样式和点击事件
      
      // 为图片添加样式（无论是否已经有 note-image class）
      // 确保图片有正确的样式
      if (!img.classList.contains('note-image')) {
        img.className = 'note-image';
      }
      img.style.maxWidth = "100%";
      img.style.borderRadius = "4px";
      img.style.margin = "0";
      img.style.cursor = "pointer"; // 改为 pointer，表示可点击
      
      // 添加点击事件：点击图片弹出删除提示框
      // 移除旧的事件监听器（如果存在），避免重复绑定
      img.onclick = null; // 清除旧的事件监听器
      img.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        console.log('[图片点击] 点击图片，弹出删除提示框');
        setImageToDelete(img);
        setShowDeleteImageConfirm(true);
      };
      
      // 添加加载成功和失败的日志
      const originalOnLoad = img.onload;
      img.onload = (e) => {
        console.log(`[修复图片] ✓ 图片加载成功: ${img.src.substring(0, 100)}...`);
        if (originalOnLoad) {
          originalOnLoad.call(img, e);
        }
      };
      
      const originalOnError = img.onerror;
      img.onerror = async (e) => {
        console.error(`[修复图片] ✗ 图片加载失败: ${img.src.substring(0, 100)}...`);
        // 如果有 data-image-path，尝试使用 Blob URL 回退
        const imagePath = img.getAttribute("data-image-path");
        if (imagePath && !img.src.startsWith('blob:')) {
          console.log("[修复图片] 尝试使用 Blob URL 回退");
          const blobUrl = await createBlobUrlFromPath(imagePath);
          if (blobUrl && blobUrl !== img.src) {
            img.src = blobUrl;
            img.setAttribute("data-use-blob", "true");
            // 移除错误处理，避免循环
            img.onerror = null;
          }
        }
        if (originalOnError) {
          originalOnError.call(img, e);
        }
      };
    }
  }, []);

  // 加载便签数据
  useEffect(() => {
    const loadNoteAndShow = async () => {
      try {
        const data = await invoke<NoteData | null>("get_note", { id: noteId });
        if (data && contentRef.current) {
          // 先设置内容，立即显示
          contentRef.current.innerHTML = data.content || "";
          // 立即设置 isLoaded，让内容先显示，不等待图片加载
          setIsLoaded(true);
          
          // 设置主题和其他属性
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
          
          // 异步修复图片路径，不阻塞内容显示
          // 使用 setTimeout 让浏览器有机会先渲染内容
          setTimeout(() => {
            fixSavedImages().catch(err => {
              console.error("修复图片路径时出错:", err);
            });
          }, 0);
        } else {
          setIsLoaded(true);
        }
        
        // 窗口在创建时已经根据 closed 状态决定是否显示
        // 这里只需要确保窗口可见（如果数据中 closed 为 false）
        if (data && !data.closed) {
          try {
            await invoke("show_note_window", { id: noteId });
          } catch (e) {
            console.warn("显示窗口失败（可能已经显示）:", e);
          }
        }
      } catch (e) {
        console.error("加载便签数据失败:", e);
        setIsLoaded(true);
        // 即使加载失败，也尝试显示窗口
        try {
          await invoke("show_note_window", { id: noteId });
        } catch (err) {
          console.warn("显示窗口失败:", err);
        }
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
    let triedWindowsAPI = false;
    
    console.log("=== [粘贴事件] 开始处理粘贴操作 ===");
    
    // 调试：打印所有剪贴板项目
    if (items && items.length > 0) {
      console.log(`[粘贴事件] 剪贴板项目数量: ${items.length}`);
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        console.log(`[粘贴事件] 项目 ${i}: type="${item.type}", kind="${item.kind}"`);
      }
    } else {
      console.log("[粘贴事件] 剪贴板为空或无法访问");
    }
    
    // 步骤1：先尝试使用浏览器的 Clipboard API 检测图片
    if (items) {
      console.log("[粘贴事件] 步骤1: 尝试使用浏览器 Clipboard API 检测图片");
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const type = item.type.toLowerCase();
        
        console.log(`[粘贴事件] 检查项目 ${i}: kind="${item.kind}", type="${item.type}"`);
        
        // 检查是否是图片类型（扩展检测范围）
        if (item.kind === "file" && (
          type.startsWith("image/") ||
          type.includes("png") ||
          type.includes("jpeg") ||
          type.includes("jpg") ||
          type.includes("gif") ||
          type.includes("webp")
        )) {
          console.log(`[粘贴事件] ✓ 检测到图片类型: ${type}`);
          // 找到图片时才阻止默认行为
          e.preventDefault();
          try {
            const file = item.getAsFile();
            if (file && file.size > 0) {
              console.log("[粘贴事件] ✓ 成功读取图片文件:", {
                name: file.name || "未命名",
                type: file.type,
                size: file.size,
                lastModified: new Date(file.lastModified).toISOString()
              });
              await insertImage(file);
              foundImage = true;
              console.log("[粘贴事件] ✓ 图片插入成功，处理完成");
              return;
            } else {
              console.warn("[粘贴事件] ✗ 读取到的文件为空或大小为0:", file);
            }
          } catch (err) {
            console.error("[粘贴事件] ✗ 读取图片文件时发生错误:", err);
            // 如果读取失败，不阻止默认行为，让文本继续粘贴
            foundImage = false;
          }
        }
      }
      console.log("[粘贴事件] 步骤1完成: 浏览器 API 未找到图片");
    }
    
    // 步骤2：如果浏览器 API 没有找到图片，尝试使用 Windows 系统剪贴板 API
    // 对于网络图片（从网页复制），浏览器剪贴板可能不会暴露文件类型，但 Windows 剪贴板可能包含 DIB 格式
    // 所以我们总是尝试 Windows API（如果浏览器 API 没找到图片）
    if (!foundImage) {
      triedWindowsAPI = true;
      console.log("[粘贴事件] 步骤2: 尝试使用 Windows 系统剪贴板 API");
      console.log("[粘贴事件] 提示: 浏览器 API 可能无法识别所有图片格式（特别是从网页复制的图片），尝试使用系统 API...");
      try {
        const clipboardImage = await invoke<string | null>("get_clipboard_image");
        console.log(`[粘贴事件] Windows API 返回结果: ${clipboardImage ? "找到图片" : "未找到图片"}`);
        if (clipboardImage) {
          e.preventDefault();
          console.log("[粘贴事件] ✓ 从 Windows 剪贴板读取到图片数据，开始转换...");
          try {
            // 将 base64 数据转换为 Blob 并插入
            const response = await fetch(clipboardImage);
            const blob = await response.blob();
            console.log(`[粘贴事件] ✓ Base64 数据转换为 Blob 成功: type="${blob.type}", size=${blob.size}`);
            const file = new File([blob], "clipboard-image.png", { type: "image/png" });
            await insertImage(file);
            foundImage = true;
            console.log("[粘贴事件] ✓ 图片插入成功，处理完成");
            return;
          } catch (err) {
            console.error("[粘贴事件] ✗ Base64 转换或插入图片时发生错误:", err);
            const errorDetails = err instanceof Error ? err.message : String(err);
            console.error(`[粘贴事件] 错误详情: ${errorDetails}`);
          }
        } else {
          console.log("[粘贴事件] Windows API 返回 None，剪贴板中可能没有图片或格式不支持");
        }
      } catch (err) {
        console.error("[粘贴事件] ✗ 调用 Windows 剪贴板 API 失败:", err);
        const errorDetails = err instanceof Error ? err.message : String(err);
        console.error(`[粘贴事件] 错误详情: ${errorDetails}`);
      }
      console.log("[粘贴事件] 步骤2完成: Windows API 未找到图片");
    }
    
    // 如果所有方式都尝试过但未找到图片
    if (!foundImage && triedWindowsAPI) {
      console.warn("[粘贴事件] ✗ 所有图片检测方式都失败，可能原因：");
      console.warn("  1. 剪贴板中确实没有图片");
      console.warn("  2. 图片格式不被支持");
      console.warn("  3. 剪贴板访问权限问题");
      console.warn("  4. 图片格式无法被识别");
      // 显示提示给用户
      alert(t("note.imagePasteFailed") || "无法识别剪贴板中的图片。请确认：\n1. 剪贴板中确实包含图片\n2. 图片格式受支持（PNG、JPEG、GIF、WebP）\n3. 如果是网页图片，请尝试右键另存为后再粘贴");
    }
    
    // 如果没有找到图片，不调用 preventDefault，让文本正常粘贴
    if (!foundImage) {
      console.log("[粘贴事件] 未找到图片，允许默认粘贴行为（文本等）");
    }
    console.log("=== [粘贴事件] 处理完成 ===");
  }, [t]);

  // 插入图片
  const insertImage = async (file: File) => {
    console.log("=== [插入图片] 开始处理图片文件 ===");
    console.log("[插入图片] 文件信息:", {
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: new Date(file.lastModified).toISOString()
    });
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      console.log(`[插入图片] FileReader 完成，Base64 长度: ${base64.length} 字符`);
      
      if (!base64 || !base64.startsWith("data:")) {
        console.error("[插入图片] ✗ Base64 数据格式无效");
        alert(t("note.imagePasteFailed") || "图片数据格式无效，请重试");
        return;
      }
      
      try {
        console.log("[插入图片] 调用后端 save_image 命令...");
        const savedPath = await invoke<string>("save_image", { imageData: base64 });
        console.log(`[插入图片] ✓ 图片已保存到: ${savedPath}`);
        
        const img = document.createElement("img");
        // 规范化路径：将 Windows 反斜杠转换为正斜杠
        // convertFileSrc 可能需要标准化的路径格式
        const normalizedPath = savedPath.replace(/\\/g, '/');
        console.log(`[插入图片] 规范化路径: ${normalizedPath}`);
        
        // 辅助函数：从 base64 创建 Blob URL
        const createBlobUrlFromBase64 = (base64Data: string): string => {
          // base64 数据格式: "data:image/png;base64,iVBORw0KG..."
          const parts = base64Data.split(',');
          if (parts.length !== 2) {
            throw new Error("无效的 base64 数据格式");
          }
          const mimeType = parts[0].match(/data:([^;]+)/)?.[1] || 'image/jpeg';
          const base64Content = parts[1];
          
          // 解码 base64 为二进制数据
          const binaryString = atob(base64Content);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          
          // 创建 Blob 并生成 URL
          const blob = new Blob([bytes], { type: mimeType });
          return URL.createObjectURL(blob);
        };
        
        // 尝试使用 convertFileSrc，但如果失败则使用 Blob URL 作为回退
        // 在开发模式下，asset.localhost 可能无法工作，所以我们需要回退方案
        let imageUrl: string;
        let useBlobUrl = false;
        
        try {
          imageUrl = convertFileSrc(normalizedPath);
          console.log(`[插入图片] 图片 URL (convertFileSrc): ${imageUrl}`);
          
          // 如果 URL 包含 asset.localhost，直接使用 Blob URL 作为回退（因为已知会失败）
          if (imageUrl.includes('asset.localhost')) {
            console.log("[插入图片] 检测到 asset.localhost URL，直接使用 Blob URL");
            imageUrl = createBlobUrlFromBase64(base64);
            useBlobUrl = true;
            console.log(`[插入图片] 图片 URL (Blob): ${imageUrl}`);
          }
        } catch (e) {
          console.warn("[插入图片] convertFileSrc 失败，使用 Blob URL:", e);
          imageUrl = createBlobUrlFromBase64(base64);
          useBlobUrl = true;
          console.log(`[插入图片] 图片 URL (Blob fallback): ${imageUrl}`);
        }
        
        img.src = imageUrl;
        // 保存原始文件路径作为 data 属性，方便后续处理
        img.setAttribute("data-image-path", savedPath);
        // 如果使用 Blob URL，也保存标记
        if (useBlobUrl) {
          img.setAttribute("data-use-blob", "true");
        }
        img.className = "note-image";
        img.style.maxWidth = "100%";
        img.style.borderRadius = "4px";
        img.style.margin = "0";
        img.style.cursor = "pointer"; // 改为 pointer，表示可点击
        
        // 添加点击事件：点击图片弹出删除提示框
        img.onclick = (e) => {
          e.stopPropagation();
          e.preventDefault();
          console.log('[图片点击] 点击图片，弹出删除提示框');
          setImageToDelete(img);
          setShowDeleteImageConfirm(true);
        };
        
        img.onload = () => {
          console.log("[插入图片] ✓ 图片元素加载成功");
        };
        img.onerror = (err) => {
          console.error("[插入图片] ✗ 图片元素加载失败:", err);
          // 如果 convertFileSrc 的 URL 加载失败，尝试使用 Blob URL
          if (!useBlobUrl && (imageUrl.includes('asset.localhost') || imageUrl.includes('asset://'))) {
            console.log("[插入图片] asset URL 加载失败，尝试使用 Blob URL 回退");
            try {
              const blobUrl = createBlobUrlFromBase64(base64);
              img.src = blobUrl;
              img.setAttribute("data-use-blob", "true");
              console.log(`[插入图片] 已切换到 Blob URL: ${blobUrl}`);
            } catch (e) {
              console.error("[插入图片] ✗ Blob URL 创建也失败:", e);
            }
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
          console.log("[插入图片] ✓ 图片已插入到当前光标位置");
        } else if (contentRef.current) {
          contentRef.current.appendChild(img);
          console.log("[插入图片] ✓ 图片已追加到内容末尾");
        }

        handleContentChange();
        console.log("=== [插入图片] 处理完成 ===");
      } catch (err) {
        console.error("[插入图片] ✗ 保存图片失败:", err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error("[插入图片] 错误详情:", errorMessage);
        // 如果保存失败，显示错误提示，不插入图片
        alert(t("note.imageSaveFailed") || `保存图片失败: ${errorMessage}\n请重试`);
      }
    };
    reader.onerror = (err) => {
      console.error("[插入图片] ✗ FileReader 读取失败:", err);
      alert(t("note.imagePasteFailed") || "读取图片文件失败，请重试");
    };
    reader.readAsDataURL(file);
  };

  // 确认删除图片
  const confirmDeleteImage = () => {
    if (imageToDelete) {
      // 直接删除图片元素
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
    setIsFocused(true);
  };

  const handleContentBlur = () => {
    // 同步清除编辑状态和焦点状态，确保状态一致性
    setIsEditing(false);
    setIsFocused(false);
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

  // 单击便签容器获取焦点（用于非自动显示模式）
  const handleContainerClick = (e: React.MouseEvent) => {
    // 如果点击的不是内容区域或工具栏按钮，让内容区域获取焦点
    const target = e.target as HTMLElement;
    // 如果点击的是图片，不需要处理（图片点击由图片自己的事件处理）
    if (target.tagName === 'IMG' || target.closest('img')) {
      return;
    }
    // 如果点击的是内容区域本身，不需要处理（内容区域的点击会触发 focus）
    if (target === contentRef.current || target.closest('.note-content')) {
      return;
    }
    if (target === containerRef.current || 
        (target.closest('.note-header') && !target.closest('.note-toolbar') && !target.closest('button'))) {
      // 只调用 focus()，让 handleContentFocus 统一处理状态更新
      if (contentRef.current) {
        contentRef.current.focus();
      }
    }
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
        onClick={handleContainerClick}
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
          className={`note-content ${isEditing ? 'editing' : 'not-editing'} ${showToolbar ? 'toolbar-visible' : 'toolbar-hidden'}`}
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
