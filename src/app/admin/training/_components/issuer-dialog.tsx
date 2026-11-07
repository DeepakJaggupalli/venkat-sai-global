"use client";

import { useState } from "react";

import { StaffForm } from "@/app/admin/pipeline/_shared/staff-form";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import type { ActionResult, ActionState } from "@/lib/actions";

/** Grant, update or withdraw an institution's certificate-issuer authorisation (orgs.verify, enforced by the module). */
export function IssuerAuthorisationDialog({
  action,
  organizationId,
  name,
  authorised,
  scope,
  until,
}: {
  action: (prev: ActionState<undefined>, fd: FormData) => Promise<ActionResult<undefined>>;
  organizationId: string;
  name: string;
  authorised: boolean;
  scope: string | null;
  until: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="outline" size="sm">
          {authorised ? "Change authorisation" : "Authorise"}
        </Button>
      }
      title={`Certificate-issuer authorisation: ${name}`}
      description="Record what the institution is accredited to certify. Leave “Authorised” unticked to withdraw."
    >
      <StaffForm
        action={action}
        hidden={{ organizationId }}
        submitLabel="Save authorisation"
        onSuccess={() => setOpen(false)}
        fields={[
          { name: "authorised", label: "Authorised to issue accredited certificates", kind: "checkbox", defaultValue: authorised },
          { name: "scope", label: "Authorised scope", kind: "textarea", optional: true, defaultValue: scope, hint: "Required when authorised, e.g. the accrediting body and programmes covered.", rows: 3 },
          { name: "authorisedUntil", label: "Authorised until", kind: "date", optional: true, defaultValue: until, hint: "Usually the accreditation expiry date." },
          { name: "note", label: "Internal note", kind: "textarea", optional: true, rows: 2 },
        ]}
      />
    </ResponsiveDialog>
  );
}
