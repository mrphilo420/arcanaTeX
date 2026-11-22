import { HighlightStyle } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { CCTHEMES, type CcTheme, type CcThemeId } from "./ccthemes";

export type ResearchThemeId =
  | "principia"
  | "tex-folio"
  | "lab-notebook"
  | "ivory-seminar"
  | "blueprint-paper"
  | "chalkboard"
  | "observatory"
  | "blueprint"
  | "spectral"
  | "blackboard-amber";

export type TerminalThemeId =
  | "arcana"
  | "arcana-paper"
  | ResearchThemeId
  | CcThemeId;

export type ThemeCategory = "research" | "signature" | "community";

export interface AppThemeUi {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  border: string;
  input: string;
  ring: string;
  sidebar: string;
  sidebarForeground: string;
  sidebarAccent: string;
  sidebarAccentForeground: string;
  sidebarBorder: string;
  surfaceDark: string;
  surfaceDarkElevated: string;
  onDark: string;
  onDarkSoft: string;
  hairline: string;
  accentTeal: string;
  accentAmber: string;
  pdfCanvas: string;
  chart1: string;
  chart2: string;
  chart3: string;
  chart4: string;
  chart5: string;
}

interface TerminalPalette {
  background: string;
  foreground: string;
  gutter: string;
  gutterActive: string;
  activeLine: string;
  selection: string;
  cursor: string;
  keyword: string;
  function: string;
  type: string;
  comment: string;
  string: string;
  number: string;
  operator: string;
  invalid: string;
  accent: string;
  panel: string;
  tooltip: string;
  border: string;
}

export interface TerminalTheme {
  id: TerminalThemeId;
  label: string;
  dark: boolean;
  category: ThemeCategory;
  discipline?: string;
  description: string;
  ui: AppThemeUi;
  colors: TerminalPalette;
}

const CANVAS_OVERRIDES: Record<string, string> = {
  "amber-crt": "#1a1200",
  aubade: "#f7f1ff",
  "catppuccin-latte": "#eff1f5",
  "catppuccin-mocha": "#1e1e2e",
  dracula: "#282a36",
  everforest: "#2b3339",
  "github-dark": "#0d1117",
  "github-light": "#ffffff",
  gruvbox: "#282828",
  letterpress: "#f6f1e6",
  "matcha-zen": "#f3f7ef",
  nord: "#2e3440",
  opaline: "#f7f8fb",
  porcelain: "#f7f8fa",
  "rose-pine-dawn": "#faf4ed",
  "solarized-dark": "#002b36",
  "solarized-light": "#fdf6e3",
  synthwave: "#241b2f",
  "tokyo-night": "#1a1b26",
};

const ARCANA_UI: AppThemeUi = {
  background: "#faf9f5",
  foreground: "#141413",
  card: "#f5f0e8",
  cardForeground: "#141413",
  popover: "#fffdf9",
  popoverForeground: "#141413",
  primary: "#cc785c",
  primaryForeground: "#ffffff",
  secondary: "#efe9de",
  secondaryForeground: "#252523",
  muted: "#f0ebe2",
  mutedForeground: "#6c6a64",
  accent: "#efe9de",
  accentForeground: "#141413",
  destructive: "#c64545",
  border: "#e6dfd8",
  input: "#e6dfd8",
  ring: "#cc785c",
  sidebar: "#f5f0e8",
  sidebarForeground: "#252523",
  sidebarAccent: "#efe9de",
  sidebarAccentForeground: "#141413",
  sidebarBorder: "#e6dfd8",
  surfaceDark: "#181715",
  surfaceDarkElevated: "#252320",
  onDark: "#faf9f5",
  onDarkSoft: "#a09d96",
  hairline: "#e6dfd8",
  accentTeal: "#5db8a6",
  accentAmber: "#e8a55a",
  pdfCanvas: "#ece5d8",
  chart1: "#cc785c",
  chart2: "#5db8a6",
  chart3: "#e8a55a",
  chart4: "#8e8b82",
  chart5: "#c64545",
};

const ARCANA_THEME: TerminalTheme = {
  id: "arcana",
  label: "Arcana",
  dark: true,
  category: "signature",
  discipline: "Studio Default",
  description:
    "Adaptive parchment and obsidian workspace that follows system Light or Dark mode.",
  ui: ARCANA_UI,
  colors: {
    background: "#181715",
    foreground: "#faf9f5",
    gutter: "#6c6a64",
    gutterActive: "#a09d96",
    activeLine: "#1f1e1b",
    selection: "rgba(204, 120, 92, 0.24)",
    cursor: "#cc785c",
    keyword: "#cc785c",
    function: "#e8a55a",
    type: "#5db8a6",
    comment: "#8e8b82",
    string: "#5db8a6",
    number: "#5db8a6",
    operator: "#5db8a6",
    invalid: "#c64545",
    accent: "#e8a55a",
    panel: "#1f1e1b",
    tooltip: "#252320",
    border: "rgba(250, 249, 245, 0.12)",
  },
};

