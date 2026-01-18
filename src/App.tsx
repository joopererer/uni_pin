import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import StickyNote from "./components/StickyNote";

function App() {
  const [noteId, setNoteId] = useState<string | null>(null);

  useEffect(() => {
    // 获取当前窗口的 label 作为便签 ID
    const window = getCurrentWindow();
    setNoteId(window.label);
  }, []);

  const handleClose = async () => {
    const window = getCurrentWindow();
    await window.close();
  };

  const handleMinimize = async () => {
    const window = getCurrentWindow();
    await window.minimize();
  };

  return (
    <StickyNote
      noteId={noteId || "note"}
      onClose={handleClose}
      onMinimize={handleMinimize}
    />
  );
}

export default App;
