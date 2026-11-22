import { NextResponse } from "next/server";
import {
  type CrossrefWork,
  type JournalPublisherFilter,
  type LiteratureResult,
  getCuratedJournalFallback,
  mapCrossrefWork,
} from "@/lib/literature";

export const runtime = "nodejs";
export const maxDuration = 30;

const VALID_PUBLISHERS = new Set<JournalPublisherFilter>([
  "all",
  "elsevier",
  "ieee",
  "springer",
  "acm",
  "math",
]);

const PUBLISHER_FILTERS: Record<JournalPublisherFilter, string> = {
  all: "type:journal-article",
  elsevier: "prefix:10.1016,type:journal-article",
  ieee: "prefix:10.1109",
  springer: "prefix:10.1007",
  acm: "prefix:10.1145",
  math: "prefix:10.1090,prefix:10.1137,type:journal-article",
};

interface CrossrefResponse {
  message?: {
    items?: CrossrefWork[];
    "total-results"?: number;
  };
}

async function queryCrossref(
  query: string,
  filter: string,
): Promise<{
  ok: boolean;
  results: LiteratureResult[];
  total: number;
}> {
  const url =
    "https://api.crossref.org/works?" +
    new URLSearchParams({
      query,
      filter,
      rows: "15",
      mailto: "support@arcanatex.org",
    }).toString();

  const response = await fetch(url, {
    headers: {
      "User-Agent": "arcanaTeX/0.0.1 (mailto:support@arcanatex.org)",
    },
    signal: AbortSignal.timeout(10_000),
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    return { ok: false, results: [], total: 0 };
  }

  const data = (await response.json()) as CrossrefResponse;
  const results = (data.message?.items ?? [])
    .map((item) => mapCrossrefWork(item, "journals"))
    .filter((item): item is LiteratureResult => item !== null);

  return {
    ok: true,
    results,
    total: data.message?.["total-results"] ?? results.length,
  };
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const query = searchParams.get("q")?.trim();
  const rawPublisher = searchParams.get("publisher")?.trim() ?? "all";
  const publisher: JournalPublisherFilter = VALID_PUBLISHERS.has(
    rawPublisher as JournalPublisherFilter,
  )
    ? (rawPublisher as JournalPublisherFilter)
    : "all";

  if (!query) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  if (query.length > 300) {
    return NextResponse.json({ error: "Query is too long" }, { status: 400 });
  }

  try {
    let response = await queryCrossref(query, PUBLISHER_FILTERS[publisher]);

    if (response.ok && publisher === "math" && response.results.length === 0) {
      response = await queryCrossref(
        `${query} mathematics`,
        "type:journal-article",
      );
    }

    if (!response.ok) {
      const fallbackResults = getCuratedJournalFallback(
        query,
        publisher,
        "journals",
      );
      return NextResponse.json({
        results: fallbackResults,
        total: fallbackResults.length,
        publisher,
        fallback: true,
      });
    }

    return NextResponse.json({
      results: response.results,
      total: response.total,
      publisher,
      fallback: false,
    });
  } catch (error) {
    console.warn("Crossref search failed, serving offline fallback", error);
    const fallbackResults = getCuratedJournalFallback(
      query,
      publisher,
      "journals",
    );
    return NextResponse.json({
      results: fallbackResults,
      total: fallbackResults.length,
      publisher,
      fallback: true,
    });
  }
}
