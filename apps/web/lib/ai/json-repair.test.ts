import { describe, expect, it } from "vitest";
import {
  extractJsonObject,
  parseRepairedJson,
  repairJsonEscapes,
} from "./json-repair";

describe("json-repair", () => {
  it("strips markdown fences and surrounding prose when extracting JSON", () => {
    const raw =
      'Here is your JSON:\n```json\n{"ok":true,"text":"hello"}\n```\nDone.';
    expect(extractJsonObject(raw)).toBe('{"ok":true,"text":"hello"}');
  });

  it("repairs bare LaTeX backslashes while preserving valid JSON escapes", () => {
    const raw =
      '{"tex":"\\section{Intro}\\n\\- item\\u0041","quoted":"a\\"b\\\\c"}';
    const repaired = repairJsonEscapes(raw);
    const parsed = JSON.parse(repaired) as { tex: string; quoted: string };
    expect(parsed.tex).toBe("\\section{Intro}\n\\- itemA");
    expect(parsed.quoted).toBe('a"b\\c');
  });

  it("handles trailing backslashes cleanly", () => {
    expect(repairJsonEscapes("abc\\")).toBe("abc\\\\");
  });

  it("parses fenced LLM responses with bare LaTeX commands in one step", () => {
    const parsed = parseRepairedJson<{ latex: string }>(
      '```json\n{"latex":"\\alpha + \\pi"}\n```',
    );
    expect(parsed.latex).toBe("\\alpha + \\pi");
  });
});
