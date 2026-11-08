import { whatsappHref } from "@/config/contact";
import { cn } from "@/lib/utils";

import { DEFAULT_WHATSAPP_MESSAGE, WhatsAppIcon } from "./contact-links";

/**
 * Small, static round WhatsApp button on every public page (bottom-right, above the phone's home indicator via
 * the safe-area inset). No pulse, wave or label bubble: a white button with the green glyph and a soft shadow.
 * It sits below the cookie banner's layer (z-40 vs z-50), so the banner is never covered.
 */
export function WhatsAppFloat({ e164, message = DEFAULT_WHATSAPP_MESSAGE, className }: { e164?: string; message?: string; className?: string }) {
  return (
    <a
      href={whatsappHref(message, e164)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with Venkat Sai on WhatsApp (opens in a new tab)"
      title="WhatsApp us"
      data-testid="whatsapp-float"
      className={cn(
        "fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 inline-flex size-12 items-center justify-center rounded-full border border-border bg-white text-[#16a34a] shadow-[0_1px_2px_rgb(10_10_11/0.06),0_8px_24px_rgb(10_10_11/0.12)] transition-[box-shadow,border-color] duration-150 hover:border-[#c9cdd5] hover:shadow-[0_1px_2px_rgb(10_10_11/0.08),0_12px_28px_rgb(10_10_11/0.16)] focus-visible:outline-offset-4 print:hidden",
        className,
      )}
    >
      <WhatsAppIcon className="size-6" />
    </a>
  );
}
