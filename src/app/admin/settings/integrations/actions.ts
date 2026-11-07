"use server";

import { z } from "zod";

import { ActionError, createFormAction, ok } from "@/lib/actions";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/modules/audit";
import { requireStaff } from "@/modules/identity/authz";
import { sendEmail } from "@/modules/messaging";

/**
 * Sends a test e-mail to the signed-in staff member's own verified address (never to a typed address,
 * so the form cannot be used as a relay). Rate limited and audited; the provider error is shown without secrets.
 */
export const sendTestEmailAction = createFormAction(z.object({}), async () => {
  const ctx = await requireStaff("settings.integrations");
  const to = ctx.user.email;
  if (!to || !ctx.user.emailVerifiedAt) throw new ActionError("Add and verify an e-mail address on your account first.");
  const limit = await rateLimit(`admin:test-email:${ctx.user.id}`, 5, 3600);
  if (!limit.allowed) throw new ActionError("You have sent several test e-mails recently. Try again later.");

  const transport = env().EMAIL_TRANSPORT;
  const sentAt = new Date().toISOString();
  const result = await sendEmail({
    to,
    subject: "Venkat Sai Global test e-mail",
    text: `This is a test e-mail from the Venkat Sai Command Centre, sent at ${sentAt} using the "${transport}" transport. No action is needed.`,
    html: `<p>This is a test e-mail from the Venkat Sai Command Centre, sent at ${sentAt} using the “${transport}” transport.</p><p>No action is needed.</p>`,
    tags: ["admin-test"],
  });
  await audit({ action: "integration.test_email_sent", entityType: "integration", entityId: "email", metadata: { transport, ok: result.ok, provider: result.provider } });
  if (!result.ok) throw new ActionError(`The e-mail could not be sent (${result.provider}): ${result.error.slice(0, 200)}`);
  return ok(undefined, transport === "dev" ? "Test e-mail stored in the development outbox" : "Test e-mail sent. Check your inbox.");
});
