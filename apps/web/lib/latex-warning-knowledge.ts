export type WarningPriority = "critical" | "high" | "medium" | "low";

export const WARNING_PRIORITY_RANK: Record<WarningPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export interface WarningRemedy {
  /** What to change. Written for both the AI prompt and the UI. */
  instruction: string;
  /** The trade-off the editor must accept. */
  risk: string;
}

export interface WarningFamily {
  id: string;
  label: string;
  priority: WarningPriority;
  /** Whether bulk "Fix all" should consider this family. */
  bulkFix: boolean;
  description: string;
  match: RegExp;
  remedies: WarningRemedy[];
  guardrails: string[];
}

/**
 * Curated LaTeX warning knowledge. The AI repair prompt is built from these
 * entries so the model chooses a known remedy instead of inventing packages or
 * commands. Keep `match` specific and order families from most to least
 * specific; the first match wins.
 */
export const WARNING_FAMILIES: WarningFamily[] = [
  {
    id: "missing-character",
    label: "Missing character",
    priority: "medium",
    bulkFix: true,
    description:
      "A glyph in the source has no character in the current font encoding. The PDF drops the glyph, so text can silently disappear.",
    match: /missing character/i,
    remedies: [
      {
        instruction:
          "Load T1 encoding and a complete font in the preamble: \\usepackage[T1]{fontenc} and \\usepackage{lmodern}.",
        risk: "Changes glyph shapes slightly; safe for most documents.",
      },
      {
        instruction:
          "For one or two Unicode characters, use \\usepackage{newunicodechar} and \\newunicodechar{<char>}{<LaTeX replacement>}.",
        risk: "The replacement must preserve the character's meaning; do not substitute a question mark.",
      },
      {
        instruction:
          "For a document that relies on Unicode text, compile with XeLaTeX or LuaLaTeX and load fontspec with a font that contains the glyph.",
        risk: "Switching engines can change layout and package compatibility.",
      },
      {
        instruction:
          "Replace the character with an equivalent LaTeX command, such as \\textendash, \\textemdash, \\textquotedblleft, or \\textquotedblright.",
        risk: "Only use an equivalent command; never silently delete the character.",
      },
    ],
    guardrails: [
      "Do not drop the character or replace it with '?'.",
      "Do not change the document engine silently.",
    ],
  },
  {
    id: "float-too-large",
    label: "Float too large",
    priority: "high",
    bulkFix: true,
    description:
      "A figure or table is taller or wider than the text area, so LaTeX pushes it to the end or overprints the page.",
    match: /float too large|too large for page/i,
    remedies: [
      {
        instruction:
          "Constrain the float: width=\\linewidth, height=\\textheight, keepaspectratio on \\includegraphics, or \\resizebox{\\linewidth}{!}{...}.",
        risk: "Scaling below roughly 0.8 of the natural size can make labels unreadable.",
      },
      {
        instruction:
          "For a table, use tabularx or tabular* to fit the text width, or reduce the font with \\small.",
        risk: "A smaller font must still meet the venue's minimum size.",
      },
      {
        instruction:
          "Change placement to [!htbp], or add \\clearpage before the float so it starts on a fresh page.",
        risk: "Moving a float can separate it from the text that references it.",
      },
    ],
    guardrails: [
      "Do not shrink a figure until its labels are unreadable.",
      "Do not move a float across a section boundary if the surrounding text refers to it.",
    ],
  },
  {
    id: "overfull-hbox",
    label: "Overfull hbox",
    priority: "high",
    bulkFix: true,
    description:
      "A line is wider than the text block. The excess either protrudes into the margin or is absorbed by a very loose paragraph. Check whether one unbreakable word or URL causes it before choosing a remedy.",
    match: /overfull\s+\\hbox/i,
    remedies: [
      {
        instruction:
          "If one word, URL, code identifier, or filename is wider than the line, insert \\- inside the token, roughly every 15-25 characters, so each fragment can break. Never append \\- at the end: a discretionary hyphen after the last character does not shorten the line. For a URL, \\path{...} is preferred.",
        risk: "Do not hyphenate code identifiers, names, or URLs in a way that changes their meaning.",
      },
      {
        instruction:
          "For an ordinary paragraph, add \\setlength{\\emergencystretch}{2em} to the preamble (or \\emergencystretch=2em). This lets TeX stretch the affected paragraph without changing the text.",
        risk: "Global and mild; keep it between 1em and 3em. It does nothing when a single word is wider than the line.",
      },
      {
        instruction:
          "Wrap only the affected paragraph in \\begin{sloppypar}...\\end{sloppypar}.",
        risk: "Local; the paragraph may show underfull lines.",
      },
      {
        instruction:
          "When many paragraphs are overfull or the overflow is severe, add \\sloppy to the preamble.",
        risk: "Global; trades overfull lines for underfull boxes and looser spacing. Never use it for underfull warnings.",
      },
      {
        instruction:
          "For an image or table, reduce its width with width=\\linewidth, tabularx, or \\resizebox{\\linewidth}{!}{...}.",
        risk: "Preserve legibility and the venue's figure requirements.",
      },
    ],
    guardrails: [
      "Never delete text solely to remove an overfull box.",
      "If the overflow is hundreds of points and the excerpt shows one long token, stretching is the wrong remedy: break the token.",
      "A \\- at the end of the token does nothing; place break points inside it and leave at least 10 characters on each side.",
      "Do not put \\sloppy inside math, verbatim, or a single command argument.",
      "Fix the paragraph TeX names, not the whole document, unless several warnings share one cause.",
    ],
  },
  {
    id: "overfull-vbox",
    label: "Overfull vbox",
    priority: "high",
    bulkFix: true,
    description:
      "A page is taller than the text height, usually because a float, display, or unbreakable block cannot fit.",
    match: /overfull\s+\\vbox/i,
    remedies: [
      {
        instruction:
          "Add \\raggedbottom to the preamble to let pages end short instead of stretching or overfilling.",
        risk: "Global; page bottoms become uneven.",
      },
      {
        instruction:
          "Use \\enlargethispage{\\baselineskip} on the affected page.",
        risk: "Local; it changes one page only and can push the problem to the next page.",
      },
      {
        instruction:
          "Reduce or move the float, display, or long unbreakable block near the page break.",
        risk: "Do not break a proof or theorem across pages if the venue forbids it.",
      },
    ],
    guardrails: [
      "Do not shrink margins or font size globally to hide an overfull vbox.",
    ],
  },
  {
    id: "undefined-reference",
    label: "Undefined reference",
    priority: "high",
    bulkFix: true,
    description:
      "A \\ref, \\eqref, or \\pageref points at a label that is not in the current .aux file.",
    match:
      /(?:reference|label).{0,40}undefined|undefined.{0,40}(?:reference|label)/i,
    remedies: [
      {
        instruction:
          "Recompile twice so the .aux file contains the label. If the warning persists, add the missing \\label{...} or correct the misspelled key.",
        risk: "A rerun cannot help when the label truly does not exist.",
      },
      {
        instruction:
          "Place \\label after \\caption in floats and after \\section for section references.",
        risk: "A label before \\caption can point at the wrong counter.",
      },
    ],
    guardrails: [
      "Never invent a label name or change a reference key without checking every use.",
    ],
  },
  {
    id: "undefined-citation",
    label: "Undefined citation",
    priority: "high",
    bulkFix: true,
    description:
      "A citation key is missing from the bibliography database or the bibliography was not regenerated.",
    match: /citation.{0,40}undefined|undefined.{0,40}citation/i,
    remedies: [
      {
        instruction:
          "Check the key in the .bib file or thebibliography, run BibTeX/Biber, then LaTeX twice.",
        risk: "The wrong bibliography tool (BibTeX vs Biber) never resolves biblatex entries.",
      },
      {
        instruction:
          "If the entry is genuinely missing, add the real bibliographic data supplied by the user.",
        risk: "Never fabricate authors, titles, venues, years, or DOIs.",
      },
    ],
    guardrails: [
      "Never invent a citation or bibliographic record.",
      "Do not delete a citation merely to silence the warning.",
    ],
  },
  {
    id: "multiply-defined-label",
    label: "Duplicate label",
    priority: "medium",
    bulkFix: true,
    description:
      "The same \\label key is used more than once, so references resolve to the last definition.",
    match: /multiply[- ]defined|multiple labels|label .* already defined/i,
    remedies: [
      {
        instruction:
          "Rename one duplicate label and update every \\ref/\\eqref that used it.",
        risk: "Missing a reference leaves a new undefined-reference warning.",
      },
    ],
    guardrails: ["Search the whole project for the key before renaming it."],
  },
  {
    id: "font-shape",
    label: "Undefined font shape",
    priority: "medium",
    bulkFix: true,
    description:
      "The requested font family/series/shape is not available; LaTeX substitutes a different shape.",
    match: /font shape .*undefined|font .*not found|font shape/i,
    remedies: [
      {
        instruction:
          "Load \\usepackage[T1]{fontenc} and \\usepackage{lmodern}.",
        risk: "Changes the document's font metrics slightly.",
      },
      {
        instruction:
          "Use a family that provides the requested shape, or declare a fallback with \\DeclareFontShape.",
        risk: "A silent fallback can hide a missing bold/italic face.",
      },
      {
        instruction:
          "In math, replace \\bfseries with \\mathbf or \\boldsymbol where appropriate.",
        risk: "Do not change math semantics just to silence the warning.",
      },
    ],
    guardrails: [
      "Do not substitute a font that changes the document's required style.",
    ],
  },
  {
    id: "math-mode-warning",
    label: "Math-mode warning",
    priority: "medium",
    bulkFix: true,
    description:
      "A command or character is used in the wrong mode, usually text inside math or a subscript outside math.",
    match:
      /invalid in math mode|math mode.*invalid|command .* invalid in math mode/i,
    remedies: [
      {
        instruction:
          "Wrap running text in \\text{...} from amsmath or \\mbox{...}, and use \\mathrm or \\operatorname for multi-letter math names.",
        risk: "Do not change the formula's meaning or its sub/superscripts.",
      },
      {
        instruction:
          "Escape _ and ^ in text mode, or move the subscript/superscript into math mode.",
        risk: "Check that the index still belongs to the intended symbol.",
      },
    ],
    guardrails: ["Do not rewrite the formula just to silence the warning."],
  },
  {
    id: "hyperref-token",
    label: "Hyperref token warning",
    priority: "medium",
    bulkFix: true,
    description:
      "A fragile command or math token appears in a PDF string such as a section title, caption, or bookmark.",
    match: /token not allowed in a pdf string|pdfstringdef|hyperref warning/i,
    remedies: [
      {
        instruction:
          "Wrap the offending content in \\texorpdfstring{<TeX>}{<plain text>} inside the section title or caption.",
        risk: "The plain-text bookmark must still identify the section clearly.",
      },
      {
        instruction:
          "Put \\protect before a fragile command used in a moving argument.",
        risk: "Over-protecting can change expansion order; use it only on the named command.",
      },
      {
        instruction: "Load hyperref last, after most other packages.",
        risk: "Reordering packages can break other package interactions.",
      },
    ],
    guardrails: ["Do not remove the section title or disable hyperref."],
  },
  {
    id: "marginpar",
    label: "Margin note warning",
    priority: "medium",
    bulkFix: true,
    description:
      "A margin note is used where the margin is unavailable, commonly inside a float or a narrow box.",
    match: /marginpar|margin note/i,
    remedies: [
      {
        instruction:
          "Move \\marginpar outside the float, or use \\marginnote from the marginnote package.",
        risk: "A moved note may no longer align with the sentence it comments on.",
      },
    ],
    guardrails: ["Do not delete the note; preserve its content."],
  },
  {
    id: "destination-duplicate",
    label: "Duplicate PDF destination",
    priority: "medium",
    bulkFix: true,
    description:
      "Two hyperlinks or bookmarks share the same PDF destination name.",
    match: /destination with the same identifier/i,
    remedies: [
      {
        instruction:
          "Add \\phantomsection before \\addcontentsline and make section titles unique.",
        risk: "Bookmarks may point at the wrong page if the anchor is misplaced.",
      },
      {
        instruction: "As a last resort, use \\hypersetup{hypertexnames=false}.",
        risk: "Global; link names become less descriptive.",
      },
    ],
    guardrails: [
      "Do not disable hyperref to silence one duplicate destination.",
    ],
  },
  {
    id: "underfull-hbox",
    label: "Underfull hbox",
    priority: "low",
    bulkFix: false,
    description:
      "A line is too loose. This is typographic, not a correctness problem, and is often the cost of fixing an overfull line.",
    match: /underfull\s+\\hbox/i,
    remedies: [
      {
        instruction:
          "Usually leave it. For a visibly loose paragraph, add \\raggedright locally or rephrase the sentence.",
        risk: "Global \\raggedright changes the document's justification.",
      },
      {
        instruction: "Do not use \\sloppy; it causes underfull lines.",
        risk: "It makes this warning more likely, not less.",
      },
    ],
    guardrails: [
      "Never apply \\sloppy to an underfull box.",
      "Do not rewrite technical content just to improve spacing.",
    ],
  },
  {
    id: "underfull-vbox",
    label: "Underfull vbox",
    priority: "low",
    bulkFix: false,
    description:
      "A page ends short. This is normal with \\raggedbottom or a forced page break.",
    match: /underfull\s+\\vbox/i,
    remedies: [
      {
        instruction:
          "Usually leave it. If it causes a visibly empty page, adjust the page break or add content.",
        risk: "Do not add filler text or vertical space to hide it.",
      },
    ],
    guardrails: [
      "Do not add \\vfill or blank text solely to silence the warning.",
    ],
  },
  {
    id: "font-substitution",
    label: "Font substitution",
    priority: "low",
    bulkFix: false,
    description:
      "LaTeX substituted an unavailable font. Output is usually acceptable but metrics can differ.",
    match: /font substitution|substituting.*font/i,
    remedies: [
      {
        instruction:
          "Install the missing font, or load an explicit substitute such as lmodern, mathptmx, or newtx.",
        risk: "Changing the font changes line breaks and page count.",
      },
    ],
    guardrails: [
      "Do not switch fonts solely to hide a warning if the current output is acceptable.",
    ],
  },
  {
    id: "rerun",
    label: "Rerun required",
    priority: "low",
    bulkFix: false,
    description:
      "The .aux file changed during the last run; a second compilation can resolve references and labels.",
    match: /rerun|label\(s\) may have changed|cross-references right/i,
    remedies: [
      {
        instruction: "Recompile; no source change is needed.",
        risk: "If the warning persists after two runs, look for a genuinely missing label.",
      },
    ],
    guardrails: ["Do not patch source for a rerun-only warning."],
  },
  {
    id: "generic-warning",
    label: "Package warning",
    priority: "low",
    bulkFix: false,
    description:
      "A package or class warning with no specific entry in this knowledge base.",
    match: /warning/i,
    remedies: [
      {
        instruction:
          "Only patch when the warning names a concrete file, command, or package and a remedy is documented here. Otherwise omit the patch.",
        risk: "Guessing can introduce new errors.",
      },
    ],
    guardrails: [
      "Do not invent packages, lengths, or commands for an unrecognized warning.",
    ],
  },
];

