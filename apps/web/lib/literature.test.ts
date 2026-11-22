import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as crossrefGet } from "@/app/api/literature/crossref/route";
import { GET as springerGet } from "@/app/api/literature/springer/route";
import {
  type LiteratureResult,
  formatDraftCitationSnippet,
  getBibStyleForSource,
  getCuratedJournalFallback,
  mapCrossrefWork,
  parseBibtexKey,
  resolveCitationInsertOffset,
  stripJatsXml,
} from "./literature";

const SAMPLE_RESULT: LiteratureResult = {
  id: "10.1016/j.jcp.2018.10.045",
  source: "journals",
  citeKey: "raissi2019physics",
  title: "Physics-informed neural networks & PDEs",
  authors: ["Maziar Raissi", "Paris Perdikaris", "George E. Karniadakis"],
  year: "2019",
  venue: "Journal of Computational Physics",
  publisher: "Elsevier",
  citationCount: 11200,
  doi: "10.1016/j.jcp.2018.10.045",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("parseBibtexKey", () => {
  it("extracts the citation key from standard BibTeX entries", () => {
    expect(
      parseBibtexKey(`@article{cortes1995support,\n  title = {SVM}\n}`),
    ).toBe("cortes1995support");
    expect(
      parseBibtexKey(`@inproceedings{ chen2016xgboost , title = {XGBoost} }`),
    ).toBe("chen2016xgboost");
  });

  it("returns null for invalid or non-BibTeX strings", () => {
    expect(parseBibtexKey("not bibtex")).toBeNull();
    expect(parseBibtexKey("@article{ , title = {Missing} }")).toBeNull();
  });
});

describe("formatDraftCitationSnippet", () => {
  it("formats narrative, parenthetical, and related-work citations with ~\\cite{key}", () => {
    const narrative = formatDraftCitationSnippet(SAMPLE_RESULT, "narrative");
    expect(narrative).toContain("Raissi et al.~\\cite{raissi2019physics}");
    expect(narrative).toContain(
      "Physics-informed neural networks \\& PDEs (2019).",
    );

    const parenthetical = formatDraftCitationSnippet(
      { ...SAMPLE_RESULT, authors: ["Kurt Hornik", "Halbert White"] },
      "parenthetical",
    );
    expect(parenthetical).toContain("~\\cite{raissi2019physics}.");
    expect(parenthetical).toContain("\\emph{Journal of Computational Physics}");

    const relatedWork = formatDraftCitationSnippet(
      { ...SAMPLE_RESULT, authors: ["Amir Beck", "Marc Teboulle"] },
      "related-work",
    );
    expect(relatedWork).toContain(
      "In related work, Beck and Teboulle~\\cite{raissi2019physics}",
    );
    expect(relatedWork).toContain("(2019).");
  });

  it("escapes LaTeX special characters (&, %, _, $, #) safely in prose", () => {
    const specialResult: LiteratureResult = {
      id: "special-1",
      source: "journals",
      citeKey: "doe2024special",
      title: "Fast & Robust_100% Bounds for #1 ($10) Problems.",
      authors: ["Jane Doe_1"],
      year: "2024",
      venue: "Transactions on R&D_100% #2 $Lab",
    };

    const snippet = formatDraftCitationSnippet(specialResult, "related-work");
    expect(snippet).toContain("Doe\\_1~\\cite{doe2024special}");
    expect(snippet).toContain(
      "Fast \\& Robust\\_100\\% Bounds for \\#1 (\\$10) Problems",
    );
    expect(snippet).toContain("Transactions on R\\&D\\_100\\% \\#2 \\$Lab");
    expect(snippet).not.toMatch(/(?<!\\)[&%_$#]/);
  });

  it("handles single author and empty author lists cleanly", () => {
    const single = formatDraftCitationSnippet(
      { ...SAMPLE_RESULT, authors: ["Lamport, Leslie"] },
      "narrative",
    );
    expect(single.startsWith("Lamport~\\cite{raissi2019physics}")).toBe(true);

    const noAuthors = formatDraftCitationSnippet(
      { ...SAMPLE_RESULT, authors: [] },
      "related-work",
    );
    expect(noAuthors).toContain("prior work~\\cite{raissi2019physics}");
  });
});

describe("getBibStyleForSource", () => {
  it("inspects magic comments and document classes while ignoring commented classes", () => {
    expect(
      getBibStyleForSource(
        "% arcana-publisher: ieee\n\\documentclass{article}",
      ),
    ).toBe("IEEEtran");
    expect(getBibStyleForSource("\\documentclass[preprint]{elsarticle}")).toBe(
      "elsarticle-num",
    );
    expect(getBibStyleForSource("\\documentclass{amsart}")).toBe("amsplain");
    expect(getBibStyleForSource("\\documentclass[sigconf]{acmart}")).toBe(
      "ACM-Reference-Format",
    );
    expect(
      getBibStyleForSource(
        "% \\documentclass{IEEEtran}\n\\documentclass{article}",
      ),
    ).toBe("plain");
  });
});

describe("resolveCitationInsertOffset", () => {
  it("clamps stale cursor positions before newly inserted bibliography blocks and \\end{document}", () => {
    const beforeBib =
      "\\documentclass{article}\n\\begin{document}\nHello world.\n\\end{document}\n";
    const staleCursorAtEof = beforeBib.length;

    const afterBib =
      "\\documentclass{article}\n\\begin{document}\nHello world.\n\\bibliographystyle{plain}\n\\bibliography{references}\n\\end{document}\n";
    const insertAt = resolveCitationInsertOffset(afterBib, staleCursorAtEof);

    expect(insertAt).toBe(afterBib.indexOf("\\bibliographystyle{plain}"));
    expect(resolveCitationInsertOffset(afterBib, 0)).toBe(
      afterBib.indexOf("\\bibliographystyle{plain}"),
    );
    expect(resolveCitationInsertOffset(afterBib, 46)).toBe(46);
  });
});

describe("Crossref mapping and curated fallback", () => {
  it("strips JATS XML tags and builds escaped BibTeX", () => {
    expect(
      stripJatsXml(
        "<jats:title>Abstract</jats:title><jats:p>A &amp; B <jats:italic>test</jats:italic></jats:p>",
      ),
    ).toBe("Abstract A & B test");

    const mapped = mapCrossrefWork({
      DOI: "10.1109/TIT.2005.862083",
      title: ["Signal &amp; Recovery_100%"],
      author: [{ given: "Terence", family: "Tao" }],
      issued: { "date-parts": [[2006]] },
      "container-title": ["IEEE Trans. Information Theory"],
      publisher: "IEEE",
      abstract: "<jats:p>Exact recovery via convex optimization.</jats:p>",
      "is-referenced-by-count": 420,
      type: "journal-article",
      page: "489-509",
    });

    expect(mapped).not.toBeNull();
    expect(mapped?.citeKey).toBe("tao2006signal");
    expect(mapped?.citationCount).toBe(420);
    expect(mapped?.abstract).toBe("Exact recovery via convex optimization.");
    expect(mapped?.bibtex).toContain("title = {Signal \\& Recovery\\_100\\%}");
    expect(mapped?.bibtex).toContain("pages = {489--509}");
    expect(mapped?.bibtex).toContain("doi = {10.1109/TIT.2005.862083}");
  });

  it("filters curated offline fallback papers by publisher prefix", () => {
    const elsevier = getCuratedJournalFallback("neural", "elsevier");
    expect(elsevier.length).toBeGreaterThan(0);
    expect(elsevier.every((item) => item.doi?.startsWith("10.1016/"))).toBe(
      true,
    );

    const math = getCuratedJournalFallback("optimization", "math");
    expect(math.length).toBeGreaterThan(0);
    expect(
      math.every(
        (item) =>
          item.doi?.startsWith("10.1090/") || item.doi?.startsWith("10.1137/"),
      ),
    ).toBe(true);

    const springer = getCuratedJournalFallback(
      "matrix",
      "springer",
      "springer",
    );
    expect(springer.length).toBeGreaterThan(0);
    expect(springer.every((item) => item.source === "springer")).toBe(true);
    expect(springer.every((item) => item.doi?.startsWith("10.1007/"))).toBe(
      true,
    );
  });
});

describe("Literature API routes", () => {
  it("validates query and falls back cleanly on Crossref network failure", async () => {
    const missing = await crossrefGet(
      new Request("http://localhost/api/literature/crossref"),
    );
    expect(missing.status).toBe(400);

    const tooLong = await crossrefGet(
      new Request(
        `http://localhost/api/literature/crossref?q=${"a".repeat(301)}`,
      ),
    );
    expect(tooLong.status).toBe(400);

    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);

    const response = await crossrefGet(
      new Request(
        "http://localhost/api/literature/crossref?q=residual&publisher=ieee",
      ),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      fallback: boolean;
      results: LiteratureResult[];
    };
    expect(body.fallback).toBe(true);
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results[0].source).toBe("journals");
    expect(body.results.every((item) => item.doi?.startsWith("10.1109/"))).toBe(
      true,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("filter=prefix%3A10.1109"),
      expect.objectContaining({
        headers: {
          "User-Agent": "arcanaTeX/0.0.1 (mailto:support@arcanatex.org)",
        },
      }),
    );
  });

  it("falls back to Crossref and curated Springer Nature papers when Springer API key is absent", async () => {
    vi.stubEnv("SPRINGER_META_API_KEY", "");
    vi.stubEnv("SPRINGER_OPENACCESS_API_KEY", "");

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          message: {
            "total-results": 1,
            items: [
              {
                DOI: "10.1007/s10107-004-0552-5",
                title: ["Smooth minimization of non-smooth functions"],
                author: [{ given: "Yurii", family: "Nesterov" }],
                issued: { "date-parts": [[2005]] },
                "container-title": ["Mathematical Programming"],
                publisher: "Springer",
                "is-referenced-by-count": 4100,
                type: "journal-article",
              },
            ],
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await springerGet(
      new Request("http://localhost/api/literature/springer?q=nesterov"),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      fallback: boolean;
      provider: string;
      results: LiteratureResult[];
    };
    expect(body.fallback).toBe(true);
    expect(body.provider).toBe("crossref-fallback");
    expect(body.results[0].source).toBe("springer");
    expect(body.results[0].citeKey).toBe("nesterov2005smooth");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("filter=prefix%3A10.1007"),
      expect.any(Object),
    );

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const offlineResponse = await springerGet(
      new Request("http://localhost/api/literature/springer?q=matrix"),
    );
    expect(offlineResponse.status).toBe(200);
    const offlineBody = (await offlineResponse.json()) as {
      fallback: boolean;
      provider: string;
      results: LiteratureResult[];
    };
    expect(offlineBody.fallback).toBe(true);
    expect(offlineBody.provider).toBe("crossref-fallback");
    expect(offlineBody.results.length).toBeGreaterThan(0);
    expect(
      offlineBody.results.every((item) => item.source === "springer"),
    ).toBe(true);
  });
});
