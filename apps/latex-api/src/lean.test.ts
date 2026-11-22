import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveComparatorConfigPath } from "./lean.js";

describe("resolveComparatorConfigPath", () => {
  const projectRoot = resolve("/tmp/sample-lean-project");

  it("defaults to comparator.json inside the project root", () => {
    expect(resolveComparatorConfigPath(projectRoot)).toBe(
      join(projectRoot, "comparator.json"),
    );
    expect(resolveComparatorConfigPath(projectRoot, "  ")).toBe(
      join(projectRoot, "comparator.json"),
    );
  });

  it("accepts nested .json config paths within the project", () => {
    expect(resolveComparatorConfigPath(projectRoot, "configs/spec.json")).toBe(
      join(projectRoot, "configs", "spec.json"),
    );
  });

  it("rejects parent-directory traversal and absolute escapes", () => {
    expect(
      resolveComparatorConfigPath(projectRoot, "../secret.json"),
    ).toBeNull();
    expect(
      resolveComparatorConfigPath(projectRoot, "/etc/passwd.json"),
    ).toBeNull();
  });

  it("rejects non-json config targets", () => {
    expect(
      resolveComparatorConfigPath(projectRoot, "lakefile.lean"),
    ).toBeNull();
  });
});
