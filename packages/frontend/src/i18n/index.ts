import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./en/common.json";
import es from "./es/common.json";
import { initialLanguage } from "./languagePreference";

function getSavedLanguage(): string {
  let storage: Storage | undefined;
  try {
    storage = localStorage;
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
  return initialLanguage(navigator.language ?? "en", storage);
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

export default i18n;
