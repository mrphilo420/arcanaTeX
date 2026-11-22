import { describe, expect, it } from "vitest";
import {
  COMMUNITY_THEMES,
  DEFAULT_TERMINAL_THEME_ID,
  RESEARCH_THEMES,
  SIGNATURE_THEMES,
  TERMINAL_THEMES,
  buildEditorTheme,
  getTerminalTheme,
} from "./editor-theme";

describe("editor-theme research collection", () => {
  it("provides 10 research themes (5 light and 5 dark) with metadata", () => {
    expect(RESEARCH_THEMES).toHaveLength(10);
    expect(RESEARCH_THEMES.filter((t) => !t.dark)).toHaveLength(5);
    expect(RESEARCH_THEMES.filter((t) => t.dark)).toHaveLength(5);

    for (const theme of RESEARCH_THEMES) {
      expect(theme.category).toBe("research");
      expect(theme.discipline?.trim().length).toBeGreaterThan(0);
      expect(theme.description.trim().length).toBeGreaterThan(0);
      expect(theme.ui.pdfCanvas).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("assigns unique theme ids across research, signature, and community categories", () => {
    const ids = TERMINAL_THEMES.map((theme) => theme.id);
    expect(new Set(ids).size).toBe(TERMINAL_THEMES.length);
    expect(TERMINAL_THEMES.length).toBe(
      RESEARCH_THEMES.length +
        SIGNATURE_THEMES.length +
        COMMUNITY_THEMES.length,
    );
  });

  it("builds valid CodeMirror themes for all registered palettes and falls back to arcana", () => {
    expect(DEFAULT_TERMINAL_THEME_ID).toBe("arcana");
    expect(getTerminalTheme("unknown" as never).id).toBe("arcana");

    for (const theme of TERMINAL_THEMES) {
      const built = buildEditorTheme(theme.id);
      expect(built.theme).toBeTruthy();
      expect(built.highlight).toBeTruthy();
    }
  });
});
