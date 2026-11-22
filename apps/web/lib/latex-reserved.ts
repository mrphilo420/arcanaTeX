import {
  enclosingGroups,
  locateContextOffset,
  maskComments,
  openEnvironments,
} from "@/lib/latex-active";

export type EscapeResult =
  | { ok: true; content: string }
  | { ok: false; reason: string };

interface ErrorContext {
  kind: string;
  line?: number | null;
  lineText?: string | null;
}

/** Environments whose body is running text, where `&` can never be a cell break. */
const PROSE_ENVIRONMENTS = new Set([
  "document",
  "itemize",
  "enumerate",
  "description",
  "center",
  "flushleft",
  "flushright",
  "quote",
  "quotation",
  "verse",
  "abstract",
  "figure",
  "figure*",
  "table",
  "table*",
  "minipage",
  "proof",
  "theorem",
  "lemma",
  "proposition",
  "corollary",
  "definition",
  "remark",
  "example",
  "claim",
  "conjecture",
]);

/** Text before a `{` that tells us the group is the body of a definition. */
const DEFINITION_GROUP =
  /\\(?:(?:re)?newcommand|providecommand|[gex]?def|(?:re)?newenvironment|newtheorem)\b/;

function isEscaped(text: string, offset: number): boolean {
  let slashes = 0;
  for (let index = offset - 1; index >= 0 && text[index] === "\\"; index--) {
    slashes++;
  }
  return slashes % 2 === 1;
}

/**
 * Escapes the one reserved character TeX tripped over. TeX prints the source up
 * to the point of failure, so the end of that printed context is a confirmed
 * position: the rule edits it only if the source line really starts with the
 * context and the character there is the expected one.
 */
export function escapeReservedCharacter(
  content: string,
  context: ErrorContext,
): EscapeResult {
  const line = context.line;
  const printed = context.lineText;
  if (!line || !printed) {
    return {
      ok: false,
      reason: "The log did not show where the error happened",
    };
  }

  const offset = locateContextOffset(content, line, printed);
  if (offset === null) {
    return {
      ok: false,
      reason: "The source line does not match what the log printed",
    };
  }

  const char = content[offset - 1];
  const masked = maskComments(content);
  const at = offset - 1;

  if (masked[at] !== char || isEscaped(content, at)) {
    return {
      ok: false,
      reason: "The character is in a comment or already escaped",
    };
  }

  if (context.kind === "math-mode") {
    if (char === "_" || char === "^") {
      return {
        ok: false,
        reason:
          "A bare _ or ^ in prose may be meant as math, so the author must decide",
      };
    }
    if (char !== "}") {
      return {
        ok: false,
        reason: "The math-mode error is not caused by _ or ^",
      };
    }
    return escapeInTypewriterGroup(content, masked, at);
  }

  if (context.kind === "misplaced-tab") {
    if (char !== "&") {
      return { ok: false, reason: "The error is not caused by an &" };
    }
    const environments = openEnvironments(masked, at);
    const innermost = environments[environments.length - 1];
    if (!innermost || !PROSE_ENVIRONMENTS.has(innermost)) {
      return {
        ok: false,
        reason: `The & is inside the ${innermost ? `"${innermost}"` : "unknown"} environment, which may be a table`,
      };
    }
    return replaceAt(content, at, "\\&");
  }

  if (context.kind === "misplaced-hash") {
    if (char !== "#") {
      return { ok: false, reason: "The error is not caused by a #" };
    }
    if (enclosingGroups(masked, at).some((b) => DEFINITION_GROUP.test(b))) {
      return { ok: false, reason: "The # is inside a macro definition" };
    }
    return replaceAt(content, at, "\\#");
  }

  return { ok: false, reason: "No reserved-character rule applies" };
}

/**
 * TeX reports an error inside a macro argument at the end of the argument, so
 * for `\\texttt{my_file}` the printed context ends at the closing brace. When
 * that brace closes a `\\texttt` group, every bare `_` and `^` in it is escaped:
 * typewriter text is code or a file name, so the intent is literal.
 */
function escapeInTypewriterGroup(
  content: string,
  masked: string,
  closeAt: number,
): EscapeResult {
  const open: number[] = [];
  let groupStart = -1;

  for (let index = 0; index <= closeAt; index++) {
    const char = masked[index];
    if (char === "\\") index++;
    else if (char === "{") open.push(index);
    else if (char === "}") {
      const start = open.pop();
      if (index === closeAt) groupStart = start ?? -1;
    }
  }

  if (groupStart === -1 || !/\\texttt\s*$/.test(masked.slice(0, groupStart))) {
    return {
      ok: false,
      reason:
        "The error is not at the end of a \\texttt group, so the intent is unclear",
    };
  }

  const targets: number[] = [];
  for (let index = groupStart + 1; index < closeAt; index++) {
    const char = masked[index];
    if (char === "\\") index++;
    else if (char === "$") {
      return { ok: false, reason: "The \\texttt group contains math" };
    } else if (char === "_" || char === "^") targets.push(index);
  }

  if (targets.length === 0) {
    return { ok: false, reason: "No bare _ or ^ found in the \\texttt group" };
  }

  let result = content;
  for (const index of targets.reverse()) {
    const escape = masked[index] === "_" ? "\\_" : "\\textasciicircum{}";
    result = result.slice(0, index) + escape + result.slice(index + 1);
  }
  return { ok: true, content: result };
}

function replaceAt(content: string, at: number, text: string): EscapeResult {
  return {
    ok: true,
    content: content.slice(0, at) + text + content.slice(at + 1),
  };
}
