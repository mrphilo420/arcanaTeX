import { describe, expect, it } from "vitest";
import { parseBibtex } from "@/lib/bibtex";
import {
  adaptManuscriptToPublisher,
  applyComplianceQuickFix,
  detectPublisherFromContent,
  evaluatePublisherCompliance,
  extractManuscriptParts,
  generatePreprintDisclosureSnippet,
  getRecommendedBibStyleForContent,
  PUBLISHER_LIST,
  PUBLISHER_TEMPLATES,
  type PublisherId,
} from "@/lib/publishers";
import type { ProjectFile } from "@/lib/project-files";

function toProjectFiles(files: Array<Omit<ProjectFile, "id">>): ProjectFile[] {
  return files.map((file, idx) => ({ ...file, id: `f-${idx}` }));
}

describe("PUBLISHER_TEMPLATES", () => {
  it("exposes all 8 peer-reviewed templates with valid structure, abstract, keywords, and references.bib", () => {
    expect(PUBLISHER_LIST).toHaveLength(8);

    const expectedIds: PublisherId[] = [
      "elsevier",
      "ieee",
      "springer-nature",
      "ams",
      "acm",
      "siam",
      "aps",
      "oxford-wiley",
    ];
    for (const id of expectedIds) {
      expect(PUBLISHER_TEMPLATES[id]).toBeDefined();
    }

    for (const template of PUBLISHER_LIST) {
      const main = template.files.find((f) => f.path === template.mainFileName);
      const bib = template.files.find((f) => f.path === "references.bib");

      expect(main, `${template.id} missing main file`).toBeDefined();
      expect(bib, `${template.id} missing references.bib`).toBeDefined();

      const content = main?.content ?? "";
      expect(content).toContain(`% arcana-publisher: ${template.id}`);
      expect(content).toContain("\\documentclass");
      expect(content).toContain("\\begin{document}");
      expect(content).toContain("\\end{document}");

      // Abstract check
      expect(
        /\\begin\{abstract\}|\\abstract\{/.test(content),
        `${template.id} missing abstract`,
      ).toBe(true);

      // Keywords check
      expect(
        /\\begin\{keyword\}|\\begin\{IEEEkeywords\}|\\begin\{keywords\}|\\keywords\{/.test(
          content,
        ),
        `${template.id} missing keywords`,
      ).toBe(true);

      // Every citation in the template resolves in references.bib and parses cleanly
      const bibParsed = parseBibtex(bib?.content ?? "");
      expect(bibParsed.problems.filter((p) => p.severity === "error")).toEqual(
        [],
      );
      const keys = new Set(bibParsed.entries.map((entry) => entry.key));
      const cites = [...content.matchAll(/\\cite\{([^}]+)\}/g)].flatMap((m) =>
        m[1].split(",").map((k) => k.trim()),
      );
      expect(cites.length).toBeGreaterThan(0);
      for (const citeKey of cites) {
        expect(
          keys.has(citeKey),
          `${template.id} missing bib key ${citeKey}`,
        ).toBe(true);
      }

      // Companion .sty referenced in main file exists in files
      const styUses = [
        ...content.matchAll(/\\usepackage\{([^}]*-portable)\}/g),
      ].map((m) => `${m[1]}.sty`);
      for (const styFile of styUses) {
        expect(
          template.files.some((f) => f.path === styFile),
          `${template.id} missing ${styFile}`,
        ).toBe(true);
      }

      // Built-in templates pass all compliance checks out of the box
      const compliance = evaluatePublisherCompliance(
        content,
        toProjectFiles(template.files),
        template,
      );
      expect(
        compliance.every((item) => item.passed),
        `${template.id} failed built-in compliance: ${JSON.stringify(
          compliance.filter((c) => !c.passed),
        )}`,
      ).toBe(true);
    }
  });
});

