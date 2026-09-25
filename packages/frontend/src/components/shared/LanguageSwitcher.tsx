import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import { saveExplicitLanguage } from "../../i18n/languagePreference";

const LANGUAGES = [
  { code: "en", label: "EN" },
  { code: "es", label: "ES" },
] as const;

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const current = i18n.language;

  return (
    <div className="flex items-center gap-1">
      <Globe className="w-4 h-4 text-gray-400" />
      {LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          onClick={() => {
            saveExplicitLanguage(lang.code);
            void i18n.changeLanguage(lang.code);
          }}
          className={`min-h-11 px-1.5 py-0.5 text-xs font-medium rounded transition-colors ${
            current === lang.code
              ? "bg-primary-100 text-primary-700"
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
          }`}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
}
