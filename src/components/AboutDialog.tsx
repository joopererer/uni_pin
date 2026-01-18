import { open } from "@tauri-apps/plugin-shell";
import { useI18n } from "../hooks/useI18n";

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
  version: string;
  onCheckUpdate?: () => void;
}

export default function AboutDialog({ open: openDialog, onClose, version, onCheckUpdate: _onCheckUpdate }: AboutDialogProps) {
  const { t } = useI18n();
  const handleFeedback = async () => {
    try {
      const mailto = `mailto:joopererer@gmail.com?subject=UniPin%20${encodeURIComponent(t("about.feedback"))}&body=请在此输入您的反馈意见...`;
      await open(mailto);
    } catch (e) {
      console.error("打开邮件客户端失败:", e);
      // 备用方案：复制邮箱地址到剪贴板
      try {
        await navigator.clipboard.writeText("joopererer@gmail.com");
        alert("邮箱地址已复制到剪贴板：joopererer@gmail.com");
      } catch (err) {
        alert("请手动发送邮件至：joopererer@gmail.com");
      }
    }
  };

  if (!openDialog) return null;

  return (
    <div className="about-dialog-overlay" onClick={onClose}>
      <div className="about-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="about-dialog-header">
          <h2>📝 {t("about.title")}</h2>
          <button className="about-dialog-close" onClick={onClose}>×</button>
        </div>
        <div className="about-dialog-content">
          <div className="about-dialog-section">
            <h3>{t("about.version")}</h3>
            <p>{version}</p>
          </div>
          <div className="about-dialog-section">
            <h3>{t("about.intro")}</h3>
            <p>{t("about.description")}</p>
          </div>
          <div className="about-dialog-section">
            <h3>主要功能</h3>
            <ul>
              <li>📝 创建和管理多个便签</li>
              <li>🖼️ 支持粘贴和插入图片</li>
              <li>🎨 6 种颜色主题切换</li>
              <li>💧 透明度调节 (0-90%)</li>
              <li>📍 窗口置顶功能</li>
              <li>🔍 便签内容搜索</li>
              <li>⚙️ 开机自动启动</li>
            </ul>
          </div>
          <div className="about-dialog-section">
            <h3>{t("about.shortcuts")}</h3>
            <p>Alt + N: {t("tray.newNote")}</p>
          </div>
          <div className="about-dialog-section">
            <button className="about-feedback-btn" onClick={handleFeedback}>
              💬 {t("about.feedback")}
            </button>
            {_onCheckUpdate && (
              <button className="about-feedback-btn" onClick={_onCheckUpdate} style={{ marginTop: "8px" }}>
                🔄 {t("about.checkUpdate")}
              </button>
            )}
          </div>
          <div className="about-dialog-footer">
            <p>{t("about.copyright")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
