import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { requireStaff } from "@/modules/identity/authz";
import { createCourseAction } from "@/modules/training/actions";

import { StaffForm } from "../../../pipeline/_shared/staff-form";
import { courseFields } from "../../_lib/course-fields";

export const metadata: Metadata = { title: "New course · Training" };

export default async function NewCoursePage() {
  await requireStaff("training.manage");
  const fields = await courseFields(null);
  return (
    <div className="space-y-6">
      <PageHeader
        title="New Venkat Sai course"
        description="Saved as a draft. Add at least one module, then publish."
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Training", href: "/admin/training" }, { label: "Courses", href: "/admin/training/courses" }, { label: "New course" }]}
      />
      <SectionCard title="Course details">
        <StaffForm action={createCourseAction} fields={fields} hidden={{ via: "admin" }} columns={2} submitLabel="Save draft" successHref="/admin/training/courses/{id}" testId="course-form" />
      </SectionCard>
    </div>
  );
}
