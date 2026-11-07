"use client";

import { createContext, useCallback, useContext, useState, type ComponentProps } from "react";

import { ResponsiveDialog } from "@/components/shared/responsive-dialog";

const CloseDialogContext = createContext<(() => void) | null>(null);

/** Closes the surrounding ActionDialog; null outside one. ActionForm calls it after a successful save. */
export function useCloseActionDialog(): (() => void) | null {
  return useContext(CloseDialogContext);
}

type ActionDialogProps = Omit<ComponentProps<typeof ResponsiveDialog>, "open" | "onOpenChange">;

/**
 * ResponsiveDialog for a "create" form: it closes itself when the ActionForm inside saves, so staff
 * see the new row instead of an emptied form still covering the page. Server pages can use it
 * directly (no callbacks cross the server/client boundary).
 */
export function ActionDialog(props: ActionDialogProps) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <CloseDialogContext.Provider value={close}>
      <ResponsiveDialog {...props} open={open} onOpenChange={setOpen} />
    </CloseDialogContext.Provider>
  );
}
