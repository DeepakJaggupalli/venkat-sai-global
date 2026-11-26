import { notFound } from "next/navigation";

/**
 * Any unknown link under /institution: show this area's own not-found page inside its shell (menu and a way back to
 * the dashboard) instead of the public 404. Real routes always win over this catch-all.
 */
export default function UnknownPage(): never {
  notFound();
}
