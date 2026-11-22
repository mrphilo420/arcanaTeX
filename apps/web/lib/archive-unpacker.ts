import { spawn } from "node:child_process";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { gunzipSync } from "node:zlib";
import type { LatexCompiler } from "@/lib/latex-compiler";
import {
  analyzeImportedPackage,
  applySafePackageFixes,
  convertIpynbToLatexPackage,
  convertMarkdownResearchToLatex,
  type PackagePreflightReport,
  parseArxivIdentifier,
} from "@/lib/package-intelligence";
import {
  fileTypeForName,
  getBaseName,
  isTextFileName,
  mimeTypeForName,
  type ProjectFile,
} from "@/lib/project-files";
import { reconstructTextLocal } from "@/lib/text-reconstructor";

export const MAX_ARCHIVE_UPLOAD_BYTES = 40 * 1024 * 1024;
export const MAX_EXTRACTED_FILES = 250;
export const MAX_SINGLE_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_EXTRACTED_BYTES = 60 * 1024 * 1024;
const EXTRACT_TIMEOUT_MS = 25_000;

export type DetectedPackageFormat =
  | "zip"
  | "tar.gz"
  | "tar.bz2"
  | "tar.xz"
  | "tar"
  | "rar"
  | "7z"
  | "gz-single"
  | "ipynb"
  | "markdown"
  | "pdf"
  | "tex"
  | "unknown";

export interface UnpackedPackageResult {
  projectName: string;
  format: DetectedPackageFormat;
  files: Omit<ProjectFile, "id">[];
  skipped: string[];
  isProject: boolean;
  recommendedCompiler: LatexCompiler;
  mainFilePath: string | null;
  report: PackagePreflightReport;
}

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".svn",
  ".hg",
  ".idea",
  ".vscode",
  "__MACOSX",
  "node_modules",
]);

const IGNORED_FILES = new Set([
  ".ds_store",
  "thumbs.db",
  "desktop.ini",
  "icon\r",
]);

const IGNORED_SUFFIXES = [
  ".aux",
  ".log",
  ".out",
  ".toc",
  ".lof",
  ".lot",
  ".fls",
  ".fdb_latexmk",
  ".synctex",
  ".synctex.gz",
  ".bcf",
  ".run.xml",
  ".blg",
  ".ilg",
  ".nav",
  ".snm",
  ".vrb",
  ".xdv",
  ".dvi",
  ".spl",
];

function shouldIgnoreEntryName(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower.startsWith("._")) return true;
  if (name.startsWith(".") && lower !== ".latexmkrc") return true;
  if (IGNORED_FILES.has(lower)) return true;
  if (name.endsWith("~")) return true;
  return IGNORED_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

function deriveCleanPackageName(fileName: string): string {
  const base = getBaseName(fileName);
  const stripped = base
    .replace(
      /\.(?:tar\.gz|tgz|tar\.bz2|tbz2|tar\.xz|txz|zip|tar|gz|rar|7z|cpio|cab|ipynb|qmd|rmd|md|pdf|tex|ltx)$/i,
      "",
    )
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.slice(0, 80) || "Imported Project";
}

function hasTarHeader(buf: Buffer): boolean {
  if (buf.length < 265) return false;
  return buf.subarray(257, 262).toString("ascii") === "ustar";
}

