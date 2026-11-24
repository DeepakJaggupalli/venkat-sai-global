CREATE TABLE "referral_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cv_submission_id" uuid NOT NULL,
	"referrer_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_by_user_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referral_payouts_amount_chk" CHECK ("referral_payouts"."amount_minor" > 0),
	CONSTRAINT "referral_payouts_note_chk" CHECK ("referral_payouts"."note" is null or char_length("referral_payouts"."note") <= 500)
);
--> statement-breakpoint
CREATE TABLE "referrers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"status" text DEFAULT 'active' NOT NULL,
	"status_changed_at" timestamp with time zone,
	"status_changed_by_user_id" uuid,
	"privacy_notice_version" text,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referrers_code_chk" CHECK ("referrers"."code" ~ '^[A-Z0-9]{4,16}$'),
	CONSTRAINT "referrers_name_chk" CHECK (btrim("referrers"."name") <> '' and char_length("referrers"."name") <= 120),
	CONSTRAINT "referrers_phone_chk" CHECK ("referrers"."phone" ~ '^[+][1-9][0-9]{6,14}$'),
	CONSTRAINT "referrers_email_chk" CHECK ("referrers"."email" is null or (char_length("referrers"."email") <= 254 and "referrers"."email" = lower("referrers"."email")))
);
--> statement-breakpoint
CREATE TABLE "booking_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"trade" text NOT NULL,
	"course_id" uuid,
	"date" date NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text,
	"venue" text NOT NULL,
	"capacity" integer NOT NULL,
	"booked_seats" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"instructions" text,
	"fee_note" text,
	"cancel_reason" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_user_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_slots_capacity_chk" CHECK ("booking_slots"."capacity" between 1 and 500),
	CONSTRAINT "booking_slots_booked_seats_chk" CHECK ("booking_slots"."booked_seats" >= 0 and "booking_slots"."booked_seats" <= "booking_slots"."capacity"),
	CONSTRAINT "booking_slots_start_time_chk" CHECK ("booking_slots"."start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "booking_slots_end_time_chk" CHECK ("booking_slots"."end_time" is null or ("booking_slots"."end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and "booking_slots"."end_time" > "booking_slots"."start_time")),
	CONSTRAINT "booking_slots_title_chk" CHECK (btrim("booking_slots"."title") <> '' and char_length("booking_slots"."title") <= 120),
	CONSTRAINT "booking_slots_trade_chk" CHECK (btrim("booking_slots"."trade") <> '' and char_length("booking_slots"."trade") <= 80),
	CONSTRAINT "booking_slots_venue_chk" CHECK (btrim("booking_slots"."venue") <> '' and char_length("booking_slots"."venue") <= 300),
	CONSTRAINT "booking_slots_instructions_chk" CHECK ("booking_slots"."instructions" is null or char_length("booking_slots"."instructions") <= 1000),
	CONSTRAINT "booking_slots_fee_note_chk" CHECK ("booking_slots"."fee_note" is null or char_length("booking_slots"."fee_note") <= 200),
	CONSTRAINT "booking_slots_cancel_chk" CHECK ("booking_slots"."status" <> 'cancelled' or "booking_slots"."cancelled_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "slot_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"slot_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"trade" text NOT NULL,
	"organization_name" text,
	"seats" smallint DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'booked' NOT NULL,
	"notes" text,
	"cancelled_with_slot" boolean DEFAULT false NOT NULL,
	"status_changed_at" timestamp with time zone,
	"status_changed_by_user_id" uuid,
	"consent_to_contact" boolean NOT NULL,
	"privacy_notice_version" text,
	"source" text DEFAULT 'website' NOT NULL,
	"user_id" uuid,
	"created_by_user_id" uuid,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slot_bookings_seats_chk" CHECK ("slot_bookings"."seats" between 1 and 20),
	CONSTRAINT "slot_bookings_consent_chk" CHECK ("slot_bookings"."consent_to_contact" = true),
	CONSTRAINT "slot_bookings_name_chk" CHECK (btrim("slot_bookings"."name") <> '' and char_length("slot_bookings"."name") <= 120),
	CONSTRAINT "slot_bookings_trade_chk" CHECK (btrim("slot_bookings"."trade") <> '' and char_length("slot_bookings"."trade") <= 80),
	CONSTRAINT "slot_bookings_email_chk" CHECK ("slot_bookings"."email" is null or (char_length("slot_bookings"."email") <= 254 and "slot_bookings"."email" = lower("slot_bookings"."email"))),
	CONSTRAINT "slot_bookings_org_chk" CHECK ("slot_bookings"."organization_name" is null or (btrim("slot_bookings"."organization_name") <> '' and char_length("slot_bookings"."organization_name") <= 160)),
	CONSTRAINT "slot_bookings_notes_chk" CHECK ("slot_bookings"."notes" is null or char_length("slot_bookings"."notes") <= 1000)
);
--> statement-breakpoint
CREATE TABLE "worker_review_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cv_submission_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"requested_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cv_submission_id" uuid,
	"display_name" text NOT NULL,
	"trade" text NOT NULL,
	"country_code" char(2),
	"rating" smallint NOT NULL,
	"body" text NOT NULL,
	"consent_to_publish" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "worker_reviews_rating_chk" CHECK ("worker_reviews"."rating" between 1 and 5),
	CONSTRAINT "worker_reviews_body_chk" CHECK (btrim("worker_reviews"."body") <> '' and char_length("worker_reviews"."body") <= 800),
	CONSTRAINT "worker_reviews_display_name_chk" CHECK (btrim("worker_reviews"."display_name") <> '' and char_length("worker_reviews"."display_name") <= 60),
	CONSTRAINT "worker_reviews_trade_chk" CHECK (btrim("worker_reviews"."trade") <> '' and char_length("worker_reviews"."trade") <= 120),
	CONSTRAINT "worker_reviews_publish_consent_chk" CHECK ("worker_reviews"."status" not in ('approved', 'hidden') or "worker_reviews"."consent_to_publish" = true)
);
--> statement-breakpoint
ALTER TABLE "referral_payouts" ADD CONSTRAINT "referral_payouts_cv_submission_id_cv_submissions_id_fk" FOREIGN KEY ("cv_submission_id") REFERENCES "public"."cv_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_payouts" ADD CONSTRAINT "referral_payouts_referrer_id_referrers_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."referrers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_payouts" ADD CONSTRAINT "referral_payouts_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_payouts" ADD CONSTRAINT "referral_payouts_paid_by_user_id_users_id_fk" FOREIGN KEY ("paid_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrers" ADD CONSTRAINT "referrers_status_changed_by_user_id_users_id_fk" FOREIGN KEY ("status_changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_slots" ADD CONSTRAINT "booking_slots_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_slots" ADD CONSTRAINT "booking_slots_cancelled_by_user_id_users_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_slots" ADD CONSTRAINT "booking_slots_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_bookings" ADD CONSTRAINT "slot_bookings_slot_id_booking_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."booking_slots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_bookings" ADD CONSTRAINT "slot_bookings_status_changed_by_user_id_users_id_fk" FOREIGN KEY ("status_changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_bookings" ADD CONSTRAINT "slot_bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_bookings" ADD CONSTRAINT "slot_bookings_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_review_requests" ADD CONSTRAINT "worker_review_requests_cv_submission_id_cv_submissions_id_fk" FOREIGN KEY ("cv_submission_id") REFERENCES "public"."cv_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_review_requests" ADD CONSTRAINT "worker_review_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_reviews" ADD CONSTRAINT "worker_reviews_cv_submission_id_cv_submissions_id_fk" FOREIGN KEY ("cv_submission_id") REFERENCES "public"."cv_submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_reviews" ADD CONSTRAINT "worker_reviews_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_reviews" ADD CONSTRAINT "worker_reviews_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "referral_payouts_cv_submission_uq" ON "referral_payouts" USING btree ("cv_submission_id");--> statement-breakpoint
CREATE INDEX "referral_payouts_referrer_idx" ON "referral_payouts" USING btree ("referrer_id","paid_at");--> statement-breakpoint
CREATE INDEX "referral_payouts_paid_by_idx" ON "referral_payouts" USING btree ("paid_by_user_id");--> statement-breakpoint
CREATE INDEX "referral_payouts_currency_idx" ON "referral_payouts" USING btree ("currency");--> statement-breakpoint
CREATE UNIQUE INDEX "referrers_code_uq" ON "referrers" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "referrers_phone_uq" ON "referrers" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "referrers_status_idx" ON "referrers" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "referrers_status_changed_by_idx" ON "referrers" USING btree ("status_changed_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_slots_code_uq" ON "booking_slots" USING btree ("code");--> statement-breakpoint
CREATE INDEX "booking_slots_date_idx" ON "booking_slots" USING btree ("date","start_time");--> statement-breakpoint
CREATE INDEX "booking_slots_open_idx" ON "booking_slots" USING btree ("date","start_time") WHERE status = 'open';--> statement-breakpoint
CREATE INDEX "booking_slots_course_idx" ON "booking_slots" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "booking_slots_created_by_idx" ON "booking_slots" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "booking_slots_cancelled_by_idx" ON "booking_slots" USING btree ("cancelled_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "slot_bookings_code_uq" ON "slot_bookings" USING btree ("code");--> statement-breakpoint
CREATE INDEX "slot_bookings_slot_idx" ON "slot_bookings" USING btree ("slot_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "slot_bookings_active_phone_uq" ON "slot_bookings" USING btree ("slot_id","phone") WHERE status <> 'cancelled';--> statement-breakpoint
CREATE INDEX "slot_bookings_phone_idx" ON "slot_bookings" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "slot_bookings_user_idx" ON "slot_bookings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "slot_bookings_created_by_idx" ON "slot_bookings" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "slot_bookings_status_changed_by_idx" ON "slot_bookings" USING btree ("status_changed_by_user_id");--> statement-breakpoint
CREATE INDEX "worker_review_requests_submission_idx" ON "worker_review_requests" USING btree ("cv_submission_id","created_at");--> statement-breakpoint
CREATE INDEX "worker_review_requests_requested_by_idx" ON "worker_review_requests" USING btree ("requested_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "worker_reviews_cv_submission_uq" ON "worker_reviews" USING btree ("cv_submission_id");--> statement-breakpoint
CREATE INDEX "worker_reviews_status_idx" ON "worker_reviews" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "worker_reviews_public_idx" ON "worker_reviews" USING btree ("published_at") WHERE "worker_reviews"."status" = 'approved' and "worker_reviews"."consent_to_publish" = true;--> statement-breakpoint
CREATE INDEX "worker_reviews_country_idx" ON "worker_reviews" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX "worker_reviews_reviewed_by_idx" ON "worker_reviews" USING btree ("reviewed_by_user_id");