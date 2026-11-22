import {
  type ReconstructOptions,
  type ReconstructionResult,
  reconstructTextLocal,
} from "@/lib/text-reconstructor";

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

/**
 * Turns raw OCR output into LaTeX-safe prose: escapes special characters,
 * rejoins wrapped lines and hyphenated words, keeps blank lines as paragraph
 * breaks, and maps typographic quotes and dashes to their LaTeX forms.
 */
export function ocrTextToLatex(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/-\n(?=\p{Ll})/gu, "")
    .split(/\n{2,}|\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean)
    .join("\n\n")
    .replace(/[\\{}$&#%_~^]/g, (char) => LATEX_ESCAPES[char])
    .replace(/[“]/g, "``")
    .replace(/[”]/g, "''")
    .replace(/[‘’]/g, "'")
    .replace(/—/g, "---")
    .replace(/–/g, "--");
}

/**
 * Runs OCR in the browser. tesseract.js is imported lazily so it never loads
 * unless someone scans an image; it fetches its worker and language data on
 * first use.
 */
export async function recognizeImage(
  image: File | Blob,
  language = "eng",
): Promise<string> {
  const { recognize } = await import("tesseract.js");
  const { data } = await recognize(image, language);
  return ocrTextToLatex(data.text);
}

/**
 * Extracts raw OCR text from an image without escaping, so callers can pass it
 * through the 5-stage ML text reconstruction & LaTeX structuring pipeline.
 */
export async function recognizeImageRaw(
  image: File | Blob,
  language = "eng",
): Promise<string> {
  const { recognize } = await import("tesseract.js");
  const { data } = await recognize(image, language);
  return data.text;
}

/**
 * Runs Tesseract OCR on an image and pipes the noisy output through Stage 1-5
 * local ML restoration and LaTeX synthesis.
 */
export async function recognizeImageStructured(
  image: File | Blob,
  language = "eng",
  options: ReconstructOptions = {},
): Promise<ReconstructionResult> {
  const raw = await recognizeImageRaw(image, language);
  return reconstructTextLocal(raw, options);
}
