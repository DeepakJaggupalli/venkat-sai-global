import { cn } from "@/lib/utils";

/**
 * Typography for rich text, shared by SafeHtml and RichTextEditor so what authors see while editing
 * matches what readers see.
 */
export const RICH_TEXT_CLASSES = cn(
  "max-w-none text-[15px] leading-7 text-foreground",
  "[&_a]:font-medium [&_a]:text-teal-strong [&_a]:underline [&_a]:underline-offset-2",
  "[&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:font-heading [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-navy",
  "[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:font-heading [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-navy",
  "[&_h4]:mt-5 [&_h4]:mb-2 [&_h4]:font-semibold",
  "[&_p]:my-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1",
  "[&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:border-teal [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground",
  "[&_img]:my-4 [&_img]:rounded-lg [&_table]:my-4 [&_table]:w-full [&_table]:text-sm [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:bg-muted [&_th]:p-2 [&_th]:text-left",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-sm",
);

/**
 * Renders HTML that was sanitised on write with `sanitizeRichText()` (src/lib/sanitize.ts).
 * Never pass unsanitised user input.
 */
export function SafeHtml({ html, className }: { html: string | null | undefined; className?: string }) {
  if (!html) return null;
  return <div className={cn(RICH_TEXT_CLASSES, className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
