import { CallButton, WhatsAppButton } from "@/components/public/requirements/contact-buttons";

/**
 * Friendly dead-end replacement for the review form: the link expired / is incomplete, or the worker already sent a
 * review. Always offers WhatsApp (prefilled) and a call. Plain markup: used by the page and by the client form.
 */
export function LinkProblem({ kind, firstName }: { kind: "expired" | "used"; firstName?: string }) {
  const used = kind === "used";
  return (
    <div role="status" className="rounded-2xl border border-border bg-white p-6 shadow-sm sm:p-8" data-testid={used ? "review-link-used" : "review-link-expired"}>
      <h2 className="font-heading text-2xl font-bold text-foreground">{used ? `Thank you${firstName ? `, ${firstName}` : ""}. We already have your review` : "This review link has expired"}</h2>
      <p className="mt-3 text-base leading-relaxed text-foreground">
        {used
          ? "Each worker can send one review. If you want to change it, message us on WhatsApp."
          : "Review links work for 30 days, and WhatsApp sometimes cuts long links. Message us on WhatsApp and we will send you a new link."}
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <WhatsAppButton
          message={used ? "Hello Venkat Sai, I would like to change my review." : "Hello Venkat Sai, my review link does not work. Please send me a new one."}
          className="min-h-14 text-lg"
        />
        <CallButton label="Call us" className="min-h-14 text-lg" />
      </div>
    </div>
  );
}
