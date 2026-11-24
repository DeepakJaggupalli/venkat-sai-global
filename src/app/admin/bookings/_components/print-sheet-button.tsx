"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Opens the browser print dialog (print, or save as PDF). Hidden on paper. */
export function PrintSheetButton() {
  return (
    <Button type="button" className="min-h-11 print:hidden" onClick={() => window.print()} data-testid="print-button">
      <Printer aria-hidden="true" />
      Print
    </Button>
  );
}
