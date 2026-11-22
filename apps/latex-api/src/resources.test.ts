import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sanitizePath, writeResources } from "./resources";

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), "resources-test-"));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe("sanitizePath", () => {
  it("resolves normal and nested paths inside the work dir", () => {
    expect(sanitizePath(workDir, "main.tex")).toBe(`${workDir}/main.tex`);
    expect(sanitizePath(workDir, "chapters/a.tex")).toBe(
      `${workDir}/chapters/a.tex`,
    );
  });

  it("allows dots inside a file name", () => {
    expect(sanitizePath(workDir, "figs/plot..v2.png")).toBe(
      `${workDir}/figs/plot..v2.png`,
    );
  });

  it("rejects parent-directory traversal", () => {
    expect(sanitizePath(workDir, "../evil.tex")).toBeNull();
    expect(sanitizePath(workDir, "a/../../evil.tex")).toBeNull();
    expect(sanitizePath(workDir, "/etc/passwd")).toBeNull();
  });
});

describe("writeResources", () => {
  it("writes empty text files so \\input of a placeholder works", async () => {
    const result = await writeResources(workDir, [
      { path: "main.tex", content: "\\input{empty}", main: true },
      { path: "empty.tex", content: "" },
    ]);

    expect(result).toEqual({ ok: true });
    expect(await readFile(join(workDir, "empty.tex"), "utf-8")).toBe("");
  });

  it("writes nested files and base64 binaries", async () => {
    await writeResources(workDir, [
      { path: "chapters/one.tex", content: "hi" },
      { path: "img/a.bin", file: Buffer.from("xyz").toString("base64") },
    ]);

    expect(await readFile(join(workDir, "chapters/one.tex"), "utf-8")).toBe(
      "hi",
    );
    expect(await readFile(join(workDir, "img/a.bin"), "utf-8")).toBe("xyz");
  });

  it("reports the offending path and writes nothing for traversal", async () => {
    const result = await writeResources(workDir, [
      { path: "../evil.tex", content: "x" },
    ]);

    expect(result).toEqual({ ok: false, path: "../evil.tex" });
    await expect(stat(join(workDir, "..", "evil.tex"))).rejects.toThrow();
  });

  it("skips entries that carry neither content nor file", async () => {
    await mkdir(join(workDir, "keep"));
    const result = await writeResources(workDir, [{ path: "nothing.tex" }]);

    expect(result).toEqual({ ok: true });
    await expect(stat(join(workDir, "nothing.tex"))).rejects.toThrow();
  });
});
