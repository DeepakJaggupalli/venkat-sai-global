import "server-only";

import { and, eq, sql } from "drizzle-orm";

import type { DbOrTx } from "@/db";
import { billingProfiles, organizationMembers, organizations, users } from "@/db/schema";
import { notify, notifyOrganization, type NotificationEvent } from "@/modules/notifications";

import { BILLING_VIEW_PERMISSION } from "./constants";

/**
 * Billing notifications go to: the organisation's members holding the billing permission of its type, plus the
 * billing e-mail of the billing profile when no active member uses that address (accounts mailboxes); or, for
 * individual buyers, the person. Always called with the transaction that made the change.
 */
export async function notifyBillingContacts(
  tx: DbOrTx,
  input: {
    event: NotificationEvent;
    organizationId: string | null;
    buyerUserId?: string | null;
    data: Record<string, unknown>;
    link?: string | null;
    dedupeKey?: string;
    /** Also e-mail the billing address of the billing profile (invoices, receipts, refunds). */
    includeBillingEmail?: boolean;
  },
): Promise<void> {
  if (input.organizationId) {
    const [org] = await tx.select({ type: organizations.type }).from(organizations).where(eq(organizations.id, input.organizationId)).limit(1);
    if (!org) return;
    await notifyOrganization(
      {
        event: input.event,
        organizationId: input.organizationId,
        permission: BILLING_VIEW_PERMISSION[org.type],
        data: input.data,
        link: input.link ?? null,
        dedupeKey: input.dedupeKey,
      },
      { tx },
    );
    if (input.includeBillingEmail) {
      const [profile] = await tx
        .select({ email: billingProfiles.billingEmail, name: billingProfiles.legalName })
        .from(billingProfiles)
        .where(eq(billingProfiles.organizationId, input.organizationId))
        .limit(1);
      if (profile?.email) {
        const [member] = await tx
          .select({ id: users.id })
          .from(organizationMembers)
          .innerJoin(users, eq(users.id, organizationMembers.userId))
          .where(and(eq(organizationMembers.organizationId, input.organizationId), eq(organizationMembers.status, "active"), sql`lower(${users.email}) = ${profile.email.toLowerCase()}`))
          .limit(1);
        if (!member) {
          await notify(
            {
              event: input.event,
              recipients: [{ email: profile.email, name: profile.name }],
              data: input.data,
              link: input.link ?? null,
              channels: ["email"],
              organizationId: input.organizationId,
              dedupeKey: input.dedupeKey ? `${input.dedupeKey}:billing-email` : undefined,
            },
            { tx },
          );
        }
      }
    }
    return;
  }
  if (input.buyerUserId) {
    await notify({ event: input.event, recipients: [{ userId: input.buyerUserId }], data: input.data, link: input.link ?? null, dedupeKey: input.dedupeKey }, { tx });
  }
}
