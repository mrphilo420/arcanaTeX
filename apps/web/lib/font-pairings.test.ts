import { describe, expect, it } from "vitest";
import {
  DEFAULT_FONT_PAIRING_ID,
  FONT_PAIRINGS,
  normalizeFontPairingId,
} from "./font-pairings";
import {
  DEFAULT_MONO_FONT_ID,
  MONO_FONTS,
  normalizeMonoFontId,
} from "./mono-fonts";

describe("scholarly font pairings and mono fonts", () => {
  it("defaults to the Principia STIX scholarly pairing with unique entries", () => {
    expect(DEFAULT_FONT_PAIRING_ID).toBe("principia");
    expect(FONT_PAIRINGS.length).toBe(6);

    const ids = FONT_PAIRINGS.map((pairing) => pairing.id);
    expect(new Set(ids).size).toBe(FONT_PAIRINGS.length);

    for (const pairing of FONT_PAIRINGS) {
      expect(pairing.discipline.trim().length).toBeGreaterThan(0);
      expect(pairing.serifCss).toContain("serif");
      expect(pairing.sansCss).toContain("sans-serif");
      expect(pairing.monoCss).toContain("monospace");
    }
  });

  it("migrates legacy font pairing ids gracefully", () => {
    expect(normalizeFontPairingId("cupertino")).toBe("system");
    expect(normalizeFontPairingId("editorial")).toBe("annals");
    expect(normalizeFontPairingId("modern")).toBe("bourbaki");
    expect(normalizeFontPairingId("technical")).toBe("laboratory");
    expect(normalizeFontPairingId("bourbaki")).toBe("bourbaki");
    expect(normalizeFontPairingId("non-existent")).toBe("principia");
    expect(normalizeFontPairingId(null)).toBe("principia");
  });

  it("includes Inconsolata and migrates cupertino mono font to system", () => {
    expect(DEFAULT_MONO_FONT_ID).toBe("jetbrains");
    expect(MONO_FONTS.some((font) => font.id === "inconsolata")).toBe(true);
    expect(normalizeMonoFontId("cupertino")).toBe("system");
    expect(normalizeMonoFontId("inconsolata")).toBe("inconsolata");
    expect(normalizeMonoFontId("unknown")).toBe("jetbrains");
    expect(normalizeMonoFontId(undefined)).toBe("jetbrains");
  });
});
