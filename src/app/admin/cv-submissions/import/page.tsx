import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { requireStaff } from "@/modules/identity/authz";
import { CV_IMPORT_MAX_BYTES, CV_IMPORT_MAX_ROWS } from "@/modules/operations/cv-import-schemas";

import { ImportWizard } from "./_components/import-wizard";

export const metadata: Metadata = { title: "Import CVs from Excel" };

/** /admin/cv-submissions/import — add the office's existing Excel list of CVs (candidates.manage). */
export default async function CvImportPage() {
  await requireStaff("candidates.manage");
  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="Import CVs from Excel"
        description="Add the CVs you already keep in Excel. They appear in the CV list, in CV matching and in passport expiry reminders. Nobody gets a message."
        backLink={{ href: "/admin/cv-submissions", label: "Applicants and CVs" }}
      />
      <ImportWizard maxBytes={CV_IMPORT_MAX_BYTES} maxRows={CV_IMPORT_MAX_ROWS} />
    </div>
  );
}
