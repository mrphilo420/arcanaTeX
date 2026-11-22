import { create } from "zustand";
import {
  DEFAULT_TERMINAL_THEME_ID,
  TERMINAL_THEMES,
  type TerminalThemeId,
} from "@/lib/editor-theme";
import {
  DEFAULT_FONT_PAIRING_ID,
  normalizeFontPairingId,
  type FontPairingId,
} from "@/lib/font-pairings";
import {
  DEFAULT_MONO_FONT_ID,
  normalizeMonoFontId,
  type MonoFontId,
} from "@/lib/mono-fonts";
import {
  DEFAULT_TEXT_SCALE_ID,
  TEXT_SCALES,
  type TextScaleId,
} from "@/lib/text-scale";

const STORAGE_KEY = "open-prism:terminal-theme";
const FONT_STORAGE_KEY = "open-prism:font-pairing";
const TEXT_SCALE_STORAGE_KEY = "open-prism:text-scale";
const MONO_FONT_STORAGE_KEY = "open-prism:mono-font";
const ZEN_MODE_STORAGE_KEY = "open-prism:zen-mode";

function isTerminalThemeId(value: string): value is TerminalThemeId {
  return TERMINAL_THEMES.some((theme) => theme.id === value);
}

function readStoredTheme(): TerminalThemeId {
  if (typeof window === "undefined") return DEFAULT_TERMINAL_THEME_ID;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored && isTerminalThemeId(stored)
      ? stored
      : DEFAULT_TERMINAL_THEME_ID;
  } catch {
    return DEFAULT_TERMINAL_THEME_ID;
  }
}

function readStoredFontPairing(): FontPairingId {
  if (typeof window === "undefined") return DEFAULT_FONT_PAIRING_ID;
  try {
    return normalizeFontPairingId(
      window.localStorage.getItem(FONT_STORAGE_KEY),
    );
  } catch {
    return DEFAULT_FONT_PAIRING_ID;
  }
}

function isTextScaleId(value: string): value is TextScaleId {
  return TEXT_SCALES.some((scale) => scale.id === value);
}

function readStoredTextScale(): TextScaleId {
  if (typeof window === "undefined") return DEFAULT_TEXT_SCALE_ID;
  try {
    const stored = window.localStorage.getItem(TEXT_SCALE_STORAGE_KEY);
    return stored && isTextScaleId(stored) ? stored : DEFAULT_TEXT_SCALE_ID;
  } catch {
    return DEFAULT_TEXT_SCALE_ID;
  }
}

function readStoredMonoFont(): MonoFontId {
  if (typeof window === "undefined") return DEFAULT_MONO_FONT_ID;
  try {
    return normalizeMonoFontId(
      window.localStorage.getItem(MONO_FONT_STORAGE_KEY),
    );
  } catch {
    return DEFAULT_MONO_FONT_ID;
  }
}

function readStoredZenMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(ZEN_MODE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

interface EditorPreferencesState {
  terminalThemeId: TerminalThemeId;
  fontPairingId: FontPairingId;
  textScaleId: TextScaleId;
  monoFontId: MonoFontId;
  isAppearanceOpen: boolean;
  isZenMode: boolean;
  setTerminalThemeId: (id: TerminalThemeId) => void;
  setFontPairingId: (id: FontPairingId) => void;
  setTextScaleId: (id: TextScaleId) => void;
  setMonoFontId: (id: MonoFontId) => void;
  setAppearanceOpen: (open: boolean) => void;
  setZenMode: (enabled: boolean) => void;
  toggleZenMode: () => void;
  resetAppearance: () => void;
  hydrate: () => void;
}

export const useEditorPreferencesStore = create<EditorPreferencesState>()(
  (set) => ({
    terminalThemeId: DEFAULT_TERMINAL_THEME_ID,
    fontPairingId: DEFAULT_FONT_PAIRING_ID,
    textScaleId: DEFAULT_TEXT_SCALE_ID,
    monoFontId: DEFAULT_MONO_FONT_ID,
    isAppearanceOpen: false,
    isZenMode: false,
    setTerminalThemeId: (terminalThemeId) => {
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(STORAGE_KEY, terminalThemeId);
        } catch {}
      }
      set({ terminalThemeId });
    },
    setFontPairingId: (fontPairingId) => {
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(FONT_STORAGE_KEY, fontPairingId);
        } catch {}
      }
      set({ fontPairingId });
    },
    setTextScaleId: (textScaleId) => {
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(TEXT_SCALE_STORAGE_KEY, textScaleId);
        } catch {}
      }
      set({ textScaleId });
    },
    setMonoFontId: (monoFontId) => {
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(MONO_FONT_STORAGE_KEY, monoFontId);
        } catch {}
      }
      set({ monoFontId });
    },
    setAppearanceOpen: (isAppearanceOpen) => set({ isAppearanceOpen }),
    setZenMode: (isZenMode) => {
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(
            ZEN_MODE_STORAGE_KEY,
            isZenMode ? "1" : "0",
          );
        } catch {}
      }
      set({ isZenMode });
    },
    toggleZenMode: () =>
      set((state) => {
        const isZenMode = !state.isZenMode;
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(
              ZEN_MODE_STORAGE_KEY,
              isZenMode ? "1" : "0",
            );
          } catch {}
        }
        return { isZenMode };
      }),
    resetAppearance: () => {
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(STORAGE_KEY, DEFAULT_TERMINAL_THEME_ID);
          window.localStorage.setItem(
            FONT_STORAGE_KEY,
            DEFAULT_FONT_PAIRING_ID,
          );
          window.localStorage.setItem(
            TEXT_SCALE_STORAGE_KEY,
            DEFAULT_TEXT_SCALE_ID,
          );
          window.localStorage.setItem(
            MONO_FONT_STORAGE_KEY,
            DEFAULT_MONO_FONT_ID,
          );
          window.localStorage.setItem(ZEN_MODE_STORAGE_KEY, "0");
        } catch {}
      }
      set({
        terminalThemeId: DEFAULT_TERMINAL_THEME_ID,
        fontPairingId: DEFAULT_FONT_PAIRING_ID,
        textScaleId: DEFAULT_TEXT_SCALE_ID,
        monoFontId: DEFAULT_MONO_FONT_ID,
        isZenMode: false,
      });
    },
    hydrate: () =>
      set({
        terminalThemeId: readStoredTheme(),
        fontPairingId: readStoredFontPairing(),
        textScaleId: readStoredTextScale(),
        monoFontId: readStoredMonoFont(),
        isZenMode: readStoredZenMode(),
      }),
  }),
);
