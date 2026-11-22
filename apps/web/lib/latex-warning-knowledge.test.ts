import { describe, expect, it } from "vitest";
import {
  classifyLatexWarning,
  isPrioritizedWarning,
  prioritizeRepairDiagnostics,
  warningKnowledgePrompt,
} from "./latex-warning-knowledge";

describe("classifyLatexWarning", () => {
  it("prioritizes an overfull hbox", () => {
    const family = classifyLatexWarning(
      "Overfull \\hbox (12.3pt too wide) in paragraph at lines 10--12",
    );

    expect(family?.id).toBe("overfull-hbox");
    expect(family?.priority).toBe("high");
    expect(family?.bulkFix).toBe(true);
    expect(
      family?.remedies.some((item) => item.instruction.includes("\\sloppy")),
    ).toBe(true);
  });

  it("keeps underfull hbox low priority and out of bulk fixes", () => {
    const family = classifyLatexWarning(
      "Underfull \\hbox (badness 10000) in paragraph at lines 20--20",
    );

    expect(family?.id).toBe("underfull-hbox");
    expect(family?.priority).toBe("low");
    expect(family?.bulkFix).toBe(false);
    expect(isPrioritizedWarning(family)).toBe(false);
  });

  it("classifies missing characters", () => {
    expect(
      classifyLatexWarning("Missing character: There is no – in font []!")?.id,
    ).toBe("missing-character");
  });

  it("classifies undefined references and citations separately", () => {
    expect(
      classifyLatexWarning(
        "LaTeX Warning: Reference `sec:x' on page 1 undefined on input line 4.",
      )?.id,
    ).toBe("undefined-reference");
    expect(
      classifyLatexWarning(
        "LaTeX Warning: Citation `smith2020' on page 1 undefined on input line 9.",
      )?.id,
    ).toBe("undefined-citation");
  });

  it("classifies a math-mode warning", () => {
    expect(
      classifyLatexWarning(
        "LaTeX Warning: Command \\text@ invalid in math mode on input line 5.",
      )?.id,
    ).toBe("math-mode-warning");
  });

  it("classifies a hyperref PDF-string warning", () => {
    expect(
      classifyLatexWarning(
        "Package hyperref Warning: Token not allowed in a PDF string (Unicode): (hyperref) removing `math shift'",
      )?.id,
    ).toBe("hyperref-token");
  });

  it("falls back to a low-priority generic warning", () => {
    const family = classifyLatexWarning(
      "Package microtype Warning: Unknown option `foo'",
    );

    expect(family?.id).toBe("generic-warning");
    expect(family?.priority).toBe("low");
    expect(family?.bulkFix).toBe(false);
  });

  it("returns null when nothing looks like a warning", () => {
    expect(classifyLatexWarning("Undefined control sequence.")).toBeNull();
  });
});

describe("warningKnowledgePrompt", () => {
  it("includes only the families in play and names the diagnostic", () => {
    const prompt = warningKnowledgePrompt([
      {
        diagnosticId: "diag-1",
        title: "Overfull \\hbox (22pt too wide) in paragraph at lines 4--6",
      },
    ]);

    expect(prompt).toContain("diagnostic diag-1");
    expect(prompt).toContain("overfull-hbox");
    expect(prompt).toContain("\\sloppy");
    expect(prompt).not.toContain("underfull-hbox");
  });

  it("tells the model to stop when the knowledge base has no match", () => {
    const prompt = warningKnowledgePrompt([
      { diagnosticId: "diag-2", title: "Something unfamiliar" },
    ]);

    expect(prompt).toContain("No knowledge-base entry");
    expect(prompt).toContain("Return no patches");
  });
});

describe("prioritizeRepairDiagnostics", () => {
  const error = {
    severity: "error" as const,
    message: "Undefined control sequence.",
  };
  const overfull = {
    severity: "warning" as const,
    message: "Overfull \\hbox (8pt too wide) in paragraph at lines 2--3",
  };
  const missing = {
    severity: "warning" as const,
    message: "Missing character: There is no – in font []!",
  };
  const underfull = {
    severity: "warning" as const,
    message: "Underfull \\hbox (badness 10000) in paragraph at lines 4--4",
  };

  it("drops warnings when the request did not ask for them", () => {
    expect(
      prioritizeRepairDiagnostics([error, overfull], {
        includeWarnings: false,
        mode: "all",
      }),
    ).toEqual([error]);
  });

  it("bulk repair keeps high and medium warnings but drops low", () => {
    expect(
      prioritizeRepairDiagnostics([underfull, missing, overfull], {
        includeWarnings: true,
        mode: "all",
      }),
    ).toEqual([overfull, missing]);
  });

  it("a single-row action may target a low warning", () => {
    expect(
      prioritizeRepairDiagnostics([underfull], {
        includeWarnings: true,
        mode: "single",
      }),
    ).toEqual([underfull]);
  });

  it("sorts errors first, then by warning priority", () => {
    expect(
      prioritizeRepairDiagnostics([underfull, overfull, error, missing], {
        includeWarnings: true,
        mode: "all",
      }),
    ).toEqual([error, overfull, missing]);
  });
});
