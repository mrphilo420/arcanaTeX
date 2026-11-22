"use client";

import { useAssistantTool } from "@assistant-ui/react";
import {
  CheckIcon,
  LoaderIcon,
  PlusIcon,
  ReplaceIcon,
  SearchIcon,
} from "lucide-react";
import type { FC } from "react";
import { z } from "zod";

import {
  applyAgentEdit,
  prepareAgentTurn,
  recordAgentFileCreate,
} from "@/lib/ai/agent-edits";
import {
  planFindAndReplace,
  type FindAndReplaceInput,
} from "@/lib/ai/edit-requests";
import {
  anchorEdit,
  applyEdits,
  lineOffset,
  normalizeEol,
  resolveProjectFile,
  type AppliedEdit,
} from "@/lib/ai/file-edits";
import { buildFilePatch, patchStats } from "@/lib/ai/line-diff";
import { selectWindow } from "@/lib/ai/text-window";
import {
  assembleWholeRevision,
  buildChunkContextEnvelope,
  createChunkSession,
  hashText,
  loadChunkSession,
  saveChunkSession,
  stageChunkRevision,
} from "@/lib/document-chunks";
import { codeArtifactToDataUrl } from "@/lib/code-artifacts";
import type { CodeRunResult } from "@/lib/code-runner";
import {
  buildLatexFigureSnippet,
  compileFigureCode,
  deduceFigureSpec,
  ensureGraphicxInLatex,
  type FigurePaletteId,
  type JournalFigurePresetId,
} from "@/lib/figure-engine";
import {
  type ReconstructionAggressiveness,
  type ReconstructionOutputMode,
  type ReconstructionResult,
  type ReconstructionTargetFormat,
  reconstructTextLocal,
} from "@/lib/text-reconstructor";
import {
  lintLatexProject,
  validateLatexEditIntegrity,
} from "@/lib/latex-linter";
import {
  fileTypeForName,
  getExtension,
  isLatexDocumentFile,
  mimeTypeForName,
} from "@/lib/project-files";
import { createProjectVersion } from "@/lib/projects/repository";
import {
  createTikzFigure,
  createTikzShape,
  generateTikzCode,
  type TikzArrow,
  type TikzShape,
} from "@/lib/tikz";
import { TIKZ_DIAGRAM_TEMPLATES } from "@/lib/tikz-diagrams";
import {
  currentAgentTurnId,
  useAgentChangesStore,
} from "@/stores/agent-changes-store";
import { useDocumentStore } from "@/stores/document-store";

const CONFLICT_ERROR =
  "The file changed while the edit was being prepared. Re-read it and try again.";

/**
 * Nothing may be inserted after \end{document}; LaTeX silently drops it and
 * the next compile fails with "missing \end{document}". Clamp instead of
 * trusting the caller's anchor or a stale cursor.
 */
function clampBeforeEndDocument(content: string, offset: number): number {
  const end = content.lastIndexOf("\\end{document}");
  return end !== -1 && offset > end ? end : offset;
}

