import { maskComments } from "@/lib/latex-active";

export type LiteratureSource = "arxiv" | "zotero" | "springer" | "journals";

export type JournalPublisherFilter =
  | "all"
  | "elsevier"
  | "ieee"
  | "springer"
  | "acm"
  | "math";

export type DraftCitationStyle = "narrative" | "parenthetical" | "related-work";

export interface LiteratureResult {
  id: string;
  source: LiteratureSource;
  citeKey: string;
  title: string;
  authors: string[];
  year?: string;
  venue?: string;
  publisher?: string;
  citationCount?: number;
  doi?: string;
  url?: string;
  abstract?: string;
  bibtex?: string;
  zoteroKey?: string;
  openAccess?: boolean;
  contentType?: string;
}

export type SpringerSource = "meta" | "openaccess";

export interface ZoteroSettings {
  mode: "local" | "web";
  library: "users" | "groups";
  libraryId: string;
  apiKey: string;
}

export const DEFAULT_ZOTERO_SETTINGS: ZoteroSettings = {
  mode: "local",
  library: "users",
  libraryId: "0",
  apiKey: "",
};

export interface CrossrefAuthor {
  given?: string;
  family?: string;
  name?: string;
}

export interface CrossrefDatePart {
  "date-parts"?: number[][];
}

export interface CrossrefWork {
  DOI?: string;
  title?: string[];
  author?: CrossrefAuthor[];
  issued?: CrossrefDatePart;
  published?: CrossrefDatePart;
  "published-print"?: CrossrefDatePart;
  "published-online"?: CrossrefDatePart;
  created?: CrossrefDatePart;
  "container-title"?: string[];
  "short-container-title"?: string[];
  publisher?: string;
  abstract?: string;
  "is-referenced-by-count"?: number;
  type?: string;
  volume?: string;
  issue?: string;
  page?: string;
  URL?: string;
}

export async function searchJournals(
  query: string,
  publisher: JournalPublisherFilter = "all",
): Promise<LiteratureResult[]> {
  const response = await fetch(
    `/api/literature/crossref?q=${encodeURIComponent(query)}&publisher=${encodeURIComponent(publisher)}`,
  );
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? "Journal search failed");
  }

  return data.results as LiteratureResult[];
}

export async function searchArxiv(query: string): Promise<LiteratureResult[]> {
  const response = await fetch(
    `/api/literature/arxiv?q=${encodeURIComponent(query)}`,
  );
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? "arXiv search failed");
  }

  return data.results as LiteratureResult[];
}

export async function searchSpringer(
  query: string,
  source: SpringerSource,
): Promise<LiteratureResult[]> {
  const response = await fetch(
    `/api/literature/springer?q=${encodeURIComponent(query)}&source=${source}`,
  );
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? "Springer search failed");
  }

  return data.results as LiteratureResult[];
}

export async function searchZotero(
  query: string,
  settings: ZoteroSettings,
): Promise<LiteratureResult[]> {
  const response = await fetch("/api/literature/zotero", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...settings, query }),
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? "Zotero search failed");
  }

  return data.results as LiteratureResult[];
}

export async function getZoteroBibtex(
  key: string,
  settings: ZoteroSettings,
): Promise<string> {
  const response = await fetch("/api/literature/zotero", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...settings, key }),
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? "Could not fetch Zotero BibTeX");
  }

  return data.bibtex as string;
}

