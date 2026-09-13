import { useCallback, useEffect, useState } from "react";
import i18n from "../i18n";
import { CurrencyCode, LanguageCode, getLanguageInfo } from "../i18n/languages";

const LANG_STORAGE_KEY = "karegah-yar-language";
const CURRENCY_STORAGE_KEY = "karegah-yar-currency";
const CURRENCY_MANUAL_STORAGE_KEY = "karegah-yar-currency-manual";

function getInitialLanguage(): LanguageCode {
  const stored = localStorage.getItem(LANG_STORAGE_KEY);
  if (stored && stored in { fa: 1, en: 1, ar: 1, tr: 1, ur: 1, ku: 1, ps: 1, ru: 1 }) {
    return stored as LanguageCode;
  }
  // پیش‌فرض همیشه فارسی است — اپ برای بازار فارسی‌زبان ساخته شده.
  return "fa";
}

function getInitialCurrency(language: LanguageCode): CurrencyCode {
  const stored = localStorage.getItem(CURRENCY_STORAGE_KEY);
  if (stored) return stored as CurrencyCode;
  return getLanguageInfo(language).defaultCurrency;
}

function getIsCurrencyManual(): boolean {
  return localStorage.getItem(CURRENCY_MANUAL_STORAGE_KEY) === "1";
}

/**
 * هوک مدیریت زبان و واحد پول اپ. با هوک useThemeMode هم‌الگو است: مقدار در
 * localStorage نگه داشته می‌شود و تغییرش بلافاصله روی کل اپ (جهت صفحه،
 * تقویم، فرمت اعداد و واحد پول) اثر می‌گذارد.
 */
export function useLanguage() {
  const [language, setLanguageState] = useState<LanguageCode>(getInitialLanguage);
  const [currency, setCurrencyState] = useState<CurrencyCode>(() => getInitialCurrency(language));

  useEffect(() => {
    localStorage.setItem(LANG_STORAGE_KEY, language);
    const info = getLanguageInfo(language);
    document.documentElement.dir = info.dir;
    document.documentElement.lang = language;
    i18n.changeLanguage(language);
  }, [language]);

  useEffect(() => {
    localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
  }, [currency]);

  const setLanguage = useCallback((next: LanguageCode) => {
    setLanguageState(next);
    // با تغییر زبان، واحد پول فقط زمانی به‌صورت پیش‌فرض به واحد رایج آن
    // زبان تغییر می‌کند که کاربر قبلاً هیچ‌وقت واحد پول را به‌صورت دستی
    // انتخاب نکرده باشد. اگر کاربر قبلاً از تنظیمات واحد پول را دستی عوض
    // کرده، آن انتخاب باید صرفاً با تغییر زبان از بین نرود.
    if (!getIsCurrencyManual()) {
      setCurrencyState(getLanguageInfo(next).defaultCurrency);
    }
  }, []);

  const setCurrency = useCallback((next: CurrencyCode) => {
    localStorage.setItem(CURRENCY_MANUAL_STORAGE_KEY, "1");
    setCurrencyState(next);
  }, []);

  const info = getLanguageInfo(language);

  return { language, setLanguage, currency, setCurrency, dir: info.dir, calendar: info.calendar };
}
