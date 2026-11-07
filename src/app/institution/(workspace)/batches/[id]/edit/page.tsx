import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { BatchForm } from "@/components/institution/batch-form";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { requireOrgMember } from "@/modules/identity/authz";
import { countryOptions } from "@/modules/taxonomy/queries";
import { getBatchForActor } from "@/modules/training/queries";

import { orNotFound } from "../../../_lib/load";
import { uuidParam } from "../../../_lib/params";

export const metadata: Metadata = { title: "Edit batch" };

export default async function EditBatchPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrgMember("institution", "institution.batches.manage");
  const id = uuidParam((await params).id);
  if (!id) notFound();
  const [{ batch, course }, countries] = await Promise.all([orNotFound(getBatchForActor(ctx, id)), countryOptions()]);
  if (batch.status === "cancelled" || batch.status === "completed") redirect(`/institution/batches/${batch.id}`);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={batch.code}
        title={`Edit ${batch.title}`}
        description={course.title}
        breadcrumbs={[
          { label: "Institution", href: "/institution" },
          { label: "Batches", href: "/institution/batches" },
          { label: batch.title, href: `/institution/batches/${batch.id}` },
          { label: "Edit" },
        ]}
      />
      <SectionCard title="Batch details">
        <BatchForm
          batchId={batch.id}
          countries={countries}
          defaults={{
            title: batch.title,
            startsOn: batch.startsOn,
            endsOn: batch.endsOn,
            schedule: batch.schedule,
            timezone: batch.timezone,
            mode: batch.mode,
            venue: batch.venue,
            countryCode: batch.countryCode,
            city: batch.city,
            capacity: batch.capacity,
            registrationDeadline: batch.registrationDeadline,
            enrolledCount: batch.enrolledCount,
          }}
        />
      </SectionCard>
    </div>
  );
}
