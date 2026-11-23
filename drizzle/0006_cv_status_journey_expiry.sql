CREATE TABLE "cv_submission_stage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"candidate_note" text,
	"changed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_expiry_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_type" text NOT NULL,
	"item_id" uuid NOT NULL,
	"expires_on" date NOT NULL,
	"threshold_months" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_expiry_alerts_threshold_chk" CHECK ("document_expiry_alerts"."threshold_months" in (1, 3, 6))
);
--> statement-breakpoint
ALTER TABLE "cv_submissions" ALTER COLUMN "status" SET DEFAULT 'received';--> statement-breakpoint
ALTER TABLE "cv_submissions" ADD COLUMN "passport_expiry" date;--> statement-breakpoint
ALTER TABLE "cv_submissions" ADD COLUMN "candidate_note" text;--> statement-breakpoint
ALTER TABLE "cv_submissions" ADD COLUMN "candidate_note_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cv_submission_stage_events" ADD CONSTRAINT "cv_submission_stage_events_submission_id_cv_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."cv_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_submission_stage_events" ADD CONSTRAINT "cv_submission_stage_events_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cv_submission_stage_events_submission_idx" ON "cv_submission_stage_events" USING btree ("submission_id","created_at");--> statement-breakpoint
CREATE INDEX "cv_submission_stage_events_changed_by_idx" ON "cv_submission_stage_events" USING btree ("changed_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_expiry_alerts_item_uq" ON "document_expiry_alerts" USING btree ("item_type","item_id","expires_on","threshold_months");--> statement-breakpoint
CREATE INDEX "cv_submissions_passport_expiry_idx" ON "cv_submissions" USING btree ("passport_expiry") WHERE "cv_submissions"."passport_expiry" is not null;--> statement-breakpoint
ALTER TABLE "cv_submissions" ADD CONSTRAINT "cv_submissions_candidate_note_chk" CHECK ("cv_submissions"."candidate_note" is null or char_length("cv_submissions"."candidate_note") <= 500);--> statement-breakpoint
UPDATE "cv_submissions" SET "status" = 'received' WHERE "status" = 'new';--> statement-breakpoint
UPDATE "cv_submissions" SET "status" = 'trade_test' WHERE "status" = 'shortlisted';--> statement-breakpoint
INSERT INTO "cv_submission_stage_events" ("submission_id", "from_status", "to_status", "created_at") SELECT "id", NULL, 'received', "created_at" FROM "cv_submissions";--> statement-breakpoint
INSERT INTO "cv_submission_stage_events" ("submission_id", "from_status", "to_status", "changed_by_user_id", "created_at") SELECT "id", 'received', "status", "status_changed_by_user_id", coalesce("status_changed_at", "updated_at") FROM "cv_submissions" WHERE "status" <> 'received';
