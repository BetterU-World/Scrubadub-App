import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./en/common.json";
import es from "./es/common.json";

const STORAGE_KEY = "scrub_language";

function getSavedLanguage(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "es") return saved;
  } catch {
    // localStorage unavailable
  }
  return "en";
}

i18n.use(initReactI18next).init({
  resources: {
    en: { common: en },
    es: { common: es },
  },
  lng: getSavedLanguage(),
  fallbackLng: "en",
  defaultNS: "common",
  ns: ["common"],
  interpolation: {
    escapeValue: false, // React already escapes
  },
});

// Persist language changes to localStorage
i18n.on("languageChanged", (lng) => {
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    // localStorage unavailable
  }
});

export default i18n;
