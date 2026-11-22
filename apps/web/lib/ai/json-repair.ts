/**
 * Extracts a JSON object from an LLM response string, stripping surrounding
 * Markdown code fences and leading/trailing explanatory prose.
 */
export function extractJsonObject(text: string): string {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  return start !== -1 && end > start ? trimmed.slice(start, end + 1) : trimmed;
}

/**
 * Repairs unescaped LaTeX backslashes (e.g. `\section`, `\-`, `\sloppy`)
 * inside a raw JSON string while preserving valid JSON escapes (`\"`, `\\`,
 * `\/`, `\b`, `\f`, `\n`, `\r`, `\t`, `\uXXXX`).
 */
export function repairJsonEscapes(json: string): string {
  let out = "";

  for (let index = 0; index < json.length; index += 1) {
    const char = json[index];
    if (char !== "\\") {
      out += char;
      continue;
    }

    const next = json[index + 1];
    if (next === undefined) {
      out += "\\\\";
      continue;
    }

    if (next === "\\") {
      out += "\\\\";
      index += 1;
      continue;
    }
    if ('"\\/bfnrt'.includes(next)) {
      out += char + next;
      index += 1;
      continue;
    }
    if (next === "u") {
      const hex = json.slice(index + 2, index + 6);
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        out += `\\u${hex}`;
        index += 5;
        continue;
      }
    }

    // Bare backslash (e.g. LaTeX command): escape it for JSON.parse.
    out += "\\\\";
  }

  return out;
}

/**
 * Extracts, escape-repairs, and parses a JSON payload produced by an LLM.
 */
export function parseRepairedJson<T = unknown>(text: string): T {
  return JSON.parse(repairJsonEscapes(extractJsonObject(text))) as T;
}
