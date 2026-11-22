import type { CompileResource } from "@/lib/latex-compiler";

function isBase64Image(content: string): boolean {
  return content.startsWith("/9j/") || content.startsWith("iVBOR");
}

/**
 * Shapes project files for the compile service. Text content is forwarded even
 * when empty: a placeholder file that another file `\input`s must still exist.
 */
export function toApiResources(
  resources: CompileResource[],
): Record<string, unknown>[] {
  return resources.map((r) => {
    const resource: Record<string, unknown> = { path: r.path };

    if (typeof r.content === "string" && !r.file && isBase64Image(r.content)) {
      resource.file = r.content.replace(/\s/g, "");
    } else if (typeof r.content === "string") {
      resource.content = r.content;
    }

    if (r.file) resource.file = r.file.replace(/\s/g, "");
    if (r.main) resource.main = r.main;
    return resource;
  });
}
