import { describe, expect, it } from "vitest";
import { initialLanguage, LANGUAGE_STORAGE_KEY, saveExplicitLanguage } from "./languagePreference";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

describe("browser language preference", () => {
  it("detects browser language only when there is no explicit preference", () => {
    const storage = memoryStorage();
    expect(initialLanguage("es-MX", storage)).toBe("es");
    expect(initialLanguage("en-US", storage)).toBe("en");
    expect(storage.values.has(LANGUAGE_STORAGE_KEY)).toBe(false);
  });

  it("keeps explicit Spanish across navigation, reload, staff and client entry, then persists English", () => {
    const storage = memoryStorage();
    saveExplicitLanguage("es", storage);
    expect(initialLanguage("en-US", storage)).toBe("es"); // full reload / staff boot
    expect(initialLanguage("en-US", storage)).toBe("es"); // client portal boot
    saveExplicitLanguage("en", storage);
    expect(initialLanguage("es-MX", storage)).toBe("en");
  });

  it("ignores unsupported stored values and unavailable storage", () => {
    const storage = memoryStorage();
    storage.setItem(LANGUAGE_STORAGE_KEY, "fr");
    expect(initialLanguage("es-ES", storage)).toBe("es");
    expect(initialLanguage("en-US", { getItem: () => { throw new Error("blocked"); } })).toBe("en");
    expect(() => saveExplicitLanguage("es", { setItem: () => { throw new Error("blocked"); } })).not.toThrow();
  });
});
