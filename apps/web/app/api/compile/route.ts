import { NextResponse } from "next/server";
import { toApiResources } from "@/lib/compile-resources";
import {
  classifyUpstreamFailure,
  describeUpstreamFailure,
} from "@/lib/compile-errors";
import { compileRatelimit, rateLimitResponse } from "@/lib/ratelimit";

export const maxDuration = 60;

interface CompileResource {
  path: string;
  content?: string;
  file?: string;
  main?: boolean;
}

export async function POST(req: Request) {
  const limited = await rateLimitResponse(compileRatelimit, req);
  if (limited) return limited;

  try {
    const {
      resources,
      compiler,
      includeLog = false,
    } = (await req.json()) as {
      resources: CompileResource[];
      compiler?: string;
      includeLog?: boolean;
    };

    if (!resources || resources.length === 0) {
      return NextResponse.json(
        { error: "No resources provided" },
        { status: 400 },
      );
    }

    const latexCompiler =
      compiler === "tectonic" ||
      compiler === "xelatex" ||
      compiler === "lualatex"
        ? compiler
        : "pdflatex";

    const apiResources = toApiResources(resources);

    const latexApiUrl = process.env.LATEX_API_URL || "http://localhost:3001";
    const response = await fetch(`${latexApiUrl}/builds/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        compiler: latexCompiler,
        resources: apiResources,
        includeLog,
      }),
      signal: req.signal,
    });

    const contentType = response.headers.get("content-type") ?? "";

    if (
      !response.ok ||
      (includeLog && !contentType.includes("application/json"))
    ) {
      const bodyText = await response.text();
      let errorData: { log_files?: Record<string, string>; log?: string } = {};
      if (contentType.includes("application/json")) {
        try {
          errorData = JSON.parse(bodyText);
        } catch {}
      }
      const errorMessage = describeUpstreamFailure(
        response.status,
        contentType,
        bodyText,
      );
      const logContent =
        errorData.log_files?.["__main_document__.log"] ?? errorData.log ?? "";
      const kind = classifyUpstreamFailure({
        status: response.status,
        contentType,
        hasLog: logContent.trim().length > 0,
      });
      const errorLines = logContent
        .split("\n")
        .filter(
          (line: string) =>
            line.includes("Error") ||
            line.includes("!") ||
            line.includes("Missing"),
        )
        .slice(0, 10)
        .join("\n");
      const errorText = /^compilation failed/i.test(errorMessage)
        ? errorMessage
        : `Compilation failed: ${errorMessage}`;
      return NextResponse.json(
        {
          error: errorText,
          details: errorLines || logContent.slice(-1000),
          log: logContent.slice(-200_000),
          kind,
        },
        { status: 500 },
      );
    }

    if (includeLog) {
      const result = (await response.json()) as {
        pdf?: string;
        log?: string;
      };

      if (!result.pdf) {
        return NextResponse.json(
          {
            error: "Compilation returned no PDF",
            log: result.log ?? "",
            kind: "latex",
          },
          { status: 500 },
        );
      }

      return NextResponse.json({
        pdf: result.pdf,
        log: result.log ?? "",
      });
    }

    const pdfBuffer = await response.arrayBuffer();

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename=document.pdf",
      },
    });
  } catch (error) {
    console.error("Compilation error:", error);
    const aborted =
      error instanceof DOMException && error.name === "AbortError";
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unknown compilation error",
        kind: aborted ? "aborted" : "network",
      },
      { status: aborted ? 499 : 502 },
    );
  }
}
