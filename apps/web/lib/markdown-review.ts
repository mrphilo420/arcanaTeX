const LATEX_ESCAPES: Record<string, string> = {
  "\\": "\\textbackslash{}",
  "{": "\\{",
  "}": "\\}",
  $: "\\$",
  "&": "\\&",
  "#": "\\#",
  "%": "\\%",
  _: "\\_",
  "~": "\\textasciitilde{}",
  "^": "\\textasciicircum{}",
};

function escapeLatex(text: string): string {
  return text.replace(/[\\{}$&#%_~^]/g, (char) => LATEX_ESCAPES[char]);
}

/** Escapes prose but leaves $...$ math intact. */
function escapeProse(text: string): string {
  return text
    .split(/(\$[^$\n]+\$)/g)
    .map((part) =>
      part.startsWith("$") && part.endsWith("$") && part.length > 2
        ? part
        : escapeLatex(part),
    )
    .join("");
}

function escapeUrl(url: string): string {
  return url.replace(/[%#&_{}$^~\\]/g, (char) => LATEX_ESCAPES[char] ?? char);
}

/** Bold, italic, inline code, and links. Code spans are escaped as text. */
function formatInline(text: string): string {
  const withCode = text
    .split(/(`[^`]+`)/g)
    .map((part) => {
      if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
        return `\\texttt{${escapeLatex(part.slice(1, -1))}}`;
      }
      return escapeProse(part)
        .replace(
          /\[([^\]]+)\]\(([^)]+)\)/g,
          (_match, label: string, url: string) =>
            `\\href{${escapeUrl(url)}}{${label}}`,
        )
        .replace(/\*\*([^*]+)\*\*/g, "\\textbf{$1}")
        .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1\\textit{$2}");
    })
    .join("");

  return withCode;
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
}

/**
 * Converts a Markdown review into one compileable LaTeX document. The paper
 * review skill returns Markdown because provider tool-call JSON cannot carry a
 * long LaTeX string reliably; this is the deterministic document wrapper.
 */
export function markdownReviewToLatex(
  markdown: string,
  title = "Paper review",
): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let list: "itemize" | "enumerate" | null = null;
  let inCode = false;
  let codeLines: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push(formatInline(paragraph.join(" ")));
    paragraph = [];
  };
  const closeList = () => {
    if (!list) return;
    blocks.push(`\\end{${list}}`);
    list = null;
  };
  const openList = (kind: "itemize" | "enumerate") => {
    flushParagraph();
    if (list === kind) return;
    closeList();
    blocks.push(`\\begin{${kind}}`);
    list = kind;
  };
  const flushBlocks = () => {
    flushParagraph();
    closeList();
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (inCode) {
      if (/^\s*```/.test(line)) {
        blocks.push(
          `\\begin{verbatim}\n${codeLines.join("\n")}\n\\end{verbatim}`,
        );
        codeLines = [];
        inCode = false;
      } else {
        codeLines.push(line);
      }
      continue;
    }

    if (/^\s*```/.test(line)) {
      flushBlocks();
      inCode = true;
      continue;
    }

    if (line.trim() === "") {
      flushBlocks();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushBlocks();
      const level = heading[1].length;
      const command =
        level === 1
          ? "section"
          : level === 2
            ? "subsection"
            : level === 3
              ? "subsubsection"
              : "paragraph";
      blocks.push(`\\${command}*{${formatInline(heading[2].trim())}}`);
      continue;
    }

    if (/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line)) {
      flushBlocks();
      blocks.push("\\hrule\\vspace{0.5\\baselineskip}");
      continue;
    }

    if (line.includes("|") && isTableSeparator(lines[index + 1] ?? "")) {
      flushBlocks();
      const header = splitTableRow(line);
      const rows: string[][] = [];
      index += 2;
      while (
        index < lines.length &&
        lines[index].includes("|") &&
        lines[index].trim() !== ""
      ) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      index -= 1;
      const columns = header.length;
      const columnWidth = Math.min(0.62, Math.max(0.14, 0.9 / columns));
      const spec = `@{}${Array.from(
        { length: columns },
        () => `p{${columnWidth.toFixed(2)}\\linewidth}`,
      ).join("")}@{}`;
      blocks.push(
        [
          "{\\small",
          `\\begin{tabular}{${spec}}`,
          "\\hline",
          `${header.map((cell) => formatInline(cell)).join(" & ")} \\\\`,
          "\\hline",
          ...rows.map(
            (row) =>
              `${row
                .slice(0, columns)
                .map((cell) => formatInline(cell))
                .join(" & ")} \\\\`,
          ),
          "\\hline",
          "\\end{tabular}",
          "}",
        ].join("\n"),
      );
      continue;
    }

    const bullet = line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      const kind = /^\s*\d+[.)]/.test(line) ? "enumerate" : "itemize";
      openList(kind);
      blocks.push(`\\item ${formatInline(bullet[1].trim())}`);
      continue;
    }

    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      flushBlocks();
      blocks.push(
        `\\begin{quote}\n${formatInline(quote[1].trim())}\n\\end{quote}`,
      );
      continue;
    }

    closeList();
    paragraph.push(line.trim());
  }

  flushBlocks();
  if (inCode && codeLines.length > 0) {
    blocks.push(`\\begin{verbatim}\n${codeLines.join("\n")}\n\\end{verbatim}`);
  }

  const body =
    blocks.join("\n\n").trim() || `\\section*{${escapeLatex(title)}}`;
  return `\\documentclass[11pt]{article}
\\usepackage[margin=1in]{geometry}
\\usepackage{amsmath,amssymb}
\\usepackage{hyperref}
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{0.5\\baselineskip}
\\begin{document}

${body}

\\end{document}
`;
}