export function detectArchiveFormat(
  buffer: Buffer,
  fileName: string,
): DetectedPackageFormat {
  // 1. Magic byte sniffing first
  if (buffer.length >= 4) {
    // ZIP (PK\x03\x04 or empty archive PK\x05\x06)
    if (
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      ((buffer[2] === 0x03 && buffer[3] === 0x04) ||
        (buffer[2] === 0x05 && buffer[3] === 0x06))
    ) {
      return "zip";
    }
    // RAR4 / RAR5 (Rar!\x1a\x07)
    if (
      buffer.length >= 6 &&
      buffer[0] === 0x52 &&
      buffer[1] === 0x61 &&
      buffer[2] === 0x72 &&
      buffer[3] === 0x21 &&
      buffer[4] === 0x1a &&
      buffer[5] === 0x07
    ) {
      return "rar";
    }
    // 7z (\x37\x7a\xbc\xaf\x27\x1c)
    if (
      buffer.length >= 6 &&
      buffer[0] === 0x37 &&
      buffer[1] === 0x7a &&
      buffer[2] === 0xbc &&
      buffer[3] === 0xaf &&
      buffer[4] === 0x27 &&
      buffer[5] === 0x1c
    ) {
      return "7z";
    }
    // GZIP (\x1f\x8b)
    if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
      try {
        const preview = gunzipSync(buffer, {
          maxOutputLength: MAX_TOTAL_EXTRACTED_BYTES,
        });
        return hasTarHeader(preview) ? "tar.gz" : "gz-single";
      } catch {
        const lower = fileName.toLowerCase();
        return lower.endsWith(".tar.gz") || lower.endsWith(".tgz")
          ? "tar.gz"
          : "gz-single";
      }
    }
    // BZIP2 ("BZh")
    if (buffer[0] === 0x42 && buffer[1] === 0x5a && buffer[2] === 0x68) {
      return "tar.bz2";
    }
    // XZ (\xfd 7 z X Z \x00)
    if (
      buffer.length >= 6 &&
      buffer[0] === 0xfd &&
      buffer[1] === 0x37 &&
      buffer[2] === 0x7a &&
      buffer[3] === 0x58 &&
      buffer[4] === 0x5a &&
      buffer[5] === 0x00
    ) {
      return "tar.xz";
    }
    // PDF ("%PDF-")
    if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
      return "pdf";
    }
    // Plain tar ("ustar" at byte 257)
    if (hasTarHeader(buffer)) {
      return "tar";
    }
  }

  // 2. Fallback to filename extension
  const lower = fileName.trim().toLowerCase();
  if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) return "tar.gz";
  if (lower.endsWith(".tar.bz2") || lower.endsWith(".tbz2")) return "tar.bz2";
  if (lower.endsWith(".tar.xz") || lower.endsWith(".txz")) return "tar.xz";
  if (lower.endsWith(".zip")) return "zip";
  if (lower.endsWith(".tar")) return "tar";
  if (lower.endsWith(".rar")) return "rar";
  if (lower.endsWith(".7z")) return "7z";
  if (lower.endsWith(".gz")) return "gz-single";
  if (lower.endsWith(".ipynb")) return "ipynb";
  if (
    lower.endsWith(".qmd") ||
    lower.endsWith(".rmd") ||
    lower.endsWith(".md") ||
    lower.endsWith(".markdown")
  ) {
    return "markdown";
  }
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".tex") || lower.endsWith(".ltx")) return "tex";
  return "unknown";
}

function runCommand(
  binary: string,
  args: string[],
  timeoutMs = EXTRACT_TIMEOUT_MS,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const child = spawn(binary, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill("SIGKILL");
        resolve({ code: null, stdout, stderr: "Timed out during extraction." });
      }
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length < 32_000) stdout += chunk.toString("utf-8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 32_000) stderr += chunk.toString("utf-8");
    });
    child.on("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ code: 127, stdout, stderr: err.message });
      }
    });
    child.on("close", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      }
    });
  });
}

function isUnsafeArchiveMember(memberPath: string): boolean {
  const normalized = memberPath.replace(/\\/g, "/").trim();
  if (!normalized) return false;
  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) return true;
  return normalized.split("/").some((segment) => segment === "..");
}

async function extractZipViaPython(
  archivePath: string,
  outDir: string,
): Promise<boolean> {
  const pyZip = await runCommand("python3", [
    "-c",
    `import os, sys, zipfile
src, dst = sys.argv[1], os.path.realpath(sys.argv[2])
with zipfile.ZipFile(src, "r") as zf:
  for info in zf.infolist():
    if info.is_dir(): continue
    raw = info.filename.replace("\\\\", "/")
    if raw.startswith("/"): continue
    parts = [p for p in raw.split("/") if p]
    if ".." in parts: continue
    rel = os.path.normpath("/".join(parts))
    if not rel or rel == "." or rel.startswith("..") or os.path.isabs(rel): continue
    target = os.path.realpath(os.path.join(dst, rel))
    if not target.startswith(dst + os.sep): continue
    os.makedirs(os.path.dirname(target), exist_ok=True)
    with zf.open(info, "r") as fin, open(target, "wb") as fout:
      fout.write(fin.read())`,
    archivePath,
    outDir,
  ]);
  return pyZip.code === 0;
}

