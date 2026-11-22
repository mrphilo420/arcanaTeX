import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/packages/import/route";

describe("POST /api/packages/import", () => {
  it("unpacks multipart .tar.gz and .ipynb research uploads cleanly", async () => {
    const dir = await mkdtemp(join(tmpdir(), "arcana-route-pkg-"));
    try {
      const src = join(dir, "src");
      await mkdir(src, { recursive: true });
      await writeFile(
        join(src, "manuscript.tex"),
        "\\documentclass{article}\n\\title{Route Tar Test}\n\\begin{document}\nHi.\n\\end{document}\n",
      );
      const tgzPath = join(dir, "bundle.tar.gz");
      const tarRun = spawnSync("bsdtar", ["-czf", tgzPath, "-C", src, "."]);
      expect(tarRun.status).toBe(0);

      const tarBytes = await readFile(tgzPath);
      const form = new FormData();
      form.append(
        "file",
        new File([new Uint8Array(tarBytes)], "bundle.tar.gz", {
          type: "application/gzip",
        }),
      );

      const response = await POST(
        new Request("http://localhost/api/packages/import", {
          method: "POST",
          body: form,
        }),
      );
      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload.format).toBe("tar.gz");
      expect(payload.projectName).toBe("Route Tar Test");
      expect(payload.mainFilePath).toBe("manuscript.tex");

      // Also test Jupyter Notebook conversion route
      const nbJson = JSON.stringify({
        metadata: { kernelspec: { language: "python" } },
        cells: [
          {
            cell_type: "markdown",
            source: "# Route Notebook\nHello math $x^2$.",
          },
        ],
      });
      const nbForm = new FormData();
      nbForm.append(
        "file",
        new File([nbJson], "demo.ipynb", { type: "application/json" }),
      );
      const nbResp = await POST(
        new Request("http://localhost/api/packages/import", {
          method: "POST",
          body: nbForm,
        }),
      );
      expect(nbResp.status).toBe(200);
      const nbData = await nbResp.json();
      expect(nbData.format).toBe("ipynb");
      expect(
        nbData.files.some((f: { path: string }) => f.path === "demo.tex"),
      ).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects missing files and invalid non-arXiv URLs (SSRF check)", async () => {
    const emptyForm = new FormData();
    const missingResp = await POST(
      new Request("http://localhost/api/packages/import", {
        method: "POST",
        body: emptyForm,
      }),
    );
    expect(missingResp.status).toBe(400);

    const badArxiv = await POST(
      new Request("http://localhost/api/packages/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arxivId: "http://127.0.0.1:8080/secret" }),
      }),
    );
    expect(badArxiv.status).toBe(400);
  });
});
