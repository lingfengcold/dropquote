import { useI18n } from '../lib/i18n';
import type { Locale } from '../lib/locale';

export function LanguageSelect() {
  const { locale, setLocale } = useI18n();
  return <select aria-label="Language / 语言" className="shrink-0 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700 focus:outline-blue-600" value={locale} onChange={e => setLocale(e.target.value as Locale)}>
    <option value="zh-CN">中文</option><option value="en">English</option>
  </select>;
}
