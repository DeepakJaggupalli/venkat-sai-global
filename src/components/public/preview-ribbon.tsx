import { Eye } from "lucide-react";

/**
 * Shown on any public page rendered from a CMS preview token. The page metadata is noindex as well
 * (the content module sets `seo.noindex` for previews).
 */
export function PreviewRibbon({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div role="note" aria-label="Preview" className="border-y border-warning/40 bg-warning-soft" data-testid="preview-ribbon">
      <div className="container-page flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm text-warning-strong">
        <Eye aria-hidden="true" className="size-4 shrink-0" />
        <strong className="font-semibold">Preview</strong>
        <span>You are viewing unpublished content from a private preview link. Visitors cannot see this version.</span>
      </div>
    </div>
  );
}
