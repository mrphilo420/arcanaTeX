import { frontendTools } from "@assistant-ui/react-ai-sdk";
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type ToolSet,
  type UIMessage,
} from "ai";
import { NextResponse } from "next/server";
import {
  getPeerReviewInvocation,
  LEAN_SYSTEM_GUIDE,
  PEER_REVIEW_SKILL,
} from "@/lib/chat-skills/paper-review";
import {
  getHourglassInvocation,
  HOURGLASS_SKILL,
  hourglassNeedsEdits,
} from "@/lib/chat-skills/hourglass";
import {
  getPaperAuditInvocation,
  PAPER_AUDIT_SKILL,
} from "@/lib/chat-skills/paper-audit";
import { BIBTEX_SKILL, getBibtexInvocation } from "@/lib/chat-skills/bibtex";
import {
  getMathematicalProverInvocation,
  MATHEMATICAL_PROVER_SKILL,
} from "@/lib/chat-skills/mathematical-prover";
import {
  getProofreadInvocation,
  PROOFREAD_SKILL,
} from "@/lib/chat-skills/proofread";
import { createServerTools } from "@/lib/ai/server-tools";
import { chatErrorMessage, providerErrorDetail } from "@/lib/ai/chat-errors";
import {
  capOutputTokens,
  planChatRequest,
  resolveModelBudget,
  type ToolLane,
} from "@/lib/ai/request-budget";
import {
  recordLimitFromError,
  recordLimitFromHeaders,
} from "@/lib/ai/model-limits";
import { resolveChatModel } from "@/lib/ai/llm-providers";
import { chatRatelimit, rateLimitResponse } from "@/lib/ratelimit";

export const maxDuration = 300;

const SYSTEM_PROMPT = `You are a research-writing and formalization assistant inside arcanaTeX, a local-first LaTeX and Lean 4 workspace.

LaTeX: use correct syntax, explain the change, and put code in \`\`\`latex blocks.
Lean: use Lean 4 syntax, preserve declaration names and implicit arguments, and explain the goal state. Treat sorry/admit as incomplete proofs and axiom, native_decide, unsafe or partial as trust risks. Never claim a proof compiles or is kernel-checked without build output or check_lean_candidate evidence.

The user's project structure, active file, main document and any Lean summaries are in the context. Use the tools to read anything you were not given; do not treat a truncated excerpt as complete.

Editing: only change the document when the user asks for a change. Questions, explanations, proofreading and conversation get a reply in chat and no edit. When an edit is requested, prefer insert_latex, find_and_replace or replace_selection over rewriting a whole file; use write_project_file for new files or whole-file replacement, and change the main document only when asked. When the user, a diagnostic, or a selection names a line, pass the 1-based 'line' to insert_latex or create_tikz_figure instead of guessing an anchor; use position="after" when the block should follow that line. If an anchor would be ambiguous, or the change is repetitive or easier to express as code, use edit_with_python: the app runs your Python against input.tex and applies the diff from output.tex, and a failed script returns stderr so you can fix it and call again.

Precision & Long Manuscripts (Overleaf / Prism best practices):
- Use lint_latex_document to detect ill-formed LaTeX (unbalanced braces, unclosed environments, unclosed math delimiters, missing references/bibkeys, unescaped &/#, or typography/arXiv package traps) with exact line numbers before or after editing.
- Never alter LaTeX macros, citation keys, or equations casually. For long manuscripts (12k+ chars), compress first with compress_and_index_document to obtain the compact manuscript outline and token-reduced map, inspect target sections via read_document_chunk (which includes the thesis & neighbor context envelope), stage safe revisions with stage_chunk_revision, and assemble + commit atomically via paste_whole_revision (which snapshots version history before applying).
- Prioritize preprint readiness first (arXiv 00README.json, .bbl, hyperref option separation; bioRxiv/medRxiv fresh PDF + statements; HAL/OSF) before peer-reviewed journal checks (CRediT, Data Availability, AI disclosure).
- For charts, convergence curves, benchmarks, distributions, heatmaps, surfaces, and computational flowcharts requested by the user, prefer generate_scientific_figure (which deduces journal specs & layout coordinates, compiles self-contained Python matplotlib/numpy or R ggplot2/base-R scripts, renders publication PDF/PNG/SVG artifacts via /api/code/run, saves them to the project, and inserts the figure block into the manuscript).
- When the user pastes heavily garbled, mojibake-corrupted, OCR-noisy, or unformatted notes/PDF copy-pastes, use reconstruct_garbled_text to run the 5-stage ML text restoration & Viterbi structural decoder and verify the LaTeX cleanly before inserting or saving.

Technical paper review (/paper-review) writes exactly one review file under paper-reviews/ and never edits the manuscript. Peer review (/peer-review) and proofreading (/proofread) are read-only. The hourglass paper writer (/hourglass) may edit only in draft and revise modes; diagnose, review, outline, and extract are read-only. Proving (/prove) requires check_lean_candidate evidence and sends changes through propose_patch.`;