describe("detectPublisherFromContent", () => {
  it("detects each publisher from its template and from standard LaTeX classes or macros", () => {
    for (const template of PUBLISHER_LIST) {
      const mainContent =
        template.files.find((f) => f.path === template.mainFileName)?.content ??
        "";
      expect(detectPublisherFromContent(mainContent)?.id).toBe(template.id);
    }

    expect(
      detectPublisherFromContent(
        "\\documentclass[preprint,12pt]{elsarticle}\n\\begin{document}\n\\end{document}",
      )?.id,
    ).toBe("elsevier");
    expect(
      detectPublisherFromContent(
        "\\documentclass[journal]{IEEEtran}\n\\begin{document}\n\\end{document}",
      )?.id,
    ).toBe("ieee");
    expect(
      detectPublisherFromContent(
        "\\documentclass[sn-mathphys-num]{sn-jnl}\n\\begin{document}\n\\end{document}",
      )?.id,
    ).toBe("springer-nature");
    expect(
      detectPublisherFromContent(
        "\\documentclass{amsart}\n\\subjclass[2020]{65F10}\n\\begin{document}\n\\end{document}",
      )?.id,
    ).toBe("ams");
    expect(
      detectPublisherFromContent(
        "\\documentclass[sigconf]{acmart}\n\\ccsdesc[500]{Theory}\n\\begin{document}\n\\end{document}",
      )?.id,
    ).toBe("acm");
    expect(
      detectPublisherFromContent(
        "\\documentclass{siamart220329}\n\\begin{AMS}65F10\\end{AMS}\n\\begin{document}\n\\end{document}",
      )?.id,
    ).toBe("siam");
    expect(
      detectPublisherFromContent(
        "\\documentclass[aps,prl,twocolumn]{revtex4-2}\n\\begin{document}\n\\end{document}",
      )?.id,
    ).toBe("aps");
    expect(
      detectPublisherFromContent(
        "\\documentclass{oup-authoring-template}\n\\begin{document}\n\\end{document}",
      )?.id,
    ).toBe("oxford-wiley");
  });

  it("ignores commented-out documentclasses and detects characteristic macros", () => {
    expect(
      detectPublisherFromContent(
        "% \\documentclass{IEEEtran}\n\\documentclass{amsart}\n\\begin{document}\n\\end{document}",
      )?.id,
    ).toBe("ams");

    expect(
      detectPublisherFromContent(
        "\\documentclass{article}\n\\begin{document}\n\\begin{IEEEkeywords}A, B\\end{IEEEkeywords}\n\\end{document}",
      )?.id,
    ).toBe("ieee");

    expect(
      detectPublisherFromContent(
        "\\documentclass{article}\n\\begin{document}\n\\begin{frontmatter}\\title{X}\\end{frontmatter}\n\\end{document}",
      )?.id,
    ).toBe("elsevier");

    expect(
      detectPublisherFromContent(
        "\\documentclass{article}\n\\begin{document}\nHi\n\\end{document}",
      ),
    ).toBeNull();
  });
});

describe("extractManuscriptParts", () => {
  it("extracts nested math in title/abstract and parses Elsevier, IEEE, Springer, and AMS", () => {
    const standard = `\\documentclass{article}
\\title{Sum $\\sum_{k=0}^{n}(k+1)a^k$ Bounds}
\\author{Sample Author\\\\{\\small\\itshape University of Testing}}
\\begin{document}
\\maketitle
\\begin{abstract}
We prove $\\frac{1}{1-a}$ holds.
\\end{abstract}
\\section{Introduction}
Body text.
\\end{document}`;

    const parts = extractManuscriptParts(standard);
    expect(parts.title).toBe("Sum $\\sum_{k=0}^{n}(k+1)a^k$ Bounds");
    expect(parts.authors).toBe("Sample Author");
    expect(parts.affiliation).toContain("University of Testing");
    expect(parts.abstractText).toBe("We prove $\\frac{1}{1-a}$ holds.");
    expect(parts.bodyContent).toContain("\\section{Introduction}");

    const snContent =
      PUBLISHER_TEMPLATES["springer-nature"].files[0].content ?? "";
    const snParts = extractManuscriptParts(snContent);
    expect(snParts.authors).toContain("Elena M. Vance");
    expect(snParts.authors).toContain("Marcus Chen");
    expect(snParts.email).toBe("e.vance@university.edu");
    expect(snParts.abstractText).toContain("Polyak");
    expect(snParts.keywords).toContain("Stochastic optimization");
    expect(snParts.subjectClass).toContain("90C25");

    const elsevierContent = PUBLISHER_TEMPLATES.elsevier.files[0].content ?? "";
    const elParts = extractManuscriptParts(elsevierContent);
    expect(elParts.keywords).toContain("Krylov subspace methods");
    expect(elParts.subjectClass).toContain("65F10");
  });
});

