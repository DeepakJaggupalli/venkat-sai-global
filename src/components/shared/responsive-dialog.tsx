"use client";

import type { ReactElement, ReactNode } from "react";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

type ResponsiveDialogProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Element that opens the dialog (rendered with asChild). */
  trigger?: ReactElement;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Footer actions (e.g. Cancel + SubmitButton). */
  footer?: ReactNode;
  /** Desktop width. */
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZE_CLASSES = { sm: "sm:max-w-sm", md: "sm:max-w-lg", lg: "sm:max-w-2xl" } as const;

/**
 * A centred Dialog on desktop and a bottom Sheet on phones (thumb-reachable, full width), with the
 * same title/description wiring for screen readers in both.
 *
 *   <ResponsiveDialog trigger={<Button>Add note</Button>} title="Add a note" footer={<SubmitButton form="note-form">Save</SubmitButton>}>
 *     <form id="note-form" action={formAction}>…</form>
 *   </ResponsiveDialog>
 */
export function ResponsiveDialog({ open, onOpenChange, trigger, title, description, children, footer, size = "md", className }: ResponsiveDialogProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        {trigger ? <SheetTrigger asChild>{trigger}</SheetTrigger> : null}
        <SheetContent side="bottom" className={cn("max-h-[90dvh] gap-0 rounded-t-2xl", className)}>
          <SheetHeader className="border-b border-border pr-12">
            <SheetTitle className="text-navy">{title}</SheetTitle>
            {description ? <SheetDescription>{description}</SheetDescription> : null}
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
          {footer ? <SheetFooter className="flex-col-reverse gap-2 border-t border-border bg-surface-subtle [&>*]:w-full">{footer}</SheetFooter> : null}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className={cn("max-h-[85dvh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0", SIZE_CLASSES[size], className)}>
        <DialogHeader className="border-b border-border px-5 pt-5 pb-4 pr-12">
          <DialogTitle className="text-navy">{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <DialogFooter className="mx-0 mb-0 rounded-b-xl px-5 py-3">{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  );
}
