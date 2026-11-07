import Link from "next/link";

import { LinkTabs } from "@/components/shared/link-tabs";

/** Tabs between the three append-only logs. */
export function AuditNav() {
  return (
    <LinkTabs
      label="Log type"
      items={[
        { href: "/admin/audit", label: "Audit trail", match: "exact" },
        { href: "/admin/audit/security", label: "Security events" },
        { href: "/admin/audit/data-access", label: "Data access" },
      ]}
    />
  );
}

/** Expandable metadata (JSON) for one log entry. Metadata never holds secrets by contract. */
export function MetadataDetails({ metadata, extra }: { metadata: Record<string, unknown>; extra?: Record<string, string | null | undefined> }) {
  const extras = Object.entries(extra ?? {}).filter(([, v]) => v);
  const hasMeta = metadata && Object.keys(metadata).length > 0;
  if (!hasMeta && !extras.length) return <span className="text-muted-foreground">—</span>;
  return (
    <details className="group max-w-full text-left">
      <summary className="cursor-pointer text-sm font-medium text-teal-strong underline-offset-4 hover:underline">Details</summary>
      <div className="mt-2 space-y-2">
        {extras.length ? (
          <dl className="grid gap-1 text-xs">
            {extras.map(([k, v]) => (
              <div key={k} className="flex flex-wrap gap-1">
                <dt className="text-muted-foreground">{k}:</dt>
                <dd className="break-all">{v}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {hasMeta ? (
          <pre className="max-h-72 max-w-[min(36rem,80vw)] overflow-auto whitespace-pre-wrap break-all rounded-lg bg-surface-subtle p-3 text-xs">{JSON.stringify(metadata, null, 2)}</pre>
        ) : null}
      </div>
    </details>
  );
}

export function PersonLink({ id, name, fallback, canOpen }: { id: string | null; name: string | null; fallback: string; canOpen: boolean }) {
  if (!id) return <span className="text-muted-foreground">{fallback}</span>;
  const label = name ?? "Deleted account";
  return canOpen ? (
    <Link href={`/admin/users/${id}`} className="relative z-10 font-medium text-foreground underline-offset-4 hover:underline">
      {label}
    </Link>
  ) : (
    <span className="font-medium">{label}</span>
  );
}

export const AUDIT_EXPORT_LIMIT = 10_000;
