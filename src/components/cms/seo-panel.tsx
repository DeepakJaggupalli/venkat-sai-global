"use client";

import { FormField } from "@/components/shared/form";
import { SectionCard } from "@/components/shared/section-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { CmsSeo } from "@/modules/content/types";
import { cn } from "@/lib/utils";

import { AssetField } from "./asset-field";
import { useCmsEditor } from "./editor-context";
import { errorsAt, SEO_LIMITS, type FieldErrors } from "./field-utils";

function Counter({ length, ideal, max }: { length: number; ideal: number; max: number }) {
  const over = length > max;
  const long = length > ideal;
  return (
    <span className={cn("text-xs tabular-nums", over ? "text-danger-strong" : long ? "text-warning-strong" : "text-muted-foreground")}>
      {length} / {ideal} characters{over ? " (too long)" : long ? " (may be cut off)" : ""}
    </span>
  );
}

/** Search & sharing: SEO title, description, social image, noindex and canonical link, with a search result preview. */
export function SeoPanel({
  seo,
  onChange,
  errors,
  fallbackTitle,
  fallbackDescription,
  publicPath,
}: {
  seo: CmsSeo;
  onChange: (seo: CmsSeo) => void;
  errors: FieldErrors;
  fallbackTitle: string;
  fallbackDescription: string | null;
  publicPath: string | null;
}) {
  const editor = useCmsEditor();
  const disabled = editor.disabled;
  const set = <K extends keyof CmsSeo>(key: K, value: CmsSeo[K] | undefined) => {
    const next = { ...seo } as Record<string, unknown>;
    if (value === undefined || value === "" || value === false) delete next[key];
    else next[key] = value;
    onChange(next as CmsSeo);
  };
  const title = seo.title || fallbackTitle || "Page title";
  const description = seo.description || fallbackDescription || "Add a description so search engines show a helpful summary.";

  return (
    <SectionCard title="Search and sharing" description="How this page appears in Google results and when shared on social media. Leave blank to use the title and summary.">
      <div className="space-y-4">
        <div className="rounded-lg border bg-surface-subtle p-4" aria-label="Search result preview" role="figure">
          <p className="text-xs text-muted-foreground">Search result preview</p>
          <p className="mt-1 truncate text-base font-medium text-info">{title} | Venkat Sai Global</p>
          <p className="truncate text-xs text-success-strong">{publicPath ? `venkatsaiglobal.com${publicPath}` : "venkatsaiglobal.com"}</p>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{description}</p>
          {seo.noindex && <p className="mt-2 text-xs font-medium text-warning-strong">Hidden from search engines</p>}
        </div>

        <FormField label="SEO title" optional errors={errorsAt(errors, "seo.title")} hint={<Counter length={(seo.title ?? "").length} ideal={SEO_LIMITS.idealTitle} max={SEO_LIMITS.title} />}>
          <Input value={seo.title ?? ""} maxLength={SEO_LIMITS.title} placeholder={fallbackTitle} disabled={disabled} onChange={(e) => set("title", e.target.value)} />
        </FormField>
        <FormField
          label="Meta description"
          optional
          errors={errorsAt(errors, "seo.description")}
          hint={<Counter length={(seo.description ?? "").length} ideal={SEO_LIMITS.idealDescription} max={SEO_LIMITS.description} />}
        >
          <Textarea rows={3} value={seo.description ?? ""} maxLength={SEO_LIMITS.description} placeholder={fallbackDescription ?? ""} disabled={disabled} onChange={(e) => set("description", e.target.value)} />
        </FormField>
        <FormField label="Social sharing image" optional errors={errorsAt(errors, "seo.ogImageAssetId")} hint="Shown when the page is shared on WhatsApp, LinkedIn or Facebook. A wide image (1.91:1) works best.">
          {(control) => (
            <AssetField
              id={control.id}
              aria-describedby={control["aria-describedby"]}
              label="Social sharing image"
              kinds={["image"]}
              value={seo.ogImageAssetId ?? null}
              onChange={(v) => set("ogImageAssetId", typeof v === "string" ? v : undefined)}
              assets={editor.assets}
              rememberAssets={editor.rememberAssets}
              canUpload={editor.canUpload}
              disabled={disabled}
            />
          )}
        </FormField>
        <FormField label="Canonical link" optional errors={errorsAt(errors, "seo.canonicalUrl")} hint="Only when the same content is published elsewhere first. Must start with https://.">
          <Input type="url" inputMode="url" value={seo.canonicalUrl ?? ""} disabled={disabled} onChange={(e) => set("canonicalUrl", e.target.value)} />
        </FormField>
        <div className="flex items-start gap-3">
          <Switch id="seo-noindex" checked={Boolean(seo.noindex)} onCheckedChange={(v) => set("noindex", v)} disabled={disabled} aria-describedby="seo-noindex-hint" />
          <div>
            <Label htmlFor="seo-noindex" className="font-normal">
              Hide from search engines (noindex)
            </Label>
            <p id="seo-noindex-hint" className="text-xs text-muted-foreground">
              The page stays reachable by link but is not listed in Google.
            </p>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
