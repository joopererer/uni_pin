import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
// 导入 logger 以初始化日志系统（拦截 console 方法）
import "./utils/logger";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
