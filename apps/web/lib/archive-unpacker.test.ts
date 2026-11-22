import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  detectArchiveFormat,
  unpackResearchPackageBuffer,
} from "@/lib/archive-unpacker";

async function buildArchiveWithBsdtar(
  formatFlag: string[],
  outName: string,
  entries: Array<{ path: string; content: string }>,
): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "arcana-tar-test-"));
  const srcDir = join(dir, "src");
  await mkdir(srcDir, { recursive: true });
  try {
    for (const entry of entries) {
      const target = join(srcDir, entry.path);
      await mkdir(join(target, ".."), { recursive: true });
      await writeFile(target, entry.content, "utf-8");
    }
    const outPath = join(dir, outName);
    const res = spawnSync(
      "bsdtar",
      [...formatFlag, "-cf", outPath, "-C", srcDir, "."],
      {
        encoding: "utf-8",
      },
    );
    if (res.status !== 0) {
      throw new Error(`bsdtar failed: ${res.stderr}`);
    }
    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("archive-unpacker", () => {
  it("sniffs magic bytes across zip, tar.gz, tar.bz2, tar.xz, rar, 7z, and pdf", () => {
    expect(
      detectArchiveFormat(Buffer.from([0x50, 0x4b, 0x03, 0x04]), "pkg.bin"),
    ).toBe("zip");
    expect(
      detectArchiveFormat(
        Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00, 0x00]),
        "pkg.rar",
      ),
    ).toBe("rar");
    expect(
      detectArchiveFormat(
        Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00]),
        "pkg5.rar",
      ),
    ).toBe("rar");
    expect(
      detectArchiveFormat(
        Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0x00]),
        "pkg.7z",
      ),
    ).toBe("7z");
    expect(detectArchiveFormat(Buffer.from("%PDF-1.7\n"), "paper.pdf")).toBe(
      "pdf",
    );
  });

  it("unpacks .tar.gz with single wrapper folder flattening, .bbl retention, build-artifact filtering, and 00README compiler detection", async () => {
    const sampleEntries = [
      {
        path: "arxiv-submission/main.tex",
        content:
          "\\documentclass{article}\n\\title{Graph Neural Operators}\n\\begin{document}\nHi.\n\\end{document}\n",
      },
      {
        path: "arxiv-submission/main.bbl",
        content:
          "\\begin{thebibliography}{1}\\bibitem{a} Ref A.\\end{thebibliography}\n",
      },
      {
        path: "arxiv-submission/00README.json",
        content: JSON.stringify({
          sources: [{ filename: "main.tex", usage: "toplevel" }],
          process: { compiler: "xelatex" },
        }),
      },
      {
        path: "arxiv-submission/main.aux",
        content: "\\relax\n",
      },
      {
        path: "arxiv-submission/.DS_Store",
        content: "junk",
      },
    ];

    const tarGzBuf = await buildArchiveWithBsdtar(
      ["-z"],
      "arxiv-bundle.tar.gz",
      sampleEntries,
    );
    expect(detectArchiveFormat(tarGzBuf, "arxiv-bundle.tar.gz")).toBe("tar.gz");

    const unpacked = await unpackResearchPackageBuffer(
      tarGzBuf,
      "arxiv-bundle.tar.gz",
    );
    expect(unpacked.format).toBe("tar.gz");
    expect(unpacked.projectName).toBe("Graph Neural Operators");
    expect(unpacked.recommendedCompiler).toBe("xelatex");
    expect(unpacked.mainFilePath).toBe("main.tex");

    const paths = unpacked.files.map((f) => f.path);
    expect(paths).toContain("main.tex");
    expect(paths).toContain("main.bbl");
    expect(paths).toContain("00README.json");
    expect(paths).not.toContain("main.aux");
    expect(paths).not.toContain(".DS_Store");
  });

  it("unpacks .zip, .tar.bz2, .tar.xz, and standalone .tex.gz packages cleanly", async () => {
    const entries = [
      {
        path: "paper.tex",
        content:
          "\\documentclass{article}\n\\title{Compressed Formats}\n\\begin{document}\nBody.\n\\end{document}\n",
      },
    ];

    const zipBuf = await buildArchiveWithBsdtar(
      ["--format=zip"],
      "paper.zip",
      entries,
    );
    const bz2Buf = await buildArchiveWithBsdtar(
      ["-j"],
      "paper.tar.bz2",
      entries,
    );
    const xzBuf = await buildArchiveWithBsdtar(["-J"], "paper.tar.xz", entries);

    for (const [buf, name, expectedFormat] of [
      [zipBuf, "paper.zip", "zip"],
      [bz2Buf, "paper.tar.bz2", "tar.bz2"],
      [xzBuf, "paper.tar.xz", "tar.xz"],
    ] as const) {
      const res = await unpackResearchPackageBuffer(buf, name);
      expect(res.format).toBe(expectedFormat);
      expect(res.projectName).toBe("Compressed Formats");
      expect(res.files.map((f) => f.path)).toContain("paper.tex");
    }

    const singleGz = gzipSync(
      Buffer.from(
        "\\documentclass{article}\\title{Single Gzip}\\begin{document}Hello\\end{document}",
      ),
    );
    const gzRes = await unpackResearchPackageBuffer(singleGz, "single.tex.gz");
    expect(gzRes.format).toBe("gz-single");
    expect(gzRes.files.map((f) => f.path)).toContain("single.tex");
    expect(gzRes.projectName).toBe("Single Gzip");
  });

  it("blocks zip-slip path traversal attempts inside zip archives", async () => {
    const dir = await mkdtemp(join(tmpdir(), "arcana-zipslip-"));
    try {
      const zipPath = join(dir, "slip.zip");
      const py = spawnSync(
        "python3",
        [
          "-c",
          `import sys, zipfile
with zipfile.ZipFile(sys.argv[1], "w") as zf:
  zf.writestr("../../outside_evil.txt", "pwned")
  zf.writestr("safe/main.tex", "\\\\documentclass{article}\\\\begin{document}Safe\\\\end{document}")`,
          zipPath,
        ],
        { encoding: "utf-8" },
      );
      expect(py.status).toBe(0);
      const buf = await readFile(zipPath);
      const res = await unpackResearchPackageBuffer(buf, "slip.zip");
      const paths = res.files.map((f) => f.path);
      expect(paths).not.toContain("outside_evil.txt");
      expect(paths.some((p) => p.includes(".."))).toBe(false);
      expect(paths).toContain("main.tex");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
