"use client";

import { Copy, Loader2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";

import { copyApplicantPhonesAction } from "../actions";

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back below (insecure context or permission denied).
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const done = document.execCommand("copy");
    document.body.removeChild(area);
    return done;
  } catch {
    return false;
  }
}

function copiedToast(count: number) {
  toast.success(`${count} ${count === 1 ? "number" : "numbers"} copied. Paste them into WhatsApp or a note.`);
}

/**
 * Copies every applicant's mobile number (one per line, current search and status filter) for a WhatsApp broadcast
 * list. Some browsers (iPhone Safari) block copying after waiting for the server: the numbers then open in a sheet
 * where one more tap on "Copy numbers" copies them (or staff select them by hand).
 */
export function CopyPhonesButton({ posterId, q, status }: { posterId: string; q?: string; status?: string }) {
  const [pending, startTransition] = useTransition();
  const [numbers, setNumbers] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  const copy = () =>
    startTransition(async () => {
      const res = await copyApplicantPhonesAction({ posterId, q, status });
      if (!res.ok) return void toast.error(res.error);
      const phones = res.data?.phones ?? [];
      if (!phones.length) return void toast.error("No phone numbers to copy.");
      const text = phones.join("\n");
      if (await writeClipboard(text)) copiedToast(phones.length);
      else setNumbers(text);
    });

  // A fresh tap, so the browser allows copying now.
  const copyFromSheet = async () => {
    if (!numbers) return;
    if (await writeClipboard(numbers)) {
      copiedToast(numbers.split("\n").length);
      setNumbers(null);
      return;
    }
    area.current?.focus();
    area.current?.select();
    toast.error("This browser does not allow copying. The numbers are selected: use your phone's Copy.");
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="min-h-11 md:min-h-7" disabled={pending} onClick={copy} data-testid="copy-applicant-phones">
        {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Copy aria-hidden="true" />}
        Copy all phone numbers
      </Button>
      <ResponsiveDialog
        open={numbers !== null}
        onOpenChange={(open) => {
          if (!open) setNumbers(null);
        }}
        title="Phone numbers"
        description="Your browser needs one more tap to copy them. Tap Copy numbers, then paste them into WhatsApp or a note."
        size="sm"
        footer={
          <Button type="button" className="min-h-11" onClick={copyFromSheet} data-testid="copy-applicant-phones-again">
            <Copy aria-hidden="true" />
            Copy numbers
          </Button>
        }
      >
        <textarea
          ref={area}
          readOnly
          value={numbers ?? ""}
          rows={8}
          spellCheck={false}
          aria-label="Applicant phone numbers, one per line"
          onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded-lg border border-input bg-white p-3 font-mono text-base text-foreground tabular-nums"
          data-testid="applicant-phones-text"
        />
      </ResponsiveDialog>
    </>
  );
}
