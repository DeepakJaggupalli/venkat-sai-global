import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { OrgAvatar } from "@/components/shared/avatars";
import { Callout } from "@/components/shared/callout";
import { DateText } from "@/components/shared/date-text";
import { KeyValueList } from "@/components/shared/key-value-list";
import { Button } from "@/components/ui/button";
import { getPortalAccess, portalHomePath } from "@/modules/identity/authz";
import { getCurrentSession } from "@/modules/identity/session";
import { getInvitationPreview, type InvitationPreview } from "@/modules/organizations/members";
import { invitationPath } from "@/modules/organizations/paths";

import { AuthHeading, AuthLinks } from "../../_components/auth-heading";
import { AcceptInvitationForm } from "./accept-invitation-form";
import { switchAccountForInvitationAction } from "./actions";

/**
 * /invite/<token> — accept an invitation to join an employer, recruitment partner or institution.
 *
 * Signed-out visitors are asked to sign in or create an account with the invited email (returnTo keeps
 * them on this page); a signed-in user with a different email can switch accounts; the accept button
 * appears only for the invited, verified email. The token is never shown, and the invited address is
 * masked unless it belongs to the signed-in viewer. Business portals are English-only.
 */
export const metadata: Metadata = {
  title: "Invitation to join an organisation",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type PageProps = { params: Promise<{ token: string }> };

function StatusScreen({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return (
    <div className="space-y-6">
      <AuthHeading title={title} description={description} />
      {children}
      <AuthLinks>
        <Link href="/" className="font-medium text-teal-strong underline-offset-4 hover:underline">
          Go to the home page
        </Link>
      </AuthLinks>
    </div>
  );
}

function InvitationDetails({ preview }: { preview: InvitationPreview }) {
  const org = preview.organization!;
  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="mb-4 flex min-w-0 items-center gap-3">
        <OrgAvatar name={org.name} src={org.logoUrl} size="lg" />
        <div className="min-w-0">
          <p className="truncate font-heading text-lg font-semibold text-navy" title={org.name}>
            {org.name}
          </p>
          <p className="text-sm text-muted-foreground">{org.typeLabel}</p>
        </div>
      </div>
      <KeyValueList
        dense
        items={[
          { label: "Your role", value: preview.roleName },
          { label: "Invited by", value: preview.inviterName },
          { label: "Sent to", value: preview.invitedEmail, hint: preview.viewerEmailMatches ? undefined : "Shown partly hidden for privacy." },
          { label: "Valid until", value: preview.expiresAt ? <DateText value={preview.expiresAt} mode="datetime" /> : null },
        ]}
      />
    </div>
  );
}

export default async function InvitePage({ params }: PageProps) {
  const { token } = await params;
  const returnTo = invitationPath(token);
  const current = await getCurrentSession();
  if (current?.needsTwoFactor) redirect(`/sign-in/two-factor?returnTo=${encodeURIComponent(returnTo)}`);
  const viewer = current?.user ?? null;
  const preview = await getInvitationPreview(token, viewer);

  if (preview.status === "not_found" || !preview.organization) {
    return (
      <StatusScreen
        title="This invitation link is not valid"
        description="Check that you opened the complete link from the invitation email, or ask the organisation to send a new invitation."
      />
    );
  }
  const org = preview.organization;

  if (preview.status === "revoked") {
    return <StatusScreen title="This invitation was cancelled" description={`Ask ${org.name} to send you a new invitation if you still need access.`} />;
  }
  if (preview.status === "expired") {
    return <StatusScreen title="This invitation has expired" description={`Invitations are valid for 7 days. Ask ${org.name} to send you a new one.`} />;
  }
  if (preview.status === "accepted") {
    const home = viewer ? portalHomePath(await getPortalAccess(viewer)) : null;
    return (
      <StatusScreen title="This invitation has already been used" description="Each invitation link can be used once.">
        {home ? (
          <Button asChild size="lg" className="h-10 w-full">
            <Link href={home}>Go to your dashboard</Link>
          </Button>
        ) : (
          <Button asChild size="lg" className="h-10 w-full">
            <Link href="/sign-in">Sign in</Link>
          </Button>
        )}
      </StatusScreen>
    );
  }
  if (org.suspended) {
    return (
      <StatusScreen
        title="This organisation cannot add members right now"
        description={`${org.name} cannot accept new members at the moment. Please contact them or Venkat Sai support.`}
      />
    );
  }

  const heading = <AuthHeading eyebrow="Invitation" title={`Join ${org.name} on Venkat Sai Global`} description="You have been invited to work with this organisation's team." />;
  const encodedReturn = encodeURIComponent(returnTo);

  // Signed out: sign in or create an account with the invited email, then come back here.
  if (!viewer) {
    return (
      <div className="space-y-6">
        {heading}
        <InvitationDetails preview={preview} />
        <Callout tone="info" title="Sign in to accept">
          Use the email address this invitation was sent to ({preview.invitedEmail}). If you are new to Venkat Sai Global, create an account with that address first.
        </Callout>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" className="h-10 w-full sm:flex-1">
            <Link href={`/sign-in?returnTo=${encodedReturn}`}>Sign in</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-10 w-full sm:flex-1">
            <Link href={`/sign-up?returnTo=${encodedReturn}`}>Create an account</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Signed in with another address: switch accounts (keeps this page as the return address).
  if (!preview.viewerEmailMatches) {
    return (
      <div className="space-y-6">
        {heading}
        <InvitationDetails preview={preview} />
        <Callout tone="warning" title="This invitation is for a different email address">
          You are signed in as {viewer.email ?? viewer.phone ?? viewer.displayName}. The invitation was sent to {preview.invitedEmail}. Sign in with that address to accept it.
        </Callout>
        <form action={switchAccountForInvitationAction}>
          <input type="hidden" name="token" value={token} />
          <Button type="submit" size="lg" className="h-10 w-full">
            Sign out and use a different account
          </Button>
        </form>
      </div>
    );
  }

  // Right address, not verified yet.
  if (!preview.viewerEmailVerified) {
    return (
      <div className="space-y-6">
        {heading}
        <InvitationDetails preview={preview} />
        <Callout tone="warning" title="Verify your email address first">
          For security, only a verified email address can accept an invitation. Verify {preview.invitedEmail} in your account settings, then open this invitation link again.
        </Callout>
        <Button asChild size="lg" className="h-10 w-full">
          <Link href="/account">Open account settings</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {heading}
      <InvitationDetails preview={preview} />
      <AcceptInvitationForm token={token} organizationName={org.name} />
      <AuthLinks>Not expecting this invitation? You can ignore it; nothing changes until you accept.</AuthLinks>
    </div>
  );
}
