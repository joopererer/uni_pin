import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Note from "./components/Note";

function App() {
  const [noteId, setNoteId] = useState<string | null>(null);

  useEffect(() => {
    // 获取当前窗口的 label 作为便签 ID
    const window = getCurrentWindow();
    setNoteId(window.label);
  }, []);

  if (!noteId) {
    return null; // 等待获取窗口 ID
  }

  return <Note noteId={noteId} />;
}

export default App;
