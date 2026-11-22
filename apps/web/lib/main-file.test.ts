import { describe, expect, it } from "vitest";
import { suggestMainFile } from "@/lib/main-file";
import type { ProjectFile } from "@/lib/project-files";

const tex = (id: string, content: string, path = `${id}.tex`): ProjectFile => ({
  id,
  name: path.split("/").pop() ?? path,
  path,
  type: "tex",
  content,
});

const DOC =
  "\\documentclass{article}\n\\begin{document}\nHi\n\\end{document}\n";

describe("suggestMainFile", () => {
  it("suggests the single file that has a \\documentclass", () => {
    const files = [tex("ch1", "\\section{A}"), tex("paper", DOC)];

    expect(suggestMainFile(files, "ch1")?.id).toBe("paper");
  });

  it("suggests it when no main file is set", () => {
    expect(suggestMainFile([tex("paper", DOC)], null)?.id).toBe("paper");
  });

  it("offers nothing when the current main already is that file", () => {
    expect(suggestMainFile([tex("paper", DOC)], "paper")).toBeNull();
  });

  it("offers nothing when two files could be the main document", () => {
    const files = [tex("a", DOC), tex("b", DOC)];

    expect(suggestMainFile(files, null)).toBeNull();
  });

  it("offers nothing when no file has a \\documentclass", () => {
    expect(suggestMainFile([tex("a", "\\section{A}")], null)).toBeNull();
  });

  it("ignores a \\documentclass that is commented out", () => {
    const files = [tex("a", "% \\documentclass{article}\n"), tex("b", DOC)];

    expect(suggestMainFile(files, "a")?.id).toBe("b");
  });

  it("ignores non-LaTeX files such as notes or classes", () => {
    const notes: ProjectFile = {
      id: "n",
      name: "notes.md",
      path: "notes.md",
      type: "tex",
      content: DOC,
    };
    const cls: ProjectFile = {
      ...notes,
      id: "c",
      name: "x.cls",
      path: "x.cls",
    };

    expect(suggestMainFile([notes, cls, tex("p", DOC)], null)?.id).toBe("p");
  });
});