describe("adaptManuscriptToPublisher", () => {
  const sampleBodyMarkers = [
    "\\section{Introduction}",
    "\\begin{theorem}",
    "\\begin{equation}",
    "\\begin{proof}",
    "\\cite{saad1986gmres}",
  ];

  it("preserves body sections, equations, theorems, proofs, and citations across Elsevier <-> IEEE <-> Springer Nature <-> AMS", () => {
    const startElsevier = PUBLISHER_TEMPLATES.elsevier.files[0].content ?? "";

    // Elsevier -> IEEE
    const toIeee = adaptManuscriptToPublisher(startElsevier, "ieee");
    expect(detectPublisherFromContent(toIeee.texContent)?.id).toBe("ieee");
    expect(toIeee.texContent).toContain("\\documentclass[journal]{IEEEtran}");
    expect(toIeee.texContent).toContain("\\bibliographystyle{IEEEtran}");
    expect(toIeee.texContent).not.toContain("\\begin{frontmatter}");
    expect(toIeee.texContent).not.toContain("\\begin{highlights}");
    for (const marker of sampleBodyMarkers) {
      expect(toIeee.texContent).toContain(marker);
    }

    // IEEE -> Springer Nature
    const toSpringer = adaptManuscriptToPublisher(
      toIeee.texContent,
      "springer-nature",
    );
    expect(detectPublisherFromContent(toSpringer.texContent)?.id).toBe(
      "springer-nature",
    );
    expect(toSpringer.texContent).toContain("\\usepackage{sn-jnl-portable}");
    expect(toSpringer.texContent).toContain("\\fnm{");
    expect(toSpringer.texContent).toContain("\\abstract{");
    expect(toSpringer.texContent).not.toContain("\\fnm{%}");
    expect(
      toSpringer.extraFiles.some((f) => f.path === "sn-jnl-portable.sty"),
    ).toBe(true);
    for (const marker of sampleBodyMarkers) {
      expect(toSpringer.texContent).toContain(marker);
    }

    // Springer Nature -> AMS
    const toAms = adaptManuscriptToPublisher(toSpringer.texContent, "ams");
    expect(detectPublisherFromContent(toAms.texContent)?.id).toBe("ams");
    expect(toAms.texContent).toContain("\\documentclass[11pt,reqno]{amsart}");
    expect(toAms.texContent).toContain("\\subjclass[2020]{");
    expect(toAms.texContent).toContain("\\numberwithin{equation}{section}");
    expect(toAms.texContent).toContain("\\bibliographystyle{amsplain}");
    expect(toAms.texContent).not.toContain("\\bmhead");
    for (const marker of sampleBodyMarkers) {
      expect(toAms.texContent).toContain(marker);
    }

    // AMS -> Elsevier
    const backToElsevier = adaptManuscriptToPublisher(
      toAms.texContent,
      "elsevier",
    );
    expect(detectPublisherFromContent(backToElsevier.texContent)?.id).toBe(
      "elsevier",
    );
    expect(backToElsevier.texContent).toContain(
      "\\documentclass[preprint,12pt]{elsarticle}",
    );
    expect(backToElsevier.texContent).toContain("\\begin{frontmatter}");
    expect(backToElsevier.texContent).toContain(
      "\\bibliographystyle{elsarticle-num}",
    );
    for (const marker of sampleBodyMarkers) {
      expect(backToElsevier.texContent).toContain(marker);
    }
  });

  it("applies metadataOverrides and converts IEEE \\IEEEPARstart cleanly", () => {
    const ieee = PUBLISHER_TEMPLATES.ieee.files[0].content ?? "";
    const adapted = adaptManuscriptToPublisher(ieee, "ams", {
      title: "Custom Override Title",
      authors: "Ada Lovelace",
      keywords: "spectral theory, stability",
      subjectClass: "47A10",
    });

    expect(adapted.texContent).toContain("Custom Override Title");
    expect(adapted.texContent).toContain("Ada Lovelace");
    expect(adapted.texContent).toContain("\\subjclass[2020]{47A10}");
    expect(adapted.texContent).not.toContain("\\IEEEPARstart");
    expect(adapted.texContent).toContain("Sparse recovery");
  });
});

