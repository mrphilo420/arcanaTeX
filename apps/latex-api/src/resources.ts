import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export interface Resource {
  path?: string;
  content?: string;
  file?: string;
  main?: boolean;
}

export type WriteResult = { ok: true } | { ok: false; path: string };

/**
 * Resolves `filePath` inside `workDir`, or returns null if it would escape it.
 * Only a `..` path segment is traversal; dots inside a name (`plot..v2.png`)
 * are legal.
 */
export function sanitizePath(workDir: string, filePath: string): string | null {
  if (filePath.split(/[\\/]/).includes("..")) return null;
  const normalized = resolve(workDir, filePath);
  if (!normalized.startsWith(`${workDir}/`) && normalized !== workDir) {
    return null;
  }
  return normalized;
}

/**
 * Writes every resource into `workDir`. Text files are written even when empty,
 * because a placeholder file that is `\input` by another file must exist.
 */
export async function writeResources(
  workDir: string,
  resources: Resource[],
): Promise<WriteResult> {
  for (const resource of resources) {
    const filePath =
      resource.path || (resource.main ? "main.tex" : `file-${randomUUID()}`);
    const fullPath = sanitizePath(workDir, filePath);
    if (!fullPath) return { ok: false, path: filePath };

    if (typeof resource.file === "string" && resource.file) {
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, Buffer.from(resource.file, "base64"));
    } else if (typeof resource.content === "string") {
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, resource.content, "utf-8");
    }
  }
  return { ok: true };
}
