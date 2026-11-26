import { ForbiddenView } from "@/components/shared/forbidden-view";

/**
 * A member whose role does not include a page (requireOrgMember → forbidden()). Rendered inside the portal
 * shell, so the member keeps the menu of what their role allows instead of the site-wide 403 page.
 */
export default function RecruiterForbidden() {
  return <ForbiddenView homeHref="/recruiter" secondary={{ label: "How to use", href: "/recruiter/help" }} />;
}