const ARCANA_PAPER_THEME: TerminalTheme = {
  id: "arcana-paper",
  label: "Arcana Paper",
  dark: false,
  category: "signature",
  discipline: "Studio Light",
  description:
    "Always-light warm archival paper paired with low-glare editorial syntax.",
  ui: ARCANA_UI,
  colors: {
    background: "#fffdf9",
    foreground: "#2b2a27",
    gutter: "#b9b3a8",
    gutterActive: "#6c6a64",
    activeLine: "#f7f1e6",
    selection: "rgba(204, 120, 92, 0.18)",
    cursor: "#cc785c",
    keyword: "#a9583e",
    function: "#46687f",
    type: "#6b6157",
    comment: "#9a958c",
    string: "#4f7f6a",
    number: "#a9762f",
    operator: "#8c877e",
    invalid: "#c64545",
    accent: "#a9583e",
    panel: "#f5f0e8",
    tooltip: "#fffdf9",
    border: "#e6dfd8",
  },
};

export const RESEARCH_THEMES: TerminalTheme[] = [
  {
    id: "principia",
    label: "Principia",
    dark: false,
    category: "research",
    discipline: "Archival Monograph",
    description:
      "Cotton-rag journal folio with iron-gall ink and oxblood theorem accents.",
    ui: {
      background: "#f8f4ea",
      foreground: "#191815",
      card: "#f2ece0",
      cardForeground: "#191815",
      popover: "#fdfaf2",
      popoverForeground: "#191815",
      primary: "#8f2d3b",
      primaryForeground: "#ffffff",
      secondary: "#e9e1d2",
      secondaryForeground: "#24221d",
      muted: "#ece5d7",
      mutedForeground: "#666156",
      accent: "#e9e1d2",
      accentForeground: "#191815",
      destructive: "#b83333",
      border: "#dfd6c4",
      input: "#dfd6c4",
      ring: "#8f2d3b",
      sidebar: "#f1ebde",
      sidebarForeground: "#24221d",
      sidebarAccent: "#e6decb",
      sidebarAccentForeground: "#191815",
      sidebarBorder: "#dfd6c4",
      surfaceDark: "#1c1917",
      surfaceDarkElevated: "#292522",
      onDark: "#f8f4ea",
      onDarkSoft: "#b3ab9c",
      hairline: "#dfd6c4",
      accentTeal: "#1d5d73",
      accentAmber: "#9c6615",
      pdfCanvas: "#eae3d2",
      chart1: "#8f2d3b",
      chart2: "#1d5d73",
      chart3: "#9c6615",
      chart4: "#666156",
      chart5: "#b83333",
    },
    colors: {
      background: "#fbf8f0",
      foreground: "#191815",
      gutter: "#a89f8e",
      gutterActive: "#666156",
      activeLine: "#f3ede0",
      selection: "rgba(143, 45, 59, 0.16)",
      cursor: "#8f2d3b",
      keyword: "#8f2d3b",
      function: "#1d5d73",
      type: "#4c463d",
      comment: "#8f887a",
      string: "#2a6953",
      number: "#9c6615",
      operator: "#1d5d73",
      invalid: "#b83333",
      accent: "#9c6615",
      panel: "#f2ece0",
      tooltip: "#fdfaf2",
      border: "#dfd6c4",
    },
  },
  {
    id: "tex-folio",
    label: "TeX Folio",
    dark: false,
    category: "research",
    discipline: "Typeset Manuscript",
    description:
      "Crisp mathematical monograph white with Oxford blue macros and carbon ink.",
    ui: {
      background: "#fbfbfa",
      foreground: "#15181e",
      card: "#f3f5f8",
      cardForeground: "#15181e",
      popover: "#ffffff",
      popoverForeground: "#15181e",
      primary: "#1e4d8c",
      primaryForeground: "#ffffff",
      secondary: "#e8ecf2",
      secondaryForeground: "#1e2430",
      muted: "#edf0f5",
      mutedForeground: "#5c6472",
      accent: "#e8ecf2",
      accentForeground: "#15181e",
      destructive: "#c43838",
      border: "#dce1ea",
      input: "#dce1ea",
      ring: "#1e4d8c",
      sidebar: "#f3f5f8",
      sidebarForeground: "#1e2430",
      sidebarAccent: "#e5eaf1",
      sidebarAccentForeground: "#15181e",
      sidebarBorder: "#dce1ea",
      surfaceDark: "#141820",
      surfaceDarkElevated: "#1f2530",
      onDark: "#f5f7fa",
      onDarkSoft: "#a0a8b5",
      hairline: "#dce1ea",
      accentTeal: "#0f6e6e",
      accentAmber: "#9b5d14",
      pdfCanvas: "#e7eaef",
      chart1: "#1e4d8c",
      chart2: "#0f6e6e",
      chart3: "#9b5d14",
      chart4: "#5c6472",
      chart5: "#c43838",
    },
    colors: {
      background: "#ffffff",
      foreground: "#15181e",
      gutter: "#9aa3b2",
      gutterActive: "#4b5362",
      activeLine: "#f4f6fa",
      selection: "rgba(30, 77, 140, 0.16)",
      cursor: "#1e4d8c",
      keyword: "#1e4d8c",
      function: "#0f6e6e",
      type: "#6a3d8a",
      comment: "#8690a0",
      string: "#1d6e4a",
      number: "#9b5d14",
      operator: "#0f6e6e",
      invalid: "#c43838",
      accent: "#1e4d8c",
      panel: "#f3f5f8",
      tooltip: "#ffffff",
      border: "#dce1ea",
    },
  },
  {
    id: "lab-notebook",
    label: "Lab Notebook",
    dark: false,
    category: "research",
    discipline: "Field & Wet Lab",
    description:
      "Pale eucalyptus grid sheet calibrated for long experimental write-ups.",
    ui: {
      background: "#f2f6f0",
      foreground: "#18231d",
      card: "#e9efe6",
      cardForeground: "#18231d",
      popover: "#f8fbf6",
      popoverForeground: "#18231d",
      primary: "#1c6b54",
      primaryForeground: "#ffffff",
      secondary: "#dde6da",
      secondaryForeground: "#1e2c24",
      muted: "#e4ece0",
      mutedForeground: "#55685d",
      accent: "#dde6da",
      accentForeground: "#18231d",
      destructive: "#bf3f3f",
      border: "#cfdaca",
      input: "#cfdaca",
      ring: "#1c6b54",
      sidebar: "#eaf0e7",
      sidebarForeground: "#1e2c24",
      sidebarAccent: "#dbe4d7",
      sidebarAccentForeground: "#18231d",
      sidebarBorder: "#cfdaca",
      surfaceDark: "#14201a",
      surfaceDarkElevated: "#1f2e26",
      onDark: "#eef5ee",
      onDarkSoft: "#9db0a4",
      hairline: "#cfdaca",
      accentTeal: "#2c5d82",
      accentAmber: "#b05136",
      pdfCanvas: "#dfe8dc",
      chart1: "#1c6b54",
      chart2: "#2c5d82",
      chart3: "#b05136",
      chart4: "#55685d",
      chart5: "#bf3f3f",
    },
    colors: {
      background: "#f7faf5",
      foreground: "#18231d",
      gutter: "#93a599",
      gutterActive: "#4e6156",
      activeLine: "#ebf1e7",
      selection: "rgba(28, 107, 84, 0.16)",
      cursor: "#1c6b54",
      keyword: "#1c6b54",
      function: "#2c5d82",
      type: "#4c5a4f",
      comment: "#7d9084",
      string: "#b05136",
      number: "#8a6217",
      operator: "#1c6b54",
      invalid: "#bf3f3f",
      accent: "#b05136",
      panel: "#e9efe6",
      tooltip: "#f8fbf6",
      border: "#cfdaca",
    },
  },
  {
    id: "ivory-seminar",
    label: "Ivory Seminar",
    dark: false,
    category: "research",
    discipline: "Low-Glare Warm",
    description:
      "Soft sepia parchment designed to minimize eye strain during proof reading.",
    ui: {
      background: "#f5eee0",
      foreground: "#231e17",
      card: "#ede4d3",
      cardForeground: "#231e17",
      popover: "#fbf6eb",
      popoverForeground: "#231e17",
      primary: "#a84a28",
      primaryForeground: "#ffffff",
      secondary: "#e4d9c4",
      secondaryForeground: "#2e271e",
      muted: "#e8decb",
      mutedForeground: "#6d6354",
      accent: "#e4d9c4",
      accentForeground: "#231e17",
      destructive: "#b83b3b",
      border: "#d8cbb4",
      input: "#d8cbb4",
      ring: "#a84a28",
      sidebar: "#ede4d3",
      sidebarForeground: "#2e271e",
      sidebarAccent: "#e1d5be",
      sidebarAccentForeground: "#231e17",
      sidebarBorder: "#d8cbb4",
      surfaceDark: "#1f1a14",
      surfaceDarkElevated: "#2c251d",
      onDark: "#f5eee0",
      onDarkSoft: "#b5a996",
      hairline: "#d8cbb4",
      accentTeal: "#216b68",
      accentAmber: "#9e6b1b",
      pdfCanvas: "#e6dcc9",
      chart1: "#a84a28",
      chart2: "#216b68",
      chart3: "#9e6b1b",
      chart4: "#6d6354",
      chart5: "#b83b3b",
    },
    colors: {
      background: "#f9f3e7",
      foreground: "#231e17",
      gutter: "#a89d8a",
      gutterActive: "#6d6354",
      activeLine: "#efe7d7",
      selection: "rgba(168, 74, 40, 0.16)",
      cursor: "#a84a28",
      keyword: "#a84a28",
      function: "#2d5488",
      type: "#5b5142",
      comment: "#8f8370",
      string: "#216b68",
      number: "#9e6b1b",
      operator: "#216b68",
      invalid: "#b83b3b",
      accent: "#9e6b1b",
      panel: "#ede4d3",
      tooltip: "#fbf6eb",
      border: "#d8cbb4",
    },
  },
  {
    id: "blueprint-paper",
    label: "Graph Paper",
    dark: false,
    category: "research",
    discipline: "Engineering Draft",
    description:
      "Clean engineering pad in cool alabaster, cobalt blue, and drafting rust.",
    ui: {
      background: "#f4f7fb",
      foreground: "#132030",
      card: "#eaf0f7",
      cardForeground: "#132030",
      popover: "#fbfdff",
      popoverForeground: "#132030",
      primary: "#1b56a6",
      primaryForeground: "#ffffff",
      secondary: "#dfe7f2",
      secondaryForeground: "#192a3e",
      muted: "#e4ebf4",
      mutedForeground: "#55687f",
      accent: "#dfe7f2",
      accentForeground: "#132030",
      destructive: "#c23b3b",
      border: "#cdd8e8",
      input: "#cdd8e8",
      ring: "#1b56a6",
      sidebar: "#ebf0f7",
      sidebarForeground: "#192a3e",
      sidebarAccent: "#dce5f2",
      sidebarAccentForeground: "#132030",
      sidebarBorder: "#cdd8e8",
      surfaceDark: "#101c2d",
      surfaceDarkElevated: "#182940",
      onDark: "#eef4fc",
      onDarkSoft: "#96abc4",
      hairline: "#cdd8e8",
      accentTeal: "#0d7380",
      accentAmber: "#b54f2a",
      pdfCanvas: "#e1e9f3",
      chart1: "#1b56a6",
      chart2: "#0d7380",
      chart3: "#b54f2a",
      chart4: "#55687f",
      chart5: "#c23b3b",
    },
    colors: {
      background: "#f9fbfe",
      foreground: "#132030",
      gutter: "#93a5bc",
      gutterActive: "#55687f",
      activeLine: "#eef3fa",
      selection: "rgba(27, 86, 166, 0.16)",
      cursor: "#1b56a6",
      keyword: "#1b56a6",
      function: "#0d7380",
      type: "#445873",
      comment: "#7f92aa",
      string: "#186b4f",
      number: "#b54f2a",
      operator: "#0d7380",
      invalid: "#c23b3b",
      accent: "#b54f2a",
      panel: "#eaf0f7",
      tooltip: "#fbfdff",
      border: "#cdd8e8",
    },
  },
  {
    id: "chalkboard",
    label: "Chalkboard",
    dark: true,
    category: "research",
    discipline: "Lecture Hall Slate",
    description:
      "Classic mathematical slate-green blackboard with pastel chalk syntax.",
    ui: {
      background: "#12201b",
      foreground: "#f2efe6",
      card: "#192b24",
      cardForeground: "#f2efe6",
      popover: "#1d3129",
      popoverForeground: "#f2efe6",
      primary: "#e08d6c",
      primaryForeground: "#12201b",
      secondary: "#20362e",
      secondaryForeground: "#f2efe6",
      muted: "#172721",
      mutedForeground: "#9fb5ab",
      accent: "#20362e",
      accentForeground: "#f2efe6",
      destructive: "#e06c75",
      border: "rgba(242, 239, 230, 0.14)",
      input: "rgba(242, 239, 230, 0.18)",
      ring: "#e08d6c",
      sidebar: "#15251f",
      sidebarForeground: "#f2efe6",
      sidebarAccent: "#20362e",
      sidebarAccentForeground: "#f2efe6",
      sidebarBorder: "rgba(242, 239, 230, 0.14)",
      surfaceDark: "#0e1a15",
      surfaceDarkElevated: "#192b24",
      onDark: "#f2efe6",
      onDarkSoft: "#9fb5ab",
      hairline: "rgba(242, 239, 230, 0.14)",
      accentTeal: "#6ad0bc",
      accentAmber: "#f0c46c",
      pdfCanvas: "#0c1713",
      chart1: "#e08d6c",
      chart2: "#6ad0bc",
      chart3: "#f0c46c",
      chart4: "#9fb5ab",
      chart5: "#e06c75",
    },
    colors: {
      background: "#12201b",
      foreground: "#f2efe6",
      gutter: "#6c857b",
      gutterActive: "#b8cabe",
      activeLine: "#192b24",
      selection: "rgba(106, 208, 188, 0.22)",
      cursor: "#f0c46c",
      keyword: "#e08d6c",
      function: "#f0c46c",
      type: "#6ad0bc",
      comment: "#869e94",
      string: "#98d99c",
      number: "#e8b474",
      operator: "#6ad0bc",
      invalid: "#e06c75",
      accent: "#f0c46c",
      panel: "#192b24",
      tooltip: "#1d3129",
      border: "rgba(242, 239, 230, 0.14)",
    },
  },
  {
    id: "observatory",
    label: "Observatory",
    dark: true,
    category: "research",
    discipline: "Astrophysics Midnight",
    description:
      "Deep celestial indigo with starlight typography and ion-teal math operators.",
    ui: {
      background: "#0d1321",
      foreground: "#ebf0f7",
      card: "#141d31",
      cardForeground: "#ebf0f7",
      popover: "#182238",
      popoverForeground: "#ebf0f7",
      primary: "#56b6e6",
      primaryForeground: "#0a101b",
      secondary: "#1a253d",
      secondaryForeground: "#ebf0f7",
      muted: "#11192b",
      mutedForeground: "#94a3bd",
      accent: "#1a253d",
      accentForeground: "#ebf0f7",
      destructive: "#ef6f7c",
      border: "rgba(235, 240, 247, 0.13)",
      input: "rgba(235, 240, 247, 0.18)",
      ring: "#56b6e6",
      sidebar: "#101727",
      sidebarForeground: "#ebf0f7",
      sidebarAccent: "#1a253d",
      sidebarAccentForeground: "#ebf0f7",
      sidebarBorder: "rgba(235, 240, 247, 0.13)",
      surfaceDark: "#090e19",
      surfaceDarkElevated: "#141d31",
      onDark: "#ebf0f7",
      onDarkSoft: "#94a3bd",
      hairline: "rgba(235, 240, 247, 0.13)",
      accentTeal: "#4fd1b5",
      accentAmber: "#e6b45a",
      pdfCanvas: "#080c16",
      chart1: "#56b6e6",
      chart2: "#4fd1b5",
      chart3: "#e6b45a",
      chart4: "#94a3bd",
      chart5: "#ef6f7c",
    },
    colors: {
      background: "#0d1321",
      foreground: "#ebf0f7",
      gutter: "#5e6e8a",
      gutterActive: "#a6b5cf",
      activeLine: "#141d31",
      selection: "rgba(86, 182, 230, 0.24)",
      cursor: "#56b6e6",
      keyword: "#56b6e6",
      function: "#e6b45a",
      type: "#b79cf7",
      comment: "#7a8aa6",
      string: "#4fd1b5",
      number: "#e6b45a",
      operator: "#4fd1b5",
      invalid: "#ef6f7c",
      accent: "#e6b45a",
      panel: "#141d31",
      tooltip: "#182238",
      border: "rgba(235, 240, 247, 0.13)",
    },
  },
  {
    id: "blueprint",
    label: "Cyanotype",
    dark: true,
    category: "research",
    discipline: "Engineering Blueprint",
    description:
      "Prussian drafting navy with high-contrast schematic white and cyan accents.",
    ui: {
      background: "#0e1d33",
      foreground: "#edf4ff",
      card: "#142744",
      cardForeground: "#edf4ff",
      popover: "#182e4f",
      popoverForeground: "#edf4ff",
      primary: "#4cc9f0",
      primaryForeground: "#091424",
      secondary: "#193052",
      secondaryForeground: "#edf4ff",
      muted: "#11223b",
      mutedForeground: "#90abd1",
      accent: "#193052",
      accentForeground: "#edf4ff",
      destructive: "#ff6b6b",
      border: "rgba(237, 244, 255, 0.15)",
      input: "rgba(237, 244, 255, 0.2)",
      ring: "#4cc9f0",
      sidebar: "#102139",
      sidebarForeground: "#edf4ff",
      sidebarAccent: "#193052",
      sidebarAccentForeground: "#edf4ff",
      sidebarBorder: "rgba(237, 244, 255, 0.15)",
      surfaceDark: "#091425",
      surfaceDarkElevated: "#142744",
      onDark: "#edf4ff",
      onDarkSoft: "#90abd1",
      hairline: "rgba(237, 244, 255, 0.15)",
      accentTeal: "#5ce0b0",
      accentAmber: "#f3b859",
      pdfCanvas: "#091425",
      chart1: "#4cc9f0",
      chart2: "#5ce0b0",
      chart3: "#f3b859",
      chart4: "#90abd1",
      chart5: "#ff6b6b",
    },
    colors: {
      background: "#0e1d33",
      foreground: "#edf4ff",
      gutter: "#5e7da8",
      gutterActive: "#aec4e2",
      activeLine: "#142744",
      selection: "rgba(76, 201, 240, 0.24)",
      cursor: "#4cc9f0",
      keyword: "#4cc9f0",
      function: "#f3b859",
      type: "#98c1ff",
      comment: "#7894bd",
      string: "#5ce0b0",
      number: "#f3b859",
      operator: "#5ce0b0",
      invalid: "#ff6b6b",
      accent: "#f3b859",
      panel: "#142744",
      tooltip: "#182e4f",
      border: "rgba(237, 244, 255, 0.15)",
    },
  },
  {
    id: "spectral",
    label: "Spectral",
    dark: true,
    category: "research",
    discipline: "Instrument Charcoal",
    description:
      "Color-neutral scientific obsidian that preserves exact color perception in plots.",
    ui: {
      background: "#131519",
      foreground: "#eceff4",
      card: "#1b1e24",
      cardForeground: "#eceff4",
      popover: "#21252c",
      popoverForeground: "#eceff4",
      primary: "#63a4ff",
      primaryForeground: "#0c1118",
      secondary: "#232730",
      secondaryForeground: "#eceff4",
      muted: "#171a20",
      mutedForeground: "#97a0ad",
      accent: "#232730",
      accentForeground: "#eceff4",
      destructive: "#f06e6e",
      border: "rgba(236, 239, 244, 0.12)",
      input: "rgba(236, 239, 244, 0.16)",
      ring: "#63a4ff",
      sidebar: "#16191e",
      sidebarForeground: "#eceff4",
      sidebarAccent: "#232730",
      sidebarAccentForeground: "#eceff4",
      sidebarBorder: "rgba(236, 239, 244, 0.12)",
      surfaceDark: "#0d0f12",
      surfaceDarkElevated: "#1b1e24",
      onDark: "#eceff4",
      onDarkSoft: "#97a0ad",
      hairline: "rgba(236, 239, 244, 0.12)",
      accentTeal: "#4fd1c5",
      accentAmber: "#f2ba5c",
      pdfCanvas: "#0c0e11",
      chart1: "#63a4ff",
      chart2: "#4fd1c5",
      chart3: "#f2ba5c",
      chart4: "#97a0ad",
      chart5: "#f06e6e",
    },
    colors: {
      background: "#131519",
      foreground: "#eceff4",
      gutter: "#5e6673",
      gutterActive: "#aeb7c4",
      activeLine: "#1b1e24",
      selection: "rgba(99, 164, 255, 0.24)",
      cursor: "#63a4ff",
      keyword: "#63a4ff",
      function: "#f2ba5c",
      type: "#4fd1c5",
      comment: "#7d8694",
      string: "#7ee0a8",
      number: "#f2ba5c",
      operator: "#4fd1c5",
      invalid: "#f06e6e",
      accent: "#f2ba5c",
      panel: "#1b1e24",
      tooltip: "#21252c",
      border: "rgba(236, 239, 244, 0.12)",
    },
  },
  {
    id: "blackboard-amber",
    label: "Nocturne Lab",
    dark: true,
    category: "research",
    discipline: "Warm Night Proofing",
    description:
      "Blue-light-reduced espresso slate with warm sodium-amber highlights for late sessions.",
    ui: {
      background: "#171411",
      foreground: "#f4ece0",
      card: "#211d18",
      cardForeground: "#f4ece0",
      popover: "#27221d",
      popoverForeground: "#f4ece0",
      primary: "#e29a4b",
      primaryForeground: "#171411",
      secondary: "#2b251f",
      secondaryForeground: "#f4ece0",
      muted: "#1d1915",
      mutedForeground: "#ad9f8e",
      accent: "#2b251f",
      accentForeground: "#f4ece0",
      destructive: "#e0665e",
      border: "rgba(244, 236, 224, 0.13)",
      input: "rgba(244, 236, 224, 0.17)",
      ring: "#e29a4b",
      sidebar: "#1a1713",
      sidebarForeground: "#f4ece0",
      sidebarAccent: "#2b251f",
      sidebarAccentForeground: "#f4ece0",
      sidebarBorder: "rgba(244, 236, 224, 0.13)",
      surfaceDark: "#100e0c",
      surfaceDarkElevated: "#211d18",
      onDark: "#f4ece0",
      onDarkSoft: "#ad9f8e",
      hairline: "rgba(244, 236, 224, 0.13)",
      accentTeal: "#6ab89b",
      accentAmber: "#ecc86e",
      pdfCanvas: "#100e0c",
      chart1: "#e29a4b",
      chart2: "#6ab89b",
      chart3: "#ecc86e",
      chart4: "#ad9f8e",
      chart5: "#e0665e",
    },
    colors: {
      background: "#171411",
      foreground: "#f4ece0",
      gutter: "#736759",
      gutterActive: "#c4b6a4",
      activeLine: "#211d18",
      selection: "rgba(226, 154, 75, 0.24)",
      cursor: "#e29a4b",
      keyword: "#e29a4b",
      function: "#ecc86e",
      type: "#6ab89b",
      comment: "#8f8273",
      string: "#94c98b",
      number: "#ecc86e",
      operator: "#6ab89b",
      invalid: "#e0665e",
      accent: "#ecc86e",
      panel: "#211d18",
      tooltip: "#27221d",
      border: "rgba(244, 236, 224, 0.13)",
    },
  },
];