async function extractWithFallbacks(
  format: DetectedPackageFormat,
  archivePath: string,
  outDir: string,
): Promise<void> {
  // For ZIP archives, prefer Python's zipfile with explicit realpath zip-slip
  // checks so path traversal is blocked even when bsdtar is unavailable.
  if (format === "zip") {
    const pyOk = await extractZipViaPython(archivePath, outDir);
    if (pyOk) return;
  }

  // Pre-screen TOC so directory traversal entries (`../` or leading `/`) are dropped before writing
  const toc = await runCommand("bsdtar", ["-tf", archivePath]);
  const unsafeMembers =
    toc.code === 0
      ? toc.stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(isUnsafeArchiveMember)
      : [];

  const excludeArgs = unsafeMembers
    .slice(0, 100)
    .flatMap((member) => ["--exclude", member]);

  // Primary: bsdtar (libarchive supports zip, tar, tar.gz, tar.bz2, tar.xz, rar, 7z)
  const bsd = await runCommand("bsdtar", [
    "--no-same-owner",
    "--no-same-permissions",
    "--no-acls",
    "--no-xattrs",
    ...excludeArgs,
    "-xf",
    archivePath,
    "-C",
    outDir,
  ]);
  if (bsd.code === 0) return;

  if (format === "rar") {
    for (const [bin, args] of [
      ["unar", ["-f", "-o", outDir, archivePath]],
      ["unrar", ["x", "-y", "-o+", archivePath, `${outDir}/`]],
      ["7zz", ["x", "-y", `-o${outDir}`, archivePath]],
      ["7z", ["x", "-y", `-o${outDir}`, archivePath]],
    ] as const) {
      const attempt = await runCommand(bin, [...args]);
      if (attempt.code === 0) return;
    }

    const detail = bsd.stderr.trim();
    throw new Error(
      `Could not extract RAR archive (${detail || "encrypted or unsupported RAR5 solid codec"}). Re-pack as .zip or .tar.gz, or remove password encryption.`,
    );
  }

  if (format === "zip") {
    const unzipToc = await runCommand("unzip", ["-Z1", archivePath]);
    const unsafeZipMembers =
      unzipToc.code === 0
        ? unzipToc.stdout
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(isUnsafeArchiveMember)
        : [];
    const unzipExclude =
      unsafeZipMembers.length > 0
        ? ["-x", ...unsafeZipMembers.slice(0, 100)]
        : [];
    const unzipRes = await runCommand("unzip", [
      "-oq",
      archivePath,
      "-d",
      outDir,
      ...unzipExclude,
    ]);
    if (unzipRes.code === 0) return;
  }

  if (
    format === "tar.gz" ||
    format === "tar" ||
    format === "tar.bz2" ||
    format === "tar.xz"
  ) {
    const tarToc = await runCommand("tar", ["-tf", archivePath]);
    const unsafeTarMembers =
      tarToc.code === 0
        ? tarToc.stdout
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(isUnsafeArchiveMember)
        : [];
    const tarExclude = unsafeTarMembers
      .slice(0, 100)
      .flatMap((member) => ["--exclude", member]);
    const gtar = await runCommand("tar", [
      ...tarExclude,
      "-xf",
      archivePath,
      "-C",
      outDir,
    ]);
    if (gtar.code === 0) return;
  }

  throw new Error(
    `Failed to extract ${format} archive: ${bsd.stderr.trim() || "corrupted or unsupported archive"}.`,
  );
}

async function collectExtractedFiles(
  rootDir: string,
): Promise<{ files: Omit<ProjectFile, "id">[]; skipped: string[] }> {
  const files: Omit<ProjectFile, "id">[] = [];
  const skipped: string[] = [];
  let totalBytes = 0;

  async function walk(currentDir: string): Promise<void> {
    if (files.length >= MAX_EXTRACTED_FILES) return;
    const entries = await readdir(currentDir);

    for (const entryName of entries) {
      if (files.length >= MAX_EXTRACTED_FILES) {
        skipped.push(
          `${relative(rootDir, join(currentDir, entryName))} (limit)`,
        );
        continue;
      }

      const fullPath = join(currentDir, entryName);
      const stat = await lstat(fullPath);

      // Ignore symlinks, sockets, devices (symlink escape protection)
      if (stat.isSymbolicLink()) {
        skipped.push(`${relative(rootDir, fullPath)} (symlink)`);
        continue;
      }

      const relPath = relative(rootDir, fullPath).replace(/\\/g, "/");
      if (!relPath || relPath.startsWith("..") || relPath.includes("/../")) {
        skipped.push(relPath || entryName);
        continue;
      }

      if (stat.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entryName) || entryName.startsWith(".")) {
          continue;
        }
        await walk(fullPath);
        continue;
      }

      if (!stat.isFile()) continue;

      if (shouldIgnoreEntryName(entryName)) {
        skipped.push(relPath);
        continue;
      }

      if (stat.size > MAX_SINGLE_FILE_BYTES) {
        skipped.push(`${relPath} (>10MB)`);
        continue;
      }

      if (totalBytes + stat.size > MAX_TOTAL_EXTRACTED_BYTES) {
        skipped.push(`${relPath} (archive size budget)`);
        continue;
      }

      totalBytes += stat.size;
      const buf = await readFile(fullPath);
      const mimeType = mimeTypeForName(entryName);
      const type = fileTypeForName(entryName, mimeType);

      if (type === "tex" || isTextFileName(entryName, mimeType)) {
        files.push({
          name: entryName,
          path: relPath,
          type: "tex",
          mimeType,
          content: buf.toString("utf-8"),
        });
      } else {
        const resolvedMime = mimeType ?? "application/octet-stream";
        files.push({
          name: entryName,
          path: relPath,
          type,
          mimeType: resolvedMime,
          dataUrl: `data:${resolvedMime};base64,${buf.toString("base64")}`,
        });
      }
    }
  }

  await walk(rootDir);
  return { files, skipped };
}