const MANUSCRIPT_EDIT_TOOLS = new Set([
  "insert_latex",
  "replace_selection",
  "find_and_replace",
  "write_project_file",
  "set_main_document",
  "edit_with_python",
  "create_tikz_figure",
  "generate_scientific_figure",
  "reconstruct_garbled_text",
  "paste_whole_revision",
]);

const READ_ONLY_BLOCKED_TOOLS = new Set([
  ...MANUSCRIPT_EDIT_TOOLS,
  "propose_patch",
  "patch_bibtex",
]);

interface ChatMessageLike {
  role?: string;
  content?: unknown;
  parts?: Array<{ type?: string; text?: string }>;
  [key: string]: unknown;
}

function messageText(message: ChatMessageLike): string {
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return typeof part.text === "string" ? part.text : "";
        }
        return "";
      })
      .join("\n");
  }
  if (Array.isArray(message.parts)) {
    return message.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text ?? "")
      .join("\n");
  }
  return "";
}

function latestUserText(messages: ChatMessageLike[]): string {
  const latest = [...messages]
    .reverse()
    .find((message) => message.role === "user");
  return latest ? messageText(latest) : "";
}

function withoutTools(tools: unknown, blocked: ReadonlySet<string>): unknown {
  if (!tools || typeof tools !== "object") return tools;
  return Object.fromEntries(
    Object.entries(tools).filter(([name]) => !blocked.has(name)),
  );
}

function readOnlyTools(tools: unknown): unknown {
  return withoutTools(tools, READ_ONLY_BLOCKED_TOOLS);
}

function laneForKind(kind: unknown): ToolLane {
  if (kind === "lean") return "lean";
  if (kind === "latex") return "latex";
  if (typeof kind === "string" && kind.length > 0) return "other";
  // Older clients do not send the kind; assume LaTeX so nothing is removed.
  return "latex";
}