function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return `rgba(204, 120, 92, ${alpha})`;
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function contrastColor(background: string): string {
  const normalized = background.replace("#", "");
  if (normalized.length !== 6) return "#ffffff";
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.6 ? "#111111" : "#ffffff";
}

function themeFromCcTheme(theme: CcTheme): TerminalTheme {
  const background =
    CANVAS_OVERRIDES[theme.id] ||
    theme.userMessageBackground ||
    theme.subtle ||
    (theme.base === "dark" ? "#181715" : "#faf9f5");
  const card = theme.bashMessageBackgroundColor || theme.subtle || background;
  const border = theme.promptBorder || theme.inactive || background;
  const accent = theme.claude;
  const dark = theme.base === "dark";

  return {
    id: theme.id as TerminalThemeId,
    label: theme.label,
    dark,
    category: "community",
    description: "Community palette",
    ui: {
      background,
      foreground: theme.text,
      card,
      cardForeground: theme.text,
      popover: theme.bashMessageBackgroundColor || card,
      popoverForeground: theme.text,
      primary: accent,
      primaryForeground: contrastColor(accent),
      secondary: theme.subtle,
      secondaryForeground: theme.text,
      muted: theme.bashMessageBackgroundColor || theme.subtle,
      mutedForeground: theme.inactive,
      accent: theme.subtle,
      accentForeground: theme.text,
      destructive: theme.error,
      border,
      input: border,
      ring: accent,
      sidebar: background,
      sidebarForeground: theme.text,
      sidebarAccent: card,
      sidebarAccentForeground: theme.text,
      sidebarBorder: border,
      surfaceDark: background,
      surfaceDarkElevated: card,
      onDark: theme.text,
      onDarkSoft: theme.inactive,
      hairline: border,
      accentTeal: theme.planMode,
      accentAmber: theme.warning,
      pdfCanvas: dark ? card : theme.subtle || background,
      chart1: accent,
      chart2: theme.planMode,
      chart3: theme.warning,
      chart4: theme.inactive,
      chart5: theme.error,
    },
    colors: {
      background,
      foreground: theme.text,
      gutter: theme.inactive,
      gutterActive: theme.text,
      activeLine: theme.bashMessageBackgroundColor || theme.subtle,
      selection: withAlpha(accent, 0.24),
      cursor: accent,
      keyword: accent,
      function: theme.warning,
      type: theme.planMode,
      comment: theme.inactive,
      string: theme.success,
      number: theme.bashBorder,
      operator: theme.planMode,
      invalid: theme.error,
      accent: theme.warning,
      panel: theme.bashMessageBackgroundColor || theme.subtle,
      tooltip: theme.subtle,
      border,
    },
  };
}

