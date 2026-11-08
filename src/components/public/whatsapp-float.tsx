import { whatsappHref } from "@/config/contact";
import { cn } from "@/lib/utils";

import { DEFAULT_WHATSAPP_MESSAGE, WhatsAppIcon } from "./contact-links";

/**
 * Floating WhatsApp button on every public page (bottom-right, above the phone's home indicator via the
 * safe-area inset). It sits below the cookie banner's layer (z-40 vs z-50), so the banner is never covered.
 */
export function WhatsAppFloat({ e164, message = DEFAULT_WHATSAPP_MESSAGE, className }: { e164?: string; message?: string; className?: string }) {
  return (
    <a
      href={whatsappHref(message, e164)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with Venkat Sai on WhatsApp (opens in a new tab)"
      data-testid="whatsapp-float"
      className={cn(
        "group fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 inline-flex h-14 items-center gap-2 rounded-full bg-green-strong pr-5 pl-4 text-white shadow-[0_12px_30px_-10px_rgb(6_18_58/0.6)] ring-4 ring-white/80 transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-offset-4 motion-reduce:hover:translate-y-0 max-sm:size-14 max-sm:justify-center max-sm:px-0 print:hidden",
        className,
      )}
    >
      <span aria-hidden="true" className="absolute inset-0 -z-10 rounded-full bg-green-strong motion-safe:animate-pulse-ring" />
      <WhatsAppIcon className="size-7 shrink-0" />
      <span aria-hidden="true" className="text-sm font-semibold max-sm:hidden">
        WhatsApp us
      </span>
    </a>
  );
}
