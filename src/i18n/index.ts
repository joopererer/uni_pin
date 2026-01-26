export type Language = 'zh' | 'en';

export interface Translations {
  // 通用
  common: {
    confirm: string;
    cancel: string;
    ok: string;
    delete: string;
    save: string;
    close: string;
      yes: string;
      no: string;
      loading: string;
  };
  // 管理中心
  manager: {
    title: string;
    newNote: string;
    showAll: string;
    hideAll: string;
    about: string;
    searchPlaceholder: string;
    selectMode: string;
    finishSelection: string;
    selectAll: string;
    deselectAll: string;
    batchShow: string;
    batchHide: string;
    batchDelete: string;
    selectedCount: string;
      visible: string;
      hidden: string;
      emptyNote: string;
      emptyState: string;
      emptySearch: string;
    autoStart: string;
    language: string;
    languageSetting: string;
    settings: string;
    autoShowToolbar: string;
  };
  // 便签
    note: {
      placeholder: string;
      addImage: string;
      changeColor: string;
      opacity: string;
      hide: string;
      delete: string;
      alwaysOnTop: string;
      cancelAlwaysOnTop: string;
      imageSaveFailed: string;
      imagePasteFailed: string;
    contextMenu: {
      pin: string;
      unpin: string;
      opacity: string;
      hide: string;
      delete: string;
    };
  };
  // 关于对话框
  about: {
    title: string;
    version: string;
    description: string;
    intro: string;
    features: string;
    shortcuts: string;
    feedback: string;
    checkUpdate: string;
    copyright: string;
  };
  // 更新对话框
  update: {
    title: string;
    version: string;
    releaseNotes: string;
    later: string;
    download: string;
    latest: string;
    checkFailed: string;
  };
  // 确认对话框
  confirm: {
    deleteNote: string;
    deleteNoteWarning: string;
    batchDelete: string;
    batchDeleteWarning: string;
    deleteImage: string;
    deleteImageWarning: string;
  };
  // 托盘菜单
  tray: {
    newNote: string;
    manager: string;
    showAll: string;
    hideAll: string;
    about: string;
    quit: string;
  };
}