export async function POST(req: Request) {
  const limited = await rateLimitResponse(chatRatelimit, req);
  if (limited) return limited;

  const requestId = crypto.randomUUID();
  const payload = await req.json();
  const messages = (Array.isArray(payload.messages)
    ? payload.messages
    : []) as unknown as UIMessage[];
  const volatileContext =
    typeof payload.system === "string" ? payload.system : "";
  const lane = laneForKind(payload.activeFileKind);

  const resolvedModel = await resolveChatModel(payload.model);
  if (!resolvedModel) {
    return NextResponse.json(
      {
        error:
          "No chat model is configured. Add an LLM provider in the developer panel (Models tab), or set GROQ_API_KEY / OPENAI_API_KEY / OPENAI_BASE_URL in apps/web/.env.local.",
        requestId,
      },
      { status: 500 },
    );
  }

  const latestText = latestUserText(messages as unknown as ChatMessageLike[]);
  const hourglass = getHourglassInvocation(latestText);
  const bibtex = hourglass ? null : getBibtexInvocation(latestText);
  const audit =
    hourglass || bibtex ? null : getPaperAuditInvocation(latestText);
  const peer =
    hourglass || bibtex || audit ? null : getPeerReviewInvocation(latestText);
  const proofread =
    hourglass || bibtex || audit || peer
      ? null
      : getProofreadInvocation(latestText);
  const prover =
    hourglass || bibtex || audit || peer || proofread
      ? null
      : getMathematicalProverInvocation(latestText);
  const hourglassReadOnly = hourglass
    ? !hourglassNeedsEdits(hourglass.mode)
    : false;
  const readOnly = Boolean(hourglassReadOnly || audit || peer || proofread);
  const activeTools = prover
    ? withoutTools(payload.tools, MANUSCRIPT_EDIT_TOOLS)
    : bibtex
      ? withoutTools(payload.tools, MANUSCRIPT_EDIT_TOOLS)
      : readOnly
        ? readOnlyTools(payload.tools)
        : payload.tools;

  const staticSystemParts = [
    SYSTEM_PROMPT,
    lane === "lean" ? LEAN_SYSTEM_GUIDE : "",
  ].filter(Boolean);
  if (hourglass) {
    staticSystemParts.push(
      HOURGLASS_SKILL,
      `Hourglass invocation: mode=${hourglass.mode}; explicit=${
        hourglass.explicit ? "true" : "false"
      }; focus=${hourglass.focus || "none"}. ${
        hourglassNeedsEdits(hourglass.mode)
          ? "You may edit the manuscript; every edit is reviewed by the user before it applies."
          : "This mode is read-only; do not modify files. Return the plan or report in chat."
      }`,
    );
  }
  if (bibtex) {
    staticSystemParts.push(
      BIBTEX_SKILL,
      `BibTeX invocation: mode=${bibtex.mode}; explicit=${
        bibtex.explicit ? "true" : "false"
      }; focus=${bibtex.focus || "none"}. ${
        bibtex.explicit
          ? "The user invoked /bibtex."
          : "The user asked to correct the bibliography in natural language."
      } Use patch_bibtex for .bib edits; do not touch .tex files except explicitly requested citation-key updates.`,
    );
  }
  if (audit) {
    staticSystemParts.push(
      PAPER_AUDIT_SKILL,
      `Paper review invocation: explicit=${
        audit.explicit ? "true" : "false"
      }; focus=${audit.focus || "none"}. ${
        audit.explicit
          ? "The user invoked /paper-review."
          : "The user asked for a technical manuscript review in natural language."
      } Return one complete LaTeX review in a single fenced \`\`\`latex block; the app saves it under paper-reviews/. The manuscript stays read-only.`,
    );
  }
  if (peer) {
    staticSystemParts.push(
      PEER_REVIEW_SKILL,
      `Peer review invocation: mode=${peer.mode}; explicit=${
        peer.explicit ? "true" : "false"
      }; focus=${peer.focus || "none"}. ${
        peer.explicit
          ? "The user invoked /peer-review."
          : "The user asked for a simulated peer review in natural language."
      } Edit tools are disabled for this turn; the panel review is read-only.`,
    );
  }
  if (proofread) {
    staticSystemParts.push(
      PROOFREAD_SKILL,
      `Proofread invocation: scope=${proofread.scope}; explicit=${
        proofread.explicit ? "true" : "false"
      }; focus=${proofread.focus || "none"}. Edit tools are disabled for this turn; the report is read-only.`,
    );
  }
  if (prover) {
    staticSystemParts.push(
      MATHEMATICAL_PROVER_SKILL,
      `Prover invocation: mode=${prover.mode}; explicit=${
        prover.explicit ? "true" : "false"
      }; focus=${prover.focus || "none"}. ${
        prover.explicit
          ? "The user invoked /prove."
          : "The user asked for proof work in natural language."
      } Direct edit tools are disabled for this turn. Use check_lean_candidate for evidence and propose_patch for the final change; the user must approve it.`,
    );
  }

  const serverTools = createServerTools(resolvedModel.model);
  const clientTools = activeTools
    ? (frontendTools(activeTools) as unknown as ToolSet)
    : {};
  const allTools = { ...serverTools, ...clientTools } as ToolSet;

  const budget = resolveModelBudget({
    providerId: resolvedModel.providerId,
    modelId: resolvedModel.modelId,
    value: resolvedModel.value,
  });

  const requestedOutput = audit || hourglass || prover ? 4096 : 2048;
  const maxOutputTokens = capOutputTokens(budget, requestedOutput);

  const plan = planChatRequest({
    budget,
    staticSystem: staticSystemParts.join("\n\n"),
    volatileContext,
    messages,
    tools: allTools,
    lane,
  });

  console.info(
    "[chat.preflight]",
    JSON.stringify({
      requestId,
      model: resolvedModel.value,
      lane,
      estimatedInputTokens: plan.estimatedInputTokens,
      limit: plan.limit,
      headroom: plan.headroom,
      maxOutputTokens,
      tools: Object.keys(plan.tools).length,
      trimmed: plan.trimmed,
    }),
  );

  if (plan.overBudget) {
    // Name the actual cause. When every trim step ran and the request is still
    // too large, the message itself is the problem and a new chat cannot help.
    const onlyMessageLeft = plan.trimmed.includes("editor-context-dropped");
    const error = onlyMessageLeft
      ? `This message needs about ${plan.estimatedInputTokens} tokens, but ${resolvedModel.value} allows ${plan.limit} input tokens per request on this plan. Shorten the message, or switch to a provider with a higher per-minute limit.`
      : `This conversation needs about ${plan.estimatedInputTokens} tokens, but ${resolvedModel.value} allows ${plan.limit} on this plan even after trimming older turns. Start a new chat, or switch to a model or provider with a larger limit.`;

    // The client turns this into a compaction job. `messageEstimated` isolates
    // the message from the system prompt and tool schemas, so it knows how much
    // room the compacted text actually has.
    const lastUser = [...messages]
      .reverse()
      .find((message) => message.role === "user");
    const messageEstimated = lastUser
      ? Math.ceil(JSON.stringify(lastUser).length / 3.5)
      : 0;

    return NextResponse.json(
      {
        error,
        code: "context_budget_exceeded",
        limit: plan.limit,
        estimated: plan.estimatedInputTokens,
        messageEstimated,
        messageId:
          lastUser && typeof lastUser.id === "string" ? lastUser.id : undefined,
        requestId,
      },
      { status: 413 },
    );
  }

  const result = streamText({
    model: resolvedModel.model,
    system: plan.system,
    messages: await convertToModelMessages(
      plan.messages as unknown as UIMessage[],
    ),
    maxOutputTokens,
    stopWhen: stepCountIs(prover ? 18 : readOnly ? 16 : 10),
    tools: plan.tools,
  });

  // Learn the real ceiling from the provider instead of trusting our table.
  void Promise.resolve(result.response)
    .then((response) =>
      recordLimitFromHeaders(resolvedModel.value, response.headers),
    )
    .catch(() => {});

  return result.toUIMessageStreamResponse({
    headers: { "x-request-id": requestId },
    onError: (error) => {
      const statusCode =
        error && typeof error === "object" && "statusCode" in error
          ? (error as { statusCode?: number }).statusCode
          : undefined;
      if (statusCode === 413) {
        const detail = providerErrorDetail(error);
        return `The selected model rejected this request before generating anything${detail ? `: ${detail}` : "."} Switch to a model with more headroom, start a new chat to shorten the conversation, or connect a provider with a larger limit.`;
      }
      recordLimitFromError(resolvedModel.value, providerErrorDetail(error));
      const message = chatErrorMessage(error);
      console.error("Chat stream error", { requestId, error });
      return `${message} Model: ${resolvedModel.value}. (ref: ${requestId.slice(0, 8)})`;
    },
  });
}