export const SIGNATURE_THEMES: TerminalTheme[] = [
  ARCANA_THEME,
  ARCANA_PAPER_THEME,
];

export const COMMUNITY_THEMES: TerminalTheme[] = CCTHEMES.map(themeFromCcTheme);

export const TERMINAL_THEMES: TerminalTheme[] = [
  ...RESEARCH_THEMES,
  ...SIGNATURE_THEMES,
  ...COMMUNITY_THEMES,
];

export const DEFAULT_TERMINAL_THEME_ID: TerminalThemeId = "arcana";

export function getTerminalTheme(id: TerminalThemeId): TerminalTheme {
  return TERMINAL_THEMES.find((theme) => theme.id === id) ?? ARCANA_THEME;
}

export function buildEditorTheme(id: TerminalThemeId): {
  theme: Extension;
  highlight: HighlightStyle;
} {
  const { colors, dark } = getTerminalTheme(id);

  const theme = EditorView.theme(
    {
      "&": {
        color: colors.foreground,
        backgroundColor: colors.background,
      },
      ".cm-content": {
        caretColor: colors.cursor,
      },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: colors.cursor,
      },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
        {
          backgroundColor: colors.selection,
        },
      ".cm-gutters": {
        backgroundColor: colors.background,
        color: colors.gutter,
        border: "none",
      },
      ".cm-activeLineGutter": {
        backgroundColor: colors.activeLine,
        color: colors.gutterActive,
      },
      ".cm-activeLine": {
        backgroundColor: colors.activeLine,
      },
      ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
        backgroundColor: colors.selection,
        outline: `1px solid ${colors.type}`,
      },
      ".cm-selectionMatch": {
        backgroundColor: colors.selection,
      },
      ".cm-searchMatch": {
        backgroundColor: colors.accent,
        opacity: 0.3,
        outline: `1px solid ${colors.accent}`,
        borderRadius: "2px",
      },
      ".cm-searchMatch.cm-searchMatch-selected": {
        backgroundColor: colors.accent,
        opacity: 0.5,
        outline: `1px solid ${colors.accent}`,
      },
      ".cm-panels": {
        backgroundColor: colors.panel,
        color: colors.foreground,
      },
      ".cm-tooltip": {
        backgroundColor: colors.tooltip,
        border: `1px solid ${colors.border}`,
        color: colors.foreground,
      },
    },
    { dark },
  );

  const highlight = HighlightStyle.define([
    { tag: tags.keyword, color: colors.keyword },
    {
      tag: [
        tags.name,
        tags.deleted,
        tags.character,
        tags.propertyName,
        tags.macroName,
      ],
      color: colors.foreground,
    },
    {
      tag: [tags.function(tags.variableName), tags.labelName],
      color: colors.function,
    },
    {
      tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)],
      color: colors.accent,
    },
    {
      tag: [
        tags.typeName,
        tags.className,
        tags.number,
        tags.changed,
        tags.annotation,
        tags.modifier,
        tags.self,
        tags.namespace,
      ],
      color: colors.type,
    },
    {
      tag: [
        tags.operator,
        tags.operatorKeyword,
        tags.url,
        tags.escape,
        tags.regexp,
        tags.link,
      ],
      color: colors.operator,
    },
    {
      tag: [tags.meta, tags.comment],
      color: colors.comment,
      fontStyle: "italic",
    },
    { tag: tags.strong, fontWeight: "600" },
    { tag: tags.emphasis, fontStyle: "italic" },
    { tag: tags.strikethrough, textDecoration: "line-through" },
    { tag: tags.heading, fontWeight: "600", color: colors.keyword },
    {
      tag: [tags.atom, tags.bool, tags.special(tags.variableName)],
      color: colors.accent,
    },
    {
      tag: [tags.processingInstruction, tags.string, tags.inserted],
      color: colors.string,
    },
    { tag: tags.invalid, color: colors.invalid },
  ]);

  return { theme, highlight };
}

export const claudeEditorTheme = buildEditorTheme("arcana").theme;
export const claudeHighlightStyle = buildEditorTheme("arcana").highlight;
