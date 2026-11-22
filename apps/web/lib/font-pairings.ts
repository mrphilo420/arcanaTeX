export type FontPairingId =
  | "principia"
  | "bourbaki"
  | "annals"
  | "laboratory"
  | "seminar"
  | "system";

export interface FontPairing {
  id: FontPairingId;
  label: string;
  discipline: string;
  description: string;
  serif: string;
  sans: string;
  mono: string;
  serifCss: string;
  sansCss: string;
  monoCss: string;
}

export const FONT_PAIRINGS: FontPairing[] = [
  {
    id: "principia",
    label: "Principia · STIX",
    discipline: "Mathematics & Journals",
    description:
      "STI Pub mathematical serif paired with IBM Plex instrument sans and JetBrains Mono.",
    serif: "STIX Two Text",
    sans: "IBM Plex Sans",
    mono: "JetBrains Mono",
    serifCss: 'var(--font-stix-two), "STIX Two Text", Georgia, serif',
    sansCss: 'var(--font-plex-sans), "IBM Plex Sans", system-ui, sans-serif',
    monoCss: 'var(--font-jetbrains), "JetBrains Mono", ui-monospace, monospace',
  },
  {
    id: "bourbaki",
    label: "Bourbaki · Monograph",
    discipline: "Pure Math & Proofs",
    description:
      "Classical European monograph serif paired with Source Sans 3 and TeX-era Inconsolata.",
    serif: "EB Garamond",
    sans: "Source Sans 3",
    mono: "Inconsolata",
    serifCss: 'var(--font-eb-garamond), "EB Garamond", Georgia, serif',
    sansCss: 'var(--font-source-sans), "Source Sans 3", system-ui, sans-serif',
    monoCss: 'var(--font-inconsolata), "Inconsolata", ui-monospace, monospace',
  },
  {
    id: "annals",
    label: "Annals · Editorial",
    discipline: "Preprints & Review",
    description:
      "Contemporary academic journal serif with geometric Inter UI and Source Code Pro.",
    serif: "Source Serif 4",
    sans: "Inter",
    mono: "Source Code Pro",
    serifCss: 'var(--font-source-serif), "Source Serif 4", Georgia, serif',
    sansCss: 'var(--font-inter), "Inter", system-ui, sans-serif',
    monoCss:
      'var(--font-source-code-pro), "Source Code Pro", ui-monospace, monospace',
  },
  {
    id: "laboratory",
    label: "Laboratory · Plex",
    discipline: "Physics & Computing",
    description:
      "Unified IBM Plex superfamily engineered for computational and empirical research.",
    serif: "IBM Plex Serif",
    sans: "IBM Plex Sans",
    mono: "IBM Plex Mono",
    serifCss: 'var(--font-plex-serif), "IBM Plex Serif", Georgia, serif',
    sansCss: 'var(--font-plex-sans), "IBM Plex Sans", system-ui, sans-serif',
    monoCss:
      'var(--font-ibm-plex-mono), "IBM Plex Mono", ui-monospace, monospace',
  },
  {
    id: "seminar",
    label: "Seminar · Hyperlegible",
    discipline: "Accessible & Proofreading",
    description:
      "Optical reading serif paired with Braille Institute Atkinson Hyperlegible for unambiguous glyphs.",
    serif: "Newsreader",
    sans: "Atkinson Hyperlegible",
    mono: "Fira Code",
    serifCss: 'var(--font-newsreader), "Newsreader", Georgia, serif',
    sansCss:
      'var(--font-atkinson), "Atkinson Hyperlegible", system-ui, sans-serif',
    monoCss: 'var(--font-fira-code), "Fira Code", ui-monospace, monospace',
  },
  {
    id: "system",
    label: "System · Native",
    discipline: "OS Native",
    description:
      "Zero-overhead native operating system serif, sans, and monospace stacks.",
    serif: "New York / ui-serif",
    sans: "SF Pro / system-ui",
    mono: "SF Mono / ui-monospace",
    serifCss: '"New York", "Iowan Old Style", ui-serif, Georgia, serif',
    sansCss:
      '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif',
    monoCss:
      '"SF Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  },
];

export const DEFAULT_FONT_PAIRING_ID: FontPairingId = "principia";

const LEGACY_FONT_PAIRING_MAP: Record<string, FontPairingId> = {
  cupertino: "system",
  editorial: "annals",
  modern: "bourbaki",
  technical: "laboratory",
};

export function normalizeFontPairingId(
  value: string | null | undefined,
): FontPairingId {
  if (!value) return DEFAULT_FONT_PAIRING_ID;
  const legacy = LEGACY_FONT_PAIRING_MAP[value];
  if (legacy) return legacy;
  const match = FONT_PAIRINGS.find((pairing) => pairing.id === value);
  return match ? match.id : DEFAULT_FONT_PAIRING_ID;
}
