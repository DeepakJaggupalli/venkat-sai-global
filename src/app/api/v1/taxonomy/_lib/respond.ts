import "server-only";

import { NextResponse } from "next/server";

/**
 * Response helpers for the public, read-only taxonomy endpoints. Results are reference data, safe to
 * cache briefly in the browser only ("private" keeps shared caches out of it).
 */
const OK_HEADERS = { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" } as const;
const NO_STORE = { "Cache-Control": "no-store" } as const;

export function jsonItems<T>(items: T[]): NextResponse<{ items: T[] }> {
  return NextResponse.json({ items }, { headers: OK_HEADERS });
}

export function jsonError(message: string, status: 400 | 500): NextResponse<{ error: string }> {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE });
}
