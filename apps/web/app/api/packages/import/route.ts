import { NextResponse } from "next/server";
import { z } from "zod";
import {
  fetchArxivSourcePackage,
  MAX_ARCHIVE_UPLOAD_BYTES,
  unpackResearchPackageBuffer,
} from "@/lib/archive-unpacker";

export const runtime = "nodejs";
export const maxDuration = 60;

const arxivRequestSchema = z.object({
  arxivId: z.string().trim().min(3).max(240),
  applySafeFixes: z.boolean().optional(),
});

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "Could not parse multipart upload payload." },
        { status: 400 },
      );
    }

    const uploaded = formData.get("file");
    if (!(uploaded instanceof File)) {
      return NextResponse.json(
        { error: "Missing archive or research file in 'file' field." },
        { status: 400 },
      );
    }

    if (uploaded.size > MAX_ARCHIVE_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          error: `Upload exceeds the ${Math.round(MAX_ARCHIVE_UPLOAD_BYTES / (1024 * 1024))} MB package limit.`,
        },
        { status: 413 },
      );
    }

    const applySafeFixes = formData.get("applySafeFixes") === "true";

    try {
      const arrayBuf = await uploaded.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      const result = await unpackResearchPackageBuffer(buffer, uploaded.name, {
        applySafeFixes,
      });
      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to unpack research archive.",
        },
        { status: 422 },
      );
    }
  }

  let parsedJson: z.infer<typeof arxivRequestSchema>;
  try {
    parsedJson = arxivRequestSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      {
        error: "Invalid request body. Expected multipart file or { arxivId }.",
      },
      { status: 400 },
    );
  }

  try {
    const result = await fetchArxivSourcePackage(parsedJson.arxivId, {
      applySafeFixes: parsedJson.applySafeFixes,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch arXiv package.";
    const status = message.includes("valid arXiv ID") ? 400 : 422;
    return NextResponse.json({ error: message }, { status });
  }
}
