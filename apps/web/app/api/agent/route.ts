import { NextResponse } from "next/server";
import { runAgentTurn, type AgentFile } from "@/lib/ai/agent-backend";
import { chatRatelimit, rateLimitResponse } from "@/lib/ratelimit";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

interface AgentRequest {
  prompt?: unknown;
  context?: unknown;
  files?: unknown;
}

function readFiles(value: unknown): AgentFile[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (file): file is AgentFile =>
        Boolean(file) &&
        typeof file === "object" &&
        typeof (file as AgentFile).path === "string" &&
        typeof (file as AgentFile).content === "string",
    )
    .slice(0, 200);
}

/**
 * Opt-in local-agent backend.
 *
 * This spawns an agent CLI on the host, which can read and write files and run
 * commands. It is disabled unless AGENT_BACKEND=1, because enabling it on a
 * shared deployment turns the app into a remote code execution surface.
 */
export async function POST(req: Request) {
  if (process.env.AGENT_BACKEND !== "1") {
    return NextResponse.json(
      {
        error:
          "The local agent backend is disabled. Set AGENT_BACKEND=1 in apps/web/.env.local to enable it on a machine you control.",
      },
      { status: 404 },
    );
  }

  const limited = await rateLimitResponse(chatRatelimit, req);
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as AgentRequest;
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const context = typeof body.context === "string" ? body.context : "";
  const files = readFiles(body.files);

  if (!prompt) {
    return NextResponse.json({ error: "No prompt provided." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      };

      try {
        for await (const event of runAgentTurn({
          prompt,
          context,
          files,
          signal: req.signal,
        })) {
          send(event);
        }
      } catch (error) {
        send({
          type: "error",
          message:
            error instanceof Error ? error.message : "The agent failed to run.",
        });
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
