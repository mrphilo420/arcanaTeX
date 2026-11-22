import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

const isConfigured =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = isConfigured
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

export const chatRatelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, "1m"),
      prefix: "openprism::ratelimit::chat",
    })
  : null;

export const compileRatelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, "1m"),
      prefix: "openprism::ratelimit::compile",
    })
  : null;

export function getIP(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  return xff ? xff.split(",")[0].trim() : "127.0.0.1";
}

/**
 * Applies `limiter` to the caller's IP. Returns a 429 response when the limit
 * is exceeded, or null when the request may proceed (or no limiter is set).
 */
export async function rateLimitResponse(
  limiter: Ratelimit | null,
  req: Request,
): Promise<NextResponse | null> {
  if (!limiter) return null;

  const { success, limit, remaining, reset } = await limiter.limit(getIP(req));
  if (success) return null;

  return NextResponse.json(
    { error: "Too many requests" },
    {
      status: 429,
      headers: {
        "X-RateLimit-Limit": limit.toString(),
        "X-RateLimit-Remaining": remaining.toString(),
        "X-RateLimit-Reset": reset.toString(),
      },
    },
  );
}
