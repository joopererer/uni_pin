import { invoke } from "@tauri-apps/api/core";

// 日志级别
export enum LogLevel {
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
}

// 日志工具类
class Logger {
  private logPath: string | null = null;

  // 初始化日志路径
  async init() {
    try {
      this.logPath = await invoke<string>("get_log_path");
      this.info(`日志文件路径: ${this.logPath}`);
    } catch (e) {
      console.error("获取日志路径失败:", e);
    }
  }

  // 写入日志到文件
  private async writeToFile(level: LogLevel, message: string) {
    if (!this.logPath) {
      await this.init();
    }
    try {
      const logMessage = `[前端][${level}] ${message}`;
      await invoke("write_log", { message: logMessage });
    } catch (e) {
      // 静默失败，避免日志写入失败导致应用崩溃
      console.error("写入日志文件失败:", e);
    }
  }

  // 格式化消息（导出为公共方法，供拦截器使用）
  formatMessage(...args: any[]): string {
    return args
      .map((arg) => {
        if (typeof arg === "object") {
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      })
      .join(" ");
  }

  // DEBUG 级别日志
  debug(...args: any[]) {
    const message = this.formatMessage(...args);
    console.debug(`[DEBUG] ${message}`);
    this.writeToFile(LogLevel.DEBUG, message);
  }

  // INFO 级别日志
  info(...args: any[]) {
    const message = this.formatMessage(...args);
    console.info(`[INFO] ${message}`);
    this.writeToFile(LogLevel.INFO, message);
  }

  // WARN 级别日志
  warn(...args: any[]) {
    const message = this.formatMessage(...args);
    console.warn(`[WARN] ${message}`);
    this.writeToFile(LogLevel.WARN, message);
  }

  // ERROR 级别日志
  error(...args: any[]) {
    const message = this.formatMessage(...args);
    console.error(`[ERROR] ${message}`);
    this.writeToFile(LogLevel.ERROR, message);
  }

  // 获取日志文件路径
  async getLogPath(): Promise<string | null> {
    if (!this.logPath) {
      await this.init();
    }
    return this.logPath;
  }
}

// 导出单例
export const logger = new Logger();

// 格式化消息的辅助函数
function formatMessage(...args: any[]): string {
  return args
    .map((arg) => {
      if (typeof arg === "object") {
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    })
    .join(" ");
}

// 写入日志到文件的辅助函数
async function writeToFile(level: LogLevel, message: string) {
  try {
    const logMessage = `[前端][${level}] ${message}`;
    await invoke("write_log", { message: logMessage });
  } catch (e) {
    // 静默失败，避免日志写入失败导致应用崩溃
  }
}

// 拦截 console 方法，同时写入文件
const originalConsoleLog = console.log;
const originalConsoleInfo = console.info;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;
const originalConsoleDebug = console.debug;

console.log = (...args: any[]) => {
  originalConsoleLog(...args);
  const message = formatMessage(...args);
  writeToFile(LogLevel.INFO, message).catch(() => {});
};

console.info = (...args: any[]) => {
  originalConsoleInfo(...args);
  const message = formatMessage(...args);
  writeToFile(LogLevel.INFO, message).catch(() => {});
};

console.warn = (...args: any[]) => {
  originalConsoleWarn(...args);
  const message = formatMessage(...args);
  writeToFile(LogLevel.WARN, message).catch(() => {});
};

console.error = (...args: any[]) => {
  originalConsoleError(...args);
  const message = formatMessage(...args);
  writeToFile(LogLevel.ERROR, message).catch(() => {});
};

console.debug = (...args: any[]) => {
  originalConsoleDebug(...args);
  const message = formatMessage(...args);
  writeToFile(LogLevel.DEBUG, message).catch(() => {});
};

// 初始化日志系统
logger.init().catch(() => {});