describe("getRecommendedBibStyleForContent and quick-fixes", () => {
  it("returns publisher-appropriate bib styles", () => {
    expect(
      getRecommendedBibStyleForContent(
        "\\documentclass{elsarticle}\n\\begin{document}\\end{document}",
      ),
    ).toBe("elsarticle-num");
    expect(
      getRecommendedBibStyleForContent(
        "\\documentclass{IEEEtran}\n\\begin{document}\\end{document}",
      ),
    ).toBe("IEEEtran");
    expect(
      getRecommendedBibStyleForContent(
        "\\documentclass{amsart}\n\\begin{document}\\end{document}",
      ),
    ).toBe("amsplain");
    expect(
      getRecommendedBibStyleForContent(
        "\\documentclass[sigconf]{acmart}\n\\begin{document}\\end{document}",
      ),
    ).toBe("ACM-Reference-Format");
    expect(
      getRecommendedBibStyleForContent(
        "\\documentclass{article}\n\\begin{document}\\end{document}",
      ),
    ).toBe("plain");
  });

  it("quick-fixes missing compliance items cleanly", () => {
    const bareElsevier = `% arcana-publisher: elsevier
\\documentclass[preprint,12pt]{elsarticle}
\\begin{document}
\\begin{frontmatter}
\\title{Test}
\\end{frontmatter}
\\section{Intro}
Hello~\\cite{saad1986gmres}.
\\end{document}`;

    let updated = bareElsevier;
    for (const fixId of [
      "abstract",
      "keywords",
      "subject-class",
      "highlights",
      "bibstyle",
      "declarations",
      "data-availability",
      "ai-disclosure",
    ] as const) {
      updated = applyComplianceQuickFix(
        updated,
        fixId,
        PUBLISHER_TEMPLATES.elsevier,
      );
    }

    const items = evaluatePublisherCompliance(
      updated,
      toProjectFiles(PUBLISHER_TEMPLATES.elsevier.files),
      PUBLISHER_TEMPLATES.elsevier,
    );
    expect(items.every((item) => item.passed)).toBe(true);
  });

  it("flags oversized abstracts (> 280 words), missing data availability, and missing AI disclosure, and provides preprint-to-journal disclosures", () => {
    const longAbstract = Array.from(
      { length: 295 },
      (_, idx) => `word${idx}`,
    ).join(" ");
    const doc = `\\documentclass[journal]{IEEEtran}
\\begin{document}
\\begin{abstract}
${longAbstract}
\\end{abstract}
\\begin{IEEEkeywords}
optimization, stability
\\end{IEEEkeywords}
\\section{Intro}
Hello~\\cite{saad1986gmres}.
\\bibliographystyle{IEEEtran}
\\bibliography{references}
\\end{document}`;

    const items = evaluatePublisherCompliance(
      doc,
      toProjectFiles(PUBLISHER_TEMPLATES.ieee.files),
      PUBLISHER_TEMPLATES.ieee,
    );
    const byId = new Map(items.map((item) => [item.id, item]));
    expect(byId.get("journal-abstract")?.passed).toBe(true);
    expect(byId.get("journal-abstract-length")?.passed).toBe(false);
    expect(byId.get("journal-data-availability")?.passed).toBe(false);
    expect(byId.get("journal-data-availability")?.quickFixId).toBe(
      "data-availability",
    );
    expect(byId.get("journal-ai-disclosure")?.passed).toBe(false);
    expect(byId.get("journal-ai-disclosure")?.quickFixId).toBe("ai-disclosure");

    let fixed = applyComplianceQuickFix(
      doc,
      "data-availability",
      PUBLISHER_TEMPLATES.ieee,
    );
    fixed = applyComplianceQuickFix(
      fixed,
      "ai-disclosure",
      PUBLISHER_TEMPLATES.ieee,
    );
    const postFix = new Map(
      evaluatePublisherCompliance(
        fixed,
        toProjectFiles(PUBLISHER_TEMPLATES.ieee.files),
        PUBLISHER_TEMPLATES.ieee,
      ).map((item) => [item.id, item]),
    );
    expect(postFix.get("journal-data-availability")?.passed).toBe(true);
    expect(postFix.get("journal-ai-disclosure")?.passed).toBe(true);

    const elsevierNotice = generatePreprintDisclosureSnippet("elsevier", {
      serverLabel: "arXiv",
      preprintId: "arXiv:2501.00123",
    });
    expect(elsevierNotice).toContain("arXiv:2501.00123");
    expect(elsevierNotice).toContain("Elsevier");

    const springerNotice = generatePreprintDisclosureSnippet(
      "springer-nature",
      {
        serverLabel: "bioRxiv",
        doi: "10.1101/2025.01.01.000001",
      },
    );
    expect(springerNotice).toContain("\\bmhead{Preprint disclosure}");
    expect(springerNotice).toContain("10.1101/2025.01.01.000001");
  });
});
