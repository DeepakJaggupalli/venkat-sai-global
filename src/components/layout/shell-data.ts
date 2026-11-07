import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { notFound, unstable_rethrow } from "next/navigation";

import type { FeatureKey } from "@/config/features";
import { PORTAL_HOME, PORTAL_LABEL, type PortalKey } from "@/config/navigation";
import { db } from "@/db";
import { organizationMembers, organizations } from "@/db/schema";
import type { OrgType } from "@/db/schema/_constants";
import { logger } from "@/lib/logger";
import { getPortalAccess, listUserMemberships, portalHomePath, type OrgContext } from "@/modules/identity/authz";
import { getCurrentUser, type SessionUser } from "@/modules/identity/session";
import { isFeatureEnabled } from "@/modules/settings";

import { LAST_PORTAL_COOKIE, SIDEBAR_COOKIE } from "./portal-config";
import type { HeaderAccount, PortalLink, ShellMembership, ShellOrganization, ShellUser } from "./types";

/**
 * Server helpers that turn the session / organisation context into the plain props the layout
 * shells render. Layouts must still call their guard (requireUser / requireOrgMember / requireStaff)
 * themselves — these helpers assume an authenticated caller and only shape data for display.
 */

const PORTAL_FLAG: Record<Exclude<PortalKey, "admin">, FeatureKey> = {
  talent: "portal.talent",
  employer: "portal.employer",
  recruiter: "portal.recruiter",
  institution: "portal.institution",
};

const PORTAL_ORDER: readonly PortalKey[] = ["talent", "employer", "recruiter", "institution", "admin"];

/**
 * Avatar URL for a user: the files module serves it at /api/v1/files/[id] after its access check
 * (`variant=thumb` falls back to the best available size). The avatar component shows initials if
 * the image cannot be loaded. Only the id is known here, so fileUrl() (which needs the file row) is not used.
 */
function avatarUrl(fileId: string | null): string | null {
  return fileId ? `/api/v1/files/${encodeURIComponent(fileId)}?variant=thumb` : null;
}

export function toShellUser(user: SessionUser): ShellUser {
  return { name: user.displayName, email: user.email, phone: user.phone, avatarUrl: avatarUrl(user.avatarFileId) };
}

/**
 * 404 when a portal is switched off in /admin/settings/modules. Pass the organisation id once known
 * so per-organisation rollout rules on the flag apply.
 */
export async function assertPortalEnabled(portal: Exclude<PortalKey, "admin">, opts: { organizationId?: string } = {}): Promise<void> {
  const user = await getCurrentUser();
  const enabled = await isFeatureEnabled(PORTAL_FLAG[portal], {
    portal,
    isStaff: user?.isStaff ?? false,
    organizationId: opts.organizationId,
  });
  if (!enabled) notFound();
}

/** Portals the user can open, in a stable order (talent always; org portals by membership; admin for staff). */
export async function getPortalLinks(user: SessionUser): Promise<PortalLink[]> {
  const access = await getPortalAccess(user);
  const links: PortalLink[] = [];
  for (const portal of PORTAL_ORDER) {
    if (!access[portal]) continue;
    if (portal !== "admin" && !(await isFeatureEnabled(PORTAL_FLAG[portal], { portal, isStaff: user.isStaff }))) continue;
    links.push({ portal, label: PORTAL_LABEL[portal], href: PORTAL_HOME[portal] });
  }
  return links;
}

/** Current organisation + the user's other active memberships of the same type (organisation switcher). */
export async function getOrgShellData(ctx: OrgContext): Promise<{ organization: ShellOrganization; memberships: ShellMembership[] }> {
  const all = await listUserMemberships(ctx.user.id);
  const memberships = all
    .filter((m) => m.organizationType === ctx.orgType)
    .map((m) => ({
      organizationId: m.organizationId,
      organizationName: m.organizationName,
      organizationStatus: m.organizationStatus,
      roleName: m.roleName,
    }));
  return {
    organization: {
      id: ctx.organization.id,
      name: ctx.organization.name,
      type: ctx.orgType,
      status: ctx.organization.status,
      roleName: ctx.role.name,
    },
    memberships,
  };
}

/**
 * The user's active membership of a specific organisation of `orgType`, or null.
 * Used to authorise organisation switching (never trust the id sent by the client).
 */
export async function findActiveMembership(
  userId: string,
  orgType: OrgType,
  organizationId: string,
): Promise<{ organizationId: string; organizationName: string } | null> {
  const rows = await db
    .select({ organizationId: organizations.id, organizationName: organizations.name })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(
      and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.status, "active"),
        eq(organizations.type, orgType),
        isNull(organizations.deletedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Desktop sidebar preference (cookie written by the shell). */
export async function readSidebarCollapsed(): Promise<boolean> {
  const jar = await cookies();
  return jar.get(SIDEBAR_COOKIE)?.value === "collapsed";
}

function isPortalKey(value: string | undefined): value is PortalKey {
  return !!value && (PORTAL_ORDER as readonly string[]).includes(value);
}

/** Last portal the user worked in (cookie written by the shell), for the account area's back link. */
export async function readLastPortal(): Promise<PortalKey | null> {
  const jar = await cookies();
  const value = jar.get(LAST_PORTAL_COOKIE)?.value;
  return isPortalKey(value) ? value : null;
}

/** Portal to return to from the account area: the last one visited if still accessible, else the user's home portal. */
export function pickBackPortal(portals: readonly PortalLink[], lastPortal: PortalKey | null): PortalLink | null {
  return portals.find((p) => p.portal === lastPortal) ?? portals.find((p) => p.portal === "talent") ?? portals[0] ?? null;
}

/**
 * Signed-in summary for the public header ("Go to People Portal" instead of Sign in / Join).
 * Never throws: the public site must render even if the session store is unavailable.
 */
export async function getHeaderAccount(): Promise<HeaderAccount | null> {
  try {
    const user = await getCurrentUser();
    if (!user) return null;
    const access = await getPortalAccess(user);
    const href = portalHomePath(access);
    const portal = (Object.keys(PORTAL_HOME) as PortalKey[]).find((key) => PORTAL_HOME[key] === href) ?? "talent";
    return { name: user.displayName, href, portalLabel: PORTAL_LABEL[portal] };
  } catch (error) {
    // Let Next.js control-flow signals (dynamic rendering, redirects) through; only real failures degrade.
    unstable_rethrow(error);
    logger.warn("Public header could not resolve the session", { error });
    return null;
  }
}
