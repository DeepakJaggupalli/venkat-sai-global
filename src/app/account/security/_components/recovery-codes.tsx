"use client";

import { AlertTriangle, Copy, Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { BRAND } from "@/config/site";
import { useT } from "@/i18n/client";

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Recovery codes, shown exactly once, with copy / download and an explicit "I saved them". */
export function RecoveryCodesPanel({ codes, onDone, doneLabel }: { codes: string[]; onDone: () => void; doneLabel: string }) {
  const t = useT("auth");
  const [saved, setSaved] = useState(false);

  const copy = async () => {
    if (await copyToClipboard(codes.join("\n"))) toast.success(t("security.recovery.copied"));
    else toast.error(t("security.recovery.copyFailed"));
  };

  const download = () => {
    const lines = [
      t("security.recovery.fileTitle", { brand: BRAND.name }),
      t("security.recovery.fileCreated", { date: new Date().toISOString().slice(0, 10) }),
      t("security.recovery.fileNote"),
      "",
      ...codes,
      "",
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "venkat-sai-global-recovery-codes.txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-4">
      <Alert role="status" className="border-warning/40 bg-warning-soft">
        <AlertTriangle className="text-warning" aria-hidden />
        <AlertTitle>{t("security.recovery.title")}</AlertTitle>
        <AlertDescription className="text-foreground">{t("security.recovery.body")}</AlertDescription>
      </Alert>
      <ul aria-label={t("security.recovery.listLabel")} className="grid grid-cols-1 gap-2 rounded-xl border bg-surface-subtle p-3 font-mono text-sm min-[420px]:grid-cols-2">
        {codes.map((code) => (
          <li key={code} className="rounded-md bg-background px-3 py-2 text-center tracking-wider select-all">
            {code}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="h-9" onClick={copy}>
          <Copy aria-hidden />
          {t("security.recovery.copy")}
        </Button>
        <Button type="button" variant="outline" className="h-9" onClick={download}>
          <Download aria-hidden />
          {t("security.recovery.download")}
        </Button>
      </div>
      <div className="flex items-start gap-3">
        <Checkbox id="recovery-saved" checked={saved} onCheckedChange={(value) => setSaved(value === true)} className="mt-0.5" />
        <Label htmlFor="recovery-saved" className="block leading-snug font-normal">
          {t("security.recovery.confirmSaved")}
        </Label>
      </div>
      <Button type="button" size="lg" className="h-10 w-full sm:w-auto" disabled={!saved} onClick={onDone}>
        {doneLabel}
      </Button>
    </div>
  );
}
