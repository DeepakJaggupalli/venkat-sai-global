"use client";

import { CreditCard, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { startCheckoutAction, verifyRazorpayPaymentAction } from "@/modules/commercial/actions";

type RazorpayResponse = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
type RazorpayOptions = {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill: { name?: string; email?: string; contact?: string };
  notes: Record<string, string>;
  theme: { color: string };
  handler: (response: RazorpayResponse) => void;
  modal: { ondismiss: () => void; escape: boolean };
};
type RazorpayInstance = { open: () => void; on: (event: "payment.failed", cb: (response: { error?: { description?: string } }) => void) => void };
declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

const RAZORPAY_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

function loadRazorpay(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${RAZORPAY_SCRIPT}"]`);
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => resolve(Boolean(window.Razorpay)), { once: true });
    script.addEventListener("error", () => resolve(false), { once: true });
    if (!existing) {
      script.src = RAZORPAY_SCRIPT;
      script.async = true;
      document.body.appendChild(script);
    }
  });
}

/**
 * Online payment buttons for an invoice (Razorpay Checkout modal or Stripe hosted Checkout). Rendered only when the
 * server says online payment is available for this viewer. Status messages are announced politely.
 */
export function PayOnline({ invoiceId, providers }: { invoiceId: string; providers: { razorpay: boolean; stripe: boolean } }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const busy = useRef(false);

  function pay(provider: "razorpay" | "stripe") {
    if (busy.current) return;
    busy.current = true;
    setMessage({ tone: "info", text: provider === "stripe" ? "Opening the secure payment page…" : "Opening the payment window…" });
    startTransition(async () => {
      const result = await startCheckoutAction({ invoiceId, provider });
      if (!result.ok || !result.data) {
        busy.current = false;
        setMessage({ tone: "error", text: result.ok ? "The payment could not be started. Please try again." : result.error });
        return;
      }
      const data = result.data;
      if (data.provider === "stripe") {
        window.location.assign(data.url);
        return;
      }
      const loaded = await loadRazorpay();
      if (!loaded || !window.Razorpay) {
        busy.current = false;
        setMessage({ tone: "error", text: "The payment window could not be loaded. Check your connection or try another method." });
        return;
      }
      const checkout = new window.Razorpay({
        key: data.keyId,
        order_id: data.orderId,
        amount: data.amount,
        currency: data.currency,
        name: data.name,
        description: data.description,
        prefill: { name: data.prefill.name, email: data.prefill.email ?? undefined, contact: data.prefill.contact ?? undefined },
        notes: data.notes,
        theme: { color: "#101C35" },
        handler: (response) => {
          setMessage({ tone: "info", text: "Confirming your payment…" });
          void verifyRazorpayPaymentAction({ orderId: response.razorpay_order_id, paymentId: response.razorpay_payment_id, signature: response.razorpay_signature }).then((verified) => {
            busy.current = false;
            if (!verified.ok) {
              setMessage({ tone: "error", text: verified.error });
              return;
            }
            router.push(`/billing/checkout/success?provider=razorpay&order_id=${encodeURIComponent(response.razorpay_order_id)}`);
          });
        },
        modal: {
          escape: true,
          ondismiss: () => {
            busy.current = false;
            setMessage({ tone: "info", text: "Payment window closed. You have not been charged." });
          },
        },
      });
      checkout.on("payment.failed", (response) => {
        setMessage({ tone: "error", text: response.error?.description ? `The payment did not go through: ${response.error.description}` : "The payment did not go through." });
      });
      checkout.open();
    });
  }

  return (
    <div className="space-y-3 print:hidden">
      <div className="flex flex-col gap-2 sm:flex-row">
        {providers.razorpay ? (
          <Button type="button" size="lg" onClick={() => pay("razorpay")} disabled={pending} aria-describedby="pay-online-status">
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <CreditCard aria-hidden />}
            Pay with card, UPI or net banking
          </Button>
        ) : null}
        {providers.stripe ? (
          <Button type="button" size="lg" variant={providers.razorpay ? "outline" : "default"} onClick={() => pay("stripe")} disabled={pending} aria-describedby="pay-online-status">
            {pending && !providers.razorpay ? <Loader2 className="animate-spin" aria-hidden /> : <CreditCard aria-hidden />}
            Pay by card (international)
          </Button>
        ) : null}
      </div>
      <p id="pay-online-status" role="status" aria-live="polite" className={message?.tone === "error" ? "text-sm text-danger-strong" : "text-sm text-muted-foreground"}>
        {message?.text ?? ""}
      </p>
    </div>
  );
}
