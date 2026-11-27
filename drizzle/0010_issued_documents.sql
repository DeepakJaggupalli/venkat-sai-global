CREATE TABLE "internship_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"programme_id" uuid NOT NULL,
	"candidate_id" uuid,
	"full_name" text NOT NULL,
	"email" text,
	"phone" text,
	"institution_name" text,
	"track" text,
	"status" text DEFAULT 'active' NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"performance_note" text,
	"completed_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "internship_participants_dates_chk" CHECK ("internship_participants"."ends_on" is null or "internship_participants"."starts_on" is null or "internship_participants"."ends_on" >= "internship_participants"."starts_on"),
	CONSTRAINT "internship_participants_completed_chk" CHECK ("internship_participants"."status" <> 'completed' or "internship_participants"."completed_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "issued_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"origin" text NOT NULL,
	"candidate_id" uuid,
	"enrolment_id" uuid,
	"internship_participant_id" uuid,
	"holder_name" text NOT NULL,
	"holder_email" text,
	"holder_phone" text,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"request_note" text,
	"verification_code" text NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by_user_id" uuid,
	"rejected_reason" text,
	"rejected_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"decided_by_user_id" uuid,
	"last_edited_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issued_documents_verification_code_chk" CHECK (char_length("issued_documents"."verification_code") >= 8),
	CONSTRAINT "issued_documents_approved_chk" CHECK ("issued_documents"."status" <> 'approved' or "issued_documents"."approved_at" is not null),
	CONSTRAINT "issued_documents_revoked_chk" CHECK ("issued_documents"."status" <> 'revoked' or "issued_documents"."revoked_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "internship_participants" ADD CONSTRAINT "internship_participants_programme_id_internship_programmes_id_fk" FOREIGN KEY ("programme_id") REFERENCES "public"."internship_programmes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internship_participants" ADD CONSTRAINT "internship_participants_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internship_participants" ADD CONSTRAINT "internship_participants_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issued_documents" ADD CONSTRAINT "issued_documents_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issued_documents" ADD CONSTRAINT "issued_documents_enrolment_id_enrolments_id_fk" FOREIGN KEY ("enrolment_id") REFERENCES "public"."enrolments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issued_documents" ADD CONSTRAINT "issued_documents_internship_participant_id_internship_participants_id_fk" FOREIGN KEY ("internship_participant_id") REFERENCES "public"."internship_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issued_documents" ADD CONSTRAINT "issued_documents_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issued_documents" ADD CONSTRAINT "issued_documents_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issued_documents" ADD CONSTRAINT "issued_documents_last_edited_by_user_id_users_id_fk" FOREIGN KEY ("last_edited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "internship_participants_programme_idx" ON "internship_participants" USING btree ("programme_id","status");--> statement-breakpoint
CREATE INDEX "internship_participants_candidate_idx" ON "internship_participants" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "internship_participants_email_idx" ON "internship_participants" USING btree ("email");--> statement-breakpoint
CREATE INDEX "internship_participants_created_by_idx" ON "internship_participants" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "internship_participants_programme_candidate_uq" ON "internship_participants" USING btree ("programme_id","candidate_id") WHERE candidate_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "issued_documents_code_uq" ON "issued_documents" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "issued_documents_verification_code_uq" ON "issued_documents" USING btree ("verification_code");--> statement-breakpoint
CREATE INDEX "issued_documents_status_idx" ON "issued_documents" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "issued_documents_candidate_idx" ON "issued_documents" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "issued_documents_enrolment_idx" ON "issued_documents" USING btree ("enrolment_id");--> statement-breakpoint
CREATE INDEX "issued_documents_participant_idx" ON "issued_documents" USING btree ("internship_participant_id");--> statement-breakpoint
CREATE INDEX "issued_documents_approved_by_idx" ON "issued_documents" USING btree ("approved_by_user_id");--> statement-breakpoint
CREATE INDEX "issued_documents_decided_by_idx" ON "issued_documents" USING btree ("decided_by_user_id");--> statement-breakpoint
CREATE INDEX "issued_documents_edited_by_idx" ON "issued_documents" USING btree ("last_edited_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "issued_documents_live_enrolment_uq" ON "issued_documents" USING btree ("enrolment_id","kind") WHERE status in ('pending', 'approved') and enrolment_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "issued_documents_live_participant_uq" ON "issued_documents" USING btree ("internship_participant_id","kind") WHERE status in ('pending', 'approved') and internship_participant_id is not null;