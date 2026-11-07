/**
 * Minimal structured logger. JSON lines in production (picked up by the host's log
 * pipeline / Application Insights / Vercel), readable output in development.
 * Never log secrets, OTPs, passwords, tokens or document contents.
 */
type Level = "debug" | "info" | "warn" | "error";

function serializeError(err: unknown) {
  if (err instanceof Error) return { name: err.name, message: err.message, stack: err.stack };
  return err;
}

function write(level: Level, message: string, context?: Record<string, unknown>) {
  const ctx = context ? Object.fromEntries(Object.entries(context).map(([k, v]) => [k, k === "error" ? serializeError(v) : v])) : undefined;
  if (process.env.NODE_ENV === "production") {
    const line = JSON.stringify({ level, time: new Date().toISOString(), message, ...ctx });
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
    return;
  }
  if (level === "debug" && !process.env.DEBUG) return;
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  fn(`[${level}] ${message}`, ctx ?? "");
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => write("debug", message, context),
  info: (message: string, context?: Record<string, unknown>) => write("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => write("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => write("error", message, context),
};
