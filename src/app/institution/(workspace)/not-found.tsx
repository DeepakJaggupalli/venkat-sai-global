import { NotFoundView } from "@/components/shared/not-found-view";

/**
 * Not found inside the Institution Portal (unknown ids and records of another institution alike, so nothing
 * reveals whether a record exists). Rendered inside the portal shell so the menu stays available.
 */
export default function InstitutionNotFound() {
  return <NotFoundView homeHref="/institution" secondary={{ label: "How to use", href: "/institution/help" }} />;
}
