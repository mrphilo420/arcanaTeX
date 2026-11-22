import { generateText } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { chatErrorMessage } from "@/lib/ai/chat-errors";
import { parseRepairedJson } from "@/lib/ai/json-repair";
import { resolveChatModel } from "@/lib/ai/llm-providers";
import { resolveModelBudget } from "@/lib/ai/request-budget";
import {
  analyzeTextCorruption,
  type BlockLabel,
  type ReconstructionResult,
  reconstructTextLocal,
  type TokenRepair,
  verifyReconstructedLatex,
} from "@/lib/text-reconstructor";

export const runtime = "nodejs";
export const maxDuration = 60;

const BLOCK_LABELS = [
  "title",
  "author",
  "abstract",
  "heading",
  "subheading",
  "theorem_env",
  "proof_env",
  "equation",
  "list_item",
  "table_block",
  "reference",
  "prose",
] as const;

const requestSchema = z.object({
  rawText: z.string().trim().min(1).max(120_000),
  mode: z.enum(["local-ml", "hybrid-llm"]).default("hybrid-llm"),
  aggressiveness: z
    .enum(["conservative", "balanced", "aggressive"])
    .default("balanced"),
  outputMode: z.enum(["document", "snippet"]).default("document"),
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
    .default("article"),
  model: z.string().optional(),
  labelOverrides: z.record(z.string(), z.enum(BLOCK_LABELS)).optional(),
});

const llmResponseSchema = z.object({
  reconstructedLatex: z.string().min(10),
  cleanedPlainText: z.string().optional(),
  semanticRepairs: z
    .array(
      z.object({
        original: z.string(),
        repaired: z.string(),
        reason: z.string().default("Neural contextual restoration"),
      }),
    )
    .max(60)
    .default([]),
  notes: z.array(z.string()).max(20).default([]),
});

