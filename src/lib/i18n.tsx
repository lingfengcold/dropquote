import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { LOCALE_KEY, localizeMessage, resolveLocale } from './locale';
import type { Locale } from './locale';

interface I18n {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (en: string, zh: string) => string;
  localize: (message: string) => string;
}

const LanguageContext = createContext<I18n | null>(null);

function initialLocale(): Locale {
  let saved: string | null = null;
  try { saved = localStorage.getItem(LOCALE_KEY); } catch { /* Language switching still works without storage. */ }
  return resolveLocale(saved, typeof navigator === 'undefined' ? 'en' : navigator.language);
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = locale === 'zh-CN' ? 'Dropquote 求解器' : 'Drop Quote Solver';
    try { localStorage.setItem(LOCALE_KEY, locale); } catch { /* Optional preference; puzzle export remains available. */ }
  }, [locale]);
  return <LanguageContext.Provider value={{ locale, setLocale, t: (en, zh) => locale === 'zh-CN' ? zh : en, localize: message => localizeMessage(message, locale) }}>{children}</LanguageContext.Provider>;
}

export function useI18n(): I18n {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useI18n must be used within LanguageProvider.');
  return context;
}