export const LatexTools: FC = () => {
  useAssistantTool({
    toolName: "insert_latex",
    description:
      "Insert LaTeX code into the active document. Pass `line` with the 1-based line number when the user names a line, a diagnostic line, or a specific location by number; the block starts before that line by default, or after it with position='after'. Pass `anchor` with an exact snippet when you have the surrounding text; an anchor wins over line. Without either, the code goes at the caret.",
    parameters: z.object({
      code: z.string().describe("The LaTeX code to insert"),
      line: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          "1-based line number where the inserted block should start, in the active file. Ignored when anchor is given.",
        ),
      anchor: z
        .string()
        .optional()
        .describe(
          "Exact existing text to insert relative to, for example '\\section*{Features}'. Copy it from the file you read; it must be unique.",
        ),
      contextBefore: z
        .string()
        .optional()
        .describe(
          "Text immediately before the anchor, used when the anchor appears more than once.",
        ),
      contextAfter: z
        .string()
        .optional()
        .describe(
          "Text immediately after the anchor, used when the anchor appears more than once.",
        ),
      position: z
        .enum(["after", "before"])
        .optional()
        .describe("Insert after or before the anchor. Defaults to after."),
    }),
    execute: async (
      {
        code,
        line,
        anchor,
        contextBefore,
        contextAfter,
        position,
      }: {
        code: string;
        line?: number;
        anchor?: string;
        contextBefore?: string;
        contextAfter?: string;
        position?: "after" | "before";
      },
      { toolCallId },
    ) => {
      const state = useDocumentStore.getState();
      const activeFile = state.files.find(
        (file) => file.id === state.activeFileId,
      );
      if (!activeFile || activeFile.type !== "tex") {
        return { success: false, error: "No editable LaTeX file is open." };
      }

      const before = activeFile.content ?? "";
      const normalizedCode = normalizeEol(code);

      let cursor = Math.min(Math.max(0, state.cursorPosition), before.length);
      let placedBy: "cursor" | "anchor" | "line" = "cursor";

      if (anchor && anchor.trim().length > 0) {
        const located = anchorEdit(before, {
          find: anchor,
          contextBefore,
          contextAfter,
        });
        if (!located.ok) {
          return {
            success: false,
            error:
              located.reason === "ambiguous"
                ? `The anchor appears ${located.count ?? "several"} times, at lines ${(located.lines ?? []).slice(0, 8).join(", ")}. Pass contextBefore or contextAfter with the neighbouring line, or copy a longer snippet that includes it.`
                : "The anchor was not found in the active file. Read the file and copy the exact text.",
          };
        }
        cursor = position === "before" ? located.start : located.end;
        placedBy = "anchor";
      } else if (line !== undefined) {
        const offset = lineOffset(before, line, position ?? "before");
        if (offset === null) {
          return {
            success: false,
            error: `Line ${line} is outside the active file (1-${before.split("\n").length}).`,
          };
        }
        cursor = offset;
        placedBy = "line";
      }

      cursor = clampBeforeEndDocument(before, cursor);

      // A figure or section placed right after an anchor needs its own line.
      const needsNewline =
        placedBy !== "cursor" &&
        !before.slice(0, cursor).endsWith("\n") &&
        !code.startsWith("\n");
      let insertion = needsNewline ? `\n${code}` : code;
      if (
        placedBy !== "cursor" &&
        !before.slice(cursor).startsWith("\n") &&
        !insertion.endsWith("\n")
      ) {
        // Keep the inserted block on its own lines; otherwise the next line
        // continues inside the insertion (for example a comment marker).
        insertion += "\n";
      }
      const insertedAt = cursor + (needsNewline ? 1 : 0);

      const result = await applyAgentEdit({
        turnId: currentAgentTurnId(),
        toolCallId,
        fileId: activeFile.id,
        before,
        after: before.slice(0, cursor) + insertion + before.slice(cursor),
        applied: [
          {
            start: insertedAt,
            end: insertedAt + normalizedCode.length,
            before: "",
            after: normalizedCode,
          },
        ],
      });

      if (!result.ok) {
        return {
          success: false,
          error:
            result.reason === "conflict"
              ? CONFLICT_ERROR
              : "The active file is no longer available.",
        };
      }

      state.setCursorPosition(insertedAt + insertion.length);
      state.requestJumpToPosition(insertedAt);
      return {
        success: true,
        message:
          placedBy === "anchor"
            ? "Code inserted at the anchor"
            : placedBy === "line"
              ? `Code inserted at line ${line}`
              : "Code inserted at cursor position",
      };
    },
    render: function InsertLatexRender({ result }) {
      const isComplete = result != null;
      const hasError = result?.success === false;
      return (
        <div className="my-2 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
          {isComplete ? (
            hasError ? (
              <span className="size-4 text-amber-600">!</span>
            ) : (
              <CheckIcon className="size-4 text-green-600" />
            )
          ) : (
            <LoaderIcon className="size-4 animate-spin text-muted-foreground" />
          )}
          <PlusIcon className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground">
            {hasError
              ? result.error
              : isComplete
                ? "Inserted LaTeX code"
                : "Inserting LaTeX code..."}
          </span>
        </div>
      );
    },
  });

  useAssistantTool({
    toolName: "replace_selection",
    description:
      "Replace the currently selected text in the document with LaTeX code",
    parameters: z.object({
      code: z.string().describe("The LaTeX code to replace the selection with"),
    }),
    execute: async ({ code }: { code: string }, { toolCallId }) => {
      const state = useDocumentStore.getState();
      const range = state.selectionRange;
      if (!range) {
        return {
          success: false,
          error: "No text is currently selected in the editor",
        };
      }

      const activeFile = state.files.find(
        (file) => file.id === state.activeFileId,
      );
      if (!activeFile || activeFile.type !== "tex") {
        return { success: false, error: "No editable LaTeX file is open." };
      }

      const before = activeFile.content ?? "";
      const start = Math.min(Math.max(0, range.start), before.length);
      const end = Math.min(Math.max(start, range.end), before.length);
      const normalizedCode = normalizeEol(code);

      const result = await applyAgentEdit({
        turnId: currentAgentTurnId(),
        toolCallId,
        fileId: activeFile.id,
        before,
        after: before.slice(0, start) + code + before.slice(end),
        applied: [
          {
            start,
            end: start + normalizedCode.length,
            before: normalizeEol(before.slice(start, end)),
            after: normalizedCode,
          },
        ],
      });

      if (!result.ok) {
        return {
          success: false,
          error:
            result.reason === "conflict"
              ? CONFLICT_ERROR
              : "The active file is no longer available.",
        };
      }

      state.setCursorPosition(start + code.length);
      return { success: true, message: "Selection replaced with code" };
    },
    render: function ReplaceSelectionRender({ result }) {
      const isComplete = result != null;
      const hasError = result?.success === false;
      return (
        <div className="my-2 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
          {isComplete ? (
            hasError ? (
              <span className="size-4 text-amber-600">!</span>
            ) : (
              <CheckIcon className="size-4 text-green-600" />
            )
          ) : (
            <LoaderIcon className="size-4 animate-spin text-muted-foreground" />
          )}
          <ReplaceIcon className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground">
            {hasError
              ? result.error
              : isComplete
                ? "Replaced selection"
                : "Replacing selection..."}
          </span>
        </div>
      );
    },
  });

  useAssistantTool({
    toolName: "find_and_replace",
    description:
      "Find and replace text in a project file (the active file unless path is given). The find text must match exactly one place unless replaceAll is set; if it matches several, add contextBefore/contextAfter to pick one.",
    parameters: z.object({
      find: z.string().describe("The exact text to find in the file"),
      replace: z.string().describe("The text to replace it with"),
      path: z
        .string()
        .optional()
        .describe(
          "Relative path of the file to edit. Omit to edit the active file.",
        ),
      replaceAll: z
        .boolean()
        .optional()
        .describe(
          "Set true to replace every match of find. Otherwise the match must be unique.",
        ),
      contextBefore: z
        .string()
        .optional()
        .describe(
          "Text immediately before find, used to disambiguate when find appears more than once.",
        ),
      contextAfter: z
        .string()
        .optional()
        .describe(
          "Text immediately after find, used to disambiguate when find appears more than once.",
        ),
    }),
    execute: async (input: FindAndReplaceInput, { toolCallId }) => {
      const state = useDocumentStore.getState();
      const plan = planFindAndReplace(state.files, state.activeFileId, input);
      if (!plan.success) {
        return { success: false, error: plan.error };
      }

      const file = state.files.find(
        (candidate) => candidate.id === plan.fileId,
      );
      if (!file) {
        return { success: false, error: "The target file no longer exists." };
      }

      const result = await applyAgentEdit({
        turnId: currentAgentTurnId(),
        toolCallId,
        fileId: plan.fileId,
        before: file.content ?? "",
        after: plan.newContent,
        applied: plan.applied,
      });

      if (!result.ok) {
        return {
          success: false,
          error:
            result.reason === "conflict"
              ? CONFLICT_ERROR
              : "The target file no longer exists.",
        };
      }

      return {
        success: true,
        message: `Replaced ${plan.replacements} occurrence${
          plan.replacements === 1 ? "" : "s"
        } in ${plan.filePath}`,
        replacements: plan.replacements,
        ...(plan.integrityWarnings?.length
          ? { integrityWarnings: plan.integrityWarnings }
          : {}),
      };
    },
    render: function FindAndReplaceRender({ result }) {
      const isComplete = result != null;
      const hasError = result?.success === false;
      return (
        <div className="my-2 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
          {isComplete ? (
            hasError ? (
              <span className="size-4 text-amber-600">!</span>
            ) : (
              <CheckIcon className="size-4 text-green-600" />
            )
          ) : (
            <LoaderIcon className="size-4 animate-spin text-muted-foreground" />
          )}
          <SearchIcon className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground">
            {hasError
              ? result.error
              : isComplete
                ? "Text replaced"
                : "Finding and replacing..."}
          </span>
        </div>
      );
    },
  });

  useAssistantTool({
    toolName: "create_tikz_figure",
    description:
      "Create a figure with the TikZ studio generator. Prefer this over hand-written tikzpicture code: the result carries studio metadata, so the user can reopen and edit it in the studio. Pass `template` for a built-in layout, or `shapes` for a custom diagram on a 16x10 cm canvas. Template ids: research-pipeline, research-flow, neural-network, layered-architecture, concept-map, timeline, comparison-matrix, commutative-diagram, lattice-face, domain-window, orthant-decomposition, block-decomposition, dual-validation, scatter-panels, trend-plot, pca-biplot, cfa-model, sem-model, scatter-fit, network-graph, histogram, boxplot, bar-chart, forest-plot, roc-curve, survival-curve, confusion-matrix, correlation-matrix. Call list_tikz_templates when you need a description.",
    parameters: z.object({
      template: z
        .string()
        .optional()
        .describe("Built-in template id, for example 'forest-plot'."),
      shapes: z
        .array(
          z.object({
            kind: z.enum(["rectangle", "ellipse", "line", "text"]),
            x: z.number().describe("Left edge, or x for a line/text"),
            y: z.number().describe("Top edge, or y for a line/text"),
            width: z.number().optional().describe("Width in cm"),
            height: z.number().optional().describe("Height in cm"),
            x2: z.number().optional().describe("End x for a line"),
            y2: z.number().optional().describe("End y for a line"),
            label: z.string().optional(),
            fill: z
              .string()
              .optional()
              .describe("TikZ colour, e.g. blue!10, orange!15, none"),
            stroke: z.string().optional(),
            arrow: z.enum(["none", "->", "<-", "<->", "|-", "-|"]).optional(),
            rounded: z.boolean().optional(),
          }),
        )
        .max(40)
        .optional()
        .describe("Custom shapes, drawn on a 16x10 cm canvas."),
      caption: z.string().optional(),
      label: z.string().optional().describe("LaTeX label, e.g. fig:results"),
      line: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          "1-based line number in the document body where the figure should start. Must be after \\begin{document}. Ignored when anchor is given.",
        ),
      anchor: z
        .string()
        .optional()
        .describe(
          "Existing text to place the figure relative to. Copy it exactly. To place a figure at the end, anchor to a line inside the document, not to \\end{document}",
        ),
      contextBefore: z
        .string()
        .optional()
        .describe(
          "Text immediately before the anchor, used when it appears more than once.",
        ),
      contextAfter: z
        .string()
        .optional()
        .describe(
          "Text immediately after the anchor, used when it appears more than once.",
        ),
      position: z.enum(["after", "before"]).optional(),
    }),
    execute: async (
      input: {
        template?: string;
        shapes?: Array<{
          kind: "rectangle" | "ellipse" | "line" | "text";
          x: number;
          y: number;
          width?: number;
          height?: number;
          x2?: number;
          y2?: number;
          label?: string;
          fill?: string;
          stroke?: string;
          arrow?: TikzArrow;
          rounded?: boolean;
        }>;
        caption?: string;
        label?: string;
        line?: number;
        anchor?: string;
        contextBefore?: string;
        contextAfter?: string;
        position?: "after" | "before";
      },
      { toolCallId },
    ) => {
      const state = useDocumentStore.getState();
      const activeFile = state.files.find(
        (file) => file.id === state.activeFileId,
      );
      if (!activeFile || activeFile.type !== "tex") {
        return { success: false, error: "No editable LaTeX file is open." };
      }

      const document = createTikzFigure();
      let shapes: TikzShape[] = [];

      if (input.template) {
        const template = TIKZ_DIAGRAM_TEMPLATES.find(
          (candidate) => candidate.id === input.template,
        );
        if (!template) {
          return {
            success: false,
            error: `Unknown template "${input.template}". Call list_tikz_templates for valid ids.`,
          };
        }
        shapes = template.build();
      } else if (input.shapes && input.shapes.length > 0) {
        const colour = (value: string | undefined, fallback: string) =>
          value && /^[a-zA-Z0-9!.%-]+$/.test(value) ? value : fallback;

        shapes = input.shapes.map((shape) => {
          if (shape.kind === "line") {
            return createTikzShape(
              "line",
              shape.x,
              shape.y,
              shape.x2 ?? shape.x + 2,
              shape.y2 ?? shape.y,
              {
                label: shape.label ?? "",
                arrow: shape.arrow ?? "->",
                stroke: colour(shape.stroke, "black"),
                lineWidth: "thick",
              },
            );
          }
          if (shape.kind === "text") {
            return createTikzShape("text", shape.x, shape.y, shape.x, shape.y, {
              label: shape.label ?? "Text",
            });
          }
          return createTikzShape(
            shape.kind,
            shape.x,
            shape.y,
            shape.x + (shape.width ?? 3),
            shape.y + (shape.height ?? 1.4),
            {
              label: shape.label ?? "",
              fill: colour(shape.fill, "blue!10"),
              stroke: colour(shape.stroke, "black"),
              lineWidth: "thick",
              rounded: shape.rounded ?? shape.kind === "rectangle",
            },
          );
        });
      } else {
        return {
          success: false,
          error: "Provide either a template id or a list of shapes.",
        };
      }

      document.shapes = shapes;
      document.options.caption = input.caption ?? "";
      document.options.label = input.label ?? "";
      document.options.libraries = [
        ...new Set([
          "arrows.meta",
          ...(shapes.some((shape) => shape.kind === "ellipse")
            ? ["shapes.geometric"]
            : []),
        ]),
      ];

      const code = generateTikzCode(document).trimEnd();

      // Add only the preamble lines this figure needs, before \begin{document}.
      let working = activeFile.content ?? "";
      let cursorShift = 0;
      let preambleBlockAt = -1;
      let preambleBlockLength = 0;
      const preambleLines: string[] = [];

      if (!/\\usepackage(?:\[[^\]]*\])?\{tikz\}/.test(working)) {
        preambleLines.push("\\usepackage{tikz}");
      }
      const loaded = new Set(
        [...working.matchAll(/\\usetikzlibrary\{([^}]*)\}/g)].flatMap((match) =>
          (match[1] ?? "").split(",").map((name) => name.trim()),
        ),
      );
      const missing = document.options.libraries.filter(
        (library) => library && !loaded.has(library),
      );
      if (missing.length > 0) {
        preambleLines.push(`\\usetikzlibrary{${missing.join(",")}}`);
      }

      if (preambleLines.length > 0) {
        const block = `${preambleLines.join("\n")}\n`;
        const beginDocument = working.indexOf("\\begin{document}");
        const blockAt = beginDocument === -1 ? 0 : beginDocument;
        preambleBlockAt = blockAt;
        preambleBlockLength = block.length;
        const withPreamble =
          working.slice(0, blockAt) + block + working.slice(blockAt);

        const preambleEdit = await applyAgentEdit({
          turnId: currentAgentTurnId(),
          toolCallId: `${toolCallId}:preamble`,
          fileId: activeFile.id,
          before: working,
          after: withPreamble,
          applied: [
            {
              start: blockAt,
              end: blockAt + block.length,
              before: "",
              after: block,
            },
          ],
        });

        if (!preambleEdit.ok) {
          return {
            success: false,
            error: "Could not add the TikZ package to the preamble.",
          };
        }

        if (blockAt <= state.cursorPosition) cursorShift = block.length;
        working = withPreamble;
      }

      let insertAt = Math.min(
        Math.max(0, state.cursorPosition + cursorShift),
        working.length,
      );
      let placedBy: "cursor" | "anchor" | "line" = "cursor";

      let lineInsertAt: number | null = null;
      if (input.line !== undefined) {
        const originalOffset = lineOffset(
          activeFile.content ?? "",
          input.line,
          input.position ?? "before",
        );
        if (originalOffset === null) {
          return {
            success: false,
            error: `Line ${input.line} is outside the active file (1-${
              (activeFile.content ?? "").split("\n").length
            }).`,
          };
        }
        const bodyStart = (activeFile.content ?? "").indexOf(
          "\\begin{document}",
        );
        if (bodyStart !== -1 && originalOffset <= bodyStart) {
          return {
            success: false,
            error: `Line ${input.line} is in the preamble. A figure must be placed inside the document body, after \\begin{document}.`,
          };
        }
        lineInsertAt =
          originalOffset +
          (preambleBlockAt !== -1 && originalOffset >= preambleBlockAt
            ? preambleBlockLength
            : 0);
      }

      if (input.anchor && input.anchor.trim().length > 0) {
        const located = anchorEdit(working, {
          find: input.anchor,
          contextBefore: input.contextBefore,
          contextAfter: input.contextAfter,
        });
        if (!located.ok) {
          return {
            success: false,
            error:
              located.reason === "ambiguous"
                ? `The anchor appears ${located.count ?? "several"} times, at lines ${(located.lines ?? []).slice(0, 8).join(", ")}. Pass contextBefore or contextAfter with a neighbouring line, or copy a longer snippet.`
                : "The anchor was not found. Read the file and copy the exact text.",
          };
        }
        insertAt = input.position === "before" ? located.start : located.end;
        placedBy = "anchor";
      } else if (lineInsertAt !== null) {
        insertAt = lineInsertAt;
        placedBy = "line";
      }

      insertAt = clampBeforeEndDocument(working, insertAt);

      const prefix = working.slice(0, insertAt);
      const needsNewline =
        (placedBy === "anchor" || insertAt > 0) &&
        !prefix.endsWith("\n") &&
        !code.startsWith("\n");
      let insertion = needsNewline ? `\n${code}` : code;
      if (
        !working.slice(insertAt).startsWith("\n") &&
        !insertion.endsWith("\n")
      ) {
        insertion += "\n";
      }
      const insertedAt = insertAt + (needsNewline ? 1 : 0);

      const result = await applyAgentEdit({
        turnId: currentAgentTurnId(),
        toolCallId: `${toolCallId}:figure`,
        fileId: activeFile.id,
        before: working,
        after: working.slice(0, insertAt) + insertion + working.slice(insertAt),
        applied: [
          {
            start: insertedAt,
            end: insertedAt + code.length,
            before: "",
            after: code,
          },
        ],
      });

      if (!result.ok) {
        return {
          success: false,
          error:
            result.reason === "conflict"
              ? "The file changed while the figure was being prepared."
              : "The active file is no longer available.",
        };
      }

      state.setCursorPosition(insertAt + insertion.length);
      state.requestJumpToPosition(insertAt);
      return {
        success: true,
        message:
          placedBy === "line"
            ? `Figure inserted at line ${input.line} with studio metadata. The user can reopen it in the TikZ studio to edit the shapes.`
            : "Figure inserted with studio metadata. The user can reopen it in the TikZ studio to edit the shapes.",
      };
    },
    render: function CreateTikzFigureRender({ result }) {
      const isComplete = result != null;
      const hasError = result?.success === false;
      return (
        <div className="my-2 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
          {isComplete ? (
            hasError ? (
              <span className="size-4 text-amber-600">!</span>
            ) : (
              <CheckIcon className="size-4 text-green-600" />
            )
          ) : (
            <LoaderIcon className="size-4 animate-spin text-muted-foreground" />
          )}
          <PlusIcon className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground">
            {hasError
              ? result.error
              : isComplete
                ? "Created figure with the TikZ studio"
                : "Drawing figure..."}
          </span>
        </div>
      );
    },
  });

  useAssistantTool({
    toolName: "list_tikz_templates",
    description:
      "List the TikZ studio templates with their descriptions, so you can pick the right layout for a figure.",
    parameters: z.object({}),
    execute: async () => ({
      templates: TIKZ_DIAGRAM_TEMPLATES.map((template) => ({
        id: template.id,
        name: template.name,
        description: template.description,
        category: template.category,
      })),
    }),
  });

  useAssistantTool({
    toolName: "edit_with_python",
    description:
      "Edit a file by running a Python transform instead of find/replace. Write a script that reads input.tex and writes output.tex; the app runs it in a sandbox, and the resulting diff is shown for review. Use this when an anchor would be ambiguous, when the change is repetitive, or when it is easier to express as code. For files larger than about 14000 characters, the app sends a line-aligned window centred on `anchor` (or the caret) as input.tex. If the script fails, stderr comes back so you can fix it and call again.",
    parameters: z.object({
      script: z
        .string()
        .describe(
          "Python source. Read input.tex and write output.tex, for example: text = open('input.tex').read(); open('output.tex','w').write(text.replace('old','new')).",
        ),
      path: z
        .string()
        .optional()
        .describe("File to edit. Defaults to the active file."),
      anchor: z
        .string()
        .optional()
        .describe(
          "Text near the region to edit. Large files are windowed around it. Copy it exactly.",
        ),
      summary: z
        .string()
        .optional()
        .describe("One short line describing the change, shown to the user."),
      timeoutMs: z.number().int().min(1000).max(30000).optional(),
    }),
    execute: async (
      input: {
        script: string;
        path?: string;
        anchor?: string;
        summary?: string;
        timeoutMs?: number;
      },
      { toolCallId },
    ) => {
      const state = useDocumentStore.getState();
      const target = input.path
        ? resolveProjectFile(state.files, input.path)
        : state.files.find((file) => file.id === state.activeFileId);

      if (!target) {
        return {
          success: false,
          error: input.path
            ? `File not found: ${input.path}. Use list_project_files to see paths.`
            : "No active file is open to edit.",
        };
      }
      if (target.type !== "tex") {
        return {
          success: false,
          error: `Cannot edit a binary file: ${target.path}.`,
        };
      }

      const before = target.content ?? "";

      // The runner accepts 20000 characters and captures up to 16000, so large
      // documents are edited through a line-aligned window.
      const WINDOW_CHARS = 14_000;
      let center = state.cursorPosition;
      if (input.anchor && input.anchor.trim().length > 0) {
        const located = anchorEdit(before, { find: input.anchor });
        if (!located.ok) {
          return {
            success: false,
            error:
              located.reason === "ambiguous"
                ? `The anchor appears ${located.count ?? "several"} times, at lines ${(located.lines ?? []).slice(0, 8).join(", ")}. Copy a longer snippet.`
                : `The anchor was not found in ${target.path}. Read the file and copy the exact text.`,
          };
        }
        center = located.start;
      }

      const window = selectWindow(before, center, WINDOW_CHARS);

      let result: {
        success?: boolean;
        exitCode?: number | null;
        timedOut?: boolean;
        stdout?: string;
        stderr?: string;
        artifacts?: { path: string; content: string; truncated: boolean }[];
        sandboxed?: boolean;
        error?: string;
      };

      try {
        const response = await fetch("/api/code/run", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            language: "python",
            code: input.script,
            timeoutMs: input.timeoutMs,
            files: [{ path: "input.tex", content: window.text }],
          }),
        });
        result = (await response.json()) as typeof result;
        if (!response.ok) {
          return {
            success: false,
            error: result.error ?? "The Python runner rejected the request.",
          };
        }
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error
              ? `Could not reach the Python runner: ${error.message}`
              : "Could not reach the Python runner.",
        };
      }

      if (!result.success || result.exitCode !== 0) {
        return {
          success: false,
          error: `The script did not finish cleanly.${
            result.timedOut ? " It timed out." : ""
          } ${(result.stderr || result.stdout || "").slice(0, 1200)}`.trim(),
        };
      }

      const output = (result.artifacts ?? []).find(
        (artifact) => artifact.path === "output.tex",
      );
      if (!output) {
        const written = (result.artifacts ?? [])
          .map((artifact) => artifact.path)
          .filter((path) => path !== "input.tex");
        return {
          success: false,
          error: `The script did not write output.tex.${
            written.length
              ? ` It wrote: ${written.join(", ")}.`
              : " Write the modified text to output.tex."
          }`,
        };
      }
      if (output.truncated) {
        return {
          success: false,
          error:
            "output.tex exceeded the runner's 16000-character capture limit, so it cannot be applied safely. Edit a smaller region instead.",
        };
      }
      if (output.content === window.text) {
        // The script ran correctly; there is simply nothing left to change.
        // Reporting an error here made the model retry and burn the turn.
        return {
          success: true,
          message:
            "The script ran but produced no change: the file already matches. Do not call it again for this request.",
          added: 0,
          removed: 0,
          summary: input.summary ?? "",
        };
      }

      const after =
        window.start === 0 && window.end === before.length
          ? output.content
          : before.slice(0, window.start) +
            output.content +
            before.slice(window.end);

      const patch = buildFilePatch(before, after);
      const wholeFile: AppliedEdit = {
        start: 0,
        end: normalizeEol(after).length,
        before: normalizeEol(before),
        after: normalizeEol(after),
      };

      let applied: AppliedEdit[] = [wholeFile];
      if (patch.kind === "edits") {
        const merged = applyEdits(before, patch.edits);
        if (merged.ok) applied = merged.applied;
      }

      const editResult = await applyAgentEdit({
        turnId: currentAgentTurnId(),
        toolCallId,
        fileId: target.id,
        before,
        after,
        applied,
      });

      if (!editResult.ok) {
        return {
          success: false,
          error:
            editResult.reason === "conflict"
              ? CONFLICT_ERROR
              : "The file is no longer available.",
        };
      }

      const stats = patchStats(patch);
      const windowed = window.text.length !== before.length;
      return {
        success: true,
        message: `Python transform applied to ${target.path} (+${stats.added} −${stats.removed})${
          windowed ? ` using lines ${window.startLine}–${window.endLine}` : ""
        }. The change is ready for review.`,
        added: stats.added,
        removed: stats.removed,
        summary: input.summary ?? "",
        sandboxed: result.sandboxed ?? false,
      };
    },
    render: function EditWithPythonRender({ result }) {
      const isComplete = result != null;
      const hasError = result?.success === false;
      const added = Number(
        (result as { added?: number } | undefined)?.added ?? 0,
      );
      const removed = Number(
        (result as { removed?: number } | undefined)?.removed ?? 0,
      );
      return (
        <div className="my-2 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
          {isComplete ? (
            hasError ? (
              <span className="size-4 text-amber-600">!</span>
            ) : (
              <CheckIcon className="size-4 text-green-600" />
            )
          ) : (
            <LoaderIcon className="size-4 animate-spin text-muted-foreground" />
          )}
          <span className="font-mono text-[0.75rem] text-muted-foreground">
            python
          </span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {hasError
              ? result.error
              : isComplete
                ? `Ran transform · +${added} −${removed}`
                : "Running transform..."}
          </span>
        </div>
      );
    },
  });

  useAssistantTool({
    toolName: "list_project_files",
    description:
      "List every file in the current LaTeX project with its relative path, file type, and whether it is the main document or the active file.",
    parameters: z.object({}),
    execute: async () => {
      const state = useDocumentStore.getState();
      return {
        success: true,
        mainDocument:
          state.files.find((file) => file.id === state.mainFileId)?.path ??
          null,
        files: state.files.map((file) => ({
          path: file.path,
          type: file.type,
          main: file.id === state.mainFileId,
          active: file.id === state.activeFileId,
        })),
      };
    },
  });

  useAssistantTool({
    toolName: "read_project_file",
    description:
      "Read a text file from the project by its relative path. Use list_project_files first if you do not know the path.",
    parameters: z.object({
      path: z
        .string()
        .describe("Relative file path, for example chapters/intro.tex"),
    }),
    execute: async ({ path }: { path: string }) => {
      const state = useDocumentStore.getState();
      const normalized = path.replace(/^\/+/, "");
      const file = state.files.find(
        (candidate) =>
          candidate.path === normalized || candidate.name === normalized,
      );

      if (!file) {
        return {
          success: false,
          error: `File not found: ${normalized}`,
          files: state.files.map((candidate) => candidate.path),
        };
      }

      if (file.type !== "tex") {
        return {
          success: true,
          path: file.path,
          type: file.type,
          note: "This is a binary file. Its content is not available as text.",
        };
      }

      return {
        success: true,
        path: file.path,
        type: file.type,
        content: file.content ?? "",
      };
    },
  });

  useAssistantTool({
    toolName: "search_project",
    description:
      "Search for text across all editable files in the project. Returns matching file paths and context snippets.",
    parameters: z.object({
      query: z.string().describe("Text to search for, case-insensitive"),
    }),
    execute: async ({ query }: { query: string }) => {
      const state = useDocumentStore.getState();
      const needle = query.trim().toLowerCase();
      if (!needle) {
        return { success: false, error: "Search query is empty" };
      }

      const matches: { path: string; snippet: string }[] = [];
      for (const file of state.files) {
        if (file.type !== "tex" || !file.content) continue;
        const index = file.content.toLowerCase().indexOf(needle);
        if (index === -1) continue;
        const start = Math.max(0, index - 120);
        const end = Math.min(file.content.length, index + query.length + 180);
        matches.push({
          path: file.path,
          snippet: file.content.slice(start, end),
        });
      }

      return {
        success: true,
        query,
        matchCount: matches.length,
        matches: matches.slice(0, 20),
        truncated: matches.length > 20,
      };
    },
  });

  useAssistantTool({
    toolName: "write_project_file",
    description:
      "Create a new text file or overwrite an existing text file in the project. Use relative paths such as sections/methods.tex. Provide the complete file content.",
    parameters: z.object({
      path: z
        .string()
        .describe("Relative path for the file, for example sections/new.tex"),
      content: z.string().describe("The complete text content for the file"),
    }),
    execute: async (
      { path, content }: { path: string; content: string },
      { toolCallId },
    ) => {
      const turnId = currentAgentTurnId();
      const state = useDocumentStore.getState();
      const normalized = path.replace(/^\/+/, "").trim();

      if (!normalized || normalized.includes("..")) {
        return { success: false, error: "Invalid file path" };
      }

      const existing = state.files.find((file) => file.path === normalized);

      if (existing) {
        if (existing.type !== "tex") {
          return {
            success: false,
            error: `Cannot overwrite binary file: ${normalized}`,
          };
        }

        const normalizedAfter = normalizeEol(content);
        const result = await applyAgentEdit({
          turnId,
          toolCallId,
          fileId: existing.id,
          before: existing.content ?? "",
          after: content,
          applied: [
            {
              start: 0,
              end: normalizedAfter.length,
              before: normalizeEol(existing.content ?? ""),
              after: normalizedAfter,
            },
          ],
        });

        if (!result.ok) {
          return {
            success: false,
            error:
              result.reason === "conflict"
                ? "The file changed while the write was being prepared. Re-read it and try again."
                : "The target file no longer exists.",
          };
        }

        return { success: true, action: "updated", path: existing.path };
      }

      // Creating a file needs a snapshot before it appears in the project.
      await prepareAgentTurn(turnId);

      // Re-check after the async snapshot. Another tool may have created the
      // file while this call was waiting.
      const latest = useDocumentStore.getState();
      const raced = latest.files.find((file) => file.path === normalized);

      if (raced) {
        if (raced.type !== "tex") {
          return {
            success: false,
            error: `Cannot overwrite binary file: ${normalized}`,
          };
        }

        const normalizedAfter = normalizeEol(content);
        const result = await applyAgentEdit({
          turnId,
          toolCallId,
          fileId: raced.id,
          before: raced.content ?? "",
          after: content,
          applied: [
            {
              start: 0,
              end: normalizedAfter.length,
              before: normalizeEol(raced.content ?? ""),
              after: normalizedAfter,
            },
          ],
        });

        if (!result.ok) {
          return {
            success: false,
            error:
              result.reason === "conflict"
                ? "The file changed while the write was being prepared. Re-read it and try again."
                : "The target file no longer exists.",
          };
        }

        return { success: true, action: "updated", path: raced.path };
      }

      const name = normalized.split("/").pop() ?? normalized;
      const fileId = latest.addFile({
        name,
        path: normalized,
        type: "tex",
        content,
      });

      recordAgentFileCreate({
        turnId,
        toolCallId,
        fileId,
        filePath: normalized,
        content,
      });

      return { success: true, action: "created", path: normalized };
    },
  });

  useAssistantTool({
    toolName: "set_main_document",
    description:
      "Set which .tex file is compiled as the project's main document.",
    parameters: z.object({
      path: z
        .string()
        .describe("Relative path of the .tex file to use as the main document"),
    }),
    execute: async ({ path }: { path: string }) => {
      const state = useDocumentStore.getState();
      const normalized = path.replace(/^\/+/, "");
      const file = state.files.find(
        (candidate) =>
          candidate.path === normalized || candidate.name === normalized,
      );

      if (!file) {
        return { success: false, error: `File not found: ${normalized}` };
      }

      if (!isLatexDocumentFile(file)) {
        return { success: false, error: `${file.path} is not a .tex document` };
      }

      state.setMainFile(file.id);
      return { success: true, mainDocument: file.path };
    },
  });

  useAssistantTool({
    toolName: "lint_latex_document",
    description:
      "Run static LaTeX precision checks (unbalanced braces, mismatched or unclosed environments, unclosed math delimiters, unbalanced \\left/\\right, duplicate/undefined \\label/\\ref/\\cite, unescaped &/#, typography traps, and arXiv/journal portability issues).",
    parameters: z.object({
      path: z
        .string()
        .optional()
        .describe(
          "Optional relative path of a .tex file to focus on. Omit to lint the entire project with active-file focus.",
        ),
      severity: z
        .enum(["error", "warning", "info"])
        .optional()
        .describe("Optional severity filter."),
    }),
    execute: async ({
      path,
      severity,
    }: {
      path?: string;
      severity?: "error" | "warning" | "info";
    }) => {
      const state = useDocumentStore.getState();
      const target = path
        ? resolveProjectFile(state.files, path)
        : state.files.find((f) => f.id === state.activeFileId);
      const report = lintLatexProject(state.files, target?.path);
      const rawIssues = path ? report.activeIssues : report.issues;
      const filtered = severity
        ? rawIssues.filter((issue) => issue.severity === severity)
        : rawIssues;

      return {
        success: true,
        scope: path ? (target?.path ?? path) : "project",
        counts: path ? report.activeCounts : report.counts,
        totalReturned: Math.min(filtered.length, 50),
        truncated: filtered.length > 50,
        issues: filtered.slice(0, 50).map((issue) => ({
          code: issue.code,
          severity: issue.severity,
          category: issue.category,
          filePath: issue.filePath,
          line: issue.line,
          column: issue.column,
          message: issue.message,
          suggestion: issue.suggestion,
          fixable: Boolean(issue.fix),
        })),
      };
    },
  });

  useAssistantTool({
    toolName: "compress_and_index_document",
    description:
      "Partition a long LaTeX manuscript cleanly along section/theorem/equation boundaries, compress it into a compact structural digest, and store the chunk session for staged chunk revisions.",
    parameters: z.object({
      path: z
        .string()
        .optional()
        .describe("Relative path of a .tex file. Omit for the active file."),
      maxChunkChars: z
        .number()
        .int()
        .min(1000)
        .max(20000)
        .optional()
        .describe("Maximum characters per logical chunk (default 6000)."),
    }),
    execute: async ({
      path,
      maxChunkChars,
    }: {
      path?: string;
      maxChunkChars?: number;
    }) => {
      const state = useDocumentStore.getState();
      const target = path
        ? resolveProjectFile(state.files, path)
        : state.files.find((f) => f.id === state.activeFileId);
      if (!target || target.type !== "tex") {
        return {
          success: false,
          error: path
            ? `Editable LaTeX file not found: ${path}`
            : "No active LaTeX file is open.",
        };
      }

      const content = target.content ?? "";
      const projectKey = state.projectId ?? "local-workspace";
      const session = createChunkSession({
        projectId: projectKey,
        fileId: target.id,
        filePath: target.path,
        content,
        maxChunkChars,
      });
      saveChunkSession(session);

      return {
        success: true,
        path: target.path,
        sourceHash: session.sourceHash,
        chunkCount: session.chunks.length,
        originalChars: session.compressed.originalChars,
        compressedChars: session.compressed.compressedChars,
        compressionRatio: session.compressed.compressionRatio,
        estimatedTokensSaved: session.compressed.estimatedTokensSaved,
        outlineEntries: session.compressed.outlineEntries,
        digestMarkdown: session.compressed.digestMarkdown,
      };
    },
  });

  useAssistantTool({
    toolName: "read_document_chunk",
    description:
      "Read a single logical chunk verbatim along with its manuscript thesis, outline, and neighbor transitions.",
    parameters: z.object({
      chunkId: z
        .string()
        .describe("Chunk identifier, for example 'chunk-001'."),
      path: z
        .string()
        .optional()
        .describe("Relative path of the .tex file. Omit for the active file."),
    }),
    execute: async ({ chunkId, path }: { chunkId: string; path?: string }) => {
      const state = useDocumentStore.getState();
      const target = path
        ? resolveProjectFile(state.files, path)
        : state.files.find((f) => f.id === state.activeFileId);
      if (!target || target.type !== "tex") {
        return { success: false, error: "Target LaTeX file not found." };
      }

      const content = target.content ?? "";
      const projectKey = state.projectId ?? "local-workspace";
      let session = loadChunkSession(projectKey, target.id);
      if (!session || session.sourceHash !== hashText(content)) {
        session = createChunkSession({
          projectId: projectKey,
          fileId: target.id,
          filePath: target.path,
          content,
        });
        saveChunkSession(session);
      }

      try {
        const envelope = buildChunkContextEnvelope(session, chunkId);
        return {
          success: true,
          path: target.path,
          chunkId: envelope.chunk.id,
          heading: envelope.chunk.heading,
          startLine: envelope.chunk.startLine,
          endLine: envelope.chunk.endLine,
          thesis: envelope.thesis,
          previousTail: envelope.previousTail,
          content: envelope.chunk.content,
          stagedContent: envelope.stagedContent,
          nextHead: envelope.nextHead,
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : "Could not read chunk.",
        };
      }
    },
  });

  useAssistantTool({
    toolName: "stage_chunk_revision",
    description:
      "Stage a revised chunk into the stored chunk session with automatic structural LaTeX integrity checking before committing with paste_whole_revision.",
    parameters: z.object({
      chunkId: z
        .string()
        .describe("Chunk identifier, for example 'chunk-002'."),
      revisedContent: z
        .string()
        .describe("The complete revised LaTeX text for that chunk."),
      note: z
        .string()
        .optional()
        .describe("Short description of the revision."),
      path: z
        .string()
        .optional()
        .describe("Relative path of the .tex file. Omit for the active file."),
      force: z
        .boolean()
        .optional()
        .describe("Set true only to override a structural integrity warning."),
    }),
    execute: async ({
      chunkId,
      revisedContent,
      note,
      path,
      force,
    }: {
      chunkId: string;
      revisedContent: string;
      note?: string;
      path?: string;
      force?: boolean;
    }) => {
      const state = useDocumentStore.getState();
      const target = path
        ? resolveProjectFile(state.files, path)
        : state.files.find((f) => f.id === state.activeFileId);
      if (!target || target.type !== "tex") {
        return { success: false, error: "Target LaTeX file not found." };
      }

      const projectKey = state.projectId ?? "local-workspace";
      let session = loadChunkSession(projectKey, target.id);
      if (!session) {
        session = createChunkSession({
          projectId: projectKey,
          fileId: target.id,
          filePath: target.path,
          content: target.content ?? "",
        });
      }

      const originalChunk = session.chunks.find((c) => c.id === chunkId);
      if (!originalChunk) {
        return { success: false, error: `Unknown chunkId: ${chunkId}` };
      }

      const integrity = validateLatexEditIntegrity(
        originalChunk.content,
        revisedContent,
      );
      if (!integrity.ok && !force) {
        return {
          success: false,
          error:
            "Revision introduced structural LaTeX issues and was not staged. Fix them or pass force=true only if an intentional split crosses chunk boundaries.",
          integrityWarnings: integrity.introduced.map(
            (i) => `[${i.code}] L${i.line}: ${i.message}`,
          ),
        };
      }

      const nextSession = stageChunkRevision(
        session,
        chunkId,
        revisedContent,
        note,
      );
      saveChunkSession(nextSession);

      return {
        success: true,
        path: target.path,
        chunkId,
        stagedCount: Object.keys(nextSession.stagedRevisions).length,
        ...(integrity.introduced.length > 0
          ? {
              integrityWarnings: integrity.introduced.map(
                (i) => `[${i.code}] L${i.line}: ${i.message}`,
              ),
            }
          : {}),
      };
    },
  });

  useAssistantTool({
    toolName: "paste_whole_revision",
    description:
      "Assemble all staged chunk revisions into the complete document with drift protection, snapshot version history, and commit as a single reviewable edit.",
    parameters: z.object({
      path: z
        .string()
        .optional()
        .describe("Relative path of the .tex file. Omit for the active file."),
    }),
    execute: async ({ path }: { path?: string }, { toolCallId }) => {
      const state = useDocumentStore.getState();
      const target = path
        ? resolveProjectFile(state.files, path)
        : state.files.find((f) => f.id === state.activeFileId);
      if (!target || target.type !== "tex") {
        return { success: false, error: "Target LaTeX file not found." };
      }

      const projectKey = state.projectId ?? "local-workspace";
      const session = loadChunkSession(projectKey, target.id);
      if (!session) {
        return {
          success: false,
          error:
            "No chunk session found for this file. Run compress_and_index_document first.",
        };
      }

      const liveContent = target.content ?? "";
      const assembled = assembleWholeRevision(liveContent, session);
      if (!assembled.ok) {
        return {
          success: false,
          error: `Source drift prevented safe whole-revision paste in chunks: ${assembled.driftedChunkIds.join(", ")}. Re-index the document first.`,
          driftedChunkIds: assembled.driftedChunkIds,
        };
      }

      if (assembled.changedChunkIds.length === 0) {
        return {
          success: true,
          message:
            "No staged chunk changes differed from the current document.",
          changedChunkIds: [],
        };
      }

      if (state.projectId) {
        try {
          await createProjectVersion({
            projectId: state.projectId,
            label: `Before pasting ${assembled.changedChunkIds.length} chunk revision(s)`,
            name: state.projectName,
            projectCreatedAt: state.createdAt ?? Date.now(),
            files: state.files,
            activeFileId: state.activeFileId || target.id,
            mainFileId: state.mainFileId,
            compiler: state.compiler,
            comments: state.comments,
          });
        } catch {
          // Non-fatal; in-memory review/undo still protects the edit.
        }
      }

      let applied: AppliedEdit[] = [];
      if (
        assembled.patch.kind === "edits" &&
        assembled.patch.edits.length > 0
      ) {
        const planned = applyEdits(liveContent, assembled.patch.edits);
        if (planned.ok) applied = planned.applied;
      }

      const turnId = currentAgentTurnId();
      const editResult = await applyAgentEdit({
        turnId,
        toolCallId,
        fileId: target.id,
        before: liveContent,
        after: assembled.content,
        applied,
      });

      if (!editResult.ok) {
        return {
          success: false,
          error:
            editResult.reason === "conflict"
              ? CONFLICT_ERROR
              : "The target file no longer exists.",
        };
      }

      const integrity = validateLatexEditIntegrity(
        liveContent,
        assembled.content,
      );
      const nextSession = createChunkSession({
        projectId: projectKey,
        fileId: target.id,
        filePath: target.path,
        content: assembled.content,
      });
      saveChunkSession(nextSession);
      useAgentChangesStore.getState().startReview(turnId, target.id);
      state.requestCompile();

      return {
        success: true,
        path: target.path,
        strategy: assembled.strategy,
        changedChunkIds: assembled.changedChunkIds,
        stats: assembled.stats,
        ...(integrity.introduced.length > 0
          ? {
              integrityWarnings: integrity.introduced.map(
                (i) => `[${i.code}] L${i.line}: ${i.message}`,
              ),
            }
          : {}),
      };
    },
  });

  useAssistantTool({
    toolName: "generate_scientific_figure",
    description:
      "3-stage journal figure pipeline (Deduce -> Instructions -> Render in Python/R): infers chart family, Sugiyama DAG or Fruchterman-Reingold graph coordinates, colorblind-safe Okabe-Ito/Tol/Grayscale styling, compiles self-contained Python (matplotlib/numpy) or R (ggplot2/base-R) code, executes via /api/code/run to produce publication PDF/PNG/SVG figures, saves artifacts + script into the project, and optionally inserts \\begin{figure} + \\usepackage{graphicx} into LaTeX.",
    parameters: z.object({
      prompt: z
        .string()
        .min(4)
        .describe(
          "Description of the scientific plot, series, comparison, or 'A -> B -> C' flowchart edges.",
        ),
      presetId: z
        .enum([
          "nature-single",
          "nature-double",
          "ieee-single",
          "ieee-double",
          "springer-single",
          "elsevier-single",
          "elsevier-double",
          "ams-siam",
          "arxiv-preprint",
        ])
        .optional()
        .describe("Publisher column-width and typography specification."),
      paletteId: z
        .enum(["okabe-ito", "tol-muted", "grayscale"])
        .optional()
        .describe("Colorblind-safe or print-grayscale palette."),
      language: z
        .enum(["auto", "python", "r"])
        .optional()
        .describe("Execution engine ('auto', 'python', or 'r')."),
      title: z.string().optional(),
      caption: z.string().optional(),
      label: z.string().optional().describe("LaTeX label, e.g. fig:decay"),
      csvPath: z
        .string()
        .optional()
        .describe("Optional workspace CSV/TSV/JSON/DAT file path to plot."),
      saveToProject: z
        .boolean()
        .optional()
        .describe(
          "Save rendered PDF/PNG/SVG artifacts and script (default true).",
        ),
      insertIntoDocument: z
        .boolean()
        .optional()
        .describe("Insert \\begin{figure} into the manuscript (default true)."),
      targetFilePath: z
        .string()
        .optional()
        .describe("Optional target .tex file path for figure insertion."),
    }),
    execute: async (
      input: {
        prompt: string;
        presetId?: JournalFigurePresetId;
        paletteId?: FigurePaletteId;
        language?: "auto" | "python" | "r";
        title?: string;
        caption?: string;
        label?: string;
        csvPath?: string;
        saveToProject?: boolean;
        insertIntoDocument?: boolean;
        targetFilePath?: string;
      },
      { toolCallId },
    ) => {
      const state = useDocumentStore.getState();
      const csvFile = input.csvPath
        ? resolveProjectFile(state.files, input.csvPath)
        : undefined;

      // Stage 1: Deduce mathematical layout, palette, and synthesis instructions
      const plan = deduceFigureSpec(input.prompt, {
        presetId: input.presetId,
        paletteId: input.paletteId,
        language: input.language ?? "auto",
        csvPath: csvFile?.path,
        csvContent: csvFile?.content,
        title: input.title,
      });

      // Stage 2: Compile self-contained Python or R script
      const code = compileFigureCode(plan, plan.language);

      // Attach workspace data files so real CSV/TSV/JSON series load inside sandbox
      const attachedFiles = state.files
        .filter((file) => {
          const ext = getExtension(file.path || file.name);
          return (
            typeof file.content === "string" &&
            file.content.length > 0 &&
            (ext === "csv" || ext === "tsv" || ext === "json" || ext === "dat")
          );
        })
        .slice(0, 16)
        .map((file) => ({
          path: file.path,
          content: (file.content ?? "").slice(0, 200_000),
        }));

      // Stage 3: Execute in Python/R sandbox to render publication PDF/PNG/SVG artifacts
      let payload: (CodeRunResult & { error?: string }) | null = null;
      try {
        const response = await fetch("/api/code/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            language: plan.language,
            code,
            files: attachedFiles,
          }),
        });
        payload = (await response.json()) as CodeRunResult & { error?: string };
        if (!response.ok || !payload.success) {
          return {
            success: false,
            stage: "compile",
            language: plan.language,
            family: plan.family,
            algorithm: plan.algorithm,
            instructions: plan.instructions,
            error:
              payload?.error ||
              payload?.stderr ||
              `Figure compiler exited with code ${payload?.exitCode ?? "unknown"}`,
            stdout: payload?.stdout ?? "",
            stderr: payload?.stderr ?? "",
            code,
          };
        }
      } catch (error) {
        return {
          success: false,
          stage: "compile",
          language: plan.language,
          family: plan.family,
          error:
            error instanceof Error
              ? error.message
              : "Failed to execute figure compiler.",
        };
      }

      const savedArtifacts: string[] = [];
      let preferredGraphicPath: string | null = null;
      let scriptPath: string | null = null;
      let insertedPath: string | null = null;
      const turnId = currentAgentTurnId();

      if (input.saveToProject !== false) {
        const latest = useDocumentStore.getState();
        const previousActiveId = latest.activeFileId;

        for (const artifact of payload.artifacts) {
          const ext = getExtension(artifact.path);
          if (
            ext !== "pdf" &&
            ext !== "png" &&
            ext !== "svg" &&
            ext !== "jpg" &&
            ext !== "jpeg" &&
            ext !== "eps"
          ) {
            continue;
          }

          const mimeType =
            artifact.mimeType ?? mimeTypeForName(artifact.path) ?? "image/png";
          const type = fileTypeForName(artifact.path, mimeType);
          const dataUrl = codeArtifactToDataUrl(artifact);

          latest.addFile({
            name: artifact.path.split("/").pop() || artifact.path,
            path: artifact.path,
            type,
            mimeType,
            dataUrl,
            content:
              artifact.encoding === "utf-8" ? artifact.content : undefined,
          });

          savedArtifacts.push(artifact.path);
          if (ext === "pdf") {
            preferredGraphicPath = artifact.path;
          } else if (ext === "png" && !preferredGraphicPath) {
            preferredGraphicPath = artifact.path;
          } else if (!preferredGraphicPath) {
            preferredGraphicPath = artifact.path;
          }
        }

        const scriptExt = plan.language === "python" ? "py" : "R";
        scriptPath = `scripts/${plan.slug}.${scriptExt}`;
        const scriptFileId = latest.addFile({
          name: `${plan.slug}.${scriptExt}`,
          path: scriptPath,
          type: "tex",
          content: code,
        });
        recordAgentFileCreate({
          turnId,
          toolCallId: `${toolCallId}:script`,
          fileId: scriptFileId,
          filePath: scriptPath,
          content: code,
        });

        if (previousActiveId) {
          useDocumentStore.getState().setActiveFile(previousActiveId);
        }
      }

      if (input.insertIntoDocument !== false && preferredGraphicPath) {
        const latest = useDocumentStore.getState();
        const requestedTex = input.targetFilePath
          ? resolveProjectFile(latest.files, input.targetFilePath)
          : undefined;
        const activeTex = latest.files.find(
          (f) => f.id === latest.activeFileId && isLatexDocumentFile(f),
        );
        const mainTex = latest.files.find(
          (f) => f.id === latest.mainFileId && isLatexDocumentFile(f),
        );
        const anyTex = latest.files.find((f) => isLatexDocumentFile(f));
        const targetTex = requestedTex ?? activeTex ?? mainTex ?? anyTex;

        if (targetTex && targetTex.type === "tex") {
          const beforeTex = targetTex.content ?? "";
          const snippet = buildLatexFigureSnippet({
            imagePath: preferredGraphicPath,
            caption: input.caption ?? plan.caption,
            label: input.label ?? plan.label,
            doubleColumn: plan.preset.columns === 2,
            width: plan.preset.latexWidth,
          });
          const insertOffset =
            latest.activeFileId === targetTex.id
              ? latest.cursorPosition
              : undefined;
          const afterTex = ensureGraphicxInLatex(
            beforeTex,
            snippet,
            insertOffset,
          );

          const editResult = await applyAgentEdit({
            turnId,
            toolCallId: `${toolCallId}:insert`,
            fileId: targetTex.id,
            before: beforeTex,
            after: afterTex,
            applied: [],
          });

          if (editResult.ok) {
            insertedPath = targetTex.path;
            useDocumentStore.getState().requestCompile();
          }
        }
      }

      return {
        success: true,
        family: plan.family,
        familyLabel: plan.familyLabel,
        algorithm: plan.algorithm,
        language: plan.language,
        preset: plan.preset.label,
        instructions: plan.instructions,
        rationale: plan.rationale,
        graphicPath: preferredGraphicPath,
        savedArtifacts,
        scriptPath,
        insertedInto: insertedPath,
        durationMs: payload.durationMs,
        stdout: payload.stdout,
      };
    },
  });

  useAssistantTool({
    toolName: "reconstruct_garbled_text",
    description:
      "Transform unformatted notes, garbled PDF copy-pastes, UTF-8 mojibake, or noisy OCR text into structured, linter-verified LaTeX using the 5-stage ML reconstruction pipeline (trigram telemetry + hygiene, Bayesian noisy-channel + Viterbi word segmentation, Viterbi CRF block classifier, symbolic emitter, closed-loop linter verification, and optional neural LLM refinement).",
    parameters: z.object({
      rawText: z
        .string()
        .min(1)
        .describe(
          "Raw unformatted, mojibake-corrupted, or OCR-noisy source text.",
        ),
      aggressiveness: z
        .enum(["conservative", "balanced", "aggressive"])
        .optional(),
      outputMode: z.enum(["document", "snippet"]).optional(),
      targetFormat: z
        .enum([
          "article",
          "elsevier",
          "ieee",
          "springer-nature",
          "ams",
          "acm",
          "siam",
          "aps",
          "oxford-wiley",
        ])
        .optional(),
      useNeuralRefinement: z
        .boolean()
        .optional()
        .describe(
          "When true, invoke hybrid-llm neural contextual pass via /api/ai/reconstruct with automatic local ML fallback.",
        ),
      applyToActiveFile: z
        .boolean()
        .optional()
        .describe(
          "Apply the reconstructed LaTeX to the active/main .tex file safely via undoable edit history.",
        ),
      saveAsPath: z
        .string()
        .optional()
        .describe(
          "Optional relative .tex file path (e.g. restored.tex) to create with the reconstructed manuscript.",
        ),
    }),
    execute: async (
      input: {
        rawText: string;
        aggressiveness?: ReconstructionAggressiveness;
        outputMode?: ReconstructionOutputMode;
        targetFormat?: ReconstructionTargetFormat;
        useNeuralRefinement?: boolean;
        applyToActiveFile?: boolean;
        saveAsPath?: string;
      },
      { toolCallId },
    ) => {
      const options = {
        aggressiveness: input.aggressiveness ?? "balanced",
        outputMode: input.outputMode ?? "document",
        targetFormat: input.targetFormat ?? "article",
      } as const;

      let result: ReconstructionResult;
      if (input.useNeuralRefinement) {
        try {
          const response = await fetch("/api/ai/reconstruct", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              rawText: input.rawText,
              mode: "hybrid-llm",
              ...options,
            }),
          });
          if (response.ok) {
            result = (await response.json()) as ReconstructionResult;
          } else {
            result = reconstructTextLocal(input.rawText, options);
          }
        } catch {
          result = reconstructTextLocal(input.rawText, options);
        }
      } else {
        result = reconstructTextLocal(input.rawText, options);
      }

      const turnId = currentAgentTurnId();
      let savedTo: string | null = null;
      let appliedTo: string | null = null;

      if (input.saveAsPath) {
        const normalized = input.saveAsPath.replace(/^\/+/, "");
        const latest = useDocumentStore.getState();
        const fileId = latest.addFile({
          name: normalized.split("/").pop() || normalized,
          path: normalized,
          type: "tex",
          content: result.reconstructedLatex,
        });
        recordAgentFileCreate({
          turnId,
          toolCallId: `${toolCallId}:create`,
          fileId,
          filePath: normalized,
          content: result.reconstructedLatex,
        });
        latest.requestCompile();
        savedTo = normalized;
      } else if (input.applyToActiveFile) {
        const latest = useDocumentStore.getState();
        const activeTex = latest.files.find(
          (f) => f.id === latest.activeFileId && isLatexDocumentFile(f),
        );
        const mainTex = latest.files.find(
          (f) => f.id === latest.mainFileId && isLatexDocumentFile(f),
        );
        const target =
          activeTex ??
          mainTex ??
          latest.files.find((f) => isLatexDocumentFile(f));

        if (target && target.type === "tex") {
          const before = target.content ?? "";
          let after = result.reconstructedLatex;
          if (
            options.outputMode === "snippet" &&
            before.includes("\\begin{document}")
          ) {
            const safeOffset = clampBeforeEndDocument(
              before,
              latest.activeFileId === target.id
                ? latest.cursorPosition
                : before.length,
            );
            after = `${before.slice(0, safeOffset)}\n${result.reconstructedLatex}\n${before.slice(safeOffset)}`;
          }

          const editResult = await applyAgentEdit({
            turnId,
            toolCallId: `${toolCallId}:apply`,
            fileId: target.id,
            before,
            after,
            applied: [],
          });
          if (editResult.ok) {
            latest.requestCompile();
            appliedTo = target.path;
          }
        }
      }

      return {
        success: true,
        engine: result.engine,
        beforeTelemetry: result.beforeTelemetry,
        afterTelemetry: result.afterTelemetry,
        repairCount: result.repairs.length,
        blockCount: result.blocks.length,
        lintErrorCount: result.lintAfterIssues.filter(
          (i) => i.severity === "error",
        ).length,
        blocksSummary: result.blocks.slice(0, 12).map((b) => ({
          index: b.index,
          label: b.label,
          confidence: b.confidence,
        })),
        reconstructedLatex: result.reconstructedLatex,
        appliedTo,
        savedTo,
        fallbackNotice: result.fallbackNotice,
        notes: result.notes,
      };
    },
  });

  return null;
};
