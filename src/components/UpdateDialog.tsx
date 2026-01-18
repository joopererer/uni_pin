import { useEffect } from "react";
import { open } from "@tauri-apps/plugin-shell";

interface UpdateDialogProps {
  open: boolean;
  version: string;
  downloadUrl: string;
  releaseNotes?: string;
  onClose: () => void;
}

export default function UpdateDialog({
  open: openDialog,
  version,
  downloadUrl,
  releaseNotes,
  onClose,
}: UpdateDialogProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && openDialog) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [openDialog, onClose]);

  const handleDownload = async () => {
    try {
      await open(downloadUrl);
      onClose();
    } catch (e) {
      console.error("打开下载链接失败:", e);
      // 备用：复制链接到剪贴板
      try {
        await navigator.clipboard.writeText(downloadUrl);
        alert(`下载链接已复制到剪贴板:\n${downloadUrl}`);
      } catch (err) {
        alert(`请手动访问: ${downloadUrl}`);
      }
    }
  };


  if (!openDialog) return null;

  return (
    <div className="update-dialog-overlay" onClick={onClose}>
      <div className="update-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="update-dialog-header">
          <h2>🆕 发现新版本</h2>
          <button className="update-dialog-close" onClick={onClose}>×</button>
        </div>
        <div className="update-dialog-content">
          <p className="update-version">版本 {version}</p>
          {releaseNotes && (
            <div className="update-notes">
              <h3>更新内容：</h3>
              <div dangerouslySetInnerHTML={{ __html: releaseNotes }} />
            </div>
          )}
          <div className="update-dialog-actions">
            <button className="update-btn secondary" onClick={onClose}>
              稍后提醒
            </button>
            <button className="update-btn primary" onClick={handleDownload}>
              立即下载
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
