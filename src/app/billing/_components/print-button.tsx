"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Opens the browser print dialog (save as PDF or print). Hidden when printing. */
export function PrintButton({ label = "Print or save as PDF" }: { label?: string }) {
  return (
    <Button type="button" variant="outline" size="lg" className="print:hidden" onClick={() => window.print()}>
      <Printer aria-hidden />
      {label}
    </Button>
  );
}
