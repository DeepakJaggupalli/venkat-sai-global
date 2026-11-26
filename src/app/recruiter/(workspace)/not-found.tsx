import { NotFoundView } from "@/components/shared/not-found-view";

/**
 * Not found inside the Partner Portal (unknown ids and records of another agency alike, so nothing reveals
 * whether a record exists). Rendered inside the portal shell so the menu stays available.
 */
export default function RecruiterNotFound() {
  return <NotFoundView homeHref="/recruiter" secondary={{ label: "How to use", href: "/recruiter/help" }} />;
}