export function parseBibtexKey(bibtex: string): string | null {
  const match = bibtex.match(/@\w+\s*\{\s*([^,\s]+)\s*,/);
  return match?.[1] ?? null;
}

function escapeLatexProse(value: string): string {
  return value
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([&%_$#{}])/g, "\\$1")
    .replace(/\^/g, "\\^{}")
    .replace(/~/g, "\\~{}")
    .replace(/\s+/g, " ")
    .trim();
}

function extractLastName(author: string): string {
  const trimmed = author.trim();
  if (!trimmed) return "";
  if (trimmed.includes(",")) {
    return trimmed.split(",")[0].trim();
  }
  const parts = trimmed.split(/\s+/);
  return parts[parts.length - 1] ?? trimmed;
}

function formatAuthorPhrase(authors: string[]): string | null {
  const lastNames = authors
    .map(extractLastName)
    .map(escapeLatexProse)
    .filter(Boolean);

  if (lastNames.length === 0) return null;
  if (lastNames.length === 1) return lastNames[0];
  if (lastNames.length === 2) return `${lastNames[0]} and ${lastNames[1]}`;
  return `${lastNames[0]} et al.`;
}

/**
 * Formats a clean, ready-to-compile LaTeX drafting snippet with `~\cite{key}`
 * and safely escaped prose special characters.
 */
export function formatDraftCitationSnippet(
  result: LiteratureResult,
  style: DraftCitationStyle = "related-work",
): string {
  const citeKey =
    result.citeKey.trim() ||
    (result.bibtex ? parseBibtexKey(result.bibtex) : null) ||
    "ref";
  const authorPhrase = formatAuthorPhrase(result.authors);
  const cleanTitle =
    escapeLatexProse(result.title).replace(/[.!?]+$/, "") || "this topic";
  const cleanVenue = result.venue ? escapeLatexProse(result.venue) : "";
  const cleanYear = result.year ? escapeLatexProse(result.year) : "";

  if (style === "narrative") {
    const subject = authorPhrase ?? "Prior work";
    return `${subject}~\\cite{${citeKey}} investigated ${cleanTitle}${cleanYear ? ` (${cleanYear})` : ""}.`;
  }

  if (style === "parenthetical") {
    return `Earlier work on ${cleanTitle}${cleanVenue ? ` in \\emph{${cleanVenue}}` : ""} provides foundational results~\\cite{${citeKey}}.`;
  }

  const subject = authorPhrase ?? "prior work";
  return `In related work, ${subject}~\\cite{${citeKey}} studied ${cleanTitle}${cleanVenue ? ` in \\emph{${cleanVenue}}` : ""}${cleanYear ? ` (${cleanYear})` : ""}.`;
}

/**
 * Returns the recommended `\bibliographystyle{...}` for a TeX document based
 * on `% arcana-publisher:` markers, `\documentclass`, or publisher macros.
 */
export function getBibStyleForSource(texContent: string): string {
  const magic = texContent
    .match(/^\s*%\s*arcana-publisher:\s*([a-z0-9-]+)/im)?.[1]
    ?.toLowerCase();

  if (magic === "elsevier") return "elsarticle-num";
  if (magic === "ieee") return "IEEEtran";
  if (magic === "ams") return "amsplain";
  if (magic === "acm") return "ACM-Reference-Format";

  const active = maskComments(texContent);
  const docClass = active
    .match(/\\documentclass(?:\[[^\]]*\])?\{([^}]+)\}/)?.[1]
    ?.trim()
    .toLowerCase();

  if (docClass === "elsarticle" || /\\begin\{frontmatter\}/.test(active)) {
    return "elsarticle-num";
  }
  if (docClass === "ieeetran" || /\\begin\{IEEEkeywords\}/.test(active)) {
    return "IEEEtran";
  }
  if (
    docClass === "amsart" ||
    docClass === "amsbook" ||
    docClass === "amsproc" ||
    /\\subjclass(?:\[[^\]]*\])?\{/.test(active)
  ) {
    return "amsplain";
  }
  if (docClass === "acmart" || /\\ccsdesc(?:\[[^\]]*\])?\{/.test(active)) {
    return "ACM-Reference-Format";
  }

  return "plain";
}

function findActiveOffset(
  masked: string,
  pattern: RegExp,
  fromIndex = 0,
): number {
  const match = pattern.exec(masked.slice(fromIndex));
  return match ? fromIndex + match.index : -1;
}

/**
 * Computes a safe insertion offset in a `.tex` document after bibliography
 * setup may have shifted `\end{document}`, clamping before `\bibliographystyle`,
 * `\bibliography`, and `\end{document}`.
 */
export function resolveCitationInsertOffset(
  content: string,
  originalCursor: number,
): number {
  const masked = maskComments(content);
  const endDocument = findActiveOffset(masked, /\\end\{document\}/);
  const beginDocument = findActiveOffset(masked, /\\begin\{document\}/);
  const searchStart = beginDocument === -1 ? 0 : beginDocument;
  const bibStyleIndex = findActiveOffset(
    masked,
    /\\bibliographystyle\s*\{/,
    searchStart,
  );
  const bibliographyIndex = findActiveOffset(
    masked,
    /\\bibliography\s*\{/,
    searchStart,
  );

  const boundaries = [endDocument, bibStyleIndex, bibliographyIndex].filter(
    (index) => index !== -1 && (endDocument === -1 || index <= endDocument),
  );
  const maxBeforeBoundary =
    boundaries.length > 0 ? Math.min(...boundaries) : content.length;

  const clampedCursor = Math.max(0, originalCursor);
  if (clampedCursor === 0 && endDocument !== -1) {
    return maxBeforeBoundary;
  }

  return Math.min(clampedCursor, maxBeforeBoundary);
}

function decodeXmlEntities(value: string): string {
  const named: Record<string, string> = {
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    amp: "&",
    nbsp: " ",
  };

  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replace(
      /&([a-z]+);/gi,
      (match, name) => named[name.toLowerCase()] ?? match,
    );
}

export function stripJatsXml(value: string): string {
  return decodeXmlEntities(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function escapeBibtexField(value: string): string {
  return value
    .replace(/[{}]/g, "")
    .replace(/\\/g, "")
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/#/g, "\\#")
    .replace(/_/g, "\\_")
    .replace(/\$/g, "\\$")
    .replace(/\s+/g, " ")
    .trim();
}

function asciiFold(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function makeCiteKey(
  authors: string[],
  year: string,
  title: string,
  fallback: string,
): string {
  const lastName = authors[0] ? extractLastName(authors[0]) : "ref";
  const word = asciiFold(title)
    .split(/\s+/)
    .map((part) => part.replace(/[^a-zA-Z0-9]/g, ""))
    .find((part) => part.length > 3);

  const key = asciiFold(`${lastName}${year}${word ?? ""}`)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  return key || `ref${fallback.replace(/\W/g, "").toLowerCase() || "entry"}`;
}

function extractCrossrefYear(work: CrossrefWork): string {
  const candidates = [
    work.issued?.["date-parts"]?.[0]?.[0],
    work.published?.["date-parts"]?.[0]?.[0],
    work["published-print"]?.["date-parts"]?.[0]?.[0],
    work["published-online"]?.["date-parts"]?.[0]?.[0],
    work.created?.["date-parts"]?.[0]?.[0],
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      const year = String(candidate);
      if (/^\d{4}$/.test(year)) return year;
    }
  }

  return "";
}

function formatCrossrefAuthor(author: CrossrefAuthor): string {
  if (author.name) return stripJatsXml(author.name);
  return [author.given, author.family]
    .filter((part): part is string => Boolean(part?.trim()))
    .map((part) => stripJatsXml(part))
    .join(" ");
}

function buildCrossrefBibtex(params: {
  entryType: "article" | "inproceedings";
  citeKey: string;
  title: string;
  authors: string[];
  year: string;
  venue?: string;
  publisher?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  url?: string;
}): string {
  const {
    entryType,
    citeKey,
    title,
    authors,
    year,
    venue,
    publisher,
    volume,
    issue,
    pages,
    doi,
    url,
  } = params;

  const fields = [
    `  title = {${escapeBibtexField(title)}}`,
    authors.length > 0
      ? `  author = {${authors.map(escapeBibtexField).join(" and ")}}`
      : null,
    year ? `  year = {${year}}` : null,
    entryType === "article" && venue
      ? `  journal = {${escapeBibtexField(venue)}}`
      : entryType === "inproceedings" && venue
        ? `  booktitle = {${escapeBibtexField(venue)}}`
        : null,
    publisher ? `  publisher = {${escapeBibtexField(publisher)}}` : null,
    volume ? `  volume = {${escapeBibtexField(volume)}}` : null,
    issue ? `  number = {${escapeBibtexField(issue)}}` : null,
    pages
      ? `  pages = {${escapeBibtexField(pages.replace(/\s*[-–—]+\s*/g, "--"))}}`
      : null,
    doi ? `  doi = {${doi}}` : null,
    url ? `  url = {${url}}` : null,
  ].filter(Boolean);

  return `@${entryType}{${citeKey},\n${fields.join(",\n")}\n}`;
}

export function mapCrossrefWork(
  work: CrossrefWork,
  source: "journals" | "springer" = "journals",
): LiteratureResult | null {
  const rawTitle = work.title?.[0];
  const title = rawTitle ? stripJatsXml(rawTitle) : "";
  if (!title) return null;

  const authors = (work.author ?? [])
    .map(formatCrossrefAuthor)
    .filter((name) => name.length > 0);
  const year = extractCrossrefYear(work);
  const rawVenue =
    work["container-title"]?.[0] ||
    work["short-container-title"]?.[0] ||
    work.publisher;
  const venue = rawVenue ? stripJatsXml(rawVenue) : undefined;
  const publisher = work.publisher ? stripJatsXml(work.publisher) : undefined;
  const doi = work.DOI?.trim() || undefined;
  const url = doi ? `https://doi.org/${doi}` : work.URL?.trim() || undefined;
  const abstract = work.abstract ? stripJatsXml(work.abstract) : undefined;
  const citationCount =
    typeof work["is-referenced-by-count"] === "number"
      ? work["is-referenced-by-count"]
      : undefined;
  const entryType =
    work.type === "proceedings-article" || work.type === "conference-paper"
      ? "inproceedings"
      : "article";
  const citeKey = makeCiteKey(authors, year, title, doi ?? title);

  return {
    id: doi || url || citeKey,
    source,
    citeKey,
    title,
    authors,
    year: year || undefined,
    venue: venue || undefined,
    publisher: publisher || undefined,
    citationCount,
    doi,
    url,
    abstract: abstract || undefined,
    contentType: work.type,
    bibtex: buildCrossrefBibtex({
      entryType,
      citeKey,
      title,
      authors,
      year,
      venue,
      publisher,
      volume: work.volume,
      issue: work.issue,
      pages: work.page,
      doi,
      url,
    }),
  };
}

const CURATED_FALLBACK_PAPERS: Omit<LiteratureResult, "source">[] = [
  {
    id: "10.1016/j.jcp.2018.10.045",
    citeKey: "raissi2019physics",
    title:
      "Physics-informed neural networks: A deep learning framework for solving forward and inverse problems involving nonlinear partial differential equations",
    authors: ["Maziar Raissi", "Paris Perdikaris", "George E. Karniadakis"],
    year: "2019",
    venue: "Journal of Computational Physics",
    publisher: "Elsevier",
    citationCount: 11200,
    doi: "10.1016/j.jcp.2018.10.045",
    url: "https://doi.org/10.1016/j.jcp.2018.10.045",
    abstract:
      "We introduce physics-informed neural networks trained to solve supervised learning tasks while respecting any given laws of physics described by general nonlinear partial differential equations.",
    contentType: "journal-article",
    bibtex: `@article{raissi2019physics,
  title = {Physics-informed neural networks: A deep learning framework for solving forward and inverse problems involving nonlinear partial differential equations},
  author = {Maziar Raissi and Paris Perdikaris and George E. Karniadakis},
  year = {2019},
  journal = {Journal of Computational Physics},
  publisher = {Elsevier},
  volume = {378},
  pages = {686--707},
  doi = {10.1016/j.jcp.2018.10.045},
  url = {https://doi.org/10.1016/j.jcp.2018.10.045}
}`,
  },
  {
    id: "10.1016/0893-6080(89)90020-8",
    citeKey: "hornik1989multilayer",
    title: "Multilayer feedforward networks are universal approximators",
    authors: ["Kurt Hornik", "Maxwell Stinchcombe", "Halbert White"],
    year: "1989",
    venue: "Neural Networks",
    publisher: "Elsevier",
    citationCount: 24800,
    doi: "10.1016/0893-6080(89)90020-8",
    url: "https://doi.org/10.1016/0893-6080(89)90020-8",
    abstract:
      "This paper rigorously establishes that standard multilayer feedforward networks with as few as one hidden layer using arbitrary squashing functions are capable of approximating any Borel measurable function from one finite dimensional space to another to any desired degree of accuracy.",
    contentType: "journal-article",
    bibtex: `@article{hornik1989multilayer,
  title = {Multilayer feedforward networks are universal approximators},
  author = {Kurt Hornik and Maxwell Stinchcombe and Halbert White},
  year = {1989},
  journal = {Neural Networks},
  publisher = {Elsevier},
  volume = {2},
  number = {5},
  pages = {359--366},
  doi = {10.1016/0893-6080(89)90020-8},
  url = {https://doi.org/10.1016/0893-6080(89)90020-8}
}`,
  },
  {
    id: "10.1016/0021-9991(83)90136-5",
    citeKey: "harten1983high",
    title: "High resolution schemes for hyperbolic conservation laws",
    authors: ["Ami Harten"],
    year: "1983",
    venue: "Journal of Computational Physics",
    publisher: "Elsevier",
    citationCount: 6400,
    doi: "10.1016/0021-9991(83)90136-5",
    url: "https://doi.org/10.1016/0021-9991(83)90136-5",
    abstract:
      "A class of new explicit second-order accurate finite difference schemes for the computation of weak solutions of hyperbolic conservation laws is presented using total variation diminishing properties.",
    contentType: "journal-article",
    bibtex: `@article{harten1983high,
  title = {High resolution schemes for hyperbolic conservation laws},
  author = {Ami Harten},
  year = {1983},
  journal = {Journal of Computational Physics},
  publisher = {Elsevier},
  volume = {49},
  number = {3},
  pages = {357--393},
  doi = {10.1016/0021-9991(83)90136-5},
  url = {https://doi.org/10.1016/0021-9991(83)90136-5}
}`,
  },
  {
    id: "10.1109/CVPR.2016.90",
    citeKey: "he2016deep",
    title: "Deep Residual Learning for Image Recognition",
    authors: ["Kaiming He", "Xiangyu Zhang", "Shaoqing Ren", "Jian Sun"],
    year: "2016",
    venue:
      "2016 IEEE Conference on Computer Vision and Pattern Recognition (CVPR)",
    publisher: "IEEE",
    citationCount: 168000,
    doi: "10.1109/CVPR.2016.90",
    url: "https://doi.org/10.1109/CVPR.2016.90",
    abstract:
      "We present a residual learning framework to ease the training of networks that are substantially deeper than those used previously by explicitly reformulating layers as learning residual functions with reference to the layer inputs.",
    contentType: "proceedings-article",
    bibtex: `@inproceedings{he2016deep,
  title = {Deep Residual Learning for Image Recognition},
  author = {Kaiming He and Xiangyu Zhang and Shaoqing Ren and Jian Sun},
  year = {2016},
  booktitle = {2016 IEEE Conference on Computer Vision and Pattern Recognition (CVPR)},
  publisher = {IEEE},
  pages = {770--778},
  doi = {10.1109/CVPR.2016.90},
  url = {https://doi.org/10.1109/CVPR.2016.90}
}`,
  },
  {
    id: "10.1109/5.726791",
    citeKey: "lecun1998gradient",
    title: "Gradient-based learning applied to document recognition",
    authors: ["Yann LeCun", "Léon Bottou", "Yoshua Bengio", "Patrick Haffner"],
    year: "1998",
    venue: "Proceedings of the IEEE",
    publisher: "IEEE",
    citationCount: 54000,
    doi: "10.1109/5.726791",
    url: "https://doi.org/10.1109/5.726791",
    abstract:
      "Multilayer neural networks trained with the back-propagation algorithm constitute the best example of a successful gradient-based learning technique, demonstrated on convolutional networks for document recognition.",
    contentType: "journal-article",
    bibtex: `@article{lecun1998gradient,
  title = {Gradient-based learning applied to document recognition},
  author = {Yann LeCun and Léon Bottou and Yoshua Bengio and Patrick Haffner},
  year = {1998},
  journal = {Proceedings of the IEEE},
  publisher = {IEEE},
  volume = {86},
  number = {11},
  pages = {2278--2324},
  doi = {10.1109/5.726791},
  url = {https://doi.org/10.1109/5.726791}
}`,
  },
  {
    id: "10.1109/TIT.2005.862083",
    citeKey: "candes2006robust",
    title:
      "Robust uncertainty principles: exact signal reconstruction from highly incomplete frequency information",
    authors: ["Emmanuel J. Candès", "Justin Romberg", "Terence Tao"],
    year: "2006",
    venue: "IEEE Transactions on Information Theory",
    publisher: "IEEE",
    citationCount: 16500,
    doi: "10.1109/TIT.2005.862083",
    url: "https://doi.org/10.1109/TIT.2005.862083",
    abstract:
      "We consider the problem of reconstructing a discrete-time signal or a finite image from incomplete frequency samples and show exact recovery via convex optimization under sparsity assumptions.",
    contentType: "journal-article",
    bibtex: `@article{candes2006robust,
  title = {Robust uncertainty principles: exact signal reconstruction from highly incomplete frequency information},
  author = {Emmanuel J. Candès and Justin Romberg and Terence Tao},
  year = {2006},
  journal = {IEEE Transactions on Information Theory},
  publisher = {IEEE},
  volume = {52},
  number = {2},
  pages = {489--509},
  doi = {10.1109/TIT.2005.862083},
  url = {https://doi.org/10.1109/TIT.2005.862083}
}`,
  },
  {
    id: "10.1007/BF00994018",
    citeKey: "cortes1995support",
    title: "Support-vector networks",
    authors: ["Corinna Cortes", "Vladimir Vapnik"],
    year: "1995",
    venue: "Machine Learning",
    publisher: "Springer Nature",
    citationCount: 38200,
    doi: "10.1007/BF00994018",
    url: "https://doi.org/10.1007/BF00994018",
    abstract:
      "The support-vector network is a learning machine for two-group classification problems that non-linearly maps input vectors to a high-dimensional feature space where a linear decision surface is constructed.",
    contentType: "journal-article",
    bibtex: `@article{cortes1995support,
  title = {Support-vector networks},
  author = {Corinna Cortes and Vladimir Vapnik},
  year = {1995},
  journal = {Machine Learning},
  publisher = {Springer Nature},
  volume = {20},
  number = {3},
  pages = {273--297},
  doi = {10.1007/BF00994018},
  url = {https://doi.org/10.1007/BF00994018}
}`,
  },
  {
    id: "10.1007/s10107-004-0552-5",
    citeKey: "nesterov2005smooth",
    title: "Smooth minimization of non-smooth functions",
    authors: ["Yurii Nesterov"],
    year: "2005",
    venue: "Mathematical Programming",
    publisher: "Springer Nature",
    citationCount: 4100,
    doi: "10.1007/s10107-004-0552-5",
    url: "https://doi.org/10.1007/s10107-004-0552-5",
    abstract:
      "We propose a smoothing technique for convex optimization problems with structured non-smooth objective functions, achieving an optimal O(1/epsilon) iteration complexity bound.",
    contentType: "journal-article",
    bibtex: `@article{nesterov2005smooth,
  title = {Smooth minimization of non-smooth functions},
  author = {Yurii Nesterov},
  year = {2005},
  journal = {Mathematical Programming},
  publisher = {Springer Nature},
  volume = {103},
  number = {1},
  pages = {127--152},
  doi = {10.1007/s10107-004-0552-5},
  url = {https://doi.org/10.1007/s10107-004-0552-5}
}`,
  },
  {
    id: "10.1007/s10208-009-9045-5",
    citeKey: "candes2009exact",
    title: "Exact Matrix Completion via Convex Optimization",
    authors: ["Emmanuel J. Candès", "Benjamin Recht"],
    year: "2009",
    venue: "Foundations of Computational Mathematics",
    publisher: "Springer Nature",
    citationCount: 6200,
    doi: "10.1007/s10208-009-9045-5",
    url: "https://doi.org/10.1007/s10208-009-9045-5",
    abstract:
      "We prove that most low-rank matrices can be recovered exactly from a small subset of sampled entries by solving a simple convex nuclear-norm minimization program.",
    contentType: "journal-article",
    bibtex: `@article{candes2009exact,
  title = {Exact Matrix Completion via Convex Optimization},
  author = {Emmanuel J. Candès and Benjamin Recht},
  year = {2009},
  journal = {Foundations of Computational Mathematics},
  publisher = {Springer Nature},
  volume = {9},
  number = {6},
  pages = {717--772},
  doi = {10.1007/s10208-009-9045-5},
  url = {https://doi.org/10.1007/s10208-009-9045-5}
}`,
  },
  {
    id: "10.1007/s10208-011-9099-z",
    citeKey: "tropp2012user",
    title: "User-Friendly Tail Bounds for Sums of Random Matrices",
    authors: ["Joel A. Tropp"],
    year: "2012",
    venue: "Foundations of Computational Mathematics",
    publisher: "Springer Nature",
    citationCount: 3800,
    doi: "10.1007/s10208-011-9099-z",
    url: "https://doi.org/10.1007/s10208-011-9099-z",
    abstract:
      "This paper develops matrix analogues of classical scalar probability inequalities including Chernoff, Bennett, and Bernstein bounds for sums of independent random Hermitian matrices.",
    contentType: "journal-article",
    bibtex: `@article{tropp2012user,
  title = {User-Friendly Tail Bounds for Sums of Random Matrices},
  author = {Joel A. Tropp},
  year = {2012},
  journal = {Foundations of Computational Mathematics},
  publisher = {Springer Nature},
  volume = {12},
  number = {4},
  pages = {389--434},
  doi = {10.1007/s10208-011-9099-z},
  url = {https://doi.org/10.1007/s10208-011-9099-z}
}`,
  },
  {
    id: "10.1145/2939672.2939785",
    citeKey: "chen2016xgboost",
    title: "XGBoost: A Scalable Tree Boosting System",
    authors: ["Tianqi Chen", "Carlos Guestrin"],
    year: "2016",
    venue:
      "Proceedings of the 22nd ACM SIGKDD International Conference on Knowledge Discovery and Data Mining",
    publisher: "ACM",
    citationCount: 41200,
    doi: "10.1145/2939672.2939785",
    url: "https://doi.org/10.1145/2939672.2939785",
    abstract:
      "We describe a scalable end-to-end tree boosting system called XGBoost, featuring a sparsity-aware algorithm for sparse data and weighted quantile sketch for approximate tree learning.",
    contentType: "proceedings-article",
    bibtex: `@inproceedings{chen2016xgboost,
  title = {XGBoost: A Scalable Tree Boosting System},
  author = {Tianqi Chen and Carlos Guestrin},
  year = {2016},
  booktitle = {Proceedings of the 22nd ACM SIGKDD International Conference on Knowledge Discovery and Data Mining},
  publisher = {ACM},
  pages = {785--794},
  doi = {10.1145/2939672.2939785},
  url = {https://doi.org/10.1145/2939672.2939785}
}`,
  },
  {
    id: "10.1145/3422622",
    citeKey: "goodfellow2020generative",
    title: "Generative adversarial networks",
    authors: [
      "Ian Goodfellow",
      "Jean Pouget-Abadie",
      "Mehdi Mirza",
      "Bing Xu",
      "David Warde-Farley",
      "Sherjil Ozair",
      "Aaron Courville",
      "Yoshua Bengio",
    ],
    year: "2020",
    venue: "Communications of the ACM",
    publisher: "ACM",
    citationCount: 7400,
    doi: "10.1145/3422622",
    url: "https://doi.org/10.1145/3422622",
    abstract:
      "Generative adversarial networks estimate generative models via an adversarial minimax process in which a generative model is pitted against a discriminative model.",
    contentType: "journal-article",
    bibtex: `@article{goodfellow2020generative,
  title = {Generative adversarial networks},
  author = {Ian Goodfellow and Jean Pouget-Abadie and Mehdi Mirza and Bing Xu and David Warde-Farley and Sherjil Ozair and Aaron Courville and Yoshua Bengio},
  year = {2020},
  journal = {Communications of the ACM},
  publisher = {ACM},
  volume = {63},
  number = {11},
  pages = {139--144},
  doi = {10.1145/3422622},
  url = {https://doi.org/10.1145/3422622}
}`,
  },
  {
    id: "10.1145/359545.359563",
    citeKey: "lamport1978time",
    title: "Time, clocks, and the ordering of events in a distributed system",
    authors: ["Leslie Lamport"],
    year: "1978",
    venue: "Communications of the ACM",
    publisher: "ACM",
    citationCount: 14900,
    doi: "10.1145/359545.359563",
    url: "https://doi.org/10.1145/359545.359563",
    abstract:
      "The concept of one event happening before another in a distributed system is examined and shown to define a partial ordering of events that can be extended to a total ordering via logical clocks.",
    contentType: "journal-article",
    bibtex: `@article{lamport1978time,
  title = {Time, clocks, and the ordering of events in a distributed system},
  author = {Leslie Lamport},
  year = {1978},
  journal = {Communications of the ACM},
  publisher = {ACM},
  volume = {21},
  number = {7},
  pages = {558--565},
  doi = {10.1145/359545.359563},
  url = {https://doi.org/10.1145/359545.359563}
}`,
  },
  {
    id: "10.1090/S0273-0979-09-01249-X",
    citeKey: "carlsson2009topology",
    title: "Topology and data",
    authors: ["Gunnar Carlsson"],
    year: "2009",
    venue: "Bulletin of the American Mathematical Society",
    publisher: "American Mathematical Society",
    citationCount: 3100,
    doi: "10.1090/S0273-0979-09-01249-X",
    url: "https://doi.org/10.1090/S0273-0979-09-01249-X",
    abstract:
      "We survey persistent homology and topological data analysis methods for extracting geometric and topological structure from high-dimensional point-cloud data.",
    contentType: "journal-article",
    bibtex: `@article{carlsson2009topology,
  title = {Topology and data},
  author = {Gunnar Carlsson},
  year = {2009},
  journal = {Bulletin of the American Mathematical Society},
  publisher = {American Mathematical Society},
  volume = {46},
  number = {2},
  pages = {255--308},
  doi = {10.1090/S0273-0979-09-01249-X},
  url = {https://doi.org/10.1090/S0273-0979-09-01249-X}
}`,
  },
  {
    id: "10.1090/S0273-0979-01-00923-5",
    citeKey: "cucker2002mathematical",
    title: "On the mathematical foundations of learning",
    authors: ["Felipe Cucker", "Steve Smale"],
    year: "2002",
    venue: "Bulletin of the American Mathematical Society",
    publisher: "American Mathematical Society",
    citationCount: 1950,
    doi: "10.1090/S0273-0979-01-00923-5",
    url: "https://doi.org/10.1090/S0273-0979-01-00923-5",
    abstract:
      "We analyze approximation theory, reproducing kernel Hilbert spaces, and probabilistic generalization error bounds as mathematical foundations for statistical learning.",
    contentType: "journal-article",
    bibtex: `@article{cucker2002mathematical,
  title = {On the mathematical foundations of learning},
  author = {Felipe Cucker and Steve Smale},
  year = {2002},
  journal = {Bulletin of the American Mathematical Society},
  publisher = {American Mathematical Society},
  volume = {39},
  number = {1},
  pages = {1--49},
  doi = {10.1090/S0273-0979-01-00923-5},
  url = {https://doi.org/10.1090/S0273-0979-01-00923-5}
}`,
  },
  {
    id: "10.1137/080716542",
    citeKey: "beck2009fast",
    title:
      "A Fast Iterative Shrinkage-Thresholding Algorithm for Linear Inverse Problems",
    authors: ["Amir Beck", "Marc Teboulle"],
    year: "2009",
    venue: "SIAM Journal on Imaging Sciences",
    publisher: "SIAM",
    citationCount: 11800,
    doi: "10.1137/080716542",
    url: "https://doi.org/10.1137/080716542",
    abstract:
      "We present FISTA, a fast iterative shrinkage-thresholding algorithm preserving the computational simplicity of ISTA while achieving a global O(1/k^2) rate of convergence.",
    contentType: "journal-article",
    bibtex: `@article{beck2009fast,
  title = {A Fast Iterative Shrinkage-Thresholding Algorithm for Linear Inverse Problems},
  author = {Amir Beck and Marc Teboulle},
  year = {2009},
  journal = {SIAM Journal on Imaging Sciences},
  publisher = {SIAM},
  volume = {2},
  number = {1},
  pages = {183--202},
  doi = {10.1137/080716542},
  url = {https://doi.org/10.1137/080716542}
}`,
  },
  {
    id: "10.1137/16M1080173",
    citeKey: "bottou2018optimization",
    title: "Optimization Methods for Large-Scale Machine Learning",
    authors: ["Léon Bottou", "Frank E. Curtis", "Jorge Nocedal"],
    year: "2018",
    venue: "SIAM Review",
    publisher: "SIAM",
    citationCount: 4400,
    doi: "10.1137/16M1080173",
    url: "https://doi.org/10.1137/16M1080173",
    abstract:
      "We review stochastic gradient, variance-reduction, and second-order optimization methods designed for large-scale empirical risk minimization in machine learning.",
    contentType: "journal-article",
    bibtex: `@article{bottou2018optimization,
  title = {Optimization Methods for Large-Scale Machine Learning},
  author = {Léon Bottou and Frank E. Curtis and Jorge Nocedal},
  year = {2018},
  journal = {SIAM Review},
  publisher = {SIAM},
  volume = {60},
  number = {2},
  pages = {223--311},
  doi = {10.1137/16M1080173},
  url = {https://doi.org/10.1137/16M1080173}
}`,
  },
  {
    id: "10.1137/080738970",
    citeKey: "cai2010singular",
    title: "A Singular Value Thresholding Algorithm for Matrix Completion",
    authors: ["Jian-Feng Cai", "Emmanuel J. Candès", "Zuowei Shen"],
    year: "2010",
    venue: "SIAM Journal on Optimization",
    publisher: "SIAM",
    citationCount: 3900,
    doi: "10.1137/080738970",
    url: "https://doi.org/10.1137/080738970",
    abstract:
      "We introduce a simple first-order singular value thresholding algorithm for nuclear-norm minimization and low-rank matrix completion.",
    contentType: "journal-article",
    bibtex: `@article{cai2010singular,
  title = {A Singular Value Thresholding Algorithm for Matrix Completion},
  author = {Jian-Feng Cai and Emmanuel J. Candès and Zuowei Shen},
  year = {2010},
  journal = {SIAM Journal on Optimization},
  publisher = {SIAM},
  volume = {20},
  number = {4},
  pages = {1956--1982},
  doi = {10.1137/080738970},
  url = {https://doi.org/10.1137/080738970}
}`,
  },
];

const PUBLISHER_DOI_PREFIXES: Record<JournalPublisherFilter, string[]> = {
  all: [],
  elsevier: ["10.1016/"],
  ieee: ["10.1109/"],
  springer: ["10.1007/"],
  acm: ["10.1145/"],
  math: ["10.1090/", "10.1137/"],
};

const QUERY_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "from",
  "in",
  "of",
  "on",
  "the",
  "to",
  "with",
]);

export function getCuratedJournalFallback(
  query: string,
  publisher: JournalPublisherFilter = "all",
  source: "journals" | "springer" = "journals",
): LiteratureResult[] {
  const prefixes = PUBLISHER_DOI_PREFIXES[publisher] ?? [];
  const scoped =
    prefixes.length > 0
      ? CURATED_FALLBACK_PAPERS.filter((paper) =>
          prefixes.some((prefix) => paper.doi?.startsWith(prefix)),
        )
      : CURATED_FALLBACK_PAPERS;

  const tokens = asciiFold(query.toLowerCase())
    .split(/[^a-z0-9.]+/)
    .filter((token) => token.length > 1 && !QUERY_STOP_WORDS.has(token));

  const ranked = scoped
    .map((paper) => {
      const haystack = asciiFold(
        [
          paper.title,
          paper.authors.join(" "),
          paper.venue ?? "",
          paper.publisher ?? "",
          paper.abstract ?? "",
          paper.doi ?? "",
        ]
          .join(" ")
          .toLowerCase(),
      );
      const matches = tokens.reduce(
        (score, token) => (haystack.includes(token) ? score + 1 : score),
        0,
      );
      return { paper, matches };
    })
    .sort(
      (a, b) =>
        b.matches - a.matches ||
        (b.paper.citationCount ?? 0) - (a.paper.citationCount ?? 0),
    );

  const matched = ranked.filter((entry) => entry.matches > 0);
  const selected = (matched.length > 0 ? matched : ranked).map((entry) => ({
    ...entry.paper,
    source,
  }));

  return selected;
}
