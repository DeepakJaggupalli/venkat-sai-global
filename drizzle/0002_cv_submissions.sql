CREATE TABLE "cv_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"job_category_id" uuid,
	"trade_other" text,
	"trade_label" text NOT NULL,
	"experience_years" smallint,
	"preferred_country_code" char(2),
	"has_passport" boolean,
	"passport_number_encrypted" text,
	"passport_number_last4" text,
	"passport_number_hash" text,
	"candidate_notes" text,
	"cv_file_id" uuid NOT NULL,
	"requirement_entry_id" uuid,
	"requirement_title" text,
	"status" text DEFAULT 'new' NOT NULL,
	"staff_remarks" text,
	"remarks_updated_at" timestamp with time zone,
	"remarks_updated_by_user_id" uuid,
	"consent_to_contact" boolean NOT NULL,
	"privacy_notice_version" text,
	"source_page" text,
	"ip_hash" text,
	"contacted_at" timestamp with time zone,
	"status_changed_at" timestamp with time zone,
	"status_changed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cv_submissions_passport_last4_chk" CHECK ("cv_submissions"."passport_number_last4" is null or char_length("cv_submissions"."passport_number_last4") <= 4),
	CONSTRAINT "cv_submissions_notes_chk" CHECK ("cv_submissions"."candidate_notes" is null or char_length("cv_submissions"."candidate_notes") <= 1000),
	CONSTRAINT "cv_submissions_consent_chk" CHECK ("cv_submissions"."consent_to_contact" = true),
	CONSTRAINT "cv_submissions_name_chk" CHECK (btrim("cv_submissions"."name") <> ''),
	CONSTRAINT "cv_submissions_trade_chk" CHECK (btrim("cv_submissions"."trade_label") <> ''),
	CONSTRAINT "cv_submissions_experience_chk" CHECK ("cv_submissions"."experience_years" is null or "cv_submissions"."experience_years" between 0 and 60)
);
--> statement-breakpoint
ALTER TABLE "cv_submissions" ADD CONSTRAINT "cv_submissions_job_category_id_job_categories_id_fk" FOREIGN KEY ("job_category_id") REFERENCES "public"."job_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_submissions" ADD CONSTRAINT "cv_submissions_preferred_country_code_countries_code_fk" FOREIGN KEY ("preferred_country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_submissions" ADD CONSTRAINT "cv_submissions_cv_file_id_files_id_fk" FOREIGN KEY ("cv_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_submissions" ADD CONSTRAINT "cv_submissions_requirement_entry_id_cms_entries_id_fk" FOREIGN KEY ("requirement_entry_id") REFERENCES "public"."cms_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_submissions" ADD CONSTRAINT "cv_submissions_remarks_updated_by_user_id_users_id_fk" FOREIGN KEY ("remarks_updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_submissions" ADD CONSTRAINT "cv_submissions_status_changed_by_user_id_users_id_fk" FOREIGN KEY ("status_changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cv_submissions_code_uq" ON "cv_submissions" USING btree ("code");--> statement-breakpoint
CREATE INDEX "cv_submissions_status_idx" ON "cv_submissions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "cv_submissions_created_idx" ON "cv_submissions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "cv_submissions_job_category_idx" ON "cv_submissions" USING btree ("job_category_id");--> statement-breakpoint
CREATE INDEX "cv_submissions_country_idx" ON "cv_submissions" USING btree ("preferred_country_code");--> statement-breakpoint
CREATE INDEX "cv_submissions_file_idx" ON "cv_submissions" USING btree ("cv_file_id");--> statement-breakpoint
CREATE INDEX "cv_submissions_requirement_idx" ON "cv_submissions" USING btree ("requirement_entry_id");--> statement-breakpoint
CREATE INDEX "cv_submissions_phone_idx" ON "cv_submissions" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "cv_submissions_status_changed_by_idx" ON "cv_submissions" USING btree ("status_changed_by_user_id");--> statement-breakpoint
CREATE INDEX "cv_submissions_remarks_by_idx" ON "cv_submissions" USING btree ("remarks_updated_by_user_id");--> statement-breakpoint
CREATE INDEX "cv_submissions_passport_hash_idx" ON "cv_submissions" USING btree ("passport_number_hash");