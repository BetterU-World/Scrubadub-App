export const LANGUAGE_STORAGE_KEY = "scrub_language";
export type SupportedLanguage = "en" | "es";

export function initialLanguage(browserLanguage: string, storage?: Pick<Storage, "getItem">): SupportedLanguage {
  try {
    const saved = storage?.getItem(LANGUAGE_STORAGE_KEY);
    if (saved === "en" || saved === "es") return saved;
  } catch {
    // Storage may be unavailable in private or restricted browser contexts.
  }
  return browserLanguage.toLowerCase().startsWith("es") ? "es" : "en";
}

export function saveExplicitLanguage(language: SupportedLanguage, storage?: Pick<Storage, "setItem">): void {
  try {
    (storage ?? localStorage).setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // The current page can still switch languages without storage.
  }
}
