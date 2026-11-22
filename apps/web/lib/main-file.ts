import { maskComments } from "@/lib/latex-active";
import { isLatexDocumentFile, type ProjectFile } from "@/lib/project-files";

/**
 * Suggests which file to set as the main document: the one `.tex` file that
 * contains an active `\documentclass`. Returns null unless the choice is
 * unambiguous and different from the current main file. Without a correct main
 * file the compile service builds the wrong file, which fails with errors that
 * point away from the real cause.
 */
export function suggestMainFile(
  files: ProjectFile[],
  mainFileId: string | null,
): ProjectFile | null {
  const candidates = files.filter(
    (file) =>
      isLatexDocumentFile(file) &&
      /\\documentclass\b/.test(maskComments(file.content ?? "")),
  );

  if (candidates.length !== 1) return null;
  return candidates[0].id === mainFileId ? null : candidates[0];
}