const translations: Record<Language, Translations> = {
  zh: {
    common: {
      confirm: '确定',
      cancel: '取消',
      ok: '确定',
      delete: '删除',
      save: '保存',
      close: '关闭',
      yes: '是',
      no: '否',
      loading: '加载中...',
    },
    manager: {
      title: 'UniPin 管理中心',
      newNote: '新建便签',
      showAll: '显示全部',
      hideAll: '隐藏全部',
      about: '关于',
      searchPlaceholder: '搜索便签内容...',
      selectMode: '多选管理',
      finishSelection: '完成选择',
      selectAll: '全选',
      deselectAll: '取消全选',
      batchShow: '批量显示',
      batchHide: '批量隐藏',
      batchDelete: '批量删除',
      selectedCount: '已选择 {count} 项',
      visible: '显示中',
      hidden: '已隐藏',
      emptyNote: '空便签',
      emptyState: '还没有便签，点击上方按钮创建一个吧！',
      emptySearch: '没有找到包含 "{term}" 的便签',
      autoStart: '开机自动启动',
      language: '语言',
      languageSetting: '界面语言',
      autoShowToolbar: '菜单栏自动显示',
      settings: '设置',
    },
    note: {
      placeholder: '输入便签内容... 支持 Ctrl+V 粘贴图片',
      addImage: '添加图片',
      changeColor: '切换颜色',
      opacity: '透明度',
      hide: '隐藏便签',
      delete: '删除便签',
      alwaysOnTop: '置顶窗口',
      cancelAlwaysOnTop: '取消置顶',
      imageSaveFailed: '保存图片失败，请重试',
      imagePasteFailed: '无法识别剪贴板中的图片。\n\n可能的原因：\n1. 剪贴板中确实没有图片\n2. 图片格式不受支持（支持的格式：PNG、JPEG、GIF、WebP）\n3. 如果是网页图片，请尝试右键另存为后再粘贴',
      contextMenu: {
        pin: '置顶窗口',
        unpin: '取消置顶',
        opacity: '调节透明度',
        hide: '隐藏便签',
        delete: '删除便签',
      },
    },
    about: {
      title: 'UniPin',
      version: '版本',
      description: 'UniPin 是一款轻量级的桌面便签应用，支持多便签管理、图片插入、颜色主题、透明度调节等功能。',
      intro: '简介',
      features: '主要功能',
      shortcuts: '快捷键',
      feedback: '反馈建议',
      checkUpdate: '检查更新',
      copyright: '© 2026 UniPin 保留所有权利',
    },
    update: {
      title: '发现新版本',
      version: '版本 {version}',
      releaseNotes: '更新内容：',
      later: '稍后提醒',
      download: '立即下载',
      latest: '已是最新版本！',
      checkFailed: '检查更新失败，请稍后重试',
    },
    confirm: {
      deleteNote: '删除便签',
      deleteNoteWarning: '确定要删除这个便签吗？\n\n删除后无法恢复！',
      batchDelete: '批量删除',
      batchDeleteWarning: '确定要删除选中的 {count} 个便签吗？\n\n删除后无法恢复！',
      deleteImage: '删除图片',
      deleteImageWarning: '确定要删除这张图片吗？',
    },
    tray: {
      newNote: '新建便签 (Alt+N)',
      manager: '管理中心',
      showAll: '显示全部',
      hideAll: '隐藏全部',
      about: '关于',
      quit: '退出',
    },
  },
  en: {
    common: {
      confirm: 'Confirm',
      cancel: 'Cancel',
      ok: 'OK',
      delete: 'Delete',
      save: 'Save',
      close: 'Close',
      yes: 'Yes',
      no: 'No',
      loading: 'Loading...',
    },
    manager: {
      title: 'UniPin Management Center',
      newNote: 'New Note',
      showAll: 'Show All',
      hideAll: 'Hide All',
      about: 'About',
      searchPlaceholder: 'Search note content...',
      selectMode: 'Multi-select',
      finishSelection: 'Finish Selection',
      selectAll: 'Select All',
      deselectAll: 'Deselect All',
      batchShow: 'Batch Show',
      batchHide: 'Batch Hide',
      batchDelete: 'Batch Delete',
      selectedCount: '{count} selected',
      visible: 'Visible',
      hidden: 'Hidden',
      emptyNote: 'Empty Note',
      emptyState: 'No notes yet, click the button above to create one!',
      emptySearch: 'No notes found containing "{term}"',
      autoStart: 'Start with system',
      language: 'Language',
      languageSetting: 'Interface Language',
      autoShowToolbar: 'Auto-show toolbar',
      settings: 'Settings',
    },
    note: {
      placeholder: 'Enter note content... Support Ctrl+V to paste images',
      addImage: 'Add Image',
      changeColor: 'Change Color',
      opacity: 'Opacity',
      hide: 'Hide Note',
      delete: 'Delete Note',
      alwaysOnTop: 'Always on Top',
      cancelAlwaysOnTop: 'Cancel Always on Top',
      imageSaveFailed: 'Failed to save image, please try again',
      imagePasteFailed: 'Cannot identify image in clipboard.\n\nPossible reasons:\n1. Clipboard does not contain an image\n2. Image format is not supported (supported formats: PNG, JPEG, GIF, WebP)\n3. For web images, try right-clicking and saving first before pasting',
      contextMenu: {
        pin: 'Pin Window',
        unpin: 'Cancel Pin',
        opacity: 'Adjust Opacity',
        hide: 'Hide Note',
        delete: 'Delete Note',
      },
    },
    about: {
      title: 'UniPin',
      version: 'Version',
      description: 'UniPin is a lightweight desktop sticky notes application that supports multi-note management, image insertion, color themes, opacity adjustment, and more.',
      intro: 'Introduction',
      features: 'Features',
      shortcuts: 'Shortcuts',
      feedback: 'Feedback',
      checkUpdate: 'Check for Updates',
      copyright: '© 2026 UniPin All Rights Reserved',
    },
    update: {
      title: 'New Version Available',
      version: 'Version {version}',
      releaseNotes: 'Release Notes:',
      later: 'Remind Me Later',
      download: 'Download Now',
      latest: 'You are on the latest version!',
      checkFailed: 'Failed to check for updates, please try again later',
    },
    confirm: {
      deleteNote: 'Delete Note',
      deleteNoteWarning: 'Are you sure you want to delete this note?\n\nThis action cannot be undone!',
      batchDelete: 'Batch Delete',
      batchDeleteWarning: 'Are you sure you want to delete {count} selected notes?\n\nThis action cannot be undone!',
      deleteImage: 'Delete Image',
      deleteImageWarning: 'Are you sure you want to delete this image?',
    },
    tray: {
      newNote: 'New Note (Alt+N)',
      manager: 'Management Center',
      showAll: 'Show All',
      hideAll: 'Hide All',
      about: 'About',
      quit: 'Quit',
    },
  },
};

let currentLanguage: Language = 'zh';

export function setLanguage(lang: Language) {
  currentLanguage = lang;
  // 触发存储更新
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('languageChanged', { detail: lang }));
  }
}

export function getLanguage(): Language {
  return currentLanguage;
}

export function t(key: string): string {
  const keys = key.split('.');
  let value: any = translations[currentLanguage];
  
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      console.warn(`Translation key not found: ${key}`);
      return key;
    }
  }
  
  if (typeof value === 'string') {
    // Template replacement is handled by tWithParams
    return value;
  }
  
  return typeof value === 'string' ? value : key;
}

export function tWithParams(key: string, params: Record<string, string | number>): string {
  let text = t(key);
  for (const [name, value] of Object.entries(params)) {
    text = text.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value));
  }
  return text;
}

export { translations };
