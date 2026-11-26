import { NotFoundView } from "@/components/shared/not-found-view";

/**
 * Not found inside the Company / Travel Agency Portal (unknown ids and records of another organisation alike, so
 * nothing reveals whether a record exists). Rendered inside the portal shell so the navigation stays available.
 * Synchronous on purpose (it renders inside the workspace loading boundary). /employer links bring a travel
 * agency member to the same page under /agency (the workspace layout's portal rule).
 */
export default function EmployerNotFound() {
  return (
    <NotFoundView
      homeHref="/employer"
      // Same words as the access page (forbidden.tsx); e2e checks them.
      homeLabel="Go to your dashboard"
      description="The record may have been removed, or the link may be out of date or belong to another organisation."
      secondary={{ label: "How to use", href: "/employer/help" }}
    />
  );
}