function toNumericOverrides(
  raw?: Record<string, BlockLabel>,
): Partial<Record<number, BlockLabel>> | undefined {
  if (!raw) return undefined;
  const out: Partial<Record<number, BlockLabel>> = {};
  for (const [k, v] of Object.entries(raw)) {
    const num = Number(k);
    if (Number.isInteger(num) && num >= 0) {
      out[num] = v;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export async function POST(request: Request) {
  let parsed: z.infer<typeof requestSchema>;
  try {
    parsed = requestSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Invalid reconstruction request. Provide non-empty rawText." },
      { status: 400 },
    );
  }

  const labelOverrides = toNumericOverrides(parsed.labelOverrides);

  // Stages 1-5 always run locally first as deterministic foundation
  const localResult: ReconstructionResult = reconstructTextLocal(
    parsed.rawText,
    {
      aggressiveness: parsed.aggressiveness,
      outputMode: parsed.outputMode,
      targetFormat: parsed.targetFormat,
      labelOverrides,
    },
  );

  if (parsed.mode === "local-ml") {
    return NextResponse.json(localResult);
  }

  const resolvedModel = await resolveChatModel(parsed.model);
  if (!resolvedModel) {
    return NextResponse.json({
      ...localResult,
      fallbackNotice:
        "No LLM provider configured — completed with the local 5-stage statistical ML pipeline.",
    });
  }

  const budget = resolveModelBudget({
    providerId: resolvedModel.providerId,
    modelId: resolvedModel.modelId,
    value: resolvedModel.value,
  });

  const maxInputChars = Math.min(
    24_000,
    Math.max(4_000, Math.floor((budget.inputTokensPerMinute ?? 16_000) * 1.4)),
  );
  const maxOutputTokens = Math.min(8_192, Math.max(1_536, budget.maxOutput));

  const lowConfBlocks = localResult.blocks
    .filter((b) => b.lowConfidence)
    .slice(0, 12)
    .map(
      (b) =>
        `- Block #${b.index} (${b.label}, conf=${b.confidence}, runnerUp=${b.runnerUpLabel}): ${b.cleanedText.slice(0, 180)}`,
    )
    .join("\n");

  const lintSummary = localResult.lintAfterIssues
    .slice(0, 10)
    .map((issue) => `- [${issue.code}] L${issue.line}: ${issue.message}`)
    .join("\n");

  const rawSlice = parsed.rawText.slice(0, Math.floor(maxInputChars * 0.45));
  const draftSlice = localResult.reconstructedLatex.slice(
    0,
    Math.floor(maxInputChars * 0.55),
  );

  try {
    let neuralParsed: z.infer<typeof llmResponseSchema> | null = null;

    for (let attempt = 0; attempt < 2 && neuralParsed === null; attempt += 1) {
      const response = await generateText({
        model: resolvedModel.model,
        temperature: 0,
        maxOutputTokens,
        ...(resolvedModel.providerId === "groq" ||
        /gpt-oss|gpt-5|(^|\/)o[1-9]/i.test(resolvedModel.modelId)
          ? {
              providerOptions: {
                openai: { reasoningEffort: "low" },
              },
            }
          : {}),
        system: `You are Stage 4b (Neural Contextual Refinement) of a scientific manuscript restoration pipeline in LaTeX.
Reply with ONE valid JSON object and nothing else.

Responsibilities:
1. You receive the original garbled/unformatted text AND a preliminary structured LaTeX draft produced by our 5-stage statistical ML pipeline (Noisy Channel + Viterbi CRF + Symbolic Emitter).
2. Fix remaining severely garbled words, truncated OCR phrases, ambiguous math notation, or split sentences that require semantic context.
3. Preserve ALL mathematical claims, symbols, theorem boundaries, table structure, and citations faithfully — NEVER fabricate data, experiments, citations, or proofs.
4. Keep target format (${parsed.targetFormat}) and outputMode (${parsed.outputMode}) intact. Do not drop \\begin{document} or \\end{document} when outputMode is "document".
5. Escape every LaTeX backslash inside JSON strings (\\\\section, \\\\begin, \\\\frac).

Return exact JSON shape:
{"reconstructedLatex":"...","cleanedPlainText":"...","semanticRepairs":[{"original":"...","repaired":"...","reason":"..."}],"notes":["..."]}`,
        prompt: `Refine this reconstructed LaTeX using the original noisy source.

Target format: ${parsed.targetFormat}
Output mode: ${parsed.outputMode}
Aggressiveness: ${parsed.aggressiveness}

Low-confidence structural blocks from Viterbi decoder:
${lowConfBlocks || "(none)"}

Residual LaTeX linter diagnostics on preliminary draft:
${lintSummary || "(none)"}

=== ORIGINAL GARBLED / UNFORMATTED SOURCE ===
${rawSlice}

=== PRELIMINARY STATISTICAL ML LATEX DRAFT ===
${draftSlice}

Return JSON only.`,
      });

      try {
        const candidate = parseRepairedJson(response.text);
        const checked = llmResponseSchema.safeParse(candidate);
        if (checked.success) {
          neuralParsed = checked.data;
        }
      } catch {
        // Retry once cleanly
      }
    }

    if (!neuralParsed) {
      return NextResponse.json({
        ...localResult,
        fallbackNotice:
          "Neural pass returned unusable JSON — serving verified local 5-stage ML output.",
      });
    }

    // Sanity check document boundaries when full document requested
    if (
      parsed.outputMode === "document" &&
      (!neuralParsed.reconstructedLatex.includes("\\begin{document}") ||
        !neuralParsed.reconstructedLatex.includes("\\end{document}"))
    ) {
      return NextResponse.json({
        ...localResult,
        fallbackNotice:
          "Neural output dropped document boundaries — kept verified local 5-stage ML output.",
      });
    }

    // Closed-loop Stage 5 verification on neural output
    const neuralVerification = verifyReconstructedLatex(
      neuralParsed.reconstructedLatex,
    );
    const localErrors = localResult.lintAfterIssues.filter(
      (i) => i.severity === "error",
    ).length;
    const neuralErrors = neuralVerification.afterIssues.filter(
      (i) => i.severity === "error",
    ).length;

    if (neuralErrors > localErrors + 1) {
      return NextResponse.json({
        ...localResult,
        fallbackNotice:
          "Neural refinement introduced structural LaTeX errors — kept verified local ML output.",
      });
    }

    const extraRepairs: TokenRepair[] = neuralParsed.semanticRepairs.map(
      (r) => ({
        original: r.original,
        repaired: r.repaired,
        kind: "ocr-channel",
        confidence: 0.91,
        reason: r.reason || "Neural contextual refinement",
      }),
    );

    const cleanedPlain =
      neuralParsed.cleanedPlainText?.trim() || localResult.cleanedPlainText;
    const afterTelemetry = analyzeTextCorruption(cleanedPlain);

    const mergedResult: ReconstructionResult = {
      ...localResult,
      engine: "hybrid-llm",
      reconstructedLatex: neuralVerification.verifiedLatex,
      bodyLatex:
        parsed.outputMode === "snippet"
          ? neuralVerification.verifiedLatex
          : localResult.bodyLatex,
      cleanedPlainText: cleanedPlain,
      afterTelemetry,
      repairs: [...localResult.repairs, ...extraRepairs],
      lintBeforeCount:
        localResult.lintBeforeCount + neuralVerification.beforeCount,
      lintAfterIssues: neuralVerification.afterIssues,
      safeFixesApplied:
        localResult.safeFixesApplied + neuralVerification.safeFixesApplied,
      notes: [
        ...localResult.notes,
        ...neuralParsed.notes,
        `Hybrid neural refinement completed via ${resolvedModel.providerLabel} (${resolvedModel.modelId}).`,
      ],
    };

    return NextResponse.json(mergedResult);
  } catch (error) {
    return NextResponse.json({
      ...localResult,
      fallbackNotice: `Neural refinement unavailable (${chatErrorMessage(error)}) — served verified local 5-stage ML output.`,
    });
  }
}
