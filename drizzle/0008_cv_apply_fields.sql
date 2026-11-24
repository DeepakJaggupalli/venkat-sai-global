CREATE TABLE "cv_import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" text NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"created_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cv_import_batches_counts_chk" CHECK ("cv_import_batches"."total_rows" >= 0 and "cv_import_batches"."created_count" >= 0 and "cv_import_batches"."skipped_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "cv_submissions" ALTER COLUMN "cv_file_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cv_submissions" ADD COLUMN "experience_abroad_years" smallint;--> statement-breakpoint
ALTER TABLE "cv_submissions" ADD COLUMN "experience_india_years" smallint;--> statement-breakpoint
ALTER TABLE "cv_submissions" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "cv_submissions" ADD COLUMN "source" text DEFAULT 'website' NOT NULL;--> statement-breakpoint
ALTER TABLE "cv_submissions" ADD COLUMN "import_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "cv_submissions" ADD COLUMN "referral_code" text;--> statement-breakpoint
ALTER TABLE "cv_submissions" ADD COLUMN "placed_organization_id" uuid;--> statement-breakpoint
ALTER TABLE "cv_import_batches" ADD CONSTRAINT "cv_import_batches_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cv_import_batches_created_by_idx" ON "cv_import_batches" USING btree ("created_by_user_id");--> statement-breakpoint
ALTER TABLE "cv_submissions" ADD CONSTRAINT "cv_submissions_import_batch_id_cv_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."cv_import_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_submissions" ADD CONSTRAINT "cv_submissions_placed_organization_id_organizations_id_fk" FOREIGN KEY ("placed_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cv_submissions_email_idx" ON "cv_submissions" USING btree ("email") WHERE "cv_submissions"."email" is not null;--> statement-breakpoint
CREATE INDEX "cv_submissions_referral_code_idx" ON "cv_submissions" USING btree ("referral_code") WHERE "cv_submissions"."referral_code" is not null;--> statement-breakpoint
CREATE INDEX "cv_submissions_import_batch_idx" ON "cv_submissions" USING btree ("import_batch_id");--> statement-breakpoint
CREATE INDEX "cv_submissions_placed_org_idx" ON "cv_submissions" USING btree ("placed_organization_id");--> statement-breakpoint
CREATE INDEX "cv_submissions_source_idx" ON "cv_submissions" USING btree ("source","created_at");--> statement-breakpoint
ALTER TABLE "cv_submissions" ADD CONSTRAINT "cv_submissions_experience_split_chk" CHECK (("cv_submissions"."experience_abroad_years" is null or "cv_submissions"."experience_abroad_years" between 0 and 60) and ("cv_submissions"."experience_india_years" is null or "cv_submissions"."experience_india_years" between 0 and 60));--> statement-breakpoint
ALTER TABLE "cv_submissions" ADD CONSTRAINT "cv_submissions_email_chk" CHECK ("cv_submissions"."email" is null or (char_length("cv_submissions"."email") <= 254 and "cv_submissions"."email" = lower("cv_submissions"."email")));--> statement-breakpoint
ALTER TABLE "cv_submissions" ADD CONSTRAINT "cv_submissions_referral_code_chk" CHECK ("cv_submissions"."referral_code" is null or "cv_submissions"."referral_code" ~ '^[A-Z0-9]{4,16}$');