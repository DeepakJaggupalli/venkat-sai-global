CREATE TABLE "cv_submission_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"file_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"uploaded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resume_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"details" jsonb NOT NULL,
	"candidate_notes" text,
	"photo_file_id" uuid,
	"price_amount_minor" bigint,
	"price_currency" char(3),
	"payment_method" text,
	"payment_reference" text,
	"gateway_order_id" text,
	"paid_at" timestamp with time zone,
	"payment_recorded_by_user_id" uuid,
	"generated_docx_file_id" uuid,
	"generated_pdf_file_id" uuid,
	"generated_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"status_changed_at" timestamp with time zone,
	"status_changed_by_user_id" uuid,
	"staff_notes" text,
	"notes_updated_at" timestamp with time zone,
	"notes_updated_by_user_id" uuid,
	"download_token_version" integer DEFAULT 1 NOT NULL,
	"cv_submission_id" uuid,
	"consent_to_contact" boolean NOT NULL,
	"privacy_notice_version" text,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resume_requests_consent_chk" CHECK ("resume_requests"."consent_to_contact" = true),
	CONSTRAINT "resume_requests_name_chk" CHECK (btrim("resume_requests"."name") <> ''),
	CONSTRAINT "resume_requests_price_chk" CHECK ("resume_requests"."price_amount_minor" is null or "resume_requests"."price_amount_minor" >= 0),
	CONSTRAINT "resume_requests_notes_chk" CHECK ("resume_requests"."candidate_notes" is null or char_length("resume_requests"."candidate_notes") <= 1000)
);
--> statement-breakpoint
ALTER TABLE "cv_submission_documents" ADD CONSTRAINT "cv_submission_documents_submission_id_cv_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."cv_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_submission_documents" ADD CONSTRAINT "cv_submission_documents_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_submission_documents" ADD CONSTRAINT "cv_submission_documents_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_requests" ADD CONSTRAINT "resume_requests_photo_file_id_files_id_fk" FOREIGN KEY ("photo_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_requests" ADD CONSTRAINT "resume_requests_price_currency_currencies_code_fk" FOREIGN KEY ("price_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_requests" ADD CONSTRAINT "resume_requests_payment_recorded_by_user_id_users_id_fk" FOREIGN KEY ("payment_recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_requests" ADD CONSTRAINT "resume_requests_generated_docx_file_id_files_id_fk" FOREIGN KEY ("generated_docx_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_requests" ADD CONSTRAINT "resume_requests_generated_pdf_file_id_files_id_fk" FOREIGN KEY ("generated_pdf_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_requests" ADD CONSTRAINT "resume_requests_status_changed_by_user_id_users_id_fk" FOREIGN KEY ("status_changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_requests" ADD CONSTRAINT "resume_requests_notes_updated_by_user_id_users_id_fk" FOREIGN KEY ("notes_updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_requests" ADD CONSTRAINT "resume_requests_cv_submission_id_cv_submissions_id_fk" FOREIGN KEY ("cv_submission_id") REFERENCES "public"."cv_submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cv_submission_documents_submission_idx" ON "cv_submission_documents" USING btree ("submission_id","kind","sort_order");--> statement-breakpoint
CREATE INDEX "cv_submission_documents_file_idx" ON "cv_submission_documents" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "cv_submission_documents_uploaded_by_idx" ON "cv_submission_documents" USING btree ("uploaded_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resume_requests_code_uq" ON "resume_requests" USING btree ("code");--> statement-breakpoint
CREATE INDEX "resume_requests_status_idx" ON "resume_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "resume_requests_created_idx" ON "resume_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "resume_requests_phone_idx" ON "resume_requests" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "resume_requests_cv_submission_idx" ON "resume_requests" USING btree ("cv_submission_id");--> statement-breakpoint
CREATE INDEX "resume_requests_photo_idx" ON "resume_requests" USING btree ("photo_file_id");--> statement-breakpoint
CREATE INDEX "resume_requests_docx_idx" ON "resume_requests" USING btree ("generated_docx_file_id");--> statement-breakpoint
CREATE INDEX "resume_requests_pdf_idx" ON "resume_requests" USING btree ("generated_pdf_file_id");--> statement-breakpoint
CREATE INDEX "resume_requests_paid_by_idx" ON "resume_requests" USING btree ("payment_recorded_by_user_id");--> statement-breakpoint
CREATE INDEX "resume_requests_status_by_idx" ON "resume_requests" USING btree ("status_changed_by_user_id");--> statement-breakpoint
CREATE INDEX "resume_requests_notes_by_idx" ON "resume_requests" USING btree ("notes_updated_by_user_id");