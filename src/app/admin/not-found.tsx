import { NotFoundView } from "@/components/shared/not-found-view";

/** Unknown ids and links inside the Command Centre (the menu stays available). */
export default function AdminNotFound() {
  return <NotFoundView homeHref="/admin" secondary={{ label: "How to use", href: "/admin/help" }} />;
}
