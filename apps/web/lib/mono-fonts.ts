export type MonoFontId =
  | "jetbrains"
  | "ibm-plex"
  | "inconsolata"
  | "fira"
  | "source-code-pro"
  | "system";

export interface MonoFontOption {
  id: MonoFontId;
  label: string;
  description: string;
  family: string;
  cssFamily: string;
}

export const MONO_FONTS: MonoFontOption[] = [
  {
    id: "jetbrains",
    label: "JetBrains Mono",
    description:
      "Tall x-height and clear LaTeX syntax with distinct \\, {}, 0/O, and 1/l/I.",
    family: "JetBrains Mono",
    cssFamily:
      'var(--font-jetbrains), "JetBrains Mono", ui-monospace, monospace',
  },
  {
    id: "ibm-plex",
    label: "IBM Plex Mono",
    description:
      "Technical, open counters suited for scientific computing and Lean proofs.",
    family: "IBM Plex Mono",
    cssFamily:
      'var(--font-ibm-plex-mono), "IBM Plex Mono", ui-monospace, monospace',
  },
  {
    id: "inconsolata",
    label: "Inconsolata (TeX)",
    description:
      "Classic LaTeX listings typeface with crisp braces, tildes, and backslashes.",
    family: "Inconsolata",
    cssFamily:
      'var(--font-inconsolata), "Inconsolata", ui-monospace, monospace',
  },
  {
    id: "fira",
    label: "Fira Code",
    description:
      "Math and logic operator ligatures (↦, ≤, ⇒, ∀) for Lean 4 and macros.",
    family: "Fira Code",
    cssFamily: 'var(--font-fira-code), "Fira Code", ui-monospace, monospace',
  },
  {
    id: "source-code-pro",
    label: "Source Code Pro",
    description:
      "Balanced rhythm from Adobe for long derivations and multi-file tex.",
    family: "Source Code Pro",
    cssFamily:
      'var(--font-source-code-pro), "Source Code Pro", ui-monospace, monospace',
  },
  {
    id: "system",
    label: "System Mono",
    description:
      "Native monospace face (SF Mono / Menlo / Consolas) on this device.",
    family: "SF Mono / ui-monospace",
    cssFamily:
      '"SF Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  },
];

export const DEFAULT_MONO_FONT_ID: MonoFontId = "jetbrains";

export function normalizeMonoFontId(
  value: string | null | undefined,
): MonoFontId {
  if (!value) return DEFAULT_MONO_FONT_ID;
  if (value === "cupertino") return "system";
  const match = MONO_FONTS.find((font) => font.id === value);
  return match ? match.id : DEFAULT_MONO_FONT_ID;
}
