import { tool, type LanguageModel, type ToolSet } from "ai";
import { z } from "zod";
import { runLocalCode } from "@/lib/code-runner";
import { runSubagents, subagentTaskSchema } from "@/lib/ai/subagents";
import {
  ARCANA_PLOT_PY,
  matplotlibSpecSchema,
  runMatplotlibSpec,
} from "@/lib/matplotlib-helper";

const codeFileSchema = z.object({
  path: z
    .string()
    .min(1)
    .max(240)
    .describe("Relative path for an input file, for example data.csv"),
  content: z.string().max(20_000).describe("Complete UTF-8 file content"),
});

const codeInputSchema = z.object({
  code: z.string().min(1).max(60_000).describe("The complete script to run"),
  timeoutMs: z
    .number()
    .int()
    .min(1_000)
    .max(30_000)
    .optional()
    .describe("Optional timeout in milliseconds; default 20000"),
  files: z
    .array(codeFileSchema)
    .max(8)
    .optional()
    .describe("Optional input files written beside the script"),
});

const subagentInputSchema = z.object({
  context: z
    .string()
    .max(24_000)
    .optional()
    .describe("Shared project or task context for every subagent"),
  tasks: z.array(subagentTaskSchema).min(1).max(4),
});

function codeTool(language: "python" | "r", modelLabel: string) {
  return tool({
    description: `${modelLabel} execution in an isolated temporary directory. Use it to run, test, or validate ${modelLabel} code, process data, compute geometry, or write a complete TikZ/PGF artifact (for example figure.tex). Prefer direct TikZ for simple LaTeX figures. Never claim a script ran before this tool returns.`,
    inputSchema: codeInputSchema,
    execute: async (input) => {
      try {
        const files =
          language === "python" &&
          !input.files?.some((file) => file.path === "arcana_plot.py")
            ? [
                ...(input.files ?? []),
                { path: "arcana_plot.py", content: ARCANA_PLOT_PY },
              ]
            : input.files;
        return await runLocalCode({
          language,
          code: input.code,
          timeoutMs: input.timeoutMs,
          files,
        });
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : `${modelLabel} failed.`,
        };
      }
    },
  });
}

export function createServerTools(model: LanguageModel): ToolSet {
  return {
    plot_matplotlib: tool({
      description:
        "Render a publication-grade Matplotlib plot (line, scatter, bar, errorbar, histogram, boxplot, heatmap) from a compact JSON spec. Python (`arcana_plot.py`) handles all journal sizing, palettes, fonts, and PDF/PNG/SVG export so you spend far fewer tokens. Prefer this over writing Matplotlib styling boilerplate in `run_python`.",
      inputSchema: matplotlibSpecSchema,
      execute: async (input) => {
        try {
          return await runMatplotlibSpec(input);
        } catch (error) {
          return {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Matplotlib plot failed.",
          };
        }
      },
    }),
    run_python: codeTool("python", "Python"),
    run_r: codeTool("r", "R"),
    spawn_subagents: tool({
      description:
        "Delegate independent parts of a task to up to four parallel subagents. Use this for complex TikZ figure requests, for example one Python geometry agent, one R/statistics agent, and one TikZ reviewer. Each subagent has no project tools and cannot execute code; give it focused context. Verify and synthesize its answer before inserting anything.",
      inputSchema: subagentInputSchema,
      execute: async (input) => {
        try {
          const results = await runSubagents({
            model,
            context: input.context,
            tasks: input.tasks,
          });
          return {
            success: results.every((result) => !result.error),
            results,
            succeeded: results.filter((result) => !result.error).length,
            failed: results.filter((result) => result.error).length,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Subagents failed.",
          };
        }
      },
    }),
  };
}