const BY_ID = new Map(WARNING_FAMILIES.map((family) => [family.id, family]));

export function warningFamilyById(
  id: string | undefined,
): WarningFamily | null {
  if (!id) return null;
  return BY_ID.get(id) ?? null;
}

/** First matching family; specific patterns come before the generic fallback. */
export function classifyLatexWarning(
  title: string,
  details: string[] = [],
): WarningFamily | null {
  const text = `${title}\n${details.join("\n")}`;
  for (const family of WARNING_FAMILIES) {
    // Reset lastIndex in case a caller ever passes a global regex.
    family.match.lastIndex = 0;
    if (family.match.test(text)) return family;
  }
  return null;
}

export function isPrioritizedWarning(
  family: WarningFamily | null,
): family is WarningFamily {
  return family !== null && family.priority !== "low" && family.bulkFix;
}

export interface RepairDiagnosticLike {
  severity?: "error" | "warning";
  message: string;
  details?: string[];
}

/**
 * Applies the product rule for bulk repair: errors always pass; warnings pass
 * only when warnings were requested and the knowledge base ranks them at least
 * medium. A single-row action may target any warning the user selected.
 */
export function prioritizeRepairDiagnostics<T extends RepairDiagnosticLike>(
  diagnostics: T[],
  options: { includeWarnings: boolean; mode: "single" | "all" },
): T[] {
  return diagnostics
    .filter((diagnostic) => {
      if (diagnostic.severity !== "warning") return true;
      if (!options.includeWarnings) return false;
      if (options.mode === "single") return true;
      return isPrioritizedWarning(
        classifyLatexWarning(diagnostic.message, diagnostic.details),
      );
    })
    .sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === "error" ? -1 : 1;
      const left = classifyLatexWarning(a.message, a.details);
      const right = classifyLatexWarning(b.message, b.details);
      return (
        (left ? WARNING_PRIORITY_RANK[left.priority] : 9) -
        (right ? WARNING_PRIORITY_RANK[right.priority] : 9)
      );
    });
}

/** Remedy block for the AI prompt, limited to the families in play. */
export function warningKnowledgePrompt(
  entries: Array<{ diagnosticId: string; title: string; details?: string[] }>,
): string {
  const families = new Map<string, WarningFamily>();
  const matches: string[] = [];

  for (const entry of entries) {
    const family = classifyLatexWarning(entry.title, entry.details);
    if (!family) continue;
    families.set(family.id, family);
    matches.push(
      `- diagnostic ${entry.diagnosticId}: family=${family.id} priority=${family.priority}`,
    );
  }

  if (families.size === 0) {
    return "No knowledge-base entry matches these diagnostics. Return no patches and explain why in notes.";
  }

  const blocks = [...families.values()].map((family) => {
    const remedies = family.remedies
      .map(
        (remedy, index) =>
          `${index + 1}. ${remedy.instruction}\n   risk: ${remedy.risk}`,
      )
      .join("\n");
    return `### ${family.id} (${family.label}, priority ${family.priority})\n${family.description}\nRemedies:\n${remedies}\nGuardrails:\n${family.guardrails
      .map((item) => `- ${item}`)
      .join("\n")}`;
  });

  return `${matches.join("\n")}\n\n${blocks.join("\n\n")}`;
}