function unwrapSingleWrapperDirectory(
  files: Omit<ProjectFile, "id">[],
  fallbackName: string,
): { files: Omit<ProjectFile, "id">[]; wrapperName: string | null } {
  if (files.length === 0) return { files, wrapperName: null };

  const firstSegments = new Set<string>();
  let allNested = true;
  for (const file of files) {
    const idx = file.path.indexOf("/");
    if (idx === -1) {
      allNested = false;
      break;
    }
    firstSegments.add(file.path.slice(0, idx));
  }

  if (!allNested || firstSegments.size !== 1) {
    return { files, wrapperName: null };
  }

  const wrapper = Array.from(firstSegments)[0];
  const prefix = `${wrapper}/`;
  return {
    wrapperName: wrapper || fallbackName,
    files: files.map((file) => {
      const nextPath = file.path.startsWith(prefix)
        ? file.path.slice(prefix.length)
        : file.path;
      return {
        ...file,
        path: nextPath,
        name: getBaseName(nextPath),
      };
    }),
  };
}

export async function unpackResearchPackageBuffer(
  buffer: Buffer,
  fileName: string,
  options: { applySafeFixes?: boolean } = {},
): Promise<UnpackedPackageResult> {
  if (buffer.byteLength === 0) {
    throw new Error("Uploaded archive or file is empty.");
  }
  if (buffer.byteLength > MAX_ARCHIVE_UPLOAD_BYTES) {
    throw new Error(
      `Archive exceeds the ${Math.round(MAX_ARCHIVE_UPLOAD_BYTES / (1024 * 1024))} MB limit.`,
    );
  }

  const format = detectArchiveFormat(buffer, fileName);
  const derivedFallback = deriveCleanPackageName(fileName);
  let files: Omit<ProjectFile, "id">[] = [];
  let skipped: string[] = [];
  const extraNotes: string[] = [];

  if (format === "ipynb") {
    const converted = convertIpynbToLatexPackage(
      buffer.toString("utf-8"),
      getBaseName(fileName),
    );
    files = converted.files;
    extraNotes.push(...converted.notes);
  } else if (format === "markdown") {
    const rawText = buffer.toString("utf-8");
    const converted = convertMarkdownResearchToLatex(
      rawText,
      getBaseName(fileName),
    );
    files = [
      converted.texFile,
      {
        name: getBaseName(fileName),
        path: getBaseName(fileName),
        type: "tex",
        content: rawText,
      },
    ];
    extraNotes.push(...converted.notes);
  } else if (format === "pdf") {
    const cleanPdfName = getBaseName(fileName);
    const stem = cleanPdfName.replace(/\.pdf$/i, "") || "manuscript";
    files.push({
      name: cleanPdfName,
      path: cleanPdfName,
      type: "binary",
      mimeType: "application/pdf",
      dataUrl: `data:application/pdf;base64,${buffer.toString("base64")}`,
    });

    const tempDir = await mkdtemp(join(tmpdir(), "arcana-pdf-"));
    try {
      const pdfPath = join(tempDir, cleanPdfName);
      await writeFile(pdfPath, buffer);
      const extract = await runCommand(
        "python3",
        [
          "-c",
          `import sys
from pypdf import PdfReader
reader = PdfReader(sys.argv[1])
parts = [(p.extract_text() or "") for p in reader.pages[:40]]
sys.stdout.write("\\n\\n".join(parts))`,
          pdfPath,
        ],
        12_000,
      );
      if (extract.code === 0 && extract.stdout.trim().length > 20) {
        const restored = reconstructTextLocal(extract.stdout, {
          aggressiveness: "balanced",
          outputMode: "document",
          targetFormat: "article",
        });
        files.unshift({
          name: `${stem}.tex`,
          path: `${stem}.tex`,
          type: "tex",
          content: restored.reconstructedLatex,
        });
        extraNotes.push(
          `Extracted text from PDF (${extract.stdout.length} chars) and reconstructed ${stem}.tex via ML Text Restorer.`,
        );
      } else {
        extraNotes.push(
          "Imported PDF asset (scanned/image PDF detected — open Text Restorer (ML) to run OCR if needed).",
        );
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  } else if (format === "tex") {
    const texName = getBaseName(fileName);
    files = [
      {
        name: texName,
        path: texName,
        type: "tex",
        content: buffer.toString("utf-8"),
      },
    ];
  } else if (format === "gz-single") {
    const decompressed = gunzipSync(buffer, {
      maxOutputLength: MAX_TOTAL_EXTRACTED_BYTES,
    });
    const baseStem = getBaseName(fileName).replace(/\.gz$/i, "") || "source";
    const text = decompressed.toString("utf-8");
    const looksLatex =
      /\\documentclass\b|\\begin\{document\}/.test(text) ||
      baseStem.toLowerCase().endsWith(".tex");
    const outName = looksLatex
      ? baseStem.toLowerCase().endsWith(".tex")
        ? baseStem
        : `${baseStem}.tex`
      : baseStem;

    files = [
      {
        name: outName,
        path: outName,
        type: "tex",
        content: text,
      },
    ];
    extraNotes.push(`Decompressed single gzip file (${outName}).`);
  } else {
    // Archive extraction path: zip, tar.gz, tar.bz2, tar.xz, tar, rar, 7z
    const workRoot = await mkdtemp(join(tmpdir(), "arcana-pkg-"));
    const archivePath = join(workRoot, "archive.bin");
    const outDir = join(workRoot, "out");

    try {
      await mkdir(outDir, { recursive: true });
      await writeFile(archivePath, buffer);
      await extractWithFallbacks(format, archivePath, outDir);

      const collected = await collectExtractedFiles(outDir);
      skipped = collected.skipped;
      const unwrapped = unwrapSingleWrapperDirectory(
        collected.files,
        derivedFallback,
      );
      files = unwrapped.files;

      if (files.length === 0) {
        throw new Error(
          "Archive unpacked cleanly but contained no supported source, figure, or data files.",
        );
      }
    } finally {
      await rm(workRoot, { recursive: true, force: true }).catch(() => {});
    }
  }

  let fixedLintCount = 0;
  if (options.applySafeFixes) {
    const applied = applySafePackageFixes(files);
    files = applied.files;
    fixedLintCount = applied.fixedCount;
    if (fixedLintCount > 0) {
      extraNotes.push(`Applied ${fixedLintCount} safe preflight lint fix(es).`);
    }
  }

  const report = analyzeImportedPackage(files, derivedFallback);
  report.notes = [...extraNotes, ...report.notes];

  return {
    projectName: report.projectName,
    format,
    files,
    skipped,
    isProject: report.isFullLatexProject || files.length > 1,
    recommendedCompiler: report.recommendedCompiler,
    mainFilePath: report.mainFilePath,
    report,
  };
}

export async function fetchArxivSourcePackage(
  rawIdOrUrl: string,
  options: { applySafeFixes?: boolean } = {},
): Promise<UnpackedPackageResult> {
  const arxivId = parseArxivIdentifier(rawIdOrUrl);
  if (!arxivId) {
    throw new Error(
      "Enter a valid arXiv ID (e.g. 2305.12345) or https://arxiv.org/abs/... URL.",
    );
  }

  const sourceUrl = `https://arxiv.org/e-print/${arxivId}`;
  const response = await fetch(sourceUrl, {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
    headers: {
      "User-Agent": "arcanaTeX/1.0 (Academic LaTeX Workspace)",
    },
  });

  if (!response.ok) {
    throw new Error(
      `arXiv returned HTTP ${response.status} for ${arxivId}. Check that the identifier exists and has source available.`,
    );
  }

  // Enforce redirect destination check
  try {
    const finalHost = new URL(response.url).hostname.toLowerCase();
    if (!finalHost.endsWith("arxiv.org")) {
      throw new Error("Unexpected redirect outside arxiv.org.");
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("redirect")) throw err;
  }

  const arrayBuf = await response.arrayBuffer();
  if (arrayBuf.byteLength > MAX_ARCHIVE_UPLOAD_BYTES) {
    throw new Error("arXiv source bundle exceeds the 40 MB import limit.");
  }

  const buf = Buffer.from(arrayBuf);
  const pseudoName = `arxiv-${arxivId.replace(/\//g, "-")}.tar.gz`;
  const result = await unpackResearchPackageBuffer(buf, pseudoName, options);
  result.report.notes.unshift(`Fetched source e-print arXiv:${arxivId}`);
  return result;
}
