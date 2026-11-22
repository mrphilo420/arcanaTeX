/** Paragraphs first, then lines, then sentences, then a hard cut. */
export function splitForCompaction(text: string, maxChars: number): string[] {
  const limit = Math.max(200, Math.floor(maxChars));
  if (text.length <= limit) return text.length > 0 ? [text] : [];

  const chunks: string[] = [];
  let current = "";

  const push = () => {
    if (current.trim().length > 0) chunks.push(current);
    current = "";
  };

  const addUnit = (unit: string) => {
    if (unit.length > limit) {
      // A single unit is too big: cut it into hard slices.
      for (let offset = 0; offset < unit.length; offset += limit) {
        const slice = unit.slice(offset, offset + limit);
        if (current.length + slice.length > limit) push();
        if (slice.length === limit) chunks.push(slice);
        else current += slice;
      }
      return;
    }
    if (current.length + unit.length > limit) push();
    current += unit;
  };

  for (const paragraph of text.split(/\n{2,}/)) {
    const units =
      paragraph.length > limit ? paragraph.split(/\n/) : [paragraph];
    for (const unit of units) {
      const withBreak = current.length > 0 ? `\n\n${unit}` : unit;
      if (current.length + withBreak.length <= limit) {
        current += withBreak;
      } else {
        addUnit(unit);
      }
    }
    // Paragraph boundary keeps chunks readable.
    if (current.length > 0) current += "\n\n";
  }

  push();
  return chunks.map((chunk) => chunk.trim()).filter(Boolean);
}

export const COMPACT_SYSTEM_PROMPT = `You compact a long user message for a downstream assistant.

Keep, in this order of priority:
1. Every explicit instruction, constraint, and question.
2. Names, numbers, dates, citations, file paths, LaTeX commands, and code identifiers, verbatim.
3. Structure: sections, lists, and the order of steps.

Drop: pleasantries, repetition, hedging, and prose that only restates the above.

Write plain text, no preamble, no headings of your own. Never invent requirements that are not present. If the message is already compact, return it unchanged.`;

export function compactionPrompt(
  chunk: string,
  index: number,
  total: number,
): string {
  return `Part ${index} of ${total} of a long message follows. Compact it.\n\n<part>\n${chunk}\n</part>`;
}

export function mergePrompt(notes: string[]): string {
  return `These are compactions of consecutive parts of one message, in order. Merge them into a single compact brief that preserves every instruction and every specific detail. Do not summarize away requirements.

${notes
  .map((note, index) => `<part index="${index + 1}">\n${note}\n</part>`)
  .join("\n\n")}`;
}
