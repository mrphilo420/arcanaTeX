import type { CodeArtifact } from "@/lib/code-runner";
import {
  getBaseName,
  getExtension,
  mimeTypeForName,
} from "@/lib/project-files";

export const FIGURE_ARTIFACT_EXTENSIONS = new Set([
  "pdf",
  "png",
  "svg",
  "jpg",
  "jpeg",
  "eps",
]);

/**
 * Returns true if the artifact path has a scientific graphic/figure extension.
 */
export function isFigureArtifactPath(filePath: string): boolean {
  return FIGURE_ARTIFACT_EXTENSIONS.has(getExtension(filePath));
}

/**
 * Encodes a UTF-8 or base64 CodeArtifact as a data URL suitable for browser
 * previews, project file storage, or direct download links.
 */
export function codeArtifactToDataUrl(
  artifact: CodeArtifact,
  fallbackMime = "application/octet-stream",
): string {
  const mime =
    artifact.mimeType ?? mimeTypeForName(artifact.path) ?? fallbackMime;
  if (artifact.encoding === "base64") {
    return `data:${mime};base64,${artifact.content}`;
  }
  if (typeof window !== "undefined") {
    const bytes = new TextEncoder().encode(artifact.content);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return `data:${mime};base64,${window.btoa(binary)}`;
  }
  return `data:${mime};utf8,${encodeURIComponent(artifact.content)}`;
}

/**
 * Triggers a browser download for a generated CodeArtifact.
 */
export function downloadCodeArtifact(artifact: CodeArtifact): void {
  if (typeof document === "undefined") return;
  const url = codeArtifactToDataUrl(artifact);
  const link = document.createElement("a");
  link.href = url;
  link.download = getBaseName(artifact.path);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
