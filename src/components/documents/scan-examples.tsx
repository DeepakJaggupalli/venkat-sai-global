import Image from "next/image";

const EXAMPLES = [
  { src: "/references/cv-last-pages-example-1.jpg", caption: "Passport cover (outside), with the punched number visible" },
  { src: "/references/cv-last-pages-example-2.jpg", caption: "Passport first page (photo and details)" },
  { src: "/references/cv-last-pages-example-3.jpg", caption: "Passport last page (address and family details)" },
  { src: "/references/cv-last-pages-example-4.jpg", caption: "Passport-size photo on a plain white background" },
] as const;

/** Masked examples of how each scan should look (personal details blurred in the sample images). */
export function ScanExamples({ className }: { className?: string }) {
  return (
    <section aria-labelledby="scan-examples-heading" className={className}>
      <h2 id="scan-examples-heading" className="font-heading text-lg font-semibold text-navy">
        How your scans should look
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Take each photo in good light, flat on a table, with all four corners visible. These examples have the personal details hidden.
      </p>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {EXAMPLES.map((e) => (
          <li key={e.src} className="overflow-hidden rounded-xl border border-border bg-white">
            <Image src={e.src} alt={`Example: ${e.caption}`} width={595} height={842} className="h-auto w-full object-contain" sizes="(min-width: 640px) 25vw, 50vw" />
            <p className="p-2 text-xs leading-snug text-foreground">{e.caption}</p>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm">
        <a href="/references/cv-last-pages-example.pdf" target="_blank" rel="noopener" className="font-medium text-navy underline underline-offset-4">
          See the full example (PDF)
        </a>
      </p>
    </section>
  );
}
