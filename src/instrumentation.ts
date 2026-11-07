import type { Instrumentation } from "next";

import { logger } from "@/lib/logger";

/**
 * Server instrumentation: structured logging of errors Next.js catches while rendering pages,
 * running Route Handlers, Server Actions or the proxy. Logged as JSON lines in production
 * (Vercel / Azure / any log pipeline). Never logs headers, cookies, query strings or bodies —
 * they can carry tokens and personal data.
 */
export function register(): void {
  // No tracing exporter is configured; hook OpenTelemetry in here if one is added later.
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const err = error instanceof Error ? error : null;
  const digest = typeof error === "object" && error !== null && "digest" in error ? String((error as { digest?: unknown }).digest) : undefined;
  const header = (name: string) => {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0] : value;
  };
  logger.error("Unhandled request error", {
    error: err ? { name: err.name, message: err.message, stack: err.stack } : String(error),
    digest,
    method: request.method,
    // Path only: query strings may contain tokens (reset links, OAuth codes).
    path: request.path.split("?")[0],
    requestId: header("x-request-id") ?? header("x-vercel-id") ?? null,
    routePath: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
    renderSource: "renderSource" in context ? context.renderSource : undefined,
    revalidateReason: context.revalidateReason ?? null,
  });
};
