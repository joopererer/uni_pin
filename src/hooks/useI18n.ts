import { useState, useEffect, useCallback } from 'react';
import { setLanguage, getLanguage, t as translate, tWithParams, Language } from '../i18n';
import { invoke } from '@tauri-apps/api/core';

export function useI18n() {
  const [lang, setLangState] = useState<Language>(getLanguage());

  useEffect(() => {
    // 加载保存的语言设置
    const loadLanguage = async () => {
      try {
        const savedLang = await invoke<Language>('get_language');
        if (savedLang === 'zh' || savedLang === 'en') {
          setLanguage(savedLang);
          setLangState(savedLang);
        }
      } catch (e) {
        console.error('Failed to load language:', e);
      }
    };
    
    loadLanguage();

    // 监听语言变更事件
    const handleLanguageChange = (e: CustomEvent<Language>) => {
      setLangState(e.detail);
    };
    
    window.addEventListener('languageChanged', handleLanguageChange as EventListener);
    
    return () => {
      window.removeEventListener('languageChanged', handleLanguageChange as EventListener);
    };
  }, []);

  const changeLanguage = useCallback(async (newLang: Language) => {
    try {
      await invoke('set_language', { language: newLang });
      setLanguage(newLang);
      setLangState(newLang);
    } catch (e) {
      console.error('Failed to save language:', e);
    }
  }, []);

  const t = useCallback((key: string) => translate(key), [lang]);
  const tWith = useCallback((key: string, params: Record<string, string | number>) => {
    return tWithParams(key, params);
  }, [lang]);

  return { t, tWith, language: lang, changeLanguage };
}
