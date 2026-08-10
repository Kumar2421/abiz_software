"use client";

import * as React from "react";

/**
 * Small translation layer.
 *
 * `t()` falls back to the English string when a key is missing, so a partially
 * translated dictionary degrades to readable English rather than showing raw
 * keys to a customer.
 */

export const LANGUAGES = [
  { code: "en", label: "English", native: "English" },
  { code: "ml", label: "Malayalam", native: "മലയാളം" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

const en = {
  // Navigation
  "nav.inbox": "Inbox",
  "nav.contacts": "Contacts",
  "nav.dashboard": "Dashboard",
  "nav.admin": "Admin",
  "nav.settings": "Settings",

  // Settings
  "settings.title": "Settings",
  "settings.whatsapp": "WhatsApp",
  "settings.welcome": "Welcome message",
  "settings.billing": "Billing",
  "settings.profile": "Profile",
  "settings.appearance": "Appearance",
  "settings.signOut": "Sign out",
  "settings.theme": "Theme",
  "settings.themeHint": "Applies to this browser only.",
  "settings.language": "Language",
  "settings.languageHint": "Changes the dashboard language for you.",
  "settings.privacy": "Privacy",

  // Theme
  "theme.light": "Light",
  "theme.dark": "Dark",
  "theme.system": "System",

  // Common
  "common.save": "Save",
  "common.saving": "Saving…",
  "common.cancel": "Cancel",
  "common.delete": "Delete",
  "common.close": "Close",
  "common.back": "Back",
  "common.continue": "Continue",
} as const;

export type TranslationKey = keyof typeof en;

const ml: Partial<Record<TranslationKey, string>> = {
  "nav.inbox": "ഇൻബോക്സ്",
  "nav.contacts": "കോൺടാക്റ്റുകൾ",
  "nav.dashboard": "ഡാഷ്ബോർഡ്",
  "nav.admin": "അഡ്മിൻ",
  "nav.settings": "ക്രമീകരണങ്ങൾ",

  "settings.title": "ക്രമീകരണങ്ങൾ",
  "settings.whatsapp": "വാട്ട്‌സ്ആപ്പ്",
  "settings.welcome": "സ്വാഗത സന്ദേശം",
  "settings.billing": "ബില്ലിംഗ്",
  "settings.profile": "പ്രൊഫൈൽ",
  "settings.appearance": "രൂപഭാവം",
  "settings.signOut": "സൈൻ ഔട്ട്",
  "settings.theme": "തീം",
  "settings.themeHint": "ഈ ബ്രൗസറിൽ മാത്രം ബാധകം.",
  "settings.language": "ഭാഷ",
  "settings.languageHint": "നിങ്ങൾക്കായി ഡാഷ്ബോർഡിന്റെ ഭാഷ മാറ്റുന്നു.",
  "settings.privacy": "സ്വകാര്യത",

  "theme.light": "ലൈറ്റ്",
  "theme.dark": "ഡാർക്ക്",
  "theme.system": "സിസ്റ്റം",

  "common.save": "സേവ് ചെയ്യുക",
  "common.saving": "സേവ് ചെയ്യുന്നു…",
  "common.cancel": "റദ്ദാക്കുക",
  "common.delete": "ഇല്ലാതാക്കുക",
  "common.close": "അടയ്ക്കുക",
  "common.back": "തിരികെ",
  "common.continue": "തുടരുക",
};

const DICTIONARIES: Record<LanguageCode, Partial<Record<TranslationKey, string>>> = {
  en,
  ml,
};

const STORAGE_KEY = "abiz.language";

type Translate = (
  key: TranslationKey,
  vars?: Record<string, string | number>,
) => string;

interface LanguageState {
  language: LanguageCode;
  setLanguage: (code: LanguageCode) => void;
  t: Translate;
}

const LanguageContext = React.createContext<LanguageState | null>(null);

const LANGUAGE_EVENT = "abiz:language";

function readStoredLanguage(): LanguageCode {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored && stored in DICTIONARIES ? (stored as LanguageCode) : "en";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // The choice lives in localStorage, outside React. Reading it through
  // useSyncExternalStore keeps the server render ("en") and the first client
  // paint consistent without a setState-in-effect.
  const language = React.useSyncExternalStore<LanguageCode>(
    (onChange) => {
      window.addEventListener(LANGUAGE_EVENT, onChange);
      window.addEventListener("storage", onChange);
      return () => {
        window.removeEventListener(LANGUAGE_EVENT, onChange);
        window.removeEventListener("storage", onChange);
      };
    },
    readStoredLanguage,
    () => "en",
  );

  const setLanguage = React.useCallback((code: LanguageCode) => {
    window.localStorage.setItem(STORAGE_KEY, code);
    document.documentElement.lang = code;
    window.dispatchEvent(new Event(LANGUAGE_EVENT));
  }, []);

  const t = React.useCallback<Translate>(
    (key, vars) => {
      const template = DICTIONARIES[language][key] ?? en[key] ?? key;
      if (!vars) return template;
      return Object.entries(vars).reduce(
        (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
        template,
      );
    },
    [language],
  );

  const value = React.useMemo(
    () => ({ language, setLanguage, t }),
    [language, setLanguage, t],
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageState {
  const context = React.useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used inside LanguageProvider");
  }
  return context;
}

/** Shorthand for components that only need the translate function. */
export function useT(): Translate {
  return useLanguage().t;
}
