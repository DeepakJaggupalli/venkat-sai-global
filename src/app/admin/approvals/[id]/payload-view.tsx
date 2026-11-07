import type { ReactNode } from "react";

import { FileLink } from "@/components/files";
import { DateText } from "@/components/shared/date-text";
import { SafeHtml } from "@/components/shared/safe-html";
import type { FileSummary } from "@/modules/files/types";
import { humanize } from "@/lib/format";
import { sanitizeRichText } from "@/lib/sanitize";

import { UUID } from "../_lib/payload";

/**
 * Renders the frozen payload snapshot of an approval request, whatever its type: scalars as a
 * definition list, nested objects as sub-sections, lists of records as compact cards. File ids that
 * the viewer may open become document links (resolved and access-checked by the page).
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;
const SECRET_KEY = /(password|secret|token|hash|encrypted|ip$|ipHash)/i;
const MAX_DEPTH = 4;

export function PayloadView({ payload, files }: { payload: Record<string, unknown>; files: Map<string, FileSummary> }) {
  const entries = Object.entries(payload ?? {}).filter(([k]) => !SECRET_KEY.test(k));
  if (!entries.length) return <p className="text-sm text-muted-foreground">This request has no submitted snapshot.</p>;
  return <ObjectView value={Object.fromEntries(entries)} files={files} depth={0} />;
}

function ObjectView({ value, files, depth }: { value: Record<string, unknown>; files: Map<string, FileSummary>; depth: number }) {
  const scalars: [string, unknown][] = [];
  const nested: [string, unknown][] = [];
  for (const [k, v] of Object.entries(value)) {
    if (SECRET_KEY.test(k)) continue;
    if (v !== null && typeof v === "object" && !(Array.isArray(v) && v.every((x) => x === null || typeof x !== "object"))) nested.push([k, v]);
    else scalars.push([k, v]);
  }
  return (
    <div className="space-y-4">
      {scalars.length ? (
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {scalars.map(([k, v]) => (
            <div key={k} className={typeof v === "string" && v.length > 80 ? "min-w-0 sm:col-span-2" : "min-w-0"}>
              <dt className="text-xs font-medium text-muted-foreground">{humanize(k)}</dt>
              <dd className="mt-0.5 text-sm break-words text-foreground">{renderScalar(k, v, files)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {nested.map(([k, v]) => (
        <div key={k} className="space-y-2">
          <h3 className="font-heading text-sm font-semibold text-foreground">{humanize(k)}</h3>
          {depth >= MAX_DEPTH ? (
            <pre className="max-h-48 overflow-auto rounded-md bg-surface-subtle p-2 text-xs">{JSON.stringify(v, null, 2)}</pre>
          ) : Array.isArray(v) ? (
            v.length ? (
              <ul className="grid gap-2">
                {v.map((item, i) => (
                  <li key={i} className="rounded-lg border border-border p-3">
                    {item && typeof item === "object" ? (
                      <ObjectView value={item as Record<string, unknown>} files={files} depth={depth + 1} />
                    ) : (
                      <span className="text-sm">{renderScalar(k, item, files)}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">None</p>
            )
          ) : (
            <div className="rounded-lg border border-border p-3">
              <ObjectView value={v as Record<string, unknown>} files={files} depth={depth + 1} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function renderScalar(key: string, v: unknown, files: Map<string, FileSummary>): ReactNode {
  if (v === null || v === undefined || v === "") return <span className="text-muted-foreground">Not provided</span>;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return v.toLocaleString("en-IN");
  if (Array.isArray(v)) {
    if (!v.length) return <span className="text-muted-foreground">None</span>;
    if (/fileids$/i.test(key)) return <span className="flex flex-col gap-1">{v.map((id) => <span key={String(id)}>{renderScalar("fileId", id, files)}</span>)}</span>;
    return v.map((x) => String(x)).join(", ");
  }
  const s = String(v);
  if (/fileid$/i.test(key) && UUID.test(s)) {
    const file = files.get(s);
    return file ? <FileLink file={file} /> : <span className="text-muted-foreground">Document not available to you</span>;
  }
  if (/html$/i.test(key)) return <SafeHtml html={sanitizeRichText(s)} />;
  if (ISO_DATE.test(s)) return <DateText value={s} mode={s.length > 10 ? "datetime" : "date"} dateOnly={s.length === 10} />;
  if (/^https?:\/\//i.test(s)) {
    return (
      <a href={s} target="_blank" rel="noopener noreferrer nofollow" className="text-teal-strong underline underline-offset-4">
        {s}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }
  return /status$|type$|kind$|mode$/i.test(key) && /^[a-z_]+$/.test(s) ? humanize(s) : <span className="whitespace-pre-line">{s}</span>;
}
