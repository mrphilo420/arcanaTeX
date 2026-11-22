const LINE_BREAK = /\r\n|\n|\r/;
/** TeX and MiKTeX hard-wrap printed context lines at this width. */
const WRAP_COLUMN = 79;

/**
 * Blanks every comment so nothing inside one is counted or matched. Output has
 * the same length as the input, so offsets stay valid. `\%`, `\{`, `\\` and any
 * other escaped character are left alone.
 */
export function maskComments(text: string): string {
  let out = "";
  let index = 0;

  while (index < text.length) {
    const char = text[index];
    if (char === "\\") {
      out += char + (text[index + 1] ?? "");
      index += 2;
    } else if (char === "%") {
      while (
        index < text.length &&
        text[index] !== "\n" &&
        text[index] !== "\r"
      ) {
        out += " ";
        index++;
      }
    } else {
      out += char;
      index++;
    }
  }

  return out;
}

/**
 * Finds the offset just past the text TeX printed on its first context line
 * (`l.N <context>`), which is exactly where it stopped reading. Returns null
 * unless the source line really starts with that context, so a repair never
 * edits a position it has not confirmed.
 */
export function locateContextOffset(
  content: string,
  line: number,
  context: string,
): number | null {
  if (!context || context.startsWith("...")) return null;
  if (context.length + String(line).length + 3 >= WRAP_COLUMN) return null;

  let start = 0;
  const breaks = content.matchAll(new RegExp(LINE_BREAK, "g"));
  for (let current = 1; current < line; current++) {
    const next = breaks.next();
    if (next.done || next.value.index === undefined) return null;
    start = next.value.index + next.value[0].length;
  }

  const rest = content.slice(start);
  const lineText = rest.split(LINE_BREAK)[0];
  const indent = lineText.length - lineText.trimStart().length;
  if (!lineText.slice(indent).startsWith(context)) return null;

  return start + indent + context.length;
}

/** Names of the environments still open at `offset`, innermost last. */
export function openEnvironments(masked: string, offset: number): string[] {
  const stack: string[] = [];
  const tokens = masked
    .slice(0, offset)
    .matchAll(/\\(begin|end)\s*\{([^}]*)\}/g);

  for (const token of tokens) {
    if (token[1] === "begin") stack.push(token[2]);
    else if (stack[stack.length - 1] === token[2]) stack.pop();
    else {
      const at = stack.lastIndexOf(token[2]);
      if (at !== -1) stack.length = at;
    }
  }

  return stack;
}

/**
 * For every brace group still open at `offset`, the (up to 200) characters of
 * source before its `{`, outermost first. Lets a rule ask "am I inside the
 * argument of \texttt, or inside a definition?".
 */
export function enclosingGroups(masked: string, offset: number): string[] {
  const open: number[] = [];

  for (let index = 0; index < offset; index++) {
    const char = masked[index];
    if (char === "\\") index++;
    else if (char === "{") open.push(index);
    else if (char === "}") open.pop();
  }

  return open.map((at) => masked.slice(Math.max(0, at - 200), at));
}
