import { ForbiddenView } from "@/components/shared/forbidden-view";

/**
 * A staff member whose role does not include a page (requireStaff(permission) → forbidden()). Rendered inside the
 * Command Centre shell, so they keep the menu of what their role allows instead of the site-wide 403 page.
 * Non-staff accounts are refused by the layout and still get the site-wide page.
 */
export default function AdminForbidden() {
  return (
    <ForbiddenView
      homeHref="/admin"
      secondary={{ label: "How to use", href: "/admin/help" }}
      description="Your staff role does not include this area. Ask the owner or a Super Admin to change your role if you need it."
    />
  );
}
