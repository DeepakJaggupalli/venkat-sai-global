CREATE TABLE "countries" (
	"code" char(2) PRIMARY KEY NOT NULL,
	"iso3" char(3),
	"name" text NOT NULL,
	"native_name" text,
	"phone_code" text,
	"currency_code" char(3),
	"continent" text,
	"market_region" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_destination" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "currencies" (
	"code" char(3) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"symbol" text NOT NULL,
	"minor_units" integer DEFAULT 2 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "education_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"rank" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "industries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"parent_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"parent_id" uuid,
	"industry_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "languages" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"native_name" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_ui_locale" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qualification_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"synonyms" text[] NOT NULL,
	"status" text DEFAULT 'approved' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_code" char(2) NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_driver" text NOT NULL,
	"storage_key" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" char(64) NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"purpose" text NOT NULL,
	"owner_user_id" uuid,
	"organization_id" uuid,
	"scan_status" text DEFAULT 'pending' NOT NULL,
	"scanned_at" timestamp with time zone,
	"scan_detail" text,
	"width" integer,
	"height" integer,
	"variants" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"slug" text NOT NULL,
	"description" text,
	"website_url" text,
	"email" text,
	"phone" text,
	"logo_file_id" uuid,
	"industry_id" uuid,
	"country_code" char(2),
	"state_region" text,
	"city" text,
	"address_line1" text,
	"address_line2" text,
	"postal_code" text,
	"registration_number" text,
	"tax_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"status_reason" text,
	"verified_at" timestamp with time zone,
	"verification_expires_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"is_public" boolean DEFAULT false NOT NULL,
	"account_manager_user_id" uuid,
	"created_by_user_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"email_verified_at" timestamp with time zone,
	"phone" text,
	"phone_verified_at" timestamp with time zone,
	"password_hash" text,
	"password_changed_at" timestamp with time zone,
	"display_name" text NOT NULL,
	"avatar_file_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"status_reason" text,
	"is_staff" boolean DEFAULT false NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"timezone" text,
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"signup_source" text,
	"last_login_at" timestamp with time zone,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"anonymous_id" text,
	"purpose" text NOT NULL,
	"granted" boolean NOT NULL,
	"policy_version" text,
	"source" text NOT NULL,
	"context_type" text,
	"context_id" uuid,
	"captured_by_user_id" uuid,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"permissions" text[] NOT NULL,
	"organization_id" uuid,
	"is_system" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_scope_key_org_uq" UNIQUE NULLS NOT DISTINCT("scope","key","organization_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"two_factor_verified_at" timestamp with time zone,
	"ip_hash" text,
	"user_agent" text,
	"active_orgs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"granted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "user_two_factor" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"totp_secret_encrypted" text NOT NULL,
	"enabled_at" timestamp with time zone,
	"last_used_step" bigint,
	"recovery_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purpose" text NOT NULL,
	"channel" text NOT NULL,
	"target" text NOT NULL,
	"user_id" uuid,
	"secret_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"ip_hash" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"verification_id" uuid,
	"document_type" text NOT NULL,
	"title" text,
	"file_id" uuid NOT NULL,
	"document_number" text,
	"issued_by" text,
	"issued_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"review_status" text DEFAULT 'pending' NOT NULL,
	"review_notes" text,
	"uploaded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by_user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by_user_id" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"job_title" text,
	"department" text,
	"branch_id" uuid,
	"invited_by_user_id" uuid,
	"joined_at" timestamp with time zone,
	"last_active_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"submitted_by_user_id" uuid,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"decision_notes" text,
	"checklist" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"valid_until" timestamp with time zone,
	"approval_request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"approval_request_id" uuid NOT NULL,
	"action" text NOT NULL,
	"actor_user_id" uuid,
	"note" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"type" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"organization_id" uuid,
	"title" text NOT NULL,
	"summary" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"submitted_by_user_id" uuid,
	"assigned_to_user_id" uuid,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_reason" text,
	"due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	"actor_type" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"organization_id" uuid,
	"ip_hash" text,
	"user_agent" text,
	"request_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "background_jobs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "background_jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"queue" text DEFAULT 'default' NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"last_error" text,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"completed_at" timestamp with time zone,
	"dedupe_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "code_sequences" (
	"key" text PRIMARY KEY NOT NULL,
	"value" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_access_logs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "data_access_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	"actor_organization_id" uuid,
	"subject_user_id" uuid,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"data_category" text NOT NULL,
	"access_type" text NOT NULL,
	"reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"user_id" uuid,
	"requester_name" text,
	"requester_email" text,
	"requester_phone" text,
	"type" text NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"details" text,
	"due_at" timestamp with time zone,
	"identity_verified_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"handled_by_user_id" uuid,
	"resolution" text,
	"retention_exceptions" text,
	"export_file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dev_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text NOT NULL,
	"to" text NOT NULL,
	"subject" text,
	"body_text" text,
	"body_html" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'general' NOT NULL,
	"rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" uuid NOT NULL,
	"grantee_user_id" uuid,
	"grantee_organization_id" uuid,
	"granted_by_user_id" uuid,
	"reason" text NOT NULL,
	"context_type" text,
	"context_id" uuid,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "security_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"type" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"ip_hash" text,
	"user_agent" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"country_code" char(2) NOT NULL,
	"state_region" text,
	"city" text,
	"address_line1" text,
	"address_line2" text,
	"postal_code" text,
	"timezone" text,
	"is_headquarters" boolean DEFAULT false NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_branches_org_name_uq" UNIQUE("organization_id","name")
);
--> statement-breakpoint
CREATE TABLE "company_profiles" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"company_size" text,
	"founded_year" integer,
	"headquarters_country_code" char(2),
	"hiring_regions" text[] NOT NULL,
	"typical_roles" text[] NOT NULL,
	"typical_job_category_ids" uuid[] NOT NULL,
	"employer_branding_tagline" text,
	"about_html" text,
	"cover_file_id" uuid,
	"social_links" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"benefits_offered" text[] NOT NULL,
	"culture_media_file_ids" uuid[] NOT NULL,
	"public_contact_email" text,
	"public_contact_phone" text,
	"is_hiring_overseas" boolean DEFAULT false NOT NULL,
	"default_currency" char(3),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_profiles_founded_year_chk" CHECK ("company_profiles"."founded_year" between 1800 and 2100)
);
--> statement-breakpoint
CREATE TABLE "employer_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contract_type" text NOT NULL,
	"title" text NOT NULL,
	"reference" text,
	"starts_on" date,
	"ends_on" date,
	"status" text DEFAULT 'draft' NOT NULL,
	"terms" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"auto_renew" boolean DEFAULT false NOT NULL,
	"document_file_id" uuid,
	"signed_at" timestamp with time zone,
	"signed_by_name" text,
	"account_manager_user_id" uuid,
	"terminated_at" timestamp with time zone,
	"termination_reason" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employer_contracts_dates_chk" CHECK ("employer_contracts"."ends_on" >= "employer_contracts"."starts_on"),
	CONSTRAINT "employer_contracts_start_required_chk" CHECK ("employer_contracts"."status" = 'draft' or "employer_contracts"."starts_on" is not null),
	CONSTRAINT "employer_contracts_terminated_chk" CHECK ("employer_contracts"."status" <> 'terminated' or "employer_contracts"."terminated_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "partner_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"version" text NOT NULL,
	"title" text NOT NULL,
	"terms_snapshot" text NOT NULL,
	"terms_sha256" char(64) NOT NULL,
	"commercial_terms" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"document_file_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"issued_by_user_id" uuid,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_by_user_id" uuid,
	"accepted_by_name" text,
	"accepted_at" timestamp with time zone,
	"ip_hash" text,
	"user_agent" text,
	"effective_from" date,
	"effective_until" date,
	"superseded_by_agreement_id" uuid,
	"terminated_at" timestamp with time zone,
	"termination_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_agreements_org_version_uq" UNIQUE("organization_id","version"),
	CONSTRAINT "partner_agreements_effective_chk" CHECK ("partner_agreements"."effective_until" >= "partner_agreements"."effective_from"),
	CONSTRAINT "partner_agreements_active_accepted_chk" CHECK ("partner_agreements"."status" <> 'active' or "partner_agreements"."accepted_at" is not null),
	CONSTRAINT "partner_agreements_terminated_chk" CHECK ("partner_agreements"."status" <> 'terminated' or "partner_agreements"."terminated_at" is not null),
	CONSTRAINT "partner_agreements_superseded_by_chk" CHECK ("partner_agreements"."superseded_by_agreement_id" <> "partner_agreements"."id")
);
--> statement-breakpoint
CREATE TABLE "partner_licences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"licence_type" text NOT NULL,
	"licence_number" text NOT NULL,
	"issuing_authority" text,
	"issuing_country_code" char(2) NOT NULL,
	"issuing_region" text,
	"valid_from" date,
	"valid_until" date,
	"file_id" uuid,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"verification_status" text DEFAULT 'pending' NOT NULL,
	"verification_method" text,
	"verified_by_user_id" uuid,
	"verified_at" timestamp with time zone,
	"rejection_reason" text,
	"notes" text,
	"submitted_by_user_id" uuid,
	"expiry_reminder_sent_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_licences_validity_chk" CHECK ("partner_licences"."valid_until" >= "partner_licences"."valid_from"),
	CONSTRAINT "partner_licences_verified_chk" CHECK ("partner_licences"."verification_status" <> 'verified' or ("partner_licences"."file_id" is not null and "partner_licences"."verified_at" is not null)),
	CONSTRAINT "partner_licences_india_ra_country_chk" CHECK ("partner_licences"."licence_type" <> 'india_recruiting_agent' or "partner_licences"."issuing_country_code" = 'IN'),
	CONSTRAINT "partner_licences_foreign_country_chk" CHECK ("partner_licences"."licence_type" <> 'foreign_recruitment_licence' or "partner_licences"."issuing_country_code" <> 'IN')
);
--> statement-breakpoint
CREATE TABLE "partner_profiles" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"business_type" text,
	"services_provided" text[] NOT NULL,
	"years_in_operation" integer,
	"specialisations" text[] NOT NULL,
	"industry_ids" uuid[] NOT NULL,
	"placements_claimed" integer,
	"quality_score" numeric(5, 2),
	"quality_score_updated_at" timestamp with time zone,
	"status_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_profiles_years_chk" CHECK ("partner_profiles"."years_in_operation" between 0 and 200),
	CONSTRAINT "partner_profiles_placements_claimed_chk" CHECK ("partner_profiles"."placements_claimed" >= 0),
	CONSTRAINT "partner_profiles_quality_score_chk" CHECK ("partner_profiles"."quality_score" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "partner_territories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"country_code" char(2) NOT NULL,
	"state_region" text,
	"scope" text DEFAULT 'sourcing' NOT NULL,
	"is_authorised" boolean DEFAULT false NOT NULL,
	"authorised_by_user_id" uuid,
	"authorised_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_territories_authorised_chk" CHECK (not "partner_territories"."is_authorised" or "partner_territories"."authorised_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "candidate_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"credential_type" text NOT NULL,
	"name" text NOT NULL,
	"issuer" text,
	"issuer_type" text DEFAULT 'self_declared' NOT NULL,
	"credential_number" text,
	"issued_at" date,
	"expires_at" date,
	"file_id" uuid,
	"certificate_id" uuid,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"verified_by_user_id" uuid,
	"verified_at" timestamp with time zone,
	"rejection_reason" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_credentials_issuer_chk" CHECK ("candidate_credentials"."issuer_type" <> 'venkat_sai' or "candidate_credentials"."certificate_id" is not null),
	CONSTRAINT "candidate_credentials_dates_chk" CHECK ("candidate_credentials"."expires_at" >= "candidate_credentials"."issued_at")
);
--> statement-breakpoint
CREATE TABLE "candidate_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"document_type" text NOT NULL,
	"title" text,
	"file_id" uuid NOT NULL,
	"document_number_encrypted" text,
	"document_number_last4" text,
	"issuing_country_code" char(2),
	"issued_at" date,
	"expires_at" date,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"verified_by_user_id" uuid,
	"verified_at" timestamp with time zone,
	"rejection_reason" text,
	"is_shareable_with_employers" boolean DEFAULT false NOT NULL,
	"uploaded_by_user_id" uuid,
	"expiry_reminder_sent_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_documents_last4_chk" CHECK (char_length("candidate_documents"."document_number_last4") <= 4),
	CONSTRAINT "candidate_documents_dates_chk" CHECK ("candidate_documents"."expires_at" >= "candidate_documents"."issued_at")
);
--> statement-breakpoint
CREATE TABLE "candidate_education" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"education_level_id" uuid,
	"qualification_type_id" uuid,
	"institution_name" text NOT NULL,
	"board_or_university" text,
	"qualification" text,
	"specialisation" text,
	"country_code" char(2),
	"start_date" date,
	"end_date" date,
	"is_current" boolean DEFAULT false NOT NULL,
	"grade_or_score" text,
	"document_file_id" uuid,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"verified_by_user_id" uuid,
	"verified_at" timestamp with time zone,
	"verification_note" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_education_dates_chk" CHECK ("candidate_education"."end_date" >= "candidate_education"."start_date")
);
--> statement-breakpoint
CREATE TABLE "candidate_experience" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"employer_name" text NOT NULL,
	"job_title" text NOT NULL,
	"industry_id" uuid,
	"job_category_id" uuid,
	"country_code" char(2),
	"city" text,
	"employment_type" text,
	"start_date" date,
	"end_date" date,
	"is_current" boolean DEFAULT false NOT NULL,
	"responsibilities" text,
	"projects" text,
	"achievements" text,
	"evidence_file_id" uuid,
	"reference_name" text,
	"reference_contact" text,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"verified_by_user_id" uuid,
	"verified_at" timestamp with time zone,
	"verification_note" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_experience_dates_chk" CHECK ("candidate_experience"."end_date" >= "candidate_experience"."start_date"),
	CONSTRAINT "candidate_experience_current_chk" CHECK (not "candidate_experience"."is_current" or "candidate_experience"."end_date" is null)
);
--> statement-breakpoint
CREATE TABLE "candidate_languages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"language_code" text NOT NULL,
	"proficiency" text NOT NULL,
	"can_read" boolean DEFAULT false NOT NULL,
	"can_write" boolean DEFAULT false NOT NULL,
	"can_speak" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_languages_candidate_language_uq" UNIQUE("candidate_id","language_code")
);
--> statement-breakpoint
CREATE TABLE "candidate_portfolio_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"project_date" date,
	"location" text,
	"media_file_ids" uuid[] NOT NULL,
	"video_url" text,
	"tags" text[] NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_portfolio_items_video_url_chk" CHECK ("candidate_portfolio_items"."video_url" ~ '^https://((www|m)[.])?(youtube[.]com|youtube-nocookie[.]com|youtu[.]be|vimeo[.]com|player[.]vimeo[.]com)/')
);
--> statement-breakpoint
CREATE TABLE "candidate_preferred_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"country_code" char(2) NOT NULL,
	"state_region" text,
	"city" text,
	"priority" smallint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_preferred_locations_priority_chk" CHECK ("candidate_preferred_locations"."priority" >= 1)
);
--> statement-breakpoint
CREATE TABLE "candidate_privacy_settings" (
	"candidate_id" uuid PRIMARY KEY NOT NULL,
	"show_full_name_to_employers" boolean DEFAULT false NOT NULL,
	"show_contact_to_unlocked_only" boolean DEFAULT true NOT NULL,
	"show_photo" boolean DEFAULT false NOT NULL,
	"show_current_employer" boolean DEFAULT false NOT NULL,
	"allow_direct_contact" boolean DEFAULT false NOT NULL,
	"blocked_organization_ids" uuid[] NOT NULL,
	"allow_partner_submissions" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"headline" text,
	"about" text,
	"career_objective" text,
	"experience_level" text,
	"total_experience_months" integer,
	"current_job_title" text,
	"current_employer_name" text,
	"industry_id" uuid,
	"preferred_category_ids" uuid[] NOT NULL,
	"preferred_roles" text[] NOT NULL,
	"desired_employment_types" text[] NOT NULL,
	"preferred_work_modes" text[] NOT NULL,
	"availability" text,
	"available_from" date,
	"notice_period_days" smallint,
	"expected_salary_minor" bigint,
	"expected_salary_currency" char(3),
	"expected_salary_period" text,
	"current_country_code" char(2),
	"state_region" text,
	"city" text,
	"nationality_code" char(2),
	"legal_name" text,
	"date_of_birth" date,
	"gender" text,
	"gender_self_description" text,
	"willing_to_relocate" boolean DEFAULT false NOT NULL,
	"open_to_overseas" boolean DEFAULT false NOT NULL,
	"passport_status" text,
	"passport_number_encrypted" text,
	"passport_number_last4" text,
	"passport_number_hash" text,
	"passport_expiry" date,
	"emigration_check_status" text,
	"photo_file_id" uuid,
	"resume_file_id" uuid,
	"resume_updated_at" timestamp with time zone,
	"profile_completeness" smallint DEFAULT 0 NOT NULL,
	"visibility" text DEFAULT 'venkat_sai_only' NOT NULL,
	"is_open_to_work" boolean DEFAULT true NOT NULL,
	"verification_level" text DEFAULT 'none' NOT NULL,
	"source" text DEFAULT 'self' NOT NULL,
	"sourced_by_partner_org_id" uuid,
	"created_by_user_id" uuid,
	"last_active_at" timestamp with time zone,
	"skill_names_cache" text[] NOT NULL,
	"skills_text" text,
	"preferred_roles_text" text,
	"search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple'::regconfig, coalesce("candidate_profiles"."headline", '') || ' ' || coalesce("candidate_profiles"."current_job_title", '')), 'A')
        || setweight(to_tsvector('simple'::regconfig, coalesce("candidate_profiles"."preferred_roles_text", '') || ' ' || coalesce("candidate_profiles"."skills_text", '')), 'B')
        || setweight(to_tsvector('simple'::regconfig, coalesce("candidate_profiles"."city", '') || ' ' || coalesce("candidate_profiles"."state_region", '')), 'C')) STORED,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_profiles_experience_chk" CHECK ("candidate_profiles"."total_experience_months" >= 0),
	CONSTRAINT "candidate_profiles_notice_period_chk" CHECK ("candidate_profiles"."notice_period_days" >= 0),
	CONSTRAINT "candidate_profiles_completeness_chk" CHECK ("candidate_profiles"."profile_completeness" between 0 and 100),
	CONSTRAINT "candidate_profiles_expected_salary_chk" CHECK ("candidate_profiles"."expected_salary_minor" is null or ("candidate_profiles"."expected_salary_minor" >= 0 and "candidate_profiles"."expected_salary_currency" is not null and "candidate_profiles"."expected_salary_period" is not null)),
	CONSTRAINT "candidate_profiles_passport_last4_chk" CHECK (char_length("candidate_profiles"."passport_number_last4") <= 4)
);
--> statement-breakpoint
CREATE TABLE "candidate_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"level" text,
	"years_experience" smallint,
	"is_primary" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'self' NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"credential_id" uuid,
	"skill_assessment_id" uuid,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_skills_candidate_skill_uq" UNIQUE("candidate_id","skill_id"),
	CONSTRAINT "candidate_skills_years_chk" CHECK ("candidate_skills"."years_experience" between 0 and 60),
	CONSTRAINT "candidate_skills_verified_chk" CHECK (not "candidate_skills"."verified" or "candidate_skills"."source" <> 'self')
);
--> statement-breakpoint
CREATE TABLE "enquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"type" text DEFAULT 'general' NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"organization_name" text,
	"subject" text,
	"message" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"assigned_to_user_id" uuid,
	"lead_id" uuid,
	"user_id" uuid,
	"support_ticket_id" uuid,
	"consent_to_contact" boolean DEFAULT false NOT NULL,
	"privacy_notice_version" text,
	"locale" text,
	"source_page" text,
	"ip_hash" text,
	"responded_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enquiries_contact_chk" CHECK ("enquiries"."email" is not null or "enquiries"."phone" is not null)
);
--> statement-breakpoint
CREATE TABLE "internal_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"organization_id" uuid,
	"author_user_id" uuid,
	"body" text NOT NULL,
	"visibility" text DEFAULT 'staff' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "internal_notes_scope_chk" CHECK ("internal_notes"."visibility" <> 'org_internal' or "internal_notes"."organization_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"type" text NOT NULL,
	"source" text NOT NULL,
	"source_detail" text,
	"status" text DEFAULT 'new' NOT NULL,
	"name" text NOT NULL,
	"designation" text,
	"organization_name" text,
	"email" text,
	"phone" text,
	"country_code" char(2),
	"city" text,
	"interest" text,
	"notes" text,
	"estimated_value_minor" bigint,
	"estimated_value_currency" char(3),
	"consent_to_contact" boolean DEFAULT false NOT NULL,
	"assigned_to_user_id" uuid,
	"organization_id" uuid,
	"converted_at" timestamp with time zone,
	"utm" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_contacted_at" timestamp with time zone,
	"next_follow_up_at" timestamp with time zone,
	"lost_reason" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_estimated_value_chk" CHECK (("leads"."estimated_value_minor" is null) = ("leads"."estimated_value_currency" is null) and coalesce("leads"."estimated_value_minor", 0) >= 0)
);
--> statement-breakpoint
CREATE TABLE "message_thread_participants" (
	"thread_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid,
	"last_read_at" timestamp with time zone,
	"is_muted" boolean DEFAULT false NOT NULL,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_thread_participants_pk" PRIMARY KEY("thread_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "message_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject" text NOT NULL,
	"context_type" text DEFAULT 'general' NOT NULL,
	"context_id" uuid,
	"organization_id" uuid,
	"created_by_user_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"last_message_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_threads_context_chk" CHECK ("message_threads"."context_type" = 'general' or "message_threads"."context_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"author_user_id" uuid,
	"is_system" boolean DEFAULT false NOT NULL,
	"body" text NOT NULL,
	"attachment_file_ids" uuid[] NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requirement_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requirement_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"job_category_id" uuid,
	"role_title" text NOT NULL,
	"positions" integer NOT NULL,
	"experience_min_years" integer,
	"experience_max_years" integer,
	"qualification" text,
	"required_skills" text[] NOT NULL,
	"salary_min_minor" bigint,
	"salary_max_minor" bigint,
	"salary_currency" char(3),
	"salary_period" text,
	"notes" text,
	"filled_count" integer DEFAULT 0 NOT NULL,
	"job_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requirement_lines_positions_chk" CHECK ("requirement_lines"."positions" > 0),
	CONSTRAINT "requirement_lines_filled_chk" CHECK ("requirement_lines"."filled_count" >= 0),
	CONSTRAINT "requirement_lines_experience_chk" CHECK (coalesce("requirement_lines"."experience_min_years", 0) >= 0 and ("requirement_lines"."experience_max_years" is null or "requirement_lines"."experience_max_years" >= coalesce("requirement_lines"."experience_min_years", 0))),
	CONSTRAINT "requirement_lines_salary_chk" CHECK (coalesce("requirement_lines"."salary_min_minor", 0) >= 0 and coalesce("requirement_lines"."salary_max_minor", 0) >= 0 and ("requirement_lines"."salary_min_minor" is null or "requirement_lines"."salary_max_minor" is null or "requirement_lines"."salary_min_minor" <= "requirement_lines"."salary_max_minor") and (("requirement_lines"."salary_min_minor" is null and "requirement_lines"."salary_max_minor" is null) or ("requirement_lines"."salary_currency" is not null and "requirement_lines"."salary_period" is not null)))
);
--> statement-breakpoint
CREATE TABLE "requirement_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"organization_id" uuid,
	"lead_id" uuid,
	"submitted_by_user_id" uuid,
	"source" text NOT NULL,
	"kind" text DEFAULT 'bulk' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"organization_name" text,
	"contact_name" text NOT NULL,
	"contact_designation" text,
	"contact_email" text,
	"contact_phone" text,
	"consent_to_contact" boolean DEFAULT false NOT NULL,
	"privacy_notice_version" text,
	"country_code" char(2),
	"locations" text,
	"industry_id" uuid,
	"total_positions" integer NOT NULL,
	"contract_duration_months" integer,
	"working_hours" text,
	"joining_by" date,
	"interview_method" text,
	"interview_details" text,
	"assessment_required" boolean DEFAULT false NOT NULL,
	"assessment_details" text,
	"documentation_requirements" text,
	"language_requirements" text,
	"benefits" text[] NOT NULL,
	"accommodation_provided" boolean DEFAULT false NOT NULL,
	"food_provided" boolean DEFAULT false NOT NULL,
	"transport_provided" boolean DEFAULT false NOT NULL,
	"urgency" text DEFAULT 'normal' NOT NULL,
	"attachment_file_ids" uuid[] NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"status_reason" text,
	"assigned_to_user_id" uuid,
	"approval_request_id" uuid,
	"quoted_fee_minor" bigint,
	"quoted_fee_currency" char(3),
	"internal_notes" text,
	"ip_hash" text,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple'::regconfig, coalesce("requirement_requests"."code", '') || ' ' || coalesce("requirement_requests"."title", '')), 'A') || setweight(to_tsvector('simple'::regconfig, coalesce("requirement_requests"."organization_name", '')), 'B') || setweight(to_tsvector('simple'::regconfig, coalesce("requirement_requests"."locations", '')), 'C') || setweight(to_tsvector('simple'::regconfig, coalesce("requirement_requests"."description", '')), 'D')) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requirement_requests_positions_chk" CHECK ("requirement_requests"."total_positions" > 0),
	CONSTRAINT "requirement_requests_duration_chk" CHECK ("requirement_requests"."contract_duration_months" is null or "requirement_requests"."contract_duration_months" > 0),
	CONSTRAINT "requirement_requests_quote_chk" CHECK (("requirement_requests"."quoted_fee_minor" is null) = ("requirement_requests"."quoted_fee_currency" is null) and coalesce("requirement_requests"."quoted_fee_minor", 0) >= 0),
	CONSTRAINT "requirement_requests_submitted_chk" CHECK ("requirement_requests"."status" = 'draft' or "requirement_requests"."submitted_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"grievance_code" text,
	"requester_user_id" uuid,
	"requester_name" text,
	"requester_email" text,
	"requester_phone" text,
	"organization_id" uuid,
	"portal" text DEFAULT 'public' NOT NULL,
	"channel" text DEFAULT 'web' NOT NULL,
	"category" text NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"subject" text NOT NULL,
	"tags" text[] NOT NULL,
	"locale" text,
	"assigned_to_user_id" uuid,
	"related_type" text,
	"related_id" uuid,
	"data_request_id" uuid,
	"first_response_due_at" timestamp with time zone,
	"first_responded_at" timestamp with time zone,
	"resolution_due_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"sla_breached_at" timestamp with time zone,
	"escalation_level" integer DEFAULT 0 NOT NULL,
	"escalated_at" timestamp with time zone,
	"is_grievance" boolean DEFAULT false NOT NULL,
	"grievance_type" text,
	"resolution" text,
	"satisfaction_rating" smallint,
	"satisfaction_comment" text,
	"last_message_at" timestamp with time zone,
	"ip_hash" text,
	"search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple'::regconfig, coalesce("support_tickets"."code", '') || ' ' || coalesce("support_tickets"."grievance_code", '')), 'A') || setweight(to_tsvector('simple'::regconfig, coalesce("support_tickets"."subject", '')), 'B') || setweight(to_tsvector('simple'::regconfig, coalesce("support_tickets"."requester_name", '')), 'C')) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_tickets_rating_chk" CHECK ("support_tickets"."satisfaction_rating" is null or "support_tickets"."satisfaction_rating" between 1 and 5),
	CONSTRAINT "support_tickets_escalation_chk" CHECK ("support_tickets"."escalation_level" >= 0),
	CONSTRAINT "support_tickets_grievance_chk" CHECK ("support_tickets"."is_grievance" = ("support_tickets"."grievance_type" is not null) and ("support_tickets"."grievance_code" is null or "support_tickets"."is_grievance") and ("support_tickets"."category" <> 'grievance' or "support_tickets"."is_grievance"))
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'todo' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"due_at" timestamp with time zone,
	"assigned_to_user_id" uuid,
	"created_by_user_id" uuid,
	"organization_id" uuid,
	"related_type" text,
	"related_id" uuid,
	"completed_at" timestamp with time zone,
	"completed_by_user_id" uuid,
	"reminder_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_completed_chk" CHECK ("tasks"."status" <> 'done' or "tasks"."completed_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "ticket_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"author_user_id" uuid,
	"author_type" text NOT NULL,
	"author_name" text,
	"body" text NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"attachment_file_ids" uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_messages_internal_chk" CHECK (not ("ticket_messages"."is_internal" and "ticket_messages"."author_type" = 'requester'))
);
--> statement-breakpoint
CREATE TABLE "job_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"criteria" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"frequency" text DEFAULT 'weekly' NOT NULL,
	"channels" text[] DEFAULT '{"email","in_app"}' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"country_code" char(2) NOT NULL,
	"state_region" text,
	"city" text,
	"openings" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_locations_openings_chk" CHECK ("job_locations"."openings" > 0)
);
--> statement-breakpoint
CREATE TABLE "job_promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"type" text NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"source_type" text NOT NULL,
	"reference_id" uuid,
	"created_by_user_id" uuid,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_promotions_window_chk" CHECK ("job_promotions"."ends_at" > "job_promotions"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "job_screening_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"question" text NOT NULL,
	"help_text" text,
	"type" text NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"knockout_answer" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_screening_questions_options_chk" CHECK (case when jsonb_typeof("job_screening_questions"."options") <> 'array' then false when "job_screening_questions"."type" in ('single_choice', 'multi_choice') then jsonb_array_length("job_screening_questions"."options") > 0 else true end)
);
--> statement-breakpoint
CREATE TABLE "job_skills" (
	"job_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"min_years" smallint,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_skills_job_id_skill_id_pk" PRIMARY KEY("job_id","skill_id"),
	CONSTRAINT "job_skills_min_years_chk" CHECK ("job_skills"."min_years" >= 0)
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"slug" text NOT NULL,
	"organization_id" uuid,
	"requirement_id" uuid,
	"workflow_id" uuid,
	"posted_by_user_id" uuid,
	"managed_by_venkat_sai" boolean DEFAULT false NOT NULL,
	"is_confidential" boolean DEFAULT false NOT NULL,
	"confidential_employer_name" text,
	"employer_reference" text,
	"title" text NOT NULL,
	"summary" text,
	"description_html" text,
	"responsibilities" text,
	"qualifications_text" text,
	"job_category_id" uuid,
	"industry_id" uuid,
	"employment_type" text DEFAULT 'full_time' NOT NULL,
	"work_mode" text DEFAULT 'on_site' NOT NULL,
	"experience_level" text,
	"experience_min_years" smallint,
	"experience_max_years" smallint,
	"min_education_level_id" uuid,
	"openings" integer DEFAULT 1 NOT NULL,
	"salary_min_minor" bigint,
	"salary_max_minor" bigint,
	"salary_currency" char(3),
	"salary_period" text,
	"salary_visible" boolean DEFAULT true NOT NULL,
	"benefits" text[] NOT NULL,
	"country_code" char(2),
	"state_region" text,
	"city" text,
	"is_overseas" boolean DEFAULT false NOT NULL,
	"visa_sponsorship" text DEFAULT 'not_applicable' NOT NULL,
	"sponsorship_details" text,
	"accommodation_provided" boolean,
	"food_provided" boolean,
	"transport_provided" boolean,
	"contract_duration_months" smallint,
	"working_hours" text,
	"recruitment_process" text,
	"application_deadline" timestamp with time zone,
	"start_date" date,
	"status" text DEFAULT 'draft' NOT NULL,
	"moderation_note" text,
	"published_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"closed_reason" text,
	"scheduled_publish_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"is_featured" boolean DEFAULT false NOT NULL,
	"featured_until" timestamp with time zone,
	"apply_mode" text DEFAULT 'platform' NOT NULL,
	"external_apply_url" text,
	"screening_required" boolean DEFAULT false NOT NULL,
	"verified_employer" boolean DEFAULT false NOT NULL,
	"info_source" text DEFAULT 'pending_review' NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"application_count" integer DEFAULT 0 NOT NULL,
	"skills_text" text,
	"category_name_cache" text,
	"search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple'::regconfig, coalesce("jobs"."title", '')), 'A')
        || setweight(to_tsvector('simple'::regconfig, coalesce("jobs"."category_name_cache", '') || ' ' || coalesce("jobs"."skills_text", '')), 'B')
        || setweight(to_tsvector('simple'::regconfig, coalesce("jobs"."summary", '')), 'C')
        || setweight(to_tsvector('simple'::regconfig, coalesce("jobs"."city", '') || ' ' || coalesce("jobs"."state_region", '')), 'D')) STORED,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_owner_chk" CHECK ("jobs"."organization_id" is not null or "jobs"."managed_by_venkat_sai"),
	CONSTRAINT "jobs_openings_chk" CHECK ("jobs"."openings" > 0),
	CONSTRAINT "jobs_experience_years_chk" CHECK ("jobs"."experience_min_years" >= 0 and "jobs"."experience_max_years" >= 0),
	CONSTRAINT "jobs_experience_range_chk" CHECK ("jobs"."experience_max_years" >= "jobs"."experience_min_years"),
	CONSTRAINT "jobs_salary_amounts_chk" CHECK ("jobs"."salary_min_minor" >= 0 and "jobs"."salary_max_minor" >= 0),
	CONSTRAINT "jobs_salary_range_chk" CHECK ("jobs"."salary_max_minor" >= "jobs"."salary_min_minor"),
	CONSTRAINT "jobs_salary_currency_chk" CHECK (("jobs"."salary_min_minor" is null and "jobs"."salary_max_minor" is null) or ("jobs"."salary_currency" is not null and "jobs"."salary_period" is not null)),
	CONSTRAINT "jobs_contract_duration_chk" CHECK ("jobs"."contract_duration_months" > 0),
	CONSTRAINT "jobs_external_apply_chk" CHECK ("jobs"."apply_mode" <> 'external_url' or "jobs"."external_apply_url" is not null)
);
--> statement-breakpoint
CREATE TABLE "saved_jobs" (
	"user_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_jobs_user_id_job_id_pk" PRIMARY KEY("user_id","job_id")
);
--> statement-breakpoint
CREATE TABLE "assessment_centres" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"country_code" char(2) NOT NULL,
	"state_region" text,
	"city" text NOT NULL,
	"address_line1" text,
	"address_line2" text,
	"postal_code" text,
	"timezone" text,
	"capabilities" text[] NOT NULL,
	"contact_phone" text,
	"contact_email" text,
	"candidate_instructions" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"enrolment_id" uuid NOT NULL,
	"score" numeric(7, 2),
	"is_absent" boolean DEFAULT false NOT NULL,
	"passed" boolean,
	"remarks" text,
	"recorded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_scores_assessment_enrolment_uq" UNIQUE("assessment_id","enrolment_id"),
	CONSTRAINT "assessment_scores_score_chk" CHECK ("assessment_scores"."score" >= 0),
	CONSTRAINT "assessment_scores_absent_chk" CHECK (not "assessment_scores"."is_absent" or "assessment_scores"."score" is null)
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"enrolment_id" uuid NOT NULL,
	"status" text NOT NULL,
	"remarks" text,
	"recorded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_records_session_enrolment_uq" UNIQUE("session_id","enrolment_id")
);
--> statement-breakpoint
CREATE TABLE "attendance_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"session_date" date NOT NULL,
	"topic" text,
	"course_module_id" uuid,
	"duration_hours" numeric(5, 2),
	"recorded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_sessions_duration_chk" CHECK ("attendance_sessions"."duration_hours" > 0)
);
--> statement-breakpoint
CREATE TABLE "batch_instructors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"bio" text,
	"role" text DEFAULT 'lead' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "batch_instructors_batch_user_uq" UNIQUE("batch_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"course_id" uuid NOT NULL,
	"organization_id" uuid,
	"requirement_id" uuid,
	"title" text NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"schedule" text,
	"timezone" text,
	"mode" text DEFAULT 'in_person' NOT NULL,
	"venue" text,
	"country_code" char(2),
	"city" text,
	"capacity" integer,
	"enrolled_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"registration_deadline" date,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "batches_dates_chk" CHECK ("batches"."ends_on" >= "batches"."starts_on"),
	CONSTRAINT "batches_capacity_chk" CHECK ("batches"."capacity" > 0),
	CONSTRAINT "batches_enrolled_count_chk" CHECK ("batches"."enrolled_count" >= 0),
	CONSTRAINT "batches_cancelled_chk" CHECK ("batches"."status" <> 'cancelled' or "batches"."cancelled_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "campus_drive_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drive_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"status" text DEFAULT 'registered' NOT NULL,
	"registered_by_user_id" uuid,
	"consent_to_share_at" timestamp with time zone,
	"application_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campus_drive_registrations_drive_candidate_uq" UNIQUE("drive_id","candidate_id")
);
--> statement-breakpoint
CREATE TABLE "campus_drives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"organization_id" uuid,
	"employer_organization_id" uuid,
	"employer_name" text,
	"requirement_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"drive_date" date,
	"drive_end_date" date,
	"registration_deadline" date,
	"mode" text DEFAULT 'in_person' NOT NULL,
	"venue" text,
	"country_code" char(2),
	"city" text,
	"eligibility" text,
	"job_ids" uuid[] NOT NULL,
	"openings" integer,
	"capacity" integer,
	"status" text DEFAULT 'planned' NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"coordinator_user_id" uuid,
	"cancellation_reason" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campus_drives_dates_chk" CHECK ("campus_drives"."drive_end_date" >= "campus_drives"."drive_date"),
	CONSTRAINT "campus_drives_openings_chk" CHECK ("campus_drives"."openings" > 0),
	CONSTRAINT "campus_drives_capacity_chk" CHECK ("campus_drives"."capacity" > 0)
);
--> statement-breakpoint
CREATE TABLE "certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"candidate_id" uuid NOT NULL,
	"holder_name" text NOT NULL,
	"issuer_type" text NOT NULL,
	"issuer_organization_id" uuid,
	"issuer_name" text NOT NULL,
	"accreditation_body" text,
	"external_certificate_number" text,
	"course_id" uuid,
	"batch_id" uuid,
	"enrolment_id" uuid,
	"skill_assessment_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"verification_code" text NOT NULL,
	"public_verification_enabled" boolean DEFAULT true NOT NULL,
	"file_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"revoked_by_user_id" uuid,
	"replaces_certificate_id" uuid,
	"issued_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "certificates_issuer_chk" CHECK (("certificates"."issuer_type" = 'venkat_sai' and "certificates"."issuer_organization_id" is null) or ("certificates"."issuer_type" = 'institution_completion' and "certificates"."issuer_organization_id" is not null) or ("certificates"."issuer_type" = 'accredited_external' and "certificates"."accreditation_body" is not null)),
	CONSTRAINT "certificates_expiry_chk" CHECK ("certificates"."expires_at" > "certificates"."issued_at"),
	CONSTRAINT "certificates_revoked_chk" CHECK ("certificates"."status" <> 'revoked' or "certificates"."revoked_at" is not null),
	CONSTRAINT "certificates_verification_code_chk" CHECK (char_length("certificates"."verification_code") >= 8),
	CONSTRAINT "certificates_replaces_chk" CHECK ("certificates"."replaces_certificate_id" <> "certificates"."id")
);
--> statement-breakpoint
CREATE TABLE "course_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"title" text NOT NULL,
	"type" text NOT NULL,
	"max_score" numeric(7, 2) NOT NULL,
	"pass_score" numeric(7, 2),
	"weight_percent" numeric(5, 2),
	"scheduled_at" timestamp with time zone,
	"results_published_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_assessments_max_score_chk" CHECK ("course_assessments"."max_score" > 0),
	CONSTRAINT "course_assessments_pass_score_chk" CHECK ("course_assessments"."pass_score" between 0 and "course_assessments"."max_score"),
	CONSTRAINT "course_assessments_weight_chk" CHECK ("course_assessments"."weight_percent" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "course_modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"duration_hours" numeric(6, 2),
	"material_file_ids" uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_modules_duration_chk" CHECK ("course_modules"."duration_hours" > 0)
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"organization_id" uuid,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"description_html" text,
	"category" text NOT NULL,
	"skill_ids" uuid[] NOT NULL,
	"mode" text DEFAULT 'in_person' NOT NULL,
	"duration_hours" integer,
	"duration_weeks" integer,
	"eligibility" text,
	"prerequisites" text,
	"outcomes" text[] NOT NULL,
	"fee_type" text DEFAULT 'on_request' NOT NULL,
	"fee_minor" bigint,
	"fee_currency" char(3),
	"fee_notes" text,
	"language_codes" text[] NOT NULL,
	"certification_type" text DEFAULT 'none' NOT NULL,
	"accreditation_body" text,
	"cover_file_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"is_featured" boolean DEFAULT false NOT NULL,
	"created_by_user_id" uuid,
	"search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple'::regconfig, coalesce("courses"."title", '')), 'A') || setweight(to_tsvector('simple'::regconfig, coalesce("courses"."summary", '') || ' ' || coalesce("courses"."eligibility", '') || ' ' || coalesce("courses"."accreditation_body", '')), 'B')) STORED,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "courses_duration_hours_chk" CHECK ("courses"."duration_hours" > 0),
	CONSTRAINT "courses_duration_weeks_chk" CHECK ("courses"."duration_weeks" > 0),
	CONSTRAINT "courses_fee_chk" CHECK (("courses"."fee_type" = 'fixed' and "courses"."fee_minor" is not null and "courses"."fee_minor" > 0 and "courses"."fee_currency" is not null) or ("courses"."fee_type" <> 'fixed' and "courses"."fee_minor" is null and "courses"."fee_currency" is null)),
	CONSTRAINT "courses_accreditation_body_chk" CHECK ("courses"."certification_type" <> 'accredited_external' or "courses"."accreditation_body" is not null),
	CONSTRAINT "courses_published_chk" CHECK ("courses"."status" <> 'published' or "courses"."published_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "enrolments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"status" text DEFAULT 'applied' NOT NULL,
	"source" text DEFAULT 'self' NOT NULL,
	"enrolled_by_user_id" uuid,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"status_reason" text,
	"fee_status" text DEFAULT 'not_applicable' NOT NULL,
	"fee_minor" bigint,
	"fee_currency" char(3),
	"payment_reference" text,
	"attendance_percent" numeric(5, 2),
	"final_score" numeric(5, 2),
	"result_status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enrolments_batch_candidate_uq" UNIQUE("batch_id","candidate_id"),
	CONSTRAINT "enrolments_fee_chk" CHECK (("enrolments"."fee_minor" is null) = ("enrolments"."fee_currency" is null) and ("enrolments"."fee_minor" is null or "enrolments"."fee_minor" >= 0)),
	CONSTRAINT "enrolments_attendance_chk" CHECK ("enrolments"."attendance_percent" between 0 and 100),
	CONSTRAINT "enrolments_final_score_chk" CHECK ("enrolments"."final_score" between 0 and 100),
	CONSTRAINT "enrolments_completed_chk" CHECK ("enrolments"."status" <> 'completed' or "enrolments"."completed_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "institution_profiles" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"institution_kind" text,
	"accreditation_bodies" text[] NOT NULL,
	"affiliation" text,
	"established_year" integer,
	"student_capacity" integer,
	"campus_address" text,
	"about_html" text,
	"cover_file_id" uuid,
	"placement_officer_name" text,
	"placement_officer_email" text,
	"placement_officer_phone" text,
	"is_authorised_certificate_issuer" boolean DEFAULT false NOT NULL,
	"authorised_issuer_scope" text,
	"authorised_by_user_id" uuid,
	"authorised_at" timestamp with time zone,
	"authorised_until" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institution_profiles_established_year_chk" CHECK ("institution_profiles"."established_year" between 1800 and 2100),
	CONSTRAINT "institution_profiles_capacity_chk" CHECK ("institution_profiles"."student_capacity" >= 0),
	CONSTRAINT "institution_profiles_authorised_chk" CHECK (not "institution_profiles"."is_authorised_certificate_issuer" or "institution_profiles"."authorised_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "internship_programmes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"host_employer_organization_id" uuid,
	"host_employer_name" text,
	"job_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"eligibility" text,
	"duration_weeks" integer,
	"starts_on" date,
	"application_deadline" date,
	"work_mode" text,
	"country_code" char(2),
	"city" text,
	"stipend_type" text DEFAULT 'not_disclosed' NOT NULL,
	"stipend_minor" bigint,
	"stipend_currency" char(3),
	"stipend_period" text,
	"seats" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "internship_programmes_duration_chk" CHECK ("internship_programmes"."duration_weeks" > 0),
	CONSTRAINT "internship_programmes_seats_chk" CHECK ("internship_programmes"."seats" > 0),
	CONSTRAINT "internship_programmes_stipend_chk" CHECK (("internship_programmes"."stipend_type" = 'fixed' and "internship_programmes"."stipend_minor" is not null and "internship_programmes"."stipend_minor" > 0 and "internship_programmes"."stipend_currency" is not null and "internship_programmes"."stipend_period" is not null) or ("internship_programmes"."stipend_type" <> 'fixed' and "internship_programmes"."stipend_minor" is null and "internship_programmes"."stipend_currency" is null))
);
--> statement-breakpoint
CREATE TABLE "placement_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"candidate_id" uuid NOT NULL,
	"enrolment_id" uuid,
	"campus_drive_id" uuid,
	"placement_id" uuid,
	"source_type" text NOT NULL,
	"employer_name" text NOT NULL,
	"employer_organization_id" uuid,
	"job_title" text NOT NULL,
	"employment_type" text,
	"country_code" char(2),
	"city" text,
	"placed_on" date NOT NULL,
	"salary_minor" bigint,
	"salary_currency" char(3),
	"salary_period" text,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_by_user_id" uuid,
	"verified_at" timestamp with time zone,
	"candidate_confirmed_at" timestamp with time zone,
	"evidence_file_id" uuid,
	"notes" text,
	"recorded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "placement_outcomes_salary_chk" CHECK (("placement_outcomes"."salary_minor" is null) = ("placement_outcomes"."salary_currency" is null) and ("placement_outcomes"."salary_minor" is null or "placement_outcomes"."salary_minor" >= 0)),
	CONSTRAINT "placement_outcomes_verified_chk" CHECK (not "placement_outcomes"."verified" or "placement_outcomes"."verified_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "skill_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"candidate_id" uuid NOT NULL,
	"assessment_centre_id" uuid,
	"application_id" uuid,
	"requirement_id" uuid,
	"enrolment_id" uuid,
	"trade" text NOT NULL,
	"skill_id" uuid,
	"assessment_type" text DEFAULT 'trade_test' NOT NULL,
	"process" text,
	"position" text,
	"standard_reference" text,
	"material_details" text,
	"evaluation_methods" text[] NOT NULL,
	"location" text,
	"scheduled_at" timestamp with time zone NOT NULL,
	"scheduled_by_user_id" uuid,
	"assessor_user_id" uuid,
	"assessor_name" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"result" text DEFAULT 'pending' NOT NULL,
	"score" numeric(7, 2),
	"max_score" numeric(7, 2),
	"remarks" text,
	"internal_notes" text,
	"evidence_file_ids" uuid[] NOT NULL,
	"completed_at" timestamp with time zone,
	"result_published_at" timestamp with time zone,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"retest_of_assessment_id" uuid,
	"retest_available_from" date,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_assessments_max_score_chk" CHECK ("skill_assessments"."max_score" > 0),
	CONSTRAINT "skill_assessments_score_chk" CHECK ("skill_assessments"."score" >= 0 and "skill_assessments"."score" <= "skill_assessments"."max_score"),
	CONSTRAINT "skill_assessments_attempt_chk" CHECK ("skill_assessments"."attempt_number" >= 1),
	CONSTRAINT "skill_assessments_completed_chk" CHECK ("skill_assessments"."status" <> 'completed' or "skill_assessments"."completed_at" is not null),
	CONSTRAINT "skill_assessments_cancelled_chk" CHECK ("skill_assessments"."status" <> 'cancelled' or "skill_assessments"."cancelled_at" is not null),
	CONSTRAINT "skill_assessments_result_chk" CHECK ("skill_assessments"."result" = 'pending' or "skill_assessments"."status" = 'completed'),
	CONSTRAINT "skill_assessments_retest_of_chk" CHECK ("skill_assessments"."retest_of_assessment_id" <> "skill_assessments"."id")
);
--> statement-breakpoint
CREATE TABLE "application_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"question_id" uuid,
	"question_snapshot" jsonb NOT NULL,
	"answer" jsonb NOT NULL,
	"is_flagged" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_answers_application_question_uq" UNIQUE("application_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "application_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"author_user_id" uuid,
	"author_organization_id" uuid,
	"visibility" text DEFAULT 'staff_only' NOT NULL,
	"body" text NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_stage_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"from_stage_id" uuid,
	"to_stage_id" uuid NOT NULL,
	"changed_by_user_id" uuid,
	"changed_by_type" text NOT NULL,
	"changed_by_organization_id" uuid,
	"note" text,
	"candidate_visible_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"job_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"current_stage_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"source" text DEFAULT 'direct' NOT NULL,
	"source_details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"partner_organization_id" uuid,
	"submitted_by_user_id" uuid,
	"assigned_to_user_id" uuid,
	"cover_letter" text,
	"resume_file_id" uuid,
	"profile_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expected_salary_minor" bigint,
	"expected_salary_currency" char(3),
	"expected_salary_period" text,
	"consent_to_share_at" timestamp with time zone,
	"consent_record_id" uuid,
	"shared_with_employer_at" timestamp with time zone,
	"shared_with_employer_by_user_id" uuid,
	"rating" smallint,
	"is_shortlisted" boolean DEFAULT false NOT NULL,
	"knockout_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"withdrawn_at" timestamp with time zone,
	"withdrawal_reason" text,
	"rejected_at" timestamp with time zone,
	"rejection_reason_code" text,
	"rejection_reason" text,
	"hired_at" timestamp with time zone,
	"last_stage_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_job_candidate_uq" UNIQUE("job_id","candidate_id"),
	CONSTRAINT "applications_rating_chk" CHECK ("applications"."rating" between 1 and 5),
	CONSTRAINT "applications_expected_salary_chk" CHECK ("applications"."expected_salary_minor" is null or ("applications"."expected_salary_minor" >= 0 and "applications"."expected_salary_currency" is not null and "applications"."expected_salary_period" is not null)),
	CONSTRAINT "applications_partner_source_chk" CHECK ("applications"."source" <> 'partner' or "applications"."partner_organization_id" is not null),
	CONSTRAINT "applications_status_dates_chk" CHECK (("applications"."status" <> 'withdrawn' or "applications"."withdrawn_at" is not null) and ("applications"."status" <> 'rejected' or "applications"."rejected_at" is not null) and ("applications"."status" <> 'hired' or "applications"."hired_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "candidate_attributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"partner_organization_id" uuid NOT NULL,
	"first_submission_id" uuid,
	"first_submitted_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"resolution_notes" text,
	"resolved_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_attributions_window_chk" CHECK ("candidate_attributions"."expires_at" > "candidate_attributions"."first_submitted_at")
);
--> statement-breakpoint
CREATE TABLE "duplicate_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"possible_duplicate_candidate_id" uuid NOT NULL,
	"matched_on" text[] NOT NULL,
	"score" smallint,
	"source" text DEFAULT 'system' NOT NULL,
	"partner_submission_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"resolution_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "duplicate_flags_distinct_chk" CHECK ("duplicate_flags"."candidate_id" <> "duplicate_flags"."possible_duplicate_candidate_id"),
	CONSTRAINT "duplicate_flags_matched_on_chk" CHECK (cardinality("duplicate_flags"."matched_on") > 0),
	CONSTRAINT "duplicate_flags_score_chk" CHECK ("duplicate_flags"."score" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "interview_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"interview_id" uuid NOT NULL,
	"author_user_id" uuid,
	"author_organization_id" uuid,
	"rating" smallint,
	"recommendation" text NOT NULL,
	"scorecard" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"strengths" text,
	"concerns" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interview_feedback_interview_author_uq" UNIQUE("interview_id","author_user_id"),
	CONSTRAINT "interview_feedback_rating_chk" CHECK ("interview_feedback"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "interview_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"interview_id" uuid NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"email" text,
	"role" text DEFAULT 'interviewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interview_participants_interview_user_uq" UNIQUE("interview_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "interviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"application_id" uuid NOT NULL,
	"organization_id" uuid,
	"round_number" smallint DEFAULT 1 NOT NULL,
	"round_name" text NOT NULL,
	"mode" text NOT NULL,
	"scheduled_start" timestamp with time zone NOT NULL,
	"scheduled_end" timestamp with time zone,
	"timezone" text NOT NULL,
	"location" text,
	"meeting_url" text,
	"candidate_instructions" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"organized_by_user_id" uuid,
	"skill_assessment_id" uuid,
	"candidate_response" text DEFAULT 'pending' NOT NULL,
	"candidate_responded_at" timestamp with time zone,
	"candidate_response_note" text,
	"reminder_sent_at" timestamp with time zone,
	"outcome" text DEFAULT 'pending' NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interviews_schedule_chk" CHECK ("interviews"."scheduled_end" > "interviews"."scheduled_start"),
	CONSTRAINT "interviews_round_chk" CHECK ("interviews"."round_number" >= 1)
);
--> statement-breakpoint
CREATE TABLE "mobilisation_checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mobilisation_id" uuid NOT NULL,
	"key" text,
	"item" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'document' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"responsible_party" text DEFAULT 'venkat_sai' NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"is_candidate_visible" boolean DEFAULT true NOT NULL,
	"file_id" uuid,
	"due_date" date,
	"completed_at" timestamp with time zone,
	"verified_by_user_id" uuid,
	"verified_at" timestamp with time zone,
	"rejection_reason" text,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mobilisation_checklist_items_key_uq" UNIQUE("mobilisation_id","key")
);
--> statement-breakpoint
CREATE TABLE "mobilisation_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"placement_id" uuid NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"status_reason" text,
	"destination_country_code" char(2) NOT NULL,
	"visa_type" text,
	"visa_status" text DEFAULT 'not_started' NOT NULL,
	"visa_number_encrypted" text,
	"visa_number_last4" text,
	"visa_issued_on" date,
	"visa_expires_on" date,
	"medical_status" text DEFAULT 'pending' NOT NULL,
	"medical_completed_on" date,
	"medical_valid_until" date,
	"emigration_clearance_status" text DEFAULT 'not_assessed' NOT NULL,
	"emigration_clearance_reference" text,
	"emigration_cleared_on" date,
	"pdos_completed" boolean DEFAULT false NOT NULL,
	"pdos_completed_on" date,
	"travel_date" date,
	"flight_details" text,
	"departed_at" timestamp with time zone,
	"arrived_at" timestamp with time zone,
	"accommodation_details" text,
	"candidate_instructions" text,
	"coordinator_user_id" uuid,
	"completed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mobilisation_records_visa_last4_chk" CHECK (char_length("mobilisation_records"."visa_number_last4") <= 4),
	CONSTRAINT "mobilisation_records_visa_dates_chk" CHECK ("mobilisation_records"."visa_expires_on" >= "mobilisation_records"."visa_issued_on"),
	CONSTRAINT "mobilisation_records_travel_chk" CHECK ("mobilisation_records"."arrived_at" >= "mobilisation_records"."departed_at"),
	CONSTRAINT "mobilisation_records_pdos_chk" CHECK ("mobilisation_records"."pdos_completed" or "mobilisation_records"."pdos_completed_on" is null)
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"application_id" uuid NOT NULL,
	"organization_id" uuid,
	"issued_by_user_id" uuid,
	"supersedes_offer_id" uuid,
	"job_title" text NOT NULL,
	"salary_minor" bigint,
	"salary_currency" char(3),
	"salary_period" text,
	"benefits" text,
	"country_code" char(2),
	"work_location" text,
	"start_date" date,
	"contract_duration_months" smallint,
	"offer_file_id" uuid,
	"signed_offer_file_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"issued_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"decline_reason" text,
	"withdrawn_at" timestamp with time zone,
	"withdrawal_reason" text,
	"internal_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offers_salary_chk" CHECK ("offers"."salary_minor" is null or ("offers"."salary_minor" >= 0 and "offers"."salary_currency" is not null and "offers"."salary_period" is not null)),
	CONSTRAINT "offers_contract_duration_chk" CHECK ("offers"."contract_duration_months" > 0),
	CONSTRAINT "offers_supersedes_chk" CHECK ("offers"."supersedes_offer_id" <> "offers"."id"),
	CONSTRAINT "offers_issued_chk" CHECK ("offers"."status" not in ('issued', 'accepted', 'declined', 'expired') or "offers"."issued_at" is not null),
	CONSTRAINT "offers_response_chk" CHECK ("offers"."status" not in ('accepted', 'declined') or "offers"."responded_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "partner_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_organization_id" uuid NOT NULL,
	"requirement_id" uuid,
	"job_id" uuid,
	"assigned_by_user_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"positions_target" integer,
	"submission_limit" integer,
	"commission_terms" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"due_date" date,
	"instructions" text,
	"internal_notes" text,
	"revoked_at" timestamp with time zone,
	"revocation_reason" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_assignments_id_partner_uq" UNIQUE("id","partner_organization_id"),
	CONSTRAINT "partner_assignments_target_chk" CHECK ("partner_assignments"."requirement_id" is not null or "partner_assignments"."job_id" is not null),
	CONSTRAINT "partner_assignments_limits_chk" CHECK ("partner_assignments"."positions_target" > 0 and "partner_assignments"."submission_limit" > 0)
);
--> statement-breakpoint
CREATE TABLE "partner_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"assignment_id" uuid NOT NULL,
	"partner_organization_id" uuid NOT NULL,
	"submitted_by_user_id" uuid,
	"candidate_id" uuid NOT NULL,
	"job_id" uuid,
	"application_id" uuid,
	"status" text DEFAULT 'submitted' NOT NULL,
	"partner_notes" text,
	"consent_record_id" uuid,
	"candidate_confirmed_at" timestamp with time zone,
	"duplicate_of_candidate_id" uuid,
	"review_notes" text,
	"partner_feedback" text,
	"rejection_reason_code" text,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_submissions_assignment_candidate_uq" UNIQUE("assignment_id","candidate_id"),
	CONSTRAINT "partner_submissions_consent_chk" CHECK ("partner_submissions"."status" <> 'accepted' or "partner_submissions"."consent_record_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "placements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"application_id" uuid NOT NULL,
	"offer_id" uuid,
	"candidate_id" uuid NOT NULL,
	"organization_id" uuid,
	"job_id" uuid NOT NULL,
	"partner_organization_id" uuid,
	"replacement_for_placement_id" uuid,
	"placed_on" date NOT NULL,
	"joined_on" date,
	"country_code" char(2),
	"work_location" text,
	"status" text DEFAULT 'pending_joining' NOT NULL,
	"replacement_deadline" date,
	"salary_minor" bigint,
	"salary_currency" char(3),
	"salary_period" text,
	"fee_minor" bigint,
	"fee_currency" char(3),
	"invoice_id" uuid,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"completed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "placements_joined_chk" CHECK ("placements"."joined_on" >= "placements"."placed_on"),
	CONSTRAINT "placements_salary_chk" CHECK ("placements"."salary_minor" is null or ("placements"."salary_minor" >= 0 and "placements"."salary_currency" is not null and "placements"."salary_period" is not null)),
	CONSTRAINT "placements_fee_chk" CHECK ("placements"."fee_minor" is null or ("placements"."fee_minor" >= 0 and "placements"."fee_currency" is not null)),
	CONSTRAINT "placements_replacement_chk" CHECK ("placements"."replacement_for_placement_id" <> "placements"."id")
);
--> statement-breakpoint
CREATE TABLE "profile_unlocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"unlocked_by_user_id" uuid,
	"job_id" uuid,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"credit_ledger_id" uuid,
	"reason" text,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_unlocks_org_candidate_uq" UNIQUE("organization_id","candidate_id"),
	CONSTRAINT "profile_unlocks_expiry_chk" CHECK ("profile_unlocks"."expires_at" > "profile_unlocks"."unlocked_at")
);
--> statement-breakpoint
CREATE TABLE "talent_list_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"added_by_user_id" uuid,
	"note" text,
	"stage" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "talent_list_items_list_candidate_uq" UNIQUE("list_id","candidate_id")
);
--> statement-breakpoint
CREATE TABLE "talent_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"kind" text DEFAULT 'shortlist' NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"job_id" uuid,
	"requirement_id" uuid,
	"created_by_user_id" uuid,
	"is_shared" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"candidate_label" text NOT NULL,
	"candidate_description" text,
	"candidate_translations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_terminal" boolean DEFAULT false NOT NULL,
	"notify_candidate" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sla_days" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_stages_workflow_key_uq" UNIQUE("workflow_id","key"),
	CONSTRAINT "workflow_stages_id_workflow_uq" UNIQUE("id","workflow_id"),
	CONSTRAINT "workflow_stages_sla_chk" CHECK ("workflow_stages"."sla_days" > 0),
	CONSTRAINT "workflow_stages_terminal_chk" CHECK (("workflow_stages"."category" not in ('closed', 'rejected', 'withdrawn') or "workflow_stages"."is_terminal") and (not "workflow_stages"."is_terminal" or "workflow_stages"."category" in ('joined', 'closed', 'rejected', 'withdrawn')))
);
--> statement-breakpoint
CREATE TABLE "billing_profiles" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"legal_name" text NOT NULL,
	"contact_name" text,
	"billing_email" text NOT NULL,
	"billing_phone" text,
	"address_line1" text NOT NULL,
	"address_line2" text,
	"city" text NOT NULL,
	"state_region" text,
	"state_code" text,
	"postal_code" text,
	"country_code" char(2) NOT NULL,
	"tax_id_type" text,
	"tax_id" text,
	"tax_exempt" boolean DEFAULT false NOT NULL,
	"tax_exempt_reason" text,
	"currency" char(3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_profiles_state_code_chk" CHECK ("billing_profiles"."country_code" <> 'IN' or "billing_profiles"."state_code" is null or "billing_profiles"."state_code" ~ '^[0-9]{2}$'),
	CONSTRAINT "billing_profiles_tax_id_chk" CHECK ("billing_profiles"."tax_id" is null or "billing_profiles"."tax_id_type" is not null),
	CONSTRAINT "billing_profiles_gstin_chk" CHECK ("billing_profiles"."tax_id_type" is distinct from 'gstin' or "billing_profiles"."tax_id" ~ '^[0-9]{2}[A-Z0-9]{13}$')
);
--> statement-breakpoint
CREATE TABLE "coupon_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coupon_id" uuid NOT NULL,
	"organization_id" uuid,
	"user_id" uuid,
	"currency" char(3),
	"invoice_id" uuid,
	"subscription_id" uuid,
	"discount_minor" bigint,
	"redeemed_by_user_id" uuid,
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reversed_at" timestamp with time zone,
	CONSTRAINT "coupon_redemptions_coupon_invoice_uq" UNIQUE("coupon_id","invoice_id"),
	CONSTRAINT "coupon_redemptions_discount_chk" CHECK (("coupon_redemptions"."discount_minor" is null) = ("coupon_redemptions"."currency" is null) and coalesce("coupon_redemptions"."discount_minor", 0) >= 0 and ("coupon_redemptions"."invoice_id" is null or "coupon_redemptions"."currency" is not null))
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"discount_type" text NOT NULL,
	"percent_off" integer,
	"amount_off_minor" bigint,
	"currency" char(3),
	"duration" text DEFAULT 'once' NOT NULL,
	"duration_cycles" integer,
	"max_redemptions" integer,
	"max_redemptions_per_organization" integer,
	"redeemed_count" integer DEFAULT 0 NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"plan_ids" uuid[] NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_code_format_chk" CHECK ("coupons"."code" ~ '^[A-Z0-9][A-Z0-9_-]{2,39}$'),
	CONSTRAINT "coupons_discount_chk" CHECK (("coupons"."discount_type" = 'percent' and "coupons"."percent_off" between 1 and 100 and "coupons"."amount_off_minor" is null and "coupons"."currency" is null) or ("coupons"."discount_type" = 'fixed' and "coupons"."amount_off_minor" > 0 and "coupons"."currency" is not null and "coupons"."percent_off" is null)),
	CONSTRAINT "coupons_duration_chk" CHECK (("coupons"."duration" = 'repeating') = ("coupons"."duration_cycles" is not null) and coalesce("coupons"."duration_cycles", 1) > 0),
	CONSTRAINT "coupons_redemptions_chk" CHECK ("coupons"."redeemed_count" >= 0 and ("coupons"."max_redemptions" is null or ("coupons"."max_redemptions" > 0 and "coupons"."redeemed_count" <= "coupons"."max_redemptions")) and ("coupons"."max_redemptions_per_organization" is null or "coupons"."max_redemptions_per_organization" > 0)),
	CONSTRAINT "coupons_validity_chk" CHECK ("coupons"."valid_from" is null or "coupons"."valid_until" is null or "coupons"."valid_until" > "coupons"."valid_from")
);
--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entitlement_key" text NOT NULL,
	"seq" integer NOT NULL,
	"delta" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"reason" text NOT NULL,
	"reference_type" text,
	"reference_id" text,
	"idempotency_key" text,
	"expires_at" timestamp with time zone,
	"actor_user_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_ledger_org_key_seq_uq" UNIQUE("organization_id","entitlement_key","seq"),
	CONSTRAINT "credit_ledger_delta_chk" CHECK ("credit_ledger"."delta" <> 0 and ("credit_ledger"."reason" not in ('plan_grant', 'purchase') or "credit_ledger"."delta" > 0) and ("credit_ledger"."reason" not in ('consumption', 'expiry') or "credit_ledger"."delta" < 0)),
	CONSTRAINT "credit_ledger_seq_chk" CHECK ("credit_ledger"."seq" > 0)
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text DEFAULT 'customer' NOT NULL,
	"payment_id" uuid,
	"invoice_id" uuid,
	"organization_id" uuid,
	"amount_minor" bigint,
	"currency" char(3),
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"provider_dispute_id" text,
	"respond_by" timestamp with time zone,
	"resolution" text,
	"opened_by_user_id" uuid,
	"resolved_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "disputes_subject_chk" CHECK ("disputes"."payment_id" is not null or "disputes"."invoice_id" is not null),
	CONSTRAINT "disputes_amount_chk" CHECK (("disputes"."amount_minor" is null) = ("disputes"."currency" is null) and coalesce("disputes"."amount_minor", 1) > 0)
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"currency" char(3) NOT NULL,
	"invoice_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"tax_code" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_amount_minor" bigint NOT NULL,
	"discount_minor" bigint DEFAULT 0 NOT NULL,
	"amount_minor" bigint NOT NULL,
	"tax_rate_basis_points" integer DEFAULT 0 NOT NULL,
	"tax_minor" bigint DEFAULT 0 NOT NULL,
	"taxes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reference_type" text,
	"reference_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_lines_amount_chk" CHECK ("invoice_lines"."quantity" > 0 and "invoice_lines"."unit_amount_minor" >= 0 and "invoice_lines"."discount_minor" >= 0 and "invoice_lines"."discount_minor" <= "invoice_lines"."quantity" * "invoice_lines"."unit_amount_minor" and "invoice_lines"."amount_minor" = "invoice_lines"."quantity" * "invoice_lines"."unit_amount_minor" - "invoice_lines"."discount_minor"),
	CONSTRAINT "invoice_lines_tax_chk" CHECK ("invoice_lines"."tax_minor" >= 0 and "invoice_lines"."tax_rate_basis_points" between 0 and 10000)
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"currency" char(3) NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text,
	"document_type" text DEFAULT 'invoice' NOT NULL,
	"original_invoice_id" uuid,
	"organization_id" uuid,
	"buyer_user_id" uuid,
	"subscription_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"tax_treatment" text DEFAULT 'standard' NOT NULL,
	"subtotal_minor" bigint DEFAULT 0 NOT NULL,
	"discount_minor" bigint DEFAULT 0 NOT NULL,
	"tax_minor" bigint DEFAULT 0 NOT NULL,
	"total_minor" bigint DEFAULT 0 NOT NULL,
	"amount_paid_minor" bigint DEFAULT 0 NOT NULL,
	"amount_refunded_minor" bigint DEFAULT 0 NOT NULL,
	"place_of_supply" text,
	"purchase_order_reference" text,
	"service_period_start" timestamp with time zone,
	"service_period_end" timestamp with time zone,
	"issued_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"issued_by_user_id" uuid,
	"voided_by_user_id" uuid,
	"buyer_snapshot" jsonb,
	"seller_snapshot" jsonb,
	"notes" text,
	"internal_notes" text,
	"pdf_file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_currency_id_uq" UNIQUE("currency","id"),
	CONSTRAINT "invoices_totals_chk" CHECK ("invoices"."subtotal_minor" >= 0 and "invoices"."discount_minor" >= 0 and "invoices"."tax_minor" >= 0 and "invoices"."discount_minor" <= "invoices"."subtotal_minor" and "invoices"."total_minor" = "invoices"."subtotal_minor" - "invoices"."discount_minor" + "invoices"."tax_minor"),
	CONSTRAINT "invoices_paid_chk" CHECK ("invoices"."amount_paid_minor" >= 0 and "invoices"."amount_refunded_minor" >= 0 and "invoices"."amount_refunded_minor" <= "invoices"."amount_paid_minor"),
	CONSTRAINT "invoices_issued_chk" CHECK ("invoices"."status" = 'draft' or ("invoices"."code" is not null and "invoices"."issued_at" is not null and "invoices"."buyer_snapshot" is not null and "invoices"."seller_snapshot" is not null)),
	CONSTRAINT "invoices_credit_note_chk" CHECK (("invoices"."document_type" = 'credit_note') = ("invoices"."original_invoice_id" is not null)),
	CONSTRAINT "invoices_void_chk" CHECK ("invoices"."status" <> 'void' or "invoices"."voided_at" is not null),
	CONSTRAINT "invoices_service_period_chk" CHECK ("invoices"."service_period_start" is null or "invoices"."service_period_end" is null or "invoices"."service_period_end" >= "invoices"."service_period_start")
);
--> statement-breakpoint
CREATE TABLE "partner_settlement_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"currency" char(3) NOT NULL,
	"settlement_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"placement_id" uuid,
	"description" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_settlement_lines_amount_chk" CHECK ("partner_settlement_lines"."amount_minor" > 0),
	CONSTRAINT "partner_settlement_lines_placement_chk" CHECK ("partner_settlement_lines"."kind" <> 'placement_fee' or "partner_settlement_lines"."placement_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "partner_settlements" (
	"currency" char(3) NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"partner_organization_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"amount_minor" bigint DEFAULT 0 NOT NULL,
	"withholding_tax_minor" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"approval_request_id" uuid,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"payment_reference" text,
	"partner_invoice_number" text,
	"partner_invoice_file_id" uuid,
	"dispute_reason" text,
	"notes" text,
	"internal_notes" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_settlements_currency_id_uq" UNIQUE("currency","id"),
	CONSTRAINT "partner_settlements_period_chk" CHECK ("partner_settlements"."period_end" >= "partner_settlements"."period_start"),
	CONSTRAINT "partner_settlements_amounts_chk" CHECK ("partner_settlements"."amount_minor" >= 0 and "partner_settlements"."withholding_tax_minor" >= 0 and "partner_settlements"."withholding_tax_minor" <= "partner_settlements"."amount_minor"),
	CONSTRAINT "partner_settlements_paid_chk" CHECK ("partner_settlements"."status" <> 'paid' or "partner_settlements"."paid_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "payment_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"payment_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "payment_webhook_events_provider_event_uq" UNIQUE("provider","event_id"),
	CONSTRAINT "payment_webhook_events_attempts_chk" CHECK ("payment_webhook_events"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"currency" char(3) NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"organization_id" uuid,
	"payer_user_id" uuid,
	"invoice_id" uuid,
	"provider" text NOT NULL,
	"method" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"amount_refunded_minor" bigint DEFAULT 0 NOT NULL,
	"provider_fee_minor" bigint,
	"provider_payment_id" text,
	"provider_order_id" text,
	"external_reference" text,
	"received_at" timestamp with time zone,
	"failure_reason" text,
	"proof_file_id" uuid,
	"recorded_by_user_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_currency_id_uq" UNIQUE("currency","id"),
	CONSTRAINT "payments_amounts_chk" CHECK ("payments"."amount_minor" > 0 and "payments"."amount_refunded_minor" >= 0 and "payments"."amount_refunded_minor" <= "payments"."amount_minor" and coalesce("payments"."provider_fee_minor", 0) >= 0),
	CONSTRAINT "payments_refund_status_chk" CHECK (("payments"."status" <> 'refunded' or "payments"."amount_refunded_minor" = "payments"."amount_minor") and ("payments"."status" <> 'partially_refunded' or ("payments"."amount_refunded_minor" > 0 and "payments"."amount_refunded_minor" < "payments"."amount_minor"))),
	CONSTRAINT "payments_received_chk" CHECK ("payments"."status" not in ('succeeded', 'refunded', 'partially_refunded') or "payments"."received_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "plan_features" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"entitlement_key" text NOT NULL,
	"limit_value" integer,
	"period" text DEFAULT 'none' NOT NULL,
	"reset_policy" text DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_features_plan_key_uq" UNIQUE("plan_id","entitlement_key"),
	CONSTRAINT "plan_features_limit_chk" CHECK ("plan_features"."limit_value" is null or "plan_features"."limit_value" >= 0),
	CONSTRAINT "plan_features_reset_chk" CHECK (("plan_features"."period" = 'none') = ("plan_features"."reset_policy" = 'none'))
);
--> statement-breakpoint
CREATE TABLE "plan_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"currency" char(3) NOT NULL,
	"interval" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"tax_inclusive" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"provider_price_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_prices_amount_chk" CHECK ("plan_prices"."amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"audience" text NOT NULL,
	"kind" text DEFAULT 'base' NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"contact_sales_only" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"trial_days" integer DEFAULT 0 NOT NULL,
	"highlights" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_key_format_chk" CHECK ("plans"."key" ~ '^[a-z0-9][a-z0-9_]{1,63}$'),
	CONSTRAINT "plans_trial_days_chk" CHECK ("plans"."trial_days" >= 0),
	CONSTRAINT "plans_default_kind_chk" CHECK (not "plans"."is_default" or "plans"."kind" = 'base')
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"currency" char(3) NOT NULL,
	"payment_id" uuid NOT NULL,
	"organization_id" uuid,
	"amount_minor" bigint NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"requested_by_user_id" uuid,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"decision_note" text,
	"approval_request_id" uuid,
	"credit_note_invoice_id" uuid,
	"provider_refund_id" text,
	"processed_at" timestamp with time zone,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_amount_chk" CHECK ("refunds"."amount_minor" > 0),
	CONSTRAINT "refunds_completed_chk" CHECK ("refunds"."status" <> 'completed' or "refunds"."processed_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"plan_price_id" uuid,
	"kind" text DEFAULT 'base' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"currency" char(3),
	"amount_minor" bigint,
	"interval" text,
	"current_period_start" timestamp with time zone NOT NULL,
	"current_period_end" timestamp with time zone,
	"trial_ends_at" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"paused_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"auto_renew" boolean DEFAULT false NOT NULL,
	"renewal_reminder_sent_at" timestamp with time zone,
	"provider" text DEFAULT 'manual' NOT NULL,
	"provider_subscription_id" text,
	"provider_customer_id" text,
	"notes" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_price_snapshot_chk" CHECK (("subscriptions"."currency" is null) = ("subscriptions"."amount_minor" is null) and ("subscriptions"."amount_minor" is null) = ("subscriptions"."interval" is null) and coalesce("subscriptions"."amount_minor", 0) >= 0),
	CONSTRAINT "subscriptions_period_chk" CHECK ("subscriptions"."current_period_end" is null or "subscriptions"."current_period_end" > "subscriptions"."current_period_start"),
	CONSTRAINT "subscriptions_trial_chk" CHECK ("subscriptions"."status" <> 'trialing' or "subscriptions"."trial_ends_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "tax_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"country_code" char(2) NOT NULL,
	"region" text,
	"kind" text NOT NULL,
	"rate_basis_points" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_rates_rate_chk" CHECK ("tax_rates"."rate_basis_points" between 0 and 10000),
	CONSTRAINT "tax_rates_effective_chk" CHECK ("tax_rates"."effective_until" is null or "tax_rates"."effective_until" > "tax_rates"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid,
	"user_id" uuid,
	"event_key" text NOT NULL,
	"channel" text NOT NULL,
	"recipient" text,
	"recipient_hash" text,
	"locale" text,
	"template_id" uuid,
	"template_version" integer,
	"status" text DEFAULT 'queued' NOT NULL,
	"skip_reason" text,
	"provider" text,
	"provider_message_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"dedupe_key" text,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_deliveries_skip_chk" CHECK (("notification_deliveries"."status" = 'skipped') = ("notification_deliveries"."skip_reason" is not null)),
	CONSTRAINT "notification_deliveries_attempts_chk" CHECK ("notification_deliveries"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" uuid NOT NULL,
	"category" text NOT NULL,
	"channel" text NOT NULL,
	"enabled" boolean NOT NULL,
	"source" text DEFAULT 'settings' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_pk" PRIMARY KEY("user_id","category","channel")
);
--> statement-breakpoint
CREATE TABLE "notification_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_key" text NOT NULL,
	"channel" text NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"whatsapp_template_name" text,
	"whatsapp_language_code" text,
	"sms_template_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_templates_event_channel_locale_uq" UNIQUE("event_key","channel","locale"),
	CONSTRAINT "notification_templates_version_chk" CHECK ("notification_templates"."version" >= 1),
	CONSTRAINT "notification_templates_subject_chk" CHECK ("notification_templates"."channel" not in ('email', 'in_app') or "notification_templates"."subject" is not null),
	CONSTRAINT "notification_templates_whatsapp_chk" CHECK ("notification_templates"."channel" <> 'whatsapp' or not "notification_templates"."is_active" or "notification_templates"."whatsapp_template_name" is not null)
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid,
	"event_key" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text,
	"read_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_link_chk" CHECK ("notifications"."link" is null or (left("notifications"."link", 1) = '/' and substr("notifications"."link", 2, 1) not in ('/', chr(92))))
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"audience" text[] NOT NULL,
	"placements" text[] NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"link_url" text,
	"link_label" text,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"status" text DEFAULT 'draft' NOT NULL,
	"is_dismissible" boolean DEFAULT true NOT NULL,
	"send_notification" boolean DEFAULT false NOT NULL,
	"notification_sent_at" timestamp with time zone,
	"organization_id" uuid,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"published_by_user_id" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcements_title_chk" CHECK (btrim("announcements"."title") <> ''),
	CONSTRAINT "announcements_targets_chk" CHECK (cardinality("announcements"."audience") > 0 and cardinality("announcements"."placements") > 0),
	CONSTRAINT "announcements_window_chk" CHECK ("announcements"."ends_at" is null or "announcements"."starts_at" is null or "announcements"."ends_at" > "announcements"."starts_at"),
	CONSTRAINT "announcements_status_chk" CHECK (("announcements"."status" <> 'scheduled' or "announcements"."starts_at" is not null) and ("announcements"."status" <> 'published' or "announcements"."published_at" is not null)),
	CONSTRAINT "announcements_link_chk" CHECK ("announcements"."link_url" is null or (("announcements"."link_url" ~ '^https?://[^/[:space:]]' or (left("announcements"."link_url", 1) = '/' and left("announcements"."link_url", 2) not in ('//', '/' || chr(92)))) and "announcements"."link_url" !~ '[[:space:]]' and char_length("announcements"."link_url") <= 2048)),
	CONSTRAINT "announcements_link_label_chk" CHECK ("announcements"."link_label" is null or "announcements"."link_url" is not null),
	CONSTRAINT "announcements_notification_chk" CHECK ("announcements"."notification_sent_at" is null or "announcements"."send_notification")
);
--> statement-breakpoint
CREATE TABLE "cms_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection" text NOT NULL,
	"slug" text NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"seo" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"publish_at" timestamp with time zone,
	"unpublish_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"published_version" integer,
	"current_version" integer DEFAULT 1 NOT NULL,
	"scheduled_version" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"tags" text[] NOT NULL,
	"hero_asset_id" uuid,
	"logo_permission_id" uuid,
	"consent_status" text DEFAULT 'not_required' NOT NULL,
	"consent_notes" text,
	"consent_file_id" uuid,
	"consent_obtained_at" timestamp with time zone,
	"consent_expires_at" timestamp with time zone,
	"search_text" text,
	"search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple'::regconfig, coalesce("cms_entries"."title", '')), 'A') || setweight(to_tsvector('simple'::regconfig, coalesce("cms_entries"."summary", '')), 'B') || setweight(to_tsvector('simple'::regconfig, coalesce("cms_entries"."search_text", '')), 'C')) STORED,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"published_by_user_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_entries_collection_slug_locale_uq" UNIQUE("collection","slug","locale"),
	CONSTRAINT "cms_entries_slug_chk" CHECK ("cms_entries"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*)*$' and char_length("cms_entries"."slug") <= 200),
	CONSTRAINT "cms_entries_locale_chk" CHECK ("cms_entries"."locale" ~ '^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|[0-9]{3}))?$'),
	CONSTRAINT "cms_entries_title_chk" CHECK (btrim("cms_entries"."title") <> ''),
	CONSTRAINT "cms_entries_json_chk" CHECK (jsonb_typeof("cms_entries"."data") = 'object' and jsonb_typeof("cms_entries"."seo") = 'object'),
	CONSTRAINT "cms_entries_versions_chk" CHECK ("cms_entries"."current_version" >= 1 and ("cms_entries"."published_version" is null or "cms_entries"."published_version" between 1 and "cms_entries"."current_version") and ("cms_entries"."scheduled_version" is null or ("cms_entries"."scheduled_version" between 1 and "cms_entries"."current_version" and "cms_entries"."publish_at" is not null))),
	CONSTRAINT "cms_entries_status_chk" CHECK (("cms_entries"."status" <> 'scheduled' or "cms_entries"."scheduled_version" is not null) and ("cms_entries"."status" <> 'published' or ("cms_entries"."published_at" is not null and "cms_entries"."published_version" is not null))),
	CONSTRAINT "cms_entries_window_chk" CHECK ("cms_entries"."unpublish_at" is null or "cms_entries"."publish_at" is null or "cms_entries"."unpublish_at" > "cms_entries"."publish_at"),
	CONSTRAINT "cms_entries_consent_evidence_chk" CHECK ("cms_entries"."consent_status" <> 'obtained' or ("cms_entries"."consent_obtained_at" is not null and ("cms_entries"."consent_file_id" is not null or coalesce(btrim("cms_entries"."consent_notes"), '') <> ''))),
	CONSTRAINT "cms_entries_consent_dates_chk" CHECK ("cms_entries"."consent_expires_at" is null or "cms_entries"."consent_obtained_at" is null or "cms_entries"."consent_expires_at" > "cms_entries"."consent_obtained_at"),
	CONSTRAINT "cms_entries_consent_required_chk" CHECK ("cms_entries"."collection" not in ('testimonials', 'case_studies', 'team_members') or "cms_entries"."status" not in ('published', 'scheduled') or "cms_entries"."consent_status" = 'obtained'),
	CONSTRAINT "cms_entries_logo_permission_chk" CHECK ("cms_entries"."collection" <> 'client_logos' or "cms_entries"."status" not in ('published', 'scheduled') or "cms_entries"."logo_permission_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "cms_entry_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"seo" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tags" text[] NOT NULL,
	"hero_asset_id" uuid,
	"note" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_entry_versions_entry_version_uq" UNIQUE("entry_id","version"),
	CONSTRAINT "cms_entry_versions_version_chk" CHECK ("cms_entry_versions"."version" >= 1),
	CONSTRAINT "cms_entry_versions_json_chk" CHECK (jsonb_typeof("cms_entry_versions"."data") = 'object' and jsonb_typeof("cms_entry_versions"."seo") = 'object')
);
--> statement-breakpoint
CREATE TABLE "logo_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_name" text NOT NULL,
	"organization_id" uuid,
	"relationship" text NOT NULL,
	"logo_asset_id" uuid,
	"permission_type" text NOT NULL,
	"evidence_file_id" uuid,
	"evidence_reference" text,
	"granted_by_name" text,
	"granted_by_designation" text,
	"granted_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"display_locations" text[] NOT NULL,
	"conditions" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"notes" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "logo_permissions_name_chk" CHECK (btrim("logo_permissions"."organization_name") <> ''),
	CONSTRAINT "logo_permissions_approved_chk" CHECK ("logo_permissions"."status" <> 'approved' or ("logo_permissions"."approved_at" is not null and "logo_permissions"."granted_at" is not null and coalesce(btrim("logo_permissions"."granted_by_name"), '') <> '' and ("logo_permissions"."evidence_file_id" is not null or coalesce(btrim("logo_permissions"."evidence_reference"), '') <> '') and cardinality("logo_permissions"."display_locations") > 0)),
	CONSTRAINT "logo_permissions_revoked_chk" CHECK ("logo_permissions"."status" <> 'revoked' or "logo_permissions"."revoked_at" is not null),
	CONSTRAINT "logo_permissions_dates_chk" CHECK ("logo_permissions"."expires_at" is null or "logo_permissions"."granted_at" is null or "logo_permissions"."expires_at" > "logo_permissions"."granted_at")
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"file_id" uuid,
	"folder_id" uuid,
	"title" text NOT NULL,
	"alt_text" text,
	"caption" text,
	"description" text,
	"credit" text,
	"tags" text[] NOT NULL,
	"embed_provider" text,
	"embed_url" text,
	"shows_identifiable_people" boolean,
	"consent_status" text DEFAULT 'not_required' NOT NULL,
	"consent_notes" text,
	"consent_file_id" uuid,
	"consent_obtained_at" timestamp with time zone,
	"consent_expires_at" timestamp with time zone,
	"visibility" text DEFAULT 'internal' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"uploaded_by_user_id" uuid,
	"search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple'::regconfig, coalesce("media_assets"."title", '')), 'A') || setweight(to_tsvector('simple'::regconfig, coalesce("media_assets"."alt_text", '') || ' ' || coalesce("media_assets"."caption", '')), 'B') || setweight(to_tsvector('simple'::regconfig, coalesce("media_assets"."description", '') || ' ' || coalesce("media_assets"."credit", '')), 'C')) STORED,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_title_chk" CHECK (btrim("media_assets"."title") <> ''),
	CONSTRAINT "media_assets_source_chk" CHECK (("media_assets"."kind" = 'embed' and "media_assets"."file_id" is null and "media_assets"."embed_provider" is not null and "media_assets"."embed_url" is not null) or ("media_assets"."kind" <> 'embed' and "media_assets"."file_id" is not null and "media_assets"."embed_provider" is null and "media_assets"."embed_url" is null)),
	CONSTRAINT "media_assets_embed_url_chk" CHECK ("media_assets"."embed_url" is null or ("media_assets"."embed_provider" is not null and "media_assets"."embed_url" !~ '[[:space:]]' and char_length("media_assets"."embed_url") <= 500 and (("media_assets"."embed_provider" = 'youtube' and "media_assets"."embed_url" ~ '^https://((www[.])?youtube(-nocookie)?[.]com|youtu[.]be)/') or ("media_assets"."embed_provider" = 'vimeo' and "media_assets"."embed_url" ~ '^https://(player[.])?vimeo[.]com/')))),
	CONSTRAINT "media_assets_people_consent_chk" CHECK ("media_assets"."shows_identifiable_people" is not true or "media_assets"."consent_status" <> 'not_required'),
	CONSTRAINT "media_assets_public_chk" CHECK ("media_assets"."visibility" <> 'public' or ("media_assets"."shows_identifiable_people" is not null and "media_assets"."consent_status" in ('not_required', 'obtained') and ("media_assets"."kind" <> 'image' or "media_assets"."alt_text" is not null))),
	CONSTRAINT "media_assets_consent_evidence_chk" CHECK ("media_assets"."consent_status" <> 'obtained' or ("media_assets"."consent_obtained_at" is not null and ("media_assets"."consent_file_id" is not null or coalesce(btrim("media_assets"."consent_notes"), '') <> ''))),
	CONSTRAINT "media_assets_consent_dates_chk" CHECK ("media_assets"."consent_expires_at" is null or "media_assets"."consent_obtained_at" is null or "media_assets"."consent_expires_at" > "media_assets"."consent_obtained_at")
);
--> statement-breakpoint
CREATE TABLE "media_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"parent_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_folders_name_chk" CHECK (char_length(btrim("media_folders"."name")) between 1 and 120),
	CONSTRAINT "media_folders_parent_chk" CHECK ("media_folders"."parent_id" is null or "media_folders"."parent_id" <> "media_folders"."id")
);
--> statement-breakpoint
CREATE TABLE "media_usages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"field" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_usages_asset_entity_field_uq" UNIQUE("asset_id","entity_type","entity_id","field")
);
--> statement-breakpoint
CREATE TABLE "public_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"mode" text DEFAULT 'hidden' NOT NULL,
	"live_query_key" text,
	"live_value" bigint,
	"live_value_computed_at" timestamp with time zone,
	"manual_value" bigint,
	"as_of_date" date,
	"definition" text,
	"evidence_note" text,
	"evidence_file_id" uuid,
	"approved_value" bigint,
	"approved_as_of_date" date,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"min_display_value" bigint,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_visible" boolean DEFAULT false NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "public_metrics_key_chk" CHECK ("public_metrics"."key" ~ '^[a-z][a-z0-9_]{1,62}$'),
	CONSTRAINT "public_metrics_label_chk" CHECK (btrim("public_metrics"."label") <> ''),
	CONSTRAINT "public_metrics_values_chk" CHECK (coalesce("public_metrics"."manual_value", 0) >= 0 and coalesce("public_metrics"."approved_value", 0) >= 0 and coalesce("public_metrics"."live_value", 0) >= 0 and coalesce("public_metrics"."min_display_value", 0) >= 0),
	CONSTRAINT "public_metrics_live_chk" CHECK ("public_metrics"."mode" <> 'live' or "public_metrics"."live_query_key" is not null),
	CONSTRAINT "public_metrics_manual_chk" CHECK ("public_metrics"."mode" <> 'manual' or ("public_metrics"."manual_value" is not null and "public_metrics"."as_of_date" is not null)),
	CONSTRAINT "public_metrics_approval_chk" CHECK (("public_metrics"."approved_at" is null) = ("public_metrics"."approved_value" is null) and ("public_metrics"."approved_at" is null) = ("public_metrics"."approved_as_of_date" is null)),
	CONSTRAINT "public_metrics_display_chk" CHECK (not "public_metrics"."is_visible" or "public_metrics"."mode" = 'hidden' or (coalesce(btrim("public_metrics"."definition"), '') <> '' and ("public_metrics"."mode" = 'live' or ("public_metrics"."approved_at" is not null and "public_metrics"."approved_value" is not distinct from "public_metrics"."manual_value" and "public_metrics"."approved_as_of_date" is not distinct from "public_metrics"."as_of_date" and ("public_metrics"."evidence_file_id" is not null or coalesce(btrim("public_metrics"."evidence_note"), '') <> '')))))
);
--> statement-breakpoint
CREATE TABLE "analytics_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"utm_campaign" text NOT NULL,
	"name" text NOT NULL,
	"channel" text DEFAULT 'other' NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"cost_minor" bigint,
	"currency" char(3),
	"notes" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_campaigns_key_chk" CHECK ("analytics_campaigns"."utm_campaign" = lower("analytics_campaigns"."utm_campaign") and char_length("analytics_campaigns"."utm_campaign") between 1 and 200 and position('@' in "analytics_campaigns"."utm_campaign") = 0),
	CONSTRAINT "analytics_campaigns_name_chk" CHECK (btrim("analytics_campaigns"."name") <> ''),
	CONSTRAINT "analytics_campaigns_dates_chk" CHECK ("analytics_campaigns"."ends_on" is null or "analytics_campaigns"."starts_on" is null or "analytics_campaigns"."ends_on" >= "analytics_campaigns"."starts_on"),
	CONSTRAINT "analytics_campaigns_cost_chk" CHECK (("analytics_campaigns"."cost_minor" is null) = ("analytics_campaigns"."currency" is null) and coalesce("analytics_campaigns"."cost_minor", 0) >= 0)
);
--> statement-breakpoint
CREATE TABLE "analytics_consent_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anonymous_id" text NOT NULL,
	"categories" jsonb NOT NULL,
	"method" text NOT NULL,
	"policy_version" text NOT NULL,
	"locale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_consent_logs_anon_chk" CHECK ("analytics_consent_logs"."anonymous_id" ~ '^[A-Za-z0-9_-]{16,64}$'),
	CONSTRAINT "analytics_consent_logs_categories_chk" CHECK (jsonb_typeof("analytics_consent_logs"."categories") = 'object'),
	CONSTRAINT "analytics_consent_logs_fields_chk" CHECK (char_length("analytics_consent_logs"."policy_version") between 1 and 50 and ("analytics_consent_logs"."locale" is null or char_length("analytics_consent_logs"."locale") <= 35))
);
--> statement-breakpoint
CREATE TABLE "analytics_daily_metrics" (
	"date" date NOT NULL,
	"metric" text NOT NULL,
	"dimension" text DEFAULT 'all' NOT NULL,
	"dimension_value" text DEFAULT '' NOT NULL,
	"value" numeric(20, 4) NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_daily_metrics_pk" PRIMARY KEY("date","metric","dimension","dimension_value"),
	CONSTRAINT "analytics_daily_metrics_metric_chk" CHECK ("analytics_daily_metrics"."metric" ~ '^[a-z][a-z0-9_]*(:[a-z][a-z0-9_]*)?$'),
	CONSTRAINT "analytics_daily_metrics_dimension_chk" CHECK (("analytics_daily_metrics"."dimension" = 'all') = ("analytics_daily_metrics"."dimension_value" = '') and octet_length("analytics_daily_metrics"."dimension_value") <= 1024),
	CONSTRAINT "analytics_daily_metrics_value_chk" CHECK ("analytics_daily_metrics"."value" >= 0)
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "analytics_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"session_id" text,
	"visitor_id" text,
	"name" text NOT NULL,
	"source" text DEFAULT 'client' NOT NULL,
	"path" text,
	"props" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_events_name_chk" CHECK ("analytics_events"."name" ~ '^[a-z][a-z0-9_]{1,63}$'),
	CONSTRAINT "analytics_events_visitor_chk" CHECK ("analytics_events"."visitor_id" is null or "analytics_events"."visitor_id" ~ '^[A-Za-z0-9_-]{16,64}$'),
	CONSTRAINT "analytics_events_path_chk" CHECK ("analytics_events"."path" is null or ("analytics_events"."path" ~ '^/[^?#[:space:]]*$' and char_length("analytics_events"."path") <= 1024)),
	CONSTRAINT "analytics_events_source_chk" CHECK ("analytics_events"."source" <> 'client' or "analytics_events"."session_id" is not null),
	CONSTRAINT "analytics_events_props_chk" CHECK (jsonb_typeof("analytics_events"."props") = 'object' and octet_length("analytics_events"."props"::text) <= 4096)
);
--> statement-breakpoint
CREATE TABLE "analytics_funnels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text,
	"name" text NOT NULL,
	"description" text,
	"steps" jsonb NOT NULL,
	"window_days" integer DEFAULT 7 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_funnels_key_chk" CHECK ("analytics_funnels"."key" is null or "analytics_funnels"."key" ~ '^[a-z][a-z0-9_]{1,62}$'),
	CONSTRAINT "analytics_funnels_name_chk" CHECK (btrim("analytics_funnels"."name") <> ''),
	CONSTRAINT "analytics_funnels_steps_chk" CHECK (case when jsonb_typeof("analytics_funnels"."steps") = 'array' then jsonb_array_length("analytics_funnels"."steps") between 2 and 20 else false end),
	CONSTRAINT "analytics_funnels_window_chk" CHECK ("analytics_funnels"."window_days" between 1 and 366)
);
--> statement-breakpoint
CREATE TABLE "analytics_heatmap_points" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "analytics_heatmap_points_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"path" text NOT NULL,
	"viewport_width_bucket" text NOT NULL,
	"x_pct" integer NOT NULL,
	"y_px" integer NOT NULL,
	"doc_height" integer NOT NULL,
	"selector" text,
	"kind" text DEFAULT 'click' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_heatmap_points_path_chk" CHECK (("analytics_heatmap_points"."path" ~ '^/[^?#[:space:]]*$' and char_length("analytics_heatmap_points"."path") <= 1024)),
	CONSTRAINT "analytics_heatmap_points_coords_chk" CHECK ("analytics_heatmap_points"."x_pct" between 0 and 1000 and "analytics_heatmap_points"."y_px" >= 0 and "analytics_heatmap_points"."doc_height" > 0),
	CONSTRAINT "analytics_heatmap_points_selector_chk" CHECK ("analytics_heatmap_points"."selector" is null or (char_length("analytics_heatmap_points"."selector") <= 512 and "analytics_heatmap_points"."selector" !~ '[''"=@]'))
);
--> statement-breakpoint
CREATE TABLE "analytics_scroll_depth" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "analytics_scroll_depth_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"session_id" text NOT NULL,
	"path" text NOT NULL,
	"max_depth_pct" integer NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_scroll_depth_session_path_uq" UNIQUE("session_id","path"),
	CONSTRAINT "analytics_scroll_depth_path_chk" CHECK (("analytics_scroll_depth"."path" ~ '^/[^?#[:space:]]*$' and char_length("analytics_scroll_depth"."path") <= 1024)),
	CONSTRAINT "analytics_scroll_depth_pct_chk" CHECK ("analytics_scroll_depth"."max_depth_pct" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "analytics_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"visitor_id" text,
	"consent_level" text NOT NULL,
	"user_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"landing_path" text,
	"exit_path" text,
	"referrer_domain" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_term" text,
	"utm_content" text,
	"device_type" text,
	"browser" text,
	"os" text,
	"country_code" char(2),
	"region" text,
	"locale" text,
	"is_new_visitor" boolean DEFAULT false NOT NULL,
	"page_views" integer DEFAULT 0 NOT NULL,
	"events" integer DEFAULT 0 NOT NULL,
	"is_bounce" boolean DEFAULT true NOT NULL,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "analytics_sessions_id_chk" CHECK ("analytics_sessions"."id" ~ '^[A-Za-z0-9_-]{16,64}$'),
	CONSTRAINT "analytics_sessions_visitor_chk" CHECK ("analytics_sessions"."visitor_id" is null or "analytics_sessions"."visitor_id" ~ '^[A-Za-z0-9_-]{16,64}$'),
	CONSTRAINT "analytics_sessions_consent_chk" CHECK ("analytics_sessions"."consent_level" <> 'essential' or ("analytics_sessions"."visitor_id" is null and "analytics_sessions"."user_id" is null)),
	CONSTRAINT "analytics_sessions_paths_chk" CHECK (("analytics_sessions"."landing_path" is null or ("analytics_sessions"."landing_path" ~ '^/[^?#[:space:]]*$' and char_length("analytics_sessions"."landing_path") <= 1024)) and ("analytics_sessions"."exit_path" is null or ("analytics_sessions"."exit_path" ~ '^/[^?#[:space:]]*$' and char_length("analytics_sessions"."exit_path") <= 1024))),
	CONSTRAINT "analytics_sessions_referrer_chk" CHECK ("analytics_sessions"."referrer_domain" is null or "analytics_sessions"."referrer_domain" ~ '^[a-z0-9.-]{1,253}$'),
	CONSTRAINT "analytics_sessions_utm_chk" CHECK (("analytics_sessions"."utm_source" is null or (char_length("analytics_sessions"."utm_source") <= 200 and position('@' in "analytics_sessions"."utm_source") = 0)) and ("analytics_sessions"."utm_medium" is null or (char_length("analytics_sessions"."utm_medium") <= 200 and position('@' in "analytics_sessions"."utm_medium") = 0)) and ("analytics_sessions"."utm_campaign" is null or (char_length("analytics_sessions"."utm_campaign") <= 200 and position('@' in "analytics_sessions"."utm_campaign") = 0)) and ("analytics_sessions"."utm_term" is null or (char_length("analytics_sessions"."utm_term") <= 200 and position('@' in "analytics_sessions"."utm_term") = 0)) and ("analytics_sessions"."utm_content" is null or (char_length("analytics_sessions"."utm_content") <= 200 and position('@' in "analytics_sessions"."utm_content") = 0))),
	CONSTRAINT "analytics_sessions_coarse_chk" CHECK (("analytics_sessions"."country_code" is null or "analytics_sessions"."country_code" ~ '^[A-Z]{2}$') and ("analytics_sessions"."region" is null or char_length("analytics_sessions"."region") <= 100) and ("analytics_sessions"."browser" is null or char_length("analytics_sessions"."browser") <= 50) and ("analytics_sessions"."os" is null or char_length("analytics_sessions"."os") <= 50) and ("analytics_sessions"."locale" is null or char_length("analytics_sessions"."locale") <= 35)),
	CONSTRAINT "analytics_sessions_counters_chk" CHECK ("analytics_sessions"."page_views" >= 0 and "analytics_sessions"."events" >= 0 and "analytics_sessions"."duration_seconds" >= 0 and "analytics_sessions"."last_seen_at" >= "analytics_sessions"."started_at")
);
--> statement-breakpoint
ALTER TABLE "countries" ADD CONSTRAINT "countries_currency_code_currencies_code_fk" FOREIGN KEY ("currency_code") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "industries" ADD CONSTRAINT "industries_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."industries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_categories" ADD CONSTRAINT "job_categories_industry_id_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_categories" ADD CONSTRAINT "job_categories_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."job_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "states" ADD CONSTRAINT "states_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_industry_id_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_account_manager_user_id_users_id_fk" FOREIGN KEY ("account_manager_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_captured_by_user_id_users_id_fk" FOREIGN KEY ("captured_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_two_factor" ADD CONSTRAINT "user_two_factor_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_documents" ADD CONSTRAINT "organization_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_documents" ADD CONSTRAINT "organization_documents_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_documents" ADD CONSTRAINT "organization_documents_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_documents" ADD CONSTRAINT "organization_documents_verification_fk" FOREIGN KEY ("verification_id") REFERENCES "public"."organization_verifications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_verifications" ADD CONSTRAINT "organization_verifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_verifications" ADD CONSTRAINT "organization_verifications_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_verifications" ADD CONSTRAINT "organization_verifications_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_events" ADD CONSTRAINT "approval_events_approval_request_id_approval_requests_id_fk" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_events" ADD CONSTRAINT "approval_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_access_logs" ADD CONSTRAINT "data_access_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_access_logs" ADD CONSTRAINT "data_access_logs_actor_organization_id_organizations_id_fk" FOREIGN KEY ("actor_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_access_logs" ADD CONSTRAINT "data_access_logs_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_handled_by_user_id_users_id_fk" FOREIGN KEY ("handled_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_export_file_id_files_id_fk" FOREIGN KEY ("export_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_access_grants" ADD CONSTRAINT "file_access_grants_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_access_grants" ADD CONSTRAINT "file_access_grants_grantee_user_id_users_id_fk" FOREIGN KEY ("grantee_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_access_grants" ADD CONSTRAINT "file_access_grants_grantee_organization_id_organizations_id_fk" FOREIGN KEY ("grantee_organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_access_grants" ADD CONSTRAINT "file_access_grants_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_branches" ADD CONSTRAINT "company_branches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_branches" ADD CONSTRAINT "company_branches_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_profiles" ADD CONSTRAINT "company_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_profiles" ADD CONSTRAINT "company_profiles_headquarters_country_code_countries_code_fk" FOREIGN KEY ("headquarters_country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_profiles" ADD CONSTRAINT "company_profiles_cover_file_id_files_id_fk" FOREIGN KEY ("cover_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_profiles" ADD CONSTRAINT "company_profiles_default_currency_currencies_code_fk" FOREIGN KEY ("default_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employer_contracts" ADD CONSTRAINT "employer_contracts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employer_contracts" ADD CONSTRAINT "employer_contracts_document_file_id_files_id_fk" FOREIGN KEY ("document_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employer_contracts" ADD CONSTRAINT "employer_contracts_account_manager_user_id_users_id_fk" FOREIGN KEY ("account_manager_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employer_contracts" ADD CONSTRAINT "employer_contracts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_agreements" ADD CONSTRAINT "partner_agreements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_agreements" ADD CONSTRAINT "partner_agreements_document_file_id_files_id_fk" FOREIGN KEY ("document_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_agreements" ADD CONSTRAINT "partner_agreements_issued_by_user_id_users_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_agreements" ADD CONSTRAINT "partner_agreements_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_agreements" ADD CONSTRAINT "partner_agreements_superseded_by_fk" FOREIGN KEY ("superseded_by_agreement_id") REFERENCES "public"."partner_agreements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_licences" ADD CONSTRAINT "partner_licences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_licences" ADD CONSTRAINT "partner_licences_issuing_country_code_countries_code_fk" FOREIGN KEY ("issuing_country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_licences" ADD CONSTRAINT "partner_licences_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_licences" ADD CONSTRAINT "partner_licences_verified_by_user_id_users_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_licences" ADD CONSTRAINT "partner_licences_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_profiles" ADD CONSTRAINT "partner_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_territories" ADD CONSTRAINT "partner_territories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_territories" ADD CONSTRAINT "partner_territories_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_territories" ADD CONSTRAINT "partner_territories_authorised_by_user_id_users_id_fk" FOREIGN KEY ("authorised_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_credentials" ADD CONSTRAINT "candidate_credentials_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_credentials" ADD CONSTRAINT "candidate_credentials_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_credentials" ADD CONSTRAINT "candidate_credentials_verified_by_user_id_users_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_documents" ADD CONSTRAINT "candidate_documents_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_documents" ADD CONSTRAINT "candidate_documents_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_documents" ADD CONSTRAINT "candidate_documents_issuing_country_code_countries_code_fk" FOREIGN KEY ("issuing_country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_documents" ADD CONSTRAINT "candidate_documents_verified_by_user_id_users_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_documents" ADD CONSTRAINT "candidate_documents_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_education" ADD CONSTRAINT "candidate_education_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_education" ADD CONSTRAINT "candidate_education_education_level_id_education_levels_id_fk" FOREIGN KEY ("education_level_id") REFERENCES "public"."education_levels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_education" ADD CONSTRAINT "candidate_education_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_education" ADD CONSTRAINT "candidate_education_document_file_id_files_id_fk" FOREIGN KEY ("document_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_education" ADD CONSTRAINT "candidate_education_verified_by_user_id_users_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_education" ADD CONSTRAINT "candidate_education_qualification_type_fk" FOREIGN KEY ("qualification_type_id") REFERENCES "public"."qualification_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_experience" ADD CONSTRAINT "candidate_experience_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_experience" ADD CONSTRAINT "candidate_experience_industry_id_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_experience" ADD CONSTRAINT "candidate_experience_job_category_id_job_categories_id_fk" FOREIGN KEY ("job_category_id") REFERENCES "public"."job_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_experience" ADD CONSTRAINT "candidate_experience_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_experience" ADD CONSTRAINT "candidate_experience_evidence_file_id_files_id_fk" FOREIGN KEY ("evidence_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_experience" ADD CONSTRAINT "candidate_experience_verified_by_user_id_users_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_languages" ADD CONSTRAINT "candidate_languages_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_languages" ADD CONSTRAINT "candidate_languages_language_code_languages_code_fk" FOREIGN KEY ("language_code") REFERENCES "public"."languages"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_portfolio_items" ADD CONSTRAINT "candidate_portfolio_items_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_preferred_locations" ADD CONSTRAINT "candidate_preferred_locations_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_preferred_locations" ADD CONSTRAINT "candidate_preferred_locations_candidate_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_privacy_settings" ADD CONSTRAINT "candidate_privacy_settings_candidate_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_industry_id_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_expected_salary_currency_currencies_code_fk" FOREIGN KEY ("expected_salary_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_current_country_code_countries_code_fk" FOREIGN KEY ("current_country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_nationality_code_countries_code_fk" FOREIGN KEY ("nationality_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_photo_file_id_files_id_fk" FOREIGN KEY ("photo_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_resume_file_id_files_id_fk" FOREIGN KEY ("resume_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_sourced_by_partner_fk" FOREIGN KEY ("sourced_by_partner_org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_skills" ADD CONSTRAINT "candidate_skills_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_skills" ADD CONSTRAINT "candidate_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_skills" ADD CONSTRAINT "candidate_skills_credential_id_candidate_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."candidate_credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_support_ticket_id_support_tickets_id_fk" FOREIGN KEY ("support_ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_notes" ADD CONSTRAINT "internal_notes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_notes" ADD CONSTRAINT "internal_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_estimated_value_currency_currencies_code_fk" FOREIGN KEY ("estimated_value_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_thread_participants" ADD CONSTRAINT "message_thread_participants_thread_id_message_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."message_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_thread_participants" ADD CONSTRAINT "message_thread_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_thread_participants" ADD CONSTRAINT "message_thread_participants_org_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_message_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."message_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_lines" ADD CONSTRAINT "requirement_lines_requirement_id_requirement_requests_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirement_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_lines" ADD CONSTRAINT "requirement_lines_job_category_id_job_categories_id_fk" FOREIGN KEY ("job_category_id") REFERENCES "public"."job_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_lines" ADD CONSTRAINT "requirement_lines_salary_currency_currencies_code_fk" FOREIGN KEY ("salary_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_requests" ADD CONSTRAINT "requirement_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_requests" ADD CONSTRAINT "requirement_requests_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_requests" ADD CONSTRAINT "requirement_requests_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_requests" ADD CONSTRAINT "requirement_requests_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_requests" ADD CONSTRAINT "requirement_requests_industry_id_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_requests" ADD CONSTRAINT "requirement_requests_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_requests" ADD CONSTRAINT "requirement_requests_quoted_fee_currency_currencies_code_fk" FOREIGN KEY ("quoted_fee_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_requests" ADD CONSTRAINT "requirement_requests_approval_request_fk" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_requester_user_id_users_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_data_request_id_data_requests_id_fk" FOREIGN KEY ("data_request_id") REFERENCES "public"."data_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_completed_by_user_id_users_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_alerts" ADD CONSTRAINT "job_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_locations" ADD CONSTRAINT "job_locations_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_locations" ADD CONSTRAINT "job_locations_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_promotions" ADD CONSTRAINT "job_promotions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_promotions" ADD CONSTRAINT "job_promotions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_screening_questions" ADD CONSTRAINT "job_screening_questions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_skills" ADD CONSTRAINT "job_skills_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_skills" ADD CONSTRAINT "job_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_requirement_id_requirement_requests_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirement_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_posted_by_user_id_users_id_fk" FOREIGN KEY ("posted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_job_category_id_job_categories_id_fk" FOREIGN KEY ("job_category_id") REFERENCES "public"."job_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_industry_id_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_min_education_level_id_education_levels_id_fk" FOREIGN KEY ("min_education_level_id") REFERENCES "public"."education_levels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_salary_currency_currencies_code_fk" FOREIGN KEY ("salary_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_centres" ADD CONSTRAINT "assessment_centres_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_scores" ADD CONSTRAINT "assessment_scores_assessment_id_course_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."course_assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_scores" ADD CONSTRAINT "assessment_scores_enrolment_id_enrolments_id_fk" FOREIGN KEY ("enrolment_id") REFERENCES "public"."enrolments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_scores" ADD CONSTRAINT "assessment_scores_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_session_id_attendance_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."attendance_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_enrolment_id_enrolments_id_fk" FOREIGN KEY ("enrolment_id") REFERENCES "public"."enrolments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_course_module_id_course_modules_id_fk" FOREIGN KEY ("course_module_id") REFERENCES "public"."course_modules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_instructors" ADD CONSTRAINT "batch_instructors_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_instructors" ADD CONSTRAINT "batch_instructors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_requirement_id_requirement_requests_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirement_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_drive_registrations" ADD CONSTRAINT "campus_drive_registrations_drive_id_campus_drives_id_fk" FOREIGN KEY ("drive_id") REFERENCES "public"."campus_drives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_drive_registrations" ADD CONSTRAINT "campus_drive_registrations_registered_by_user_id_users_id_fk" FOREIGN KEY ("registered_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_drive_registrations" ADD CONSTRAINT "campus_drive_registrations_candidate_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_drives" ADD CONSTRAINT "campus_drives_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_drives" ADD CONSTRAINT "campus_drives_employer_organization_id_organizations_id_fk" FOREIGN KEY ("employer_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_drives" ADD CONSTRAINT "campus_drives_requirement_id_requirement_requests_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirement_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_drives" ADD CONSTRAINT "campus_drives_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_drives" ADD CONSTRAINT "campus_drives_coordinator_user_id_users_id_fk" FOREIGN KEY ("coordinator_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_drives" ADD CONSTRAINT "campus_drives_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_issuer_organization_id_organizations_id_fk" FOREIGN KEY ("issuer_organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_enrolment_id_enrolments_id_fk" FOREIGN KEY ("enrolment_id") REFERENCES "public"."enrolments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_skill_assessment_id_skill_assessments_id_fk" FOREIGN KEY ("skill_assessment_id") REFERENCES "public"."skill_assessments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_issued_by_user_id_users_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_replaces_fk" FOREIGN KEY ("replaces_certificate_id") REFERENCES "public"."certificates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_assessments" ADD CONSTRAINT "course_assessments_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_assessments" ADD CONSTRAINT "course_assessments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_modules" ADD CONSTRAINT "course_modules_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_fee_currency_currencies_code_fk" FOREIGN KEY ("fee_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_cover_file_id_files_id_fk" FOREIGN KEY ("cover_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrolments" ADD CONSTRAINT "enrolments_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrolments" ADD CONSTRAINT "enrolments_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrolments" ADD CONSTRAINT "enrolments_enrolled_by_user_id_users_id_fk" FOREIGN KEY ("enrolled_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrolments" ADD CONSTRAINT "enrolments_fee_currency_currencies_code_fk" FOREIGN KEY ("fee_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_profiles" ADD CONSTRAINT "institution_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_profiles" ADD CONSTRAINT "institution_profiles_cover_file_id_files_id_fk" FOREIGN KEY ("cover_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_profiles" ADD CONSTRAINT "institution_profiles_authorised_by_user_id_users_id_fk" FOREIGN KEY ("authorised_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internship_programmes" ADD CONSTRAINT "internship_programmes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internship_programmes" ADD CONSTRAINT "internship_programmes_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internship_programmes" ADD CONSTRAINT "internship_programmes_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internship_programmes" ADD CONSTRAINT "internship_programmes_stipend_currency_currencies_code_fk" FOREIGN KEY ("stipend_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internship_programmes" ADD CONSTRAINT "internship_programmes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internship_programmes" ADD CONSTRAINT "internship_programmes_host_employer_fk" FOREIGN KEY ("host_employer_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placement_outcomes" ADD CONSTRAINT "placement_outcomes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placement_outcomes" ADD CONSTRAINT "placement_outcomes_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placement_outcomes" ADD CONSTRAINT "placement_outcomes_enrolment_id_enrolments_id_fk" FOREIGN KEY ("enrolment_id") REFERENCES "public"."enrolments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placement_outcomes" ADD CONSTRAINT "placement_outcomes_campus_drive_id_campus_drives_id_fk" FOREIGN KEY ("campus_drive_id") REFERENCES "public"."campus_drives"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placement_outcomes" ADD CONSTRAINT "placement_outcomes_employer_organization_id_organizations_id_fk" FOREIGN KEY ("employer_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placement_outcomes" ADD CONSTRAINT "placement_outcomes_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placement_outcomes" ADD CONSTRAINT "placement_outcomes_salary_currency_currencies_code_fk" FOREIGN KEY ("salary_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placement_outcomes" ADD CONSTRAINT "placement_outcomes_verified_by_user_id_users_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placement_outcomes" ADD CONSTRAINT "placement_outcomes_evidence_file_id_files_id_fk" FOREIGN KEY ("evidence_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placement_outcomes" ADD CONSTRAINT "placement_outcomes_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_assessments" ADD CONSTRAINT "skill_assessments_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_assessments" ADD CONSTRAINT "skill_assessments_assessment_centre_id_assessment_centres_id_fk" FOREIGN KEY ("assessment_centre_id") REFERENCES "public"."assessment_centres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_assessments" ADD CONSTRAINT "skill_assessments_requirement_id_requirement_requests_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirement_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_assessments" ADD CONSTRAINT "skill_assessments_enrolment_id_enrolments_id_fk" FOREIGN KEY ("enrolment_id") REFERENCES "public"."enrolments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_assessments" ADD CONSTRAINT "skill_assessments_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_assessments" ADD CONSTRAINT "skill_assessments_scheduled_by_user_id_users_id_fk" FOREIGN KEY ("scheduled_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_assessments" ADD CONSTRAINT "skill_assessments_assessor_user_id_users_id_fk" FOREIGN KEY ("assessor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_assessments" ADD CONSTRAINT "skill_assessments_retest_of_fk" FOREIGN KEY ("retest_of_assessment_id") REFERENCES "public"."skill_assessments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_answers" ADD CONSTRAINT "application_answers_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_answers" ADD CONSTRAINT "application_answers_question_id_job_screening_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."job_screening_questions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_notes" ADD CONSTRAINT "application_notes_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_notes" ADD CONSTRAINT "application_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_notes" ADD CONSTRAINT "application_notes_author_organization_id_organizations_id_fk" FOREIGN KEY ("author_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_stage_history" ADD CONSTRAINT "application_stage_history_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_stage_history" ADD CONSTRAINT "application_stage_history_from_stage_id_workflow_stages_id_fk" FOREIGN KEY ("from_stage_id") REFERENCES "public"."workflow_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_stage_history" ADD CONSTRAINT "application_stage_history_to_stage_id_workflow_stages_id_fk" FOREIGN KEY ("to_stage_id") REFERENCES "public"."workflow_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_stage_history" ADD CONSTRAINT "application_stage_history_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_stage_history" ADD CONSTRAINT "application_stage_history_changed_by_org_fk" FOREIGN KEY ("changed_by_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_workflows" ADD CONSTRAINT "application_workflows_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_workflows" ADD CONSTRAINT "application_workflows_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_workflow_id_application_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."application_workflows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_partner_organization_id_organizations_id_fk" FOREIGN KEY ("partner_organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_resume_file_id_files_id_fk" FOREIGN KEY ("resume_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_expected_salary_currency_currencies_code_fk" FOREIGN KEY ("expected_salary_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_consent_record_id_consent_records_id_fk" FOREIGN KEY ("consent_record_id") REFERENCES "public"."consent_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_shared_with_employer_by_user_id_users_id_fk" FOREIGN KEY ("shared_with_employer_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_current_stage_fk" FOREIGN KEY ("current_stage_id","workflow_id") REFERENCES "public"."workflow_stages"("id","workflow_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_attributions" ADD CONSTRAINT "candidate_attributions_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_attributions" ADD CONSTRAINT "candidate_attributions_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_attributions" ADD CONSTRAINT "candidate_attributions_partner_fk" FOREIGN KEY ("partner_organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_attributions" ADD CONSTRAINT "candidate_attributions_first_submission_fk" FOREIGN KEY ("first_submission_id") REFERENCES "public"."partner_submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_flags" ADD CONSTRAINT "duplicate_flags_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_flags" ADD CONSTRAINT "duplicate_flags_partner_submission_id_partner_submissions_id_fk" FOREIGN KEY ("partner_submission_id") REFERENCES "public"."partner_submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_flags" ADD CONSTRAINT "duplicate_flags_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_flags" ADD CONSTRAINT "duplicate_flags_possible_duplicate_fk" FOREIGN KEY ("possible_duplicate_candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_feedback" ADD CONSTRAINT "interview_feedback_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_feedback" ADD CONSTRAINT "interview_feedback_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_feedback" ADD CONSTRAINT "interview_feedback_author_organization_id_organizations_id_fk" FOREIGN KEY ("author_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_participants" ADD CONSTRAINT "interview_participants_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_participants" ADD CONSTRAINT "interview_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_organized_by_user_id_users_id_fk" FOREIGN KEY ("organized_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_skill_assessment_id_skill_assessments_id_fk" FOREIGN KEY ("skill_assessment_id") REFERENCES "public"."skill_assessments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobilisation_checklist_items" ADD CONSTRAINT "mobilisation_checklist_items_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobilisation_checklist_items" ADD CONSTRAINT "mobilisation_checklist_items_verified_by_user_id_users_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobilisation_checklist_items" ADD CONSTRAINT "mobilisation_checklist_items_mobilisation_fk" FOREIGN KEY ("mobilisation_id") REFERENCES "public"."mobilisation_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobilisation_records" ADD CONSTRAINT "mobilisation_records_placement_id_placements_id_fk" FOREIGN KEY ("placement_id") REFERENCES "public"."placements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobilisation_records" ADD CONSTRAINT "mobilisation_records_destination_country_code_countries_code_fk" FOREIGN KEY ("destination_country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobilisation_records" ADD CONSTRAINT "mobilisation_records_coordinator_user_id_users_id_fk" FOREIGN KEY ("coordinator_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_issued_by_user_id_users_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_salary_currency_currencies_code_fk" FOREIGN KEY ("salary_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_offer_file_id_files_id_fk" FOREIGN KEY ("offer_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_signed_offer_file_id_files_id_fk" FOREIGN KEY ("signed_offer_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_supersedes_fk" FOREIGN KEY ("supersedes_offer_id") REFERENCES "public"."offers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_assignments" ADD CONSTRAINT "partner_assignments_partner_organization_id_organizations_id_fk" FOREIGN KEY ("partner_organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_assignments" ADD CONSTRAINT "partner_assignments_requirement_id_requirement_requests_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirement_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_assignments" ADD CONSTRAINT "partner_assignments_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_assignments" ADD CONSTRAINT "partner_assignments_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_submissions" ADD CONSTRAINT "partner_submissions_partner_organization_id_organizations_id_fk" FOREIGN KEY ("partner_organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_submissions" ADD CONSTRAINT "partner_submissions_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_submissions" ADD CONSTRAINT "partner_submissions_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_submissions" ADD CONSTRAINT "partner_submissions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_submissions" ADD CONSTRAINT "partner_submissions_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_submissions" ADD CONSTRAINT "partner_submissions_consent_record_id_consent_records_id_fk" FOREIGN KEY ("consent_record_id") REFERENCES "public"."consent_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_submissions" ADD CONSTRAINT "partner_submissions_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_submissions" ADD CONSTRAINT "partner_submissions_assignment_partner_fk" FOREIGN KEY ("assignment_id","partner_organization_id") REFERENCES "public"."partner_assignments"("id","partner_organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_submissions" ADD CONSTRAINT "partner_submissions_duplicate_of_fk" FOREIGN KEY ("duplicate_of_candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_partner_organization_id_organizations_id_fk" FOREIGN KEY ("partner_organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_salary_currency_currencies_code_fk" FOREIGN KEY ("salary_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_fee_currency_currencies_code_fk" FOREIGN KEY ("fee_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_replacement_for_fk" FOREIGN KEY ("replacement_for_placement_id") REFERENCES "public"."placements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_unlocks" ADD CONSTRAINT "profile_unlocks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_unlocks" ADD CONSTRAINT "profile_unlocks_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_unlocks" ADD CONSTRAINT "profile_unlocks_unlocked_by_user_id_users_id_fk" FOREIGN KEY ("unlocked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_unlocks" ADD CONSTRAINT "profile_unlocks_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_list_items" ADD CONSTRAINT "talent_list_items_list_id_talent_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."talent_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_list_items" ADD CONSTRAINT "talent_list_items_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_list_items" ADD CONSTRAINT "talent_list_items_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_lists" ADD CONSTRAINT "talent_lists_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_lists" ADD CONSTRAINT "talent_lists_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_lists" ADD CONSTRAINT "talent_lists_requirement_id_requirement_requests_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirement_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_lists" ADD CONSTRAINT "talent_lists_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_stages" ADD CONSTRAINT "workflow_stages_workflow_id_application_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."application_workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_profiles" ADD CONSTRAINT "billing_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_profiles" ADD CONSTRAINT "billing_profiles_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_profiles" ADD CONSTRAINT "billing_profiles_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_redeemed_by_user_id_users_id_fk" FOREIGN KEY ("redeemed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_invoice_currency_fk" FOREIGN KEY ("currency","invoice_id") REFERENCES "public"."invoices"("currency","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_opened_by_user_id_users_id_fk" FOREIGN KEY ("opened_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_currency_fk" FOREIGN KEY ("currency","invoice_id") REFERENCES "public"."invoices"("currency","id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_buyer_user_id_users_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_issued_by_user_id_users_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_voided_by_user_id_users_id_fk" FOREIGN KEY ("voided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_pdf_file_id_files_id_fk" FOREIGN KEY ("pdf_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_original_invoice_fk" FOREIGN KEY ("original_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_settlement_lines" ADD CONSTRAINT "partner_settlement_lines_placement_id_placements_id_fk" FOREIGN KEY ("placement_id") REFERENCES "public"."placements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_settlement_lines" ADD CONSTRAINT "partner_settlement_lines_settlement_currency_fk" FOREIGN KEY ("currency","settlement_id") REFERENCES "public"."partner_settlements"("currency","id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "partner_settlements" ADD CONSTRAINT "partner_settlements_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_settlements" ADD CONSTRAINT "partner_settlements_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_settlements" ADD CONSTRAINT "partner_settlements_partner_invoice_file_id_files_id_fk" FOREIGN KEY ("partner_invoice_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_settlements" ADD CONSTRAINT "partner_settlements_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_settlements" ADD CONSTRAINT "partner_settlements_partner_org_fk" FOREIGN KEY ("partner_organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_settlements" ADD CONSTRAINT "partner_settlements_approval_request_fk" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payer_user_id_users_id_fk" FOREIGN KEY ("payer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_proof_file_id_files_id_fk" FOREIGN KEY ("proof_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_currency_fk" FOREIGN KEY ("currency","invoice_id") REFERENCES "public"."invoices"("currency","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_prices" ADD CONSTRAINT "plan_prices_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_prices" ADD CONSTRAINT "plan_prices_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_approval_request_id_approval_requests_id_fk" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_credit_note_invoice_id_invoices_id_fk" FOREIGN KEY ("credit_note_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_currency_fk" FOREIGN KEY ("currency","payment_id") REFERENCES "public"."payments"("currency","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_price_id_plan_prices_id_fk" FOREIGN KEY ("plan_price_id") REFERENCES "public"."plan_prices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_template_fk" FOREIGN KEY ("template_id") REFERENCES "public"."notification_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_locale_languages_code_fk" FOREIGN KEY ("locale") REFERENCES "public"."languages"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entries" ADD CONSTRAINT "cms_entries_hero_asset_id_media_assets_id_fk" FOREIGN KEY ("hero_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entries" ADD CONSTRAINT "cms_entries_logo_permission_id_logo_permissions_id_fk" FOREIGN KEY ("logo_permission_id") REFERENCES "public"."logo_permissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entries" ADD CONSTRAINT "cms_entries_consent_file_id_files_id_fk" FOREIGN KEY ("consent_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entries" ADD CONSTRAINT "cms_entries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entries" ADD CONSTRAINT "cms_entries_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entries" ADD CONSTRAINT "cms_entries_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_versions" ADD CONSTRAINT "cms_entry_versions_entry_id_cms_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."cms_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_versions" ADD CONSTRAINT "cms_entry_versions_hero_asset_id_media_assets_id_fk" FOREIGN KEY ("hero_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entry_versions" ADD CONSTRAINT "cms_entry_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logo_permissions" ADD CONSTRAINT "logo_permissions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logo_permissions" ADD CONSTRAINT "logo_permissions_logo_asset_id_media_assets_id_fk" FOREIGN KEY ("logo_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logo_permissions" ADD CONSTRAINT "logo_permissions_evidence_file_id_files_id_fk" FOREIGN KEY ("evidence_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logo_permissions" ADD CONSTRAINT "logo_permissions_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logo_permissions" ADD CONSTRAINT "logo_permissions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_folder_id_media_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."media_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_consent_file_id_files_id_fk" FOREIGN KEY ("consent_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_folders" ADD CONSTRAINT "media_folders_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_folders" ADD CONSTRAINT "media_folders_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."media_folders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_usages" ADD CONSTRAINT "media_usages_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_metrics" ADD CONSTRAINT "public_metrics_evidence_file_id_files_id_fk" FOREIGN KEY ("evidence_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_metrics" ADD CONSTRAINT "public_metrics_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_metrics" ADD CONSTRAINT "public_metrics_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_campaigns" ADD CONSTRAINT "analytics_campaigns_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_campaigns" ADD CONSTRAINT "analytics_campaigns_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_session_id_analytics_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."analytics_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_funnels" ADD CONSTRAINT "analytics_funnels_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_scroll_depth" ADD CONSTRAINT "analytics_scroll_depth_session_id_analytics_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."analytics_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_sessions" ADD CONSTRAINT "analytics_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "countries_market_region_idx" ON "countries" USING btree ("market_region");--> statement-breakpoint
CREATE UNIQUE INDEX "education_levels_key_uq" ON "education_levels" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "industries_slug_uq" ON "industries" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "job_categories_slug_uq" ON "job_categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "job_categories_industry_idx" ON "job_categories" USING btree ("industry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "qualification_types_key_uq" ON "qualification_types" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "skills_slug_uq" ON "skills" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "skills_category_idx" ON "skills" USING btree ("category");--> statement-breakpoint
CREATE INDEX "skills_name_trgm_idx" ON "skills" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "states_country_name_uq" ON "states" USING btree ("country_code","name");--> statement-breakpoint
CREATE UNIQUE INDEX "files_storage_key_uq" ON "files" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "files_owner_idx" ON "files" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "files_org_idx" ON "files" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "files_purpose_idx" ON "files" USING btree ("purpose");--> statement-breakpoint
CREATE INDEX "files_sha256_idx" ON "files" USING btree ("sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_uq" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "organizations_type_status_idx" ON "organizations" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX "organizations_country_idx" ON "organizations" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX "organizations_name_trgm_idx" ON "organizations" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_uq" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "users_staff_idx" ON "users" USING btree ("is_staff");--> statement-breakpoint
CREATE INDEX "users_display_name_trgm_idx" ON "users" USING gin ("display_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "consent_records_user_purpose_idx" ON "consent_records" USING btree ("user_id","purpose","created_at");--> statement-breakpoint
CREATE INDEX "consent_records_anon_idx" ON "consent_records" USING btree ("anonymous_id","purpose","created_at");--> statement-breakpoint
CREATE INDEX "consent_records_context_idx" ON "consent_records" USING btree ("context_type","context_id");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_accounts_provider_account_uq" ON "oauth_accounts" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE INDEX "oauth_accounts_user_idx" ON "oauth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "roles_org_idx" ON "roles" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "user_roles_role_idx" ON "user_roles" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "verification_tokens_target_idx" ON "verification_tokens" USING btree ("target","purpose","created_at");--> statement-breakpoint
CREATE INDEX "verification_tokens_user_idx" ON "verification_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "organization_documents_org_idx" ON "organization_documents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_documents_expiry_idx" ON "organization_documents" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_invitations_token_uq" ON "organization_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "organization_invitations_org_idx" ON "organization_invitations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_invitations_email_idx" ON "organization_invitations" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_members_org_user_uq" ON "organization_members" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "organization_members_user_idx" ON "organization_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "organization_verifications_org_idx" ON "organization_verifications" USING btree ("organization_id","submitted_at");--> statement-breakpoint
CREATE INDEX "approval_events_request_idx" ON "approval_events" USING btree ("approval_request_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_requests_code_uq" ON "approval_requests" USING btree ("code");--> statement-breakpoint
CREATE INDEX "approval_requests_status_idx" ON "approval_requests" USING btree ("status","type","created_at");--> statement-breakpoint
CREATE INDEX "approval_requests_entity_idx" ON "approval_requests" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "approval_requests_assignee_idx" ON "approval_requests" USING btree ("assigned_to_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_requests_open_uq" ON "approval_requests" USING btree ("type","entity_id") WHERE status in ('pending','in_review','escalated','changes_requested');--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_logs_org_idx" ON "audit_logs" USING btree ("organization_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_logs_occurred_idx" ON "audit_logs" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "background_jobs_ready_idx" ON "background_jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "background_jobs_dedupe_uq" ON "background_jobs" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "background_jobs_type_idx" ON "background_jobs" USING btree ("type");--> statement-breakpoint
CREATE INDEX "data_access_logs_subject_idx" ON "data_access_logs" USING btree ("subject_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "data_access_logs_actor_idx" ON "data_access_logs" USING btree ("actor_user_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "data_requests_code_uq" ON "data_requests" USING btree ("code");--> statement-breakpoint
CREATE INDEX "data_requests_status_idx" ON "data_requests" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "data_requests_user_idx" ON "data_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "dev_outbox_created_idx" ON "dev_outbox" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "file_access_grants_file_idx" ON "file_access_grants" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "file_access_grants_user_idx" ON "file_access_grants" USING btree ("grantee_user_id");--> statement-breakpoint
CREATE INDEX "file_access_grants_org_idx" ON "file_access_grants" USING btree ("grantee_organization_id");--> statement-breakpoint
CREATE INDEX "rate_limit_buckets_expires_idx" ON "rate_limit_buckets" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "security_events_user_idx" ON "security_events" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "security_events_type_idx" ON "security_events" USING btree ("type","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "company_branches_org_hq_uq" ON "company_branches" USING btree ("organization_id") WHERE is_headquarters;--> statement-breakpoint
CREATE INDEX "company_branches_country_idx" ON "company_branches" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX "company_profiles_hq_country_idx" ON "company_profiles" USING btree ("headquarters_country_code");--> statement-breakpoint
CREATE INDEX "company_profiles_cover_file_idx" ON "company_profiles" USING btree ("cover_file_id");--> statement-breakpoint
CREATE INDEX "company_profiles_default_currency_idx" ON "company_profiles" USING btree ("default_currency");--> statement-breakpoint
CREATE INDEX "company_profiles_hiring_regions_idx" ON "company_profiles" USING gin ("hiring_regions");--> statement-breakpoint
CREATE INDEX "employer_contracts_org_idx" ON "employer_contracts" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "employer_contracts_document_file_idx" ON "employer_contracts" USING btree ("document_file_id");--> statement-breakpoint
CREATE INDEX "employer_contracts_account_manager_idx" ON "employer_contracts" USING btree ("account_manager_user_id");--> statement-breakpoint
CREATE INDEX "employer_contracts_created_by_idx" ON "employer_contracts" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "employer_contracts_active_ends_on_idx" ON "employer_contracts" USING btree ("ends_on") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "partner_agreements_one_active_uq" ON "partner_agreements" USING btree ("organization_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "partner_agreements_superseded_by_idx" ON "partner_agreements" USING btree ("superseded_by_agreement_id");--> statement-breakpoint
CREATE INDEX "partner_agreements_document_file_idx" ON "partner_agreements" USING btree ("document_file_id");--> statement-breakpoint
CREATE INDEX "partner_agreements_issued_by_idx" ON "partner_agreements" USING btree ("issued_by_user_id");--> statement-breakpoint
CREATE INDEX "partner_agreements_accepted_by_idx" ON "partner_agreements" USING btree ("accepted_by_user_id");--> statement-breakpoint
CREATE INDEX "partner_agreements_active_until_idx" ON "partner_agreements" USING btree ("effective_until") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "partner_licences_org_idx" ON "partner_licences" USING btree ("organization_id","verification_status");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_licences_org_number_uq" ON "partner_licences" USING btree ("organization_id","licence_type","issuing_country_code","licence_number") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "partner_licences_number_idx" ON "partner_licences" USING btree ("licence_number","issuing_country_code");--> statement-breakpoint
CREATE INDEX "partner_licences_country_idx" ON "partner_licences" USING btree ("issuing_country_code");--> statement-breakpoint
CREATE INDEX "partner_licences_file_idx" ON "partner_licences" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "partner_licences_verified_by_idx" ON "partner_licences" USING btree ("verified_by_user_id");--> statement-breakpoint
CREATE INDEX "partner_licences_submitted_by_idx" ON "partner_licences" USING btree ("submitted_by_user_id");--> statement-breakpoint
CREATE INDEX "partner_licences_review_idx" ON "partner_licences" USING btree ("verification_status","created_at");--> statement-breakpoint
CREATE INDEX "partner_licences_expiry_idx" ON "partner_licences" USING btree ("valid_until") WHERE verification_status = 'verified' and deleted_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "partner_territories_org_area_uq" ON "partner_territories" USING btree ("organization_id","country_code",coalesce("state_region", ''));--> statement-breakpoint
CREATE INDEX "partner_territories_country_idx" ON "partner_territories" USING btree ("country_code","scope");--> statement-breakpoint
CREATE INDEX "partner_territories_authorised_by_idx" ON "partner_territories" USING btree ("authorised_by_user_id");--> statement-breakpoint
CREATE INDEX "candidate_credentials_candidate_idx" ON "candidate_credentials" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "candidate_credentials_file_idx" ON "candidate_credentials" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "candidate_credentials_verified_by_idx" ON "candidate_credentials" USING btree ("verified_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_credentials_certificate_uq" ON "candidate_credentials" USING btree ("certificate_id");--> statement-breakpoint
CREATE INDEX "candidate_credentials_review_idx" ON "candidate_credentials" USING btree ("created_at") WHERE "candidate_credentials"."verification_status" = 'pending' and "candidate_credentials"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "candidate_documents_candidate_idx" ON "candidate_documents" USING btree ("candidate_id","document_type");--> statement-breakpoint
CREATE INDEX "candidate_documents_file_idx" ON "candidate_documents" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "candidate_documents_issuing_country_idx" ON "candidate_documents" USING btree ("issuing_country_code");--> statement-breakpoint
CREATE INDEX "candidate_documents_verified_by_idx" ON "candidate_documents" USING btree ("verified_by_user_id");--> statement-breakpoint
CREATE INDEX "candidate_documents_uploaded_by_idx" ON "candidate_documents" USING btree ("uploaded_by_user_id");--> statement-breakpoint
CREATE INDEX "candidate_documents_review_idx" ON "candidate_documents" USING btree ("created_at") WHERE "candidate_documents"."verification_status" = 'pending' and "candidate_documents"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "candidate_documents_expiry_idx" ON "candidate_documents" USING btree ("expires_at") WHERE "candidate_documents"."expires_at" is not null and "candidate_documents"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "candidate_education_candidate_idx" ON "candidate_education" USING btree ("candidate_id","sort_order");--> statement-breakpoint
CREATE INDEX "candidate_education_level_idx" ON "candidate_education" USING btree ("education_level_id");--> statement-breakpoint
CREATE INDEX "candidate_education_qualification_type_idx" ON "candidate_education" USING btree ("qualification_type_id");--> statement-breakpoint
CREATE INDEX "candidate_education_country_idx" ON "candidate_education" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX "candidate_education_document_file_idx" ON "candidate_education" USING btree ("document_file_id");--> statement-breakpoint
CREATE INDEX "candidate_education_verified_by_idx" ON "candidate_education" USING btree ("verified_by_user_id");--> statement-breakpoint
CREATE INDEX "candidate_experience_candidate_idx" ON "candidate_experience" USING btree ("candidate_id","sort_order");--> statement-breakpoint
CREATE INDEX "candidate_experience_industry_idx" ON "candidate_experience" USING btree ("industry_id");--> statement-breakpoint
CREATE INDEX "candidate_experience_category_idx" ON "candidate_experience" USING btree ("job_category_id");--> statement-breakpoint
CREATE INDEX "candidate_experience_country_idx" ON "candidate_experience" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX "candidate_experience_evidence_file_idx" ON "candidate_experience" USING btree ("evidence_file_id");--> statement-breakpoint
CREATE INDEX "candidate_experience_verified_by_idx" ON "candidate_experience" USING btree ("verified_by_user_id");--> statement-breakpoint
CREATE INDEX "candidate_languages_language_idx" ON "candidate_languages" USING btree ("language_code","proficiency");--> statement-breakpoint
CREATE INDEX "candidate_portfolio_items_candidate_idx" ON "candidate_portfolio_items" USING btree ("candidate_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_preferred_locations_place_uq" ON "candidate_preferred_locations" USING btree ("candidate_id","country_code",coalesce("state_region", ''),coalesce("city", ''));--> statement-breakpoint
CREATE INDEX "candidate_preferred_locations_country_idx" ON "candidate_preferred_locations" USING btree ("country_code");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_profiles_user_uq" ON "candidate_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "candidate_profiles_industry_idx" ON "candidate_profiles" USING btree ("industry_id");--> statement-breakpoint
CREATE INDEX "candidate_profiles_salary_currency_idx" ON "candidate_profiles" USING btree ("expected_salary_currency");--> statement-breakpoint
CREATE INDEX "candidate_profiles_country_idx" ON "candidate_profiles" USING btree ("current_country_code");--> statement-breakpoint
CREATE INDEX "candidate_profiles_nationality_idx" ON "candidate_profiles" USING btree ("nationality_code");--> statement-breakpoint
CREATE INDEX "candidate_profiles_photo_file_idx" ON "candidate_profiles" USING btree ("photo_file_id");--> statement-breakpoint
CREATE INDEX "candidate_profiles_resume_file_idx" ON "candidate_profiles" USING btree ("resume_file_id");--> statement-breakpoint
CREATE INDEX "candidate_profiles_partner_idx" ON "candidate_profiles" USING btree ("sourced_by_partner_org_id");--> statement-breakpoint
CREATE INDEX "candidate_profiles_created_by_idx" ON "candidate_profiles" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "candidate_profiles_passport_hash_idx" ON "candidate_profiles" USING btree ("passport_number_hash") WHERE "candidate_profiles"."passport_number_hash" is not null;--> statement-breakpoint
CREATE INDEX "candidate_profiles_search_idx" ON "candidate_profiles" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "candidate_profiles_categories_idx" ON "candidate_profiles" USING gin ("preferred_category_ids");--> statement-breakpoint
CREATE INDEX "candidate_profiles_discovery_idx" ON "candidate_profiles" USING btree ("visibility","last_active_at" DESC NULLS LAST) WHERE "candidate_profiles"."deleted_at" is null and "candidate_profiles"."is_open_to_work";--> statement-breakpoint
CREATE INDEX "candidate_profiles_overseas_idx" ON "candidate_profiles" USING btree ("passport_status","current_country_code") WHERE "candidate_profiles"."open_to_overseas" and "candidate_profiles"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "candidate_skills_skill_idx" ON "candidate_skills" USING btree ("skill_id","verified");--> statement-breakpoint
CREATE INDEX "candidate_skills_credential_idx" ON "candidate_skills" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "candidate_skills_skill_assessment_idx" ON "candidate_skills" USING btree ("skill_assessment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enquiries_code_uq" ON "enquiries" USING btree ("code");--> statement-breakpoint
CREATE INDEX "enquiries_status_idx" ON "enquiries" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "enquiries_type_idx" ON "enquiries" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX "enquiries_assignee_idx" ON "enquiries" USING btree ("assigned_to_user_id","status");--> statement-breakpoint
CREATE INDEX "enquiries_lead_idx" ON "enquiries" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "enquiries_user_idx" ON "enquiries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "enquiries_ticket_idx" ON "enquiries" USING btree ("support_ticket_id");--> statement-breakpoint
CREATE INDEX "enquiries_email_idx" ON "enquiries" USING btree ("email");--> statement-breakpoint
CREATE INDEX "internal_notes_entity_idx" ON "internal_notes" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "internal_notes_org_idx" ON "internal_notes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "internal_notes_author_idx" ON "internal_notes" USING btree ("author_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_code_uq" ON "leads" USING btree ("code");--> statement-breakpoint
CREATE INDEX "leads_status_idx" ON "leads" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "leads_assignee_idx" ON "leads" USING btree ("assigned_to_user_id","status");--> statement-breakpoint
CREATE INDEX "leads_follow_up_idx" ON "leads" USING btree ("next_follow_up_at") WHERE "leads"."status" not in ('won', 'lost');--> statement-breakpoint
CREATE INDEX "leads_org_idx" ON "leads" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "leads_country_idx" ON "leads" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX "leads_currency_idx" ON "leads" USING btree ("estimated_value_currency");--> statement-breakpoint
CREATE INDEX "leads_created_by_idx" ON "leads" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "leads_email_idx" ON "leads" USING btree ("email");--> statement-breakpoint
CREATE INDEX "leads_phone_idx" ON "leads" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "leads_name_trgm_idx" ON "leads" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "leads_org_name_trgm_idx" ON "leads" USING gin ("organization_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "message_thread_participants_user_idx" ON "message_thread_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "message_thread_participants_org_idx" ON "message_thread_participants" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "message_threads_org_idx" ON "message_threads" USING btree ("organization_id","last_message_at");--> statement-breakpoint
CREATE INDEX "message_threads_context_idx" ON "message_threads" USING btree ("context_type","context_id");--> statement-breakpoint
CREATE INDEX "message_threads_created_by_idx" ON "message_threads" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "message_threads_status_idx" ON "message_threads" USING btree ("status","last_message_at");--> statement-breakpoint
CREATE INDEX "messages_thread_idx" ON "messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_author_idx" ON "messages" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX "requirement_lines_requirement_idx" ON "requirement_lines" USING btree ("requirement_id","sort_order");--> statement-breakpoint
CREATE INDEX "requirement_lines_category_idx" ON "requirement_lines" USING btree ("job_category_id");--> statement-breakpoint
CREATE INDEX "requirement_lines_currency_idx" ON "requirement_lines" USING btree ("salary_currency");--> statement-breakpoint
CREATE INDEX "requirement_lines_job_idx" ON "requirement_lines" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "requirement_requests_code_uq" ON "requirement_requests" USING btree ("code");--> statement-breakpoint
CREATE INDEX "requirement_requests_org_idx" ON "requirement_requests" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "requirement_requests_lead_idx" ON "requirement_requests" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "requirement_requests_submitted_by_idx" ON "requirement_requests" USING btree ("submitted_by_user_id");--> statement-breakpoint
CREATE INDEX "requirement_requests_status_idx" ON "requirement_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "requirement_requests_assignee_idx" ON "requirement_requests" USING btree ("assigned_to_user_id","status");--> statement-breakpoint
CREATE INDEX "requirement_requests_country_idx" ON "requirement_requests" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX "requirement_requests_industry_idx" ON "requirement_requests" USING btree ("industry_id");--> statement-breakpoint
CREATE INDEX "requirement_requests_approval_idx" ON "requirement_requests" USING btree ("approval_request_id");--> statement-breakpoint
CREATE INDEX "requirement_requests_currency_idx" ON "requirement_requests" USING btree ("quoted_fee_currency");--> statement-breakpoint
CREATE INDEX "requirement_requests_search_idx" ON "requirement_requests" USING gin ("search_vector");--> statement-breakpoint
CREATE UNIQUE INDEX "support_tickets_code_uq" ON "support_tickets" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "support_tickets_grievance_code_uq" ON "support_tickets" USING btree ("grievance_code");--> statement-breakpoint
CREATE INDEX "support_tickets_requester_idx" ON "support_tickets" USING btree ("requester_user_id","created_at");--> statement-breakpoint
CREATE INDEX "support_tickets_requester_email_idx" ON "support_tickets" USING btree ("requester_email");--> statement-breakpoint
CREATE INDEX "support_tickets_org_idx" ON "support_tickets" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "support_tickets_status_idx" ON "support_tickets" USING btree ("status","priority","created_at");--> statement-breakpoint
CREATE INDEX "support_tickets_assignee_idx" ON "support_tickets" USING btree ("assigned_to_user_id","status");--> statement-breakpoint
CREATE INDEX "support_tickets_category_idx" ON "support_tickets" USING btree ("category","status");--> statement-breakpoint
CREATE INDEX "support_tickets_related_idx" ON "support_tickets" USING btree ("related_type","related_id");--> statement-breakpoint
CREATE INDEX "support_tickets_data_request_idx" ON "support_tickets" USING btree ("data_request_id");--> statement-breakpoint
CREATE INDEX "support_tickets_first_response_due_idx" ON "support_tickets" USING btree ("first_response_due_at") WHERE "support_tickets"."first_responded_at" is null;--> statement-breakpoint
CREATE INDEX "support_tickets_resolution_due_idx" ON "support_tickets" USING btree ("resolution_due_at") WHERE "support_tickets"."resolved_at" is null;--> statement-breakpoint
CREATE INDEX "support_tickets_grievance_idx" ON "support_tickets" USING btree ("created_at") WHERE "support_tickets"."is_grievance";--> statement-breakpoint
CREATE INDEX "support_tickets_search_idx" ON "support_tickets" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "tasks_assignee_idx" ON "tasks" USING btree ("assigned_to_user_id","status","due_at");--> statement-breakpoint
CREATE INDEX "tasks_status_due_idx" ON "tasks" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "tasks_created_by_idx" ON "tasks" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "tasks_completed_by_idx" ON "tasks" USING btree ("completed_by_user_id");--> statement-breakpoint
CREATE INDEX "tasks_org_idx" ON "tasks" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tasks_related_idx" ON "tasks" USING btree ("related_type","related_id");--> statement-breakpoint
CREATE INDEX "ticket_messages_ticket_idx" ON "ticket_messages" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "ticket_messages_author_idx" ON "ticket_messages" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX "job_alerts_user_idx" ON "job_alerts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "job_alerts_due_idx" ON "job_alerts" USING btree ("frequency","last_run_at") WHERE "job_alerts"."is_active";--> statement-breakpoint
CREATE UNIQUE INDEX "job_locations_place_uq" ON "job_locations" USING btree ("job_id","country_code",coalesce("state_region", ''),coalesce("city", ''));--> statement-breakpoint
CREATE INDEX "job_locations_country_idx" ON "job_locations" USING btree ("country_code","city");--> statement-breakpoint
CREATE INDEX "job_promotions_job_idx" ON "job_promotions" USING btree ("job_id","type");--> statement-breakpoint
CREATE INDEX "job_promotions_active_idx" ON "job_promotions" USING btree ("type","starts_at","ends_at") WHERE "job_promotions"."cancelled_at" is null;--> statement-breakpoint
CREATE INDEX "job_promotions_created_by_idx" ON "job_promotions" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "job_screening_questions_job_idx" ON "job_screening_questions" USING btree ("job_id","sort_order");--> statement-breakpoint
CREATE INDEX "job_skills_skill_idx" ON "job_skills" USING btree ("skill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_code_uq" ON "jobs" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_slug_uq" ON "jobs" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "jobs_org_status_idx" ON "jobs" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "jobs_requirement_idx" ON "jobs" USING btree ("requirement_id");--> statement-breakpoint
CREATE INDEX "jobs_posted_by_idx" ON "jobs" USING btree ("posted_by_user_id");--> statement-breakpoint
CREATE INDEX "jobs_category_idx" ON "jobs" USING btree ("job_category_id");--> statement-breakpoint
CREATE INDEX "jobs_industry_idx" ON "jobs" USING btree ("industry_id");--> statement-breakpoint
CREATE INDEX "jobs_min_education_idx" ON "jobs" USING btree ("min_education_level_id");--> statement-breakpoint
CREATE INDEX "jobs_salary_currency_idx" ON "jobs" USING btree ("salary_currency");--> statement-breakpoint
CREATE INDEX "jobs_country_idx" ON "jobs" USING btree ("country_code","city");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "jobs_published_idx" ON "jobs" USING btree ("published_at" DESC NULLS LAST) WHERE "jobs"."status" = 'published' and "jobs"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "jobs_featured_idx" ON "jobs" USING btree ("featured_until") WHERE "jobs"."is_featured" and "jobs"."status" = 'published' and "jobs"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "jobs_expiry_idx" ON "jobs" USING btree ("expires_at") WHERE "jobs"."status" = 'published';--> statement-breakpoint
CREATE INDEX "jobs_scheduled_publish_idx" ON "jobs" USING btree ("scheduled_publish_at") WHERE "jobs"."scheduled_publish_at" is not null;--> statement-breakpoint
CREATE INDEX "jobs_search_idx" ON "jobs" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "jobs_title_trgm_idx" ON "jobs" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "saved_jobs_job_idx" ON "saved_jobs" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_centres_name_uq" ON "assessment_centres" USING btree ("name");--> statement-breakpoint
CREATE INDEX "assessment_centres_country_idx" ON "assessment_centres" USING btree ("country_code","city");--> statement-breakpoint
CREATE INDEX "assessment_scores_enrolment_idx" ON "assessment_scores" USING btree ("enrolment_id");--> statement-breakpoint
CREATE INDEX "assessment_scores_recorded_by_idx" ON "assessment_scores" USING btree ("recorded_by_user_id");--> statement-breakpoint
CREATE INDEX "attendance_records_enrolment_idx" ON "attendance_records" USING btree ("enrolment_id");--> statement-breakpoint
CREATE INDEX "attendance_records_recorded_by_idx" ON "attendance_records" USING btree ("recorded_by_user_id");--> statement-breakpoint
CREATE INDEX "attendance_sessions_batch_idx" ON "attendance_sessions" USING btree ("batch_id","session_date");--> statement-breakpoint
CREATE INDEX "attendance_sessions_module_idx" ON "attendance_sessions" USING btree ("course_module_id");--> statement-breakpoint
CREATE INDEX "attendance_sessions_recorded_by_idx" ON "attendance_sessions" USING btree ("recorded_by_user_id");--> statement-breakpoint
CREATE INDEX "batch_instructors_user_idx" ON "batch_instructors" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "batches_code_uq" ON "batches" USING btree ("code");--> statement-breakpoint
CREATE INDEX "batches_course_idx" ON "batches" USING btree ("course_id","starts_on");--> statement-breakpoint
CREATE INDEX "batches_org_idx" ON "batches" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "batches_requirement_idx" ON "batches" USING btree ("requirement_id");--> statement-breakpoint
CREATE INDEX "batches_country_idx" ON "batches" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX "batches_created_by_idx" ON "batches" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "batches_status_starts_idx" ON "batches" USING btree ("status","starts_on");--> statement-breakpoint
CREATE INDEX "campus_drive_registrations_candidate_idx" ON "campus_drive_registrations" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "campus_drive_registrations_registered_by_idx" ON "campus_drive_registrations" USING btree ("registered_by_user_id");--> statement-breakpoint
CREATE INDEX "campus_drive_registrations_application_idx" ON "campus_drive_registrations" USING btree ("application_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campus_drives_code_uq" ON "campus_drives" USING btree ("code");--> statement-breakpoint
CREATE INDEX "campus_drives_org_idx" ON "campus_drives" USING btree ("organization_id","drive_date");--> statement-breakpoint
CREATE INDEX "campus_drives_employer_idx" ON "campus_drives" USING btree ("employer_organization_id");--> statement-breakpoint
CREATE INDEX "campus_drives_requirement_idx" ON "campus_drives" USING btree ("requirement_id");--> statement-breakpoint
CREATE INDEX "campus_drives_country_idx" ON "campus_drives" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX "campus_drives_coordinator_idx" ON "campus_drives" USING btree ("coordinator_user_id");--> statement-breakpoint
CREATE INDEX "campus_drives_created_by_idx" ON "campus_drives" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "campus_drives_status_date_idx" ON "campus_drives" USING btree ("status","drive_date");--> statement-breakpoint
CREATE INDEX "campus_drives_job_ids_idx" ON "campus_drives" USING gin ("job_ids");--> statement-breakpoint
CREATE UNIQUE INDEX "certificates_code_uq" ON "certificates" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "certificates_verification_code_uq" ON "certificates" USING btree ("verification_code");--> statement-breakpoint
CREATE INDEX "certificates_candidate_idx" ON "certificates" USING btree ("candidate_id","issued_at");--> statement-breakpoint
CREATE INDEX "certificates_issuer_org_idx" ON "certificates" USING btree ("issuer_organization_id","issued_at");--> statement-breakpoint
CREATE INDEX "certificates_course_idx" ON "certificates" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "certificates_batch_idx" ON "certificates" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "certificates_enrolment_idx" ON "certificates" USING btree ("enrolment_id");--> statement-breakpoint
CREATE INDEX "certificates_skill_assessment_idx" ON "certificates" USING btree ("skill_assessment_id");--> statement-breakpoint
CREATE INDEX "certificates_file_idx" ON "certificates" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "certificates_revoked_by_idx" ON "certificates" USING btree ("revoked_by_user_id");--> statement-breakpoint
CREATE INDEX "certificates_issued_by_idx" ON "certificates" USING btree ("issued_by_user_id");--> statement-breakpoint
CREATE INDEX "certificates_replaces_idx" ON "certificates" USING btree ("replaces_certificate_id");--> statement-breakpoint
CREATE INDEX "certificates_active_expiry_idx" ON "certificates" USING btree ("expires_at") WHERE status = 'active' and expires_at is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "certificates_active_assessment_uq" ON "certificates" USING btree ("skill_assessment_id") WHERE status = 'active' and skill_assessment_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "certificates_active_enrolment_uq" ON "certificates" USING btree ("enrolment_id","issuer_type") WHERE status = 'active' and enrolment_id is not null and skill_assessment_id is null;--> statement-breakpoint
CREATE INDEX "course_assessments_batch_idx" ON "course_assessments" USING btree ("batch_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "course_assessments_created_by_idx" ON "course_assessments" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "course_modules_course_idx" ON "course_modules" USING btree ("course_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "courses_code_uq" ON "courses" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "courses_slug_uq" ON "courses" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "courses_org_idx" ON "courses" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "courses_public_idx" ON "courses" USING btree ("category","published_at") WHERE status = 'published' and deleted_at is null;--> statement-breakpoint
CREATE INDEX "courses_fee_currency_idx" ON "courses" USING btree ("fee_currency");--> statement-breakpoint
CREATE INDEX "courses_cover_file_idx" ON "courses" USING btree ("cover_file_id");--> statement-breakpoint
CREATE INDEX "courses_created_by_idx" ON "courses" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "courses_search_idx" ON "courses" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "enrolments_batch_status_idx" ON "enrolments" USING btree ("batch_id","status");--> statement-breakpoint
CREATE INDEX "enrolments_candidate_idx" ON "enrolments" USING btree ("candidate_id","status");--> statement-breakpoint
CREATE INDEX "enrolments_enrolled_by_idx" ON "enrolments" USING btree ("enrolled_by_user_id");--> statement-breakpoint
CREATE INDEX "enrolments_fee_currency_idx" ON "enrolments" USING btree ("fee_currency");--> statement-breakpoint
CREATE INDEX "institution_profiles_cover_file_idx" ON "institution_profiles" USING btree ("cover_file_id");--> statement-breakpoint
CREATE INDEX "institution_profiles_authorised_by_idx" ON "institution_profiles" USING btree ("authorised_by_user_id");--> statement-breakpoint
CREATE INDEX "internship_programmes_org_idx" ON "internship_programmes" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "internship_programmes_host_idx" ON "internship_programmes" USING btree ("host_employer_organization_id");--> statement-breakpoint
CREATE INDEX "internship_programmes_job_idx" ON "internship_programmes" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "internship_programmes_country_idx" ON "internship_programmes" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX "internship_programmes_currency_idx" ON "internship_programmes" USING btree ("stipend_currency");--> statement-breakpoint
CREATE INDEX "internship_programmes_created_by_idx" ON "internship_programmes" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "placement_outcomes_org_idx" ON "placement_outcomes" USING btree ("organization_id","placed_on");--> statement-breakpoint
CREATE INDEX "placement_outcomes_candidate_idx" ON "placement_outcomes" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "placement_outcomes_enrolment_idx" ON "placement_outcomes" USING btree ("enrolment_id");--> statement-breakpoint
CREATE INDEX "placement_outcomes_drive_idx" ON "placement_outcomes" USING btree ("campus_drive_id");--> statement-breakpoint
CREATE INDEX "placement_outcomes_employer_idx" ON "placement_outcomes" USING btree ("employer_organization_id");--> statement-breakpoint
CREATE INDEX "placement_outcomes_country_idx" ON "placement_outcomes" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX "placement_outcomes_currency_idx" ON "placement_outcomes" USING btree ("salary_currency");--> statement-breakpoint
CREATE INDEX "placement_outcomes_verified_by_idx" ON "placement_outcomes" USING btree ("verified_by_user_id");--> statement-breakpoint
CREATE INDEX "placement_outcomes_evidence_file_idx" ON "placement_outcomes" USING btree ("evidence_file_id");--> statement-breakpoint
CREATE INDEX "placement_outcomes_recorded_by_idx" ON "placement_outcomes" USING btree ("recorded_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "placement_outcomes_org_placement_uq" ON "placement_outcomes" USING btree ("organization_id","placement_id") WHERE organization_id is not null and placement_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "placement_outcomes_vsg_placement_uq" ON "placement_outcomes" USING btree ("placement_id") WHERE organization_id is null and placement_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "skill_assessments_code_uq" ON "skill_assessments" USING btree ("code");--> statement-breakpoint
CREATE INDEX "skill_assessments_candidate_idx" ON "skill_assessments" USING btree ("candidate_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "skill_assessments_centre_idx" ON "skill_assessments" USING btree ("assessment_centre_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "skill_assessments_application_idx" ON "skill_assessments" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "skill_assessments_requirement_idx" ON "skill_assessments" USING btree ("requirement_id");--> statement-breakpoint
CREATE INDEX "skill_assessments_enrolment_idx" ON "skill_assessments" USING btree ("enrolment_id");--> statement-breakpoint
CREATE INDEX "skill_assessments_skill_idx" ON "skill_assessments" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "skill_assessments_scheduled_by_idx" ON "skill_assessments" USING btree ("scheduled_by_user_id");--> statement-breakpoint
CREATE INDEX "skill_assessments_assessor_idx" ON "skill_assessments" USING btree ("assessor_user_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "skill_assessments_status_idx" ON "skill_assessments" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "skill_assessments_retest_of_idx" ON "skill_assessments" USING btree ("retest_of_assessment_id");--> statement-breakpoint
CREATE INDEX "application_answers_question_idx" ON "application_answers" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "application_notes_application_idx" ON "application_notes" USING btree ("application_id","created_at");--> statement-breakpoint
CREATE INDEX "application_notes_author_idx" ON "application_notes" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX "application_notes_author_org_idx" ON "application_notes" USING btree ("author_organization_id");--> statement-breakpoint
CREATE INDEX "application_stage_history_application_idx" ON "application_stage_history" USING btree ("application_id","created_at");--> statement-breakpoint
CREATE INDEX "application_stage_history_from_stage_idx" ON "application_stage_history" USING btree ("from_stage_id");--> statement-breakpoint
CREATE INDEX "application_stage_history_to_stage_idx" ON "application_stage_history" USING btree ("to_stage_id","created_at");--> statement-breakpoint
CREATE INDEX "application_stage_history_changed_by_idx" ON "application_stage_history" USING btree ("changed_by_user_id");--> statement-breakpoint
CREATE INDEX "application_stage_history_changed_by_org_idx" ON "application_stage_history" USING btree ("changed_by_organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "application_workflows_org_key_uq" ON "application_workflows" USING btree (coalesce("organization_id", '00000000-0000-0000-0000-000000000000'::uuid),"key");--> statement-breakpoint
CREATE INDEX "application_workflows_org_idx" ON "application_workflows" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "application_workflows_default_uq" ON "application_workflows" USING btree (coalesce("organization_id", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE "application_workflows"."is_default";--> statement-breakpoint
CREATE INDEX "application_workflows_created_by_idx" ON "application_workflows" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "applications_code_uq" ON "applications" USING btree ("code");--> statement-breakpoint
CREATE INDEX "applications_job_stage_idx" ON "applications" USING btree ("job_id","current_stage_id");--> statement-breakpoint
CREATE INDEX "applications_candidate_idx" ON "applications" USING btree ("candidate_id","created_at");--> statement-breakpoint
CREATE INDEX "applications_workflow_idx" ON "applications" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "applications_stage_idx" ON "applications" USING btree ("current_stage_id","last_stage_changed_at");--> statement-breakpoint
CREATE INDEX "applications_partner_idx" ON "applications" USING btree ("partner_organization_id","created_at");--> statement-breakpoint
CREATE INDEX "applications_submitted_by_idx" ON "applications" USING btree ("submitted_by_user_id");--> statement-breakpoint
CREATE INDEX "applications_assigned_to_idx" ON "applications" USING btree ("assigned_to_user_id","status");--> statement-breakpoint
CREATE INDEX "applications_resume_file_idx" ON "applications" USING btree ("resume_file_id");--> statement-breakpoint
CREATE INDEX "applications_consent_idx" ON "applications" USING btree ("consent_record_id");--> statement-breakpoint
CREATE INDEX "applications_shared_by_idx" ON "applications" USING btree ("shared_with_employer_by_user_id");--> statement-breakpoint
CREATE INDEX "applications_salary_currency_idx" ON "applications" USING btree ("expected_salary_currency");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_attributions_active_uq" ON "candidate_attributions" USING btree ("candidate_id") WHERE "candidate_attributions"."status" = 'active';--> statement-breakpoint
CREATE INDEX "candidate_attributions_candidate_idx" ON "candidate_attributions" USING btree ("candidate_id","created_at");--> statement-breakpoint
CREATE INDEX "candidate_attributions_partner_idx" ON "candidate_attributions" USING btree ("partner_organization_id","status");--> statement-breakpoint
CREATE INDEX "candidate_attributions_first_submission_idx" ON "candidate_attributions" USING btree ("first_submission_id");--> statement-breakpoint
CREATE INDEX "candidate_attributions_resolved_by_idx" ON "candidate_attributions" USING btree ("resolved_by_user_id");--> statement-breakpoint
CREATE INDEX "candidate_attributions_expiry_idx" ON "candidate_attributions" USING btree ("expires_at") WHERE "candidate_attributions"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "duplicate_flags_pair_uq" ON "duplicate_flags" USING btree (least("candidate_id", "possible_duplicate_candidate_id"),greatest("candidate_id", "possible_duplicate_candidate_id"));--> statement-breakpoint
CREATE INDEX "duplicate_flags_candidate_idx" ON "duplicate_flags" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "duplicate_flags_possible_duplicate_idx" ON "duplicate_flags" USING btree ("possible_duplicate_candidate_id");--> statement-breakpoint
CREATE INDEX "duplicate_flags_partner_submission_idx" ON "duplicate_flags" USING btree ("partner_submission_id");--> statement-breakpoint
CREATE INDEX "duplicate_flags_resolved_by_idx" ON "duplicate_flags" USING btree ("resolved_by_user_id");--> statement-breakpoint
CREATE INDEX "duplicate_flags_status_idx" ON "duplicate_flags" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "interview_feedback_author_idx" ON "interview_feedback" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX "interview_feedback_author_org_idx" ON "interview_feedback" USING btree ("author_organization_id");--> statement-breakpoint
CREATE INDEX "interview_participants_user_idx" ON "interview_participants" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "interviews_code_uq" ON "interviews" USING btree ("code");--> statement-breakpoint
CREATE INDEX "interviews_application_idx" ON "interviews" USING btree ("application_id","scheduled_start");--> statement-breakpoint
CREATE INDEX "interviews_org_schedule_idx" ON "interviews" USING btree ("organization_id","scheduled_start");--> statement-breakpoint
CREATE INDEX "interviews_organized_by_idx" ON "interviews" USING btree ("organized_by_user_id");--> statement-breakpoint
CREATE INDEX "interviews_skill_assessment_idx" ON "interviews" USING btree ("skill_assessment_id");--> statement-breakpoint
CREATE INDEX "interviews_upcoming_idx" ON "interviews" USING btree ("scheduled_start") WHERE "interviews"."status" in ('scheduled', 'rescheduled');--> statement-breakpoint
CREATE INDEX "mobilisation_checklist_items_mobilisation_idx" ON "mobilisation_checklist_items" USING btree ("mobilisation_id","sort_order");--> statement-breakpoint
CREATE INDEX "mobilisation_checklist_items_file_idx" ON "mobilisation_checklist_items" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "mobilisation_checklist_items_verified_by_idx" ON "mobilisation_checklist_items" USING btree ("verified_by_user_id");--> statement-breakpoint
CREATE INDEX "mobilisation_checklist_items_due_idx" ON "mobilisation_checklist_items" USING btree ("due_date") WHERE "mobilisation_checklist_items"."status" in ('pending', 'rejected');--> statement-breakpoint
CREATE UNIQUE INDEX "mobilisation_records_code_uq" ON "mobilisation_records" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "mobilisation_records_placement_uq" ON "mobilisation_records" USING btree ("placement_id");--> statement-breakpoint
CREATE INDEX "mobilisation_records_destination_idx" ON "mobilisation_records" USING btree ("destination_country_code");--> statement-breakpoint
CREATE INDEX "mobilisation_records_coordinator_idx" ON "mobilisation_records" USING btree ("coordinator_user_id","status");--> statement-breakpoint
CREATE INDEX "mobilisation_records_status_idx" ON "mobilisation_records" USING btree ("status","travel_date");--> statement-breakpoint
CREATE UNIQUE INDEX "offers_code_uq" ON "offers" USING btree ("code");--> statement-breakpoint
CREATE INDEX "offers_application_idx" ON "offers" USING btree ("application_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "offers_application_open_uq" ON "offers" USING btree ("application_id") WHERE "offers"."status" in ('draft', 'issued', 'accepted');--> statement-breakpoint
CREATE INDEX "offers_org_status_idx" ON "offers" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "offers_issued_by_idx" ON "offers" USING btree ("issued_by_user_id");--> statement-breakpoint
CREATE INDEX "offers_supersedes_idx" ON "offers" USING btree ("supersedes_offer_id");--> statement-breakpoint
CREATE INDEX "offers_country_idx" ON "offers" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX "offers_salary_currency_idx" ON "offers" USING btree ("salary_currency");--> statement-breakpoint
CREATE INDEX "offers_offer_file_idx" ON "offers" USING btree ("offer_file_id");--> statement-breakpoint
CREATE INDEX "offers_signed_file_idx" ON "offers" USING btree ("signed_offer_file_id");--> statement-breakpoint
CREATE INDEX "offers_expiry_idx" ON "offers" USING btree ("expires_at") WHERE "offers"."status" = 'issued';--> statement-breakpoint
CREATE INDEX "partner_assignments_partner_idx" ON "partner_assignments" USING btree ("partner_organization_id","status");--> statement-breakpoint
CREATE INDEX "partner_assignments_requirement_idx" ON "partner_assignments" USING btree ("requirement_id");--> statement-breakpoint
CREATE INDEX "partner_assignments_job_idx" ON "partner_assignments" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "partner_assignments_assigned_by_idx" ON "partner_assignments" USING btree ("assigned_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_assignments_open_uq" ON "partner_assignments" USING btree ("partner_organization_id",coalesce("requirement_id", '00000000-0000-0000-0000-000000000000'::uuid),coalesce("job_id", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE "partner_assignments"."status" in ('active', 'paused');--> statement-breakpoint
CREATE UNIQUE INDEX "partner_submissions_code_uq" ON "partner_submissions" USING btree ("code");--> statement-breakpoint
CREATE INDEX "partner_submissions_partner_idx" ON "partner_submissions" USING btree ("partner_organization_id","status","created_at");--> statement-breakpoint
CREATE INDEX "partner_submissions_submitted_by_idx" ON "partner_submissions" USING btree ("submitted_by_user_id");--> statement-breakpoint
CREATE INDEX "partner_submissions_candidate_idx" ON "partner_submissions" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "partner_submissions_job_idx" ON "partner_submissions" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_submissions_application_uq" ON "partner_submissions" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "partner_submissions_consent_idx" ON "partner_submissions" USING btree ("consent_record_id");--> statement-breakpoint
CREATE INDEX "partner_submissions_duplicate_of_idx" ON "partner_submissions" USING btree ("duplicate_of_candidate_id");--> statement-breakpoint
CREATE INDEX "partner_submissions_reviewed_by_idx" ON "partner_submissions" USING btree ("reviewed_by_user_id");--> statement-breakpoint
CREATE INDEX "partner_submissions_review_queue_idx" ON "partner_submissions" USING btree ("created_at") WHERE "partner_submissions"."status" in ('submitted', 'under_review');--> statement-breakpoint
CREATE UNIQUE INDEX "placements_code_uq" ON "placements" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "placements_application_uq" ON "placements" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "placements_offer_idx" ON "placements" USING btree ("offer_id");--> statement-breakpoint
CREATE INDEX "placements_candidate_idx" ON "placements" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "placements_org_status_idx" ON "placements" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "placements_job_idx" ON "placements" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "placements_partner_idx" ON "placements" USING btree ("partner_organization_id","placed_on");--> statement-breakpoint
CREATE INDEX "placements_replacement_for_idx" ON "placements" USING btree ("replacement_for_placement_id");--> statement-breakpoint
CREATE INDEX "placements_country_idx" ON "placements" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX "placements_salary_currency_idx" ON "placements" USING btree ("salary_currency");--> statement-breakpoint
CREATE INDEX "placements_fee_currency_idx" ON "placements" USING btree ("fee_currency");--> statement-breakpoint
CREATE INDEX "placements_status_idx" ON "placements" USING btree ("status","placed_on");--> statement-breakpoint
CREATE INDEX "profile_unlocks_candidate_idx" ON "profile_unlocks" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "profile_unlocks_unlocked_by_idx" ON "profile_unlocks" USING btree ("unlocked_by_user_id");--> statement-breakpoint
CREATE INDEX "profile_unlocks_job_idx" ON "profile_unlocks" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "talent_list_items_candidate_idx" ON "talent_list_items" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "talent_list_items_added_by_idx" ON "talent_list_items" USING btree ("added_by_user_id");--> statement-breakpoint
CREATE INDEX "talent_lists_org_idx" ON "talent_lists" USING btree ("organization_id","updated_at");--> statement-breakpoint
CREATE INDEX "talent_lists_job_idx" ON "talent_lists" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "talent_lists_requirement_idx" ON "talent_lists" USING btree ("requirement_id");--> statement-breakpoint
CREATE INDEX "talent_lists_created_by_idx" ON "talent_lists" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "workflow_stages_workflow_order_idx" ON "workflow_stages" USING btree ("workflow_id","sort_order");--> statement-breakpoint
CREATE INDEX "billing_profiles_country_idx" ON "billing_profiles" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX "billing_profiles_currency_idx" ON "billing_profiles" USING btree ("currency");--> statement-breakpoint
CREATE INDEX "coupon_redemptions_org_idx" ON "coupon_redemptions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "coupon_redemptions_user_idx" ON "coupon_redemptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "coupon_redemptions_invoice_idx" ON "coupon_redemptions" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "coupon_redemptions_subscription_idx" ON "coupon_redemptions" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "coupon_redemptions_currency_idx" ON "coupon_redemptions" USING btree ("currency");--> statement-breakpoint
CREATE INDEX "coupon_redemptions_redeemed_by_idx" ON "coupon_redemptions" USING btree ("redeemed_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_code_uq" ON "coupons" USING btree ("code");--> statement-breakpoint
CREATE INDEX "coupons_currency_idx" ON "coupons" USING btree ("currency");--> statement-breakpoint
CREATE INDEX "coupons_created_by_idx" ON "coupons" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_idempotency_uq" ON "credit_ledger" USING btree ("organization_id","idempotency_key") WHERE "credit_ledger"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "credit_ledger_org_key_created_idx" ON "credit_ledger" USING btree ("organization_id","entitlement_key","created_at");--> statement-breakpoint
CREATE INDEX "credit_ledger_reference_idx" ON "credit_ledger" USING btree ("reference_type","reference_id");--> statement-breakpoint
CREATE INDEX "credit_ledger_actor_idx" ON "credit_ledger" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "credit_ledger_expiry_idx" ON "credit_ledger" USING btree ("expires_at") WHERE "credit_ledger"."expires_at" is not null and "credit_ledger"."delta" > 0;--> statement-breakpoint
CREATE UNIQUE INDEX "disputes_provider_ref_uq" ON "disputes" USING btree ("provider_dispute_id");--> statement-breakpoint
CREATE INDEX "disputes_payment_idx" ON "disputes" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "disputes_invoice_idx" ON "disputes" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "disputes_org_idx" ON "disputes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "disputes_status_idx" ON "disputes" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "disputes_currency_idx" ON "disputes" USING btree ("currency");--> statement-breakpoint
CREATE INDEX "disputes_opened_by_idx" ON "disputes" USING btree ("opened_by_user_id");--> statement-breakpoint
CREATE INDEX "disputes_resolved_by_idx" ON "disputes" USING btree ("resolved_by_user_id");--> statement-breakpoint
CREATE INDEX "invoice_lines_invoice_idx" ON "invoice_lines" USING btree ("invoice_id","sort_order");--> statement-breakpoint
CREATE INDEX "invoice_lines_reference_idx" ON "invoice_lines" USING btree ("reference_type","reference_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_code_uq" ON "invoices" USING btree ("code");--> statement-breakpoint
CREATE INDEX "invoices_original_invoice_idx" ON "invoices" USING btree ("original_invoice_id");--> statement-breakpoint
CREATE INDEX "invoices_org_idx" ON "invoices" USING btree ("organization_id","issued_at");--> statement-breakpoint
CREATE INDEX "invoices_buyer_user_idx" ON "invoices" USING btree ("buyer_user_id");--> statement-breakpoint
CREATE INDEX "invoices_subscription_idx" ON "invoices" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "invoices_status_due_idx" ON "invoices" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "invoices_currency_issued_idx" ON "invoices" USING btree ("currency","issued_at");--> statement-breakpoint
CREATE INDEX "invoices_issued_by_idx" ON "invoices" USING btree ("issued_by_user_id");--> statement-breakpoint
CREATE INDEX "invoices_voided_by_idx" ON "invoices" USING btree ("voided_by_user_id");--> statement-breakpoint
CREATE INDEX "invoices_pdf_file_idx" ON "invoices" USING btree ("pdf_file_id");--> statement-breakpoint
CREATE INDEX "partner_settlement_lines_settlement_idx" ON "partner_settlement_lines" USING btree ("settlement_id");--> statement-breakpoint
CREATE INDEX "partner_settlement_lines_placement_idx" ON "partner_settlement_lines" USING btree ("placement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_settlement_lines_placement_fee_uq" ON "partner_settlement_lines" USING btree ("placement_id") WHERE "partner_settlement_lines"."kind" = 'placement_fee' and "partner_settlement_lines"."voided_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "partner_settlements_code_uq" ON "partner_settlements" USING btree ("code");--> statement-breakpoint
CREATE INDEX "partner_settlements_partner_idx" ON "partner_settlements" USING btree ("partner_organization_id","period_start");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_settlements_period_uq" ON "partner_settlements" USING btree ("partner_organization_id","period_start","period_end","currency") WHERE "partner_settlements"."status" <> 'cancelled';--> statement-breakpoint
CREATE INDEX "partner_settlements_status_idx" ON "partner_settlements" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "partner_settlements_approval_idx" ON "partner_settlements" USING btree ("approval_request_id");--> statement-breakpoint
CREATE INDEX "partner_settlements_approved_by_idx" ON "partner_settlements" USING btree ("approved_by_user_id");--> statement-breakpoint
CREATE INDEX "partner_settlements_invoice_file_idx" ON "partner_settlements" USING btree ("partner_invoice_file_id");--> statement-breakpoint
CREATE INDEX "partner_settlements_created_by_idx" ON "partner_settlements" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "payment_webhook_events_status_idx" ON "payment_webhook_events" USING btree ("status","received_at");--> statement-breakpoint
CREATE INDEX "payment_webhook_events_payment_idx" ON "payment_webhook_events" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_code_uq" ON "payments" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_ref_uq" ON "payments" USING btree ("provider","provider_payment_id") WHERE "payments"."provider_payment_id" is not null;--> statement-breakpoint
CREATE INDEX "payments_provider_order_idx" ON "payments" USING btree ("provider","provider_order_id");--> statement-breakpoint
CREATE INDEX "payments_org_idx" ON "payments" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "payments_payer_idx" ON "payments" USING btree ("payer_user_id");--> statement-breakpoint
CREATE INDEX "payments_invoice_idx" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "payments_currency_received_idx" ON "payments" USING btree ("currency","received_at");--> statement-breakpoint
CREATE INDEX "payments_proof_file_idx" ON "payments" USING btree ("proof_file_id");--> statement-breakpoint
CREATE INDEX "payments_recorded_by_idx" ON "payments" USING btree ("recorded_by_user_id");--> statement-breakpoint
CREATE INDEX "plan_prices_plan_idx" ON "plan_prices" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "plan_prices_currency_idx" ON "plan_prices" USING btree ("currency");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_prices_active_uq" ON "plan_prices" USING btree ("plan_id","currency","interval") WHERE "plan_prices"."is_active";--> statement-breakpoint
CREATE UNIQUE INDEX "plans_key_uq" ON "plans" USING btree ("key");--> statement-breakpoint
CREATE INDEX "plans_audience_idx" ON "plans" USING btree ("audience","is_active","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_default_audience_uq" ON "plans" USING btree ("audience") WHERE "plans"."is_default";--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_code_uq" ON "refunds" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_provider_ref_uq" ON "refunds" USING btree ("provider_refund_id");--> statement-breakpoint
CREATE INDEX "refunds_payment_idx" ON "refunds" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "refunds_org_idx" ON "refunds" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "refunds_status_idx" ON "refunds" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "refunds_requested_by_idx" ON "refunds" USING btree ("requested_by_user_id");--> statement-breakpoint
CREATE INDEX "refunds_approved_by_idx" ON "refunds" USING btree ("approved_by_user_id");--> statement-breakpoint
CREATE INDEX "refunds_approval_idx" ON "refunds" USING btree ("approval_request_id");--> statement-breakpoint
CREATE INDEX "refunds_credit_note_idx" ON "refunds" USING btree ("credit_note_invoice_id");--> statement-breakpoint
CREATE INDEX "subscriptions_org_idx" ON "subscriptions" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "subscriptions_plan_idx" ON "subscriptions" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "subscriptions_price_idx" ON "subscriptions" USING btree ("plan_price_id");--> statement-breakpoint
CREATE INDEX "subscriptions_currency_idx" ON "subscriptions" USING btree ("currency");--> statement-breakpoint
CREATE INDEX "subscriptions_created_by_idx" ON "subscriptions" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_period_end_idx" ON "subscriptions" USING btree ("status","current_period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_live_base_uq" ON "subscriptions" USING btree ("organization_id") WHERE "subscriptions"."kind" = 'base' and "subscriptions"."status" in ('trialing', 'active', 'past_due', 'paused');--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_provider_ref_uq" ON "subscriptions" USING btree ("provider","provider_subscription_id") WHERE "subscriptions"."provider_subscription_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "tax_rates_definition_uq" ON "tax_rates" USING btree ("country_code",coalesce("region", ''),"kind","effective_from");--> statement-breakpoint
CREATE INDEX "tax_rates_country_idx" ON "tax_rates" USING btree ("country_code","is_active");--> statement-breakpoint
CREATE INDEX "notification_deliveries_notification_idx" ON "notification_deliveries" USING btree ("notification_id");--> statement-breakpoint
CREATE INDEX "notification_deliveries_user_idx" ON "notification_deliveries" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notification_deliveries_template_idx" ON "notification_deliveries" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "notification_deliveries_event_idx" ON "notification_deliveries" USING btree ("event_key","created_at");--> statement-breakpoint
CREATE INDEX "notification_deliveries_status_idx" ON "notification_deliveries" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "notification_deliveries_provider_msg_idx" ON "notification_deliveries" USING btree ("provider","provider_message_id");--> statement-breakpoint
CREATE INDEX "notification_deliveries_recipient_idx" ON "notification_deliveries" USING btree ("recipient_hash");--> statement-breakpoint
CREATE INDEX "notification_deliveries_created_idx" ON "notification_deliveries" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_dedupe_uq" ON "notification_deliveries" USING btree ("dedupe_key","channel","recipient_hash") WHERE "notification_deliveries"."dedupe_key" is not null;--> statement-breakpoint
CREATE INDEX "notification_templates_locale_idx" ON "notification_templates" USING btree ("locale");--> statement-breakpoint
CREATE INDEX "notification_templates_updated_by_idx" ON "notification_templates" USING btree ("updated_by_user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_inbox_idx" ON "notifications" USING btree ("user_id","read_at","created_at");--> statement-breakpoint
CREATE INDEX "notifications_org_idx" ON "notifications" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "notifications_created_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_user_dedupe_uq" ON "notifications" USING btree ("user_id","dedupe_key") WHERE "notifications"."dedupe_key" is not null;--> statement-breakpoint
CREATE INDEX "announcements_status_starts_idx" ON "announcements" USING btree ("status","starts_at");--> statement-breakpoint
CREATE INDEX "announcements_status_ends_idx" ON "announcements" USING btree ("status","ends_at");--> statement-breakpoint
CREATE INDEX "announcements_audience_idx" ON "announcements" USING gin ("audience");--> statement-breakpoint
CREATE INDEX "announcements_org_idx" ON "announcements" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "announcements_created_by_idx" ON "announcements" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "announcements_updated_by_idx" ON "announcements" USING btree ("updated_by_user_id");--> statement-breakpoint
CREATE INDEX "announcements_published_by_idx" ON "announcements" USING btree ("published_by_user_id");--> statement-breakpoint
CREATE INDEX "cms_entries_listing_idx" ON "cms_entries" USING btree ("collection","locale","status","sort_order") WHERE "cms_entries"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "cms_entries_publish_at_idx" ON "cms_entries" USING btree ("publish_at") WHERE "cms_entries"."publish_at" is not null;--> statement-breakpoint
CREATE INDEX "cms_entries_unpublish_at_idx" ON "cms_entries" USING btree ("unpublish_at") WHERE "cms_entries"."unpublish_at" is not null;--> statement-breakpoint
CREATE INDEX "cms_entries_consent_expires_idx" ON "cms_entries" USING btree ("consent_expires_at") WHERE "cms_entries"."consent_expires_at" is not null;--> statement-breakpoint
CREATE INDEX "cms_entries_tags_idx" ON "cms_entries" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "cms_entries_search_idx" ON "cms_entries" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "cms_entries_hero_asset_idx" ON "cms_entries" USING btree ("hero_asset_id");--> statement-breakpoint
CREATE INDEX "cms_entries_logo_permission_idx" ON "cms_entries" USING btree ("logo_permission_id");--> statement-breakpoint
CREATE INDEX "cms_entries_consent_file_idx" ON "cms_entries" USING btree ("consent_file_id");--> statement-breakpoint
CREATE INDEX "cms_entries_created_by_idx" ON "cms_entries" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "cms_entries_updated_by_idx" ON "cms_entries" USING btree ("updated_by_user_id");--> statement-breakpoint
CREATE INDEX "cms_entries_published_by_idx" ON "cms_entries" USING btree ("published_by_user_id");--> statement-breakpoint
CREATE INDEX "cms_entry_versions_hero_asset_idx" ON "cms_entry_versions" USING btree ("hero_asset_id");--> statement-breakpoint
CREATE INDEX "cms_entry_versions_created_by_idx" ON "cms_entry_versions" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "logo_permissions_org_idx" ON "logo_permissions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "logo_permissions_logo_asset_idx" ON "logo_permissions" USING btree ("logo_asset_id");--> statement-breakpoint
CREATE INDEX "logo_permissions_evidence_file_idx" ON "logo_permissions" USING btree ("evidence_file_id");--> statement-breakpoint
CREATE INDEX "logo_permissions_approved_by_idx" ON "logo_permissions" USING btree ("approved_by_user_id");--> statement-breakpoint
CREATE INDEX "logo_permissions_created_by_idx" ON "logo_permissions" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "logo_permissions_status_expires_idx" ON "logo_permissions" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_file_uq" ON "media_assets" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "media_assets_folder_idx" ON "media_assets" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "media_assets_consent_file_idx" ON "media_assets" USING btree ("consent_file_id");--> statement-breakpoint
CREATE INDEX "media_assets_uploaded_by_idx" ON "media_assets" USING btree ("uploaded_by_user_id");--> statement-breakpoint
CREATE INDEX "media_assets_library_idx" ON "media_assets" USING btree ("status","kind","created_at");--> statement-breakpoint
CREATE INDEX "media_assets_consent_status_idx" ON "media_assets" USING btree ("consent_status");--> statement-breakpoint
CREATE INDEX "media_assets_consent_expires_idx" ON "media_assets" USING btree ("consent_expires_at") WHERE "media_assets"."consent_expires_at" is not null;--> statement-breakpoint
CREATE INDEX "media_assets_tags_idx" ON "media_assets" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "media_assets_search_idx" ON "media_assets" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "media_folders_parent_idx" ON "media_folders" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_folders_parent_name_uq" ON "media_folders" USING btree (coalesce("parent_id", '00000000-0000-0000-0000-000000000000'::uuid),"name");--> statement-breakpoint
CREATE INDEX "media_folders_created_by_idx" ON "media_folders" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "media_usages_entity_idx" ON "media_usages" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "public_metrics_key_uq" ON "public_metrics" USING btree ("key");--> statement-breakpoint
CREATE INDEX "public_metrics_evidence_file_idx" ON "public_metrics" USING btree ("evidence_file_id");--> statement-breakpoint
CREATE INDEX "public_metrics_approved_by_idx" ON "public_metrics" USING btree ("approved_by_user_id");--> statement-breakpoint
CREATE INDEX "public_metrics_updated_by_idx" ON "public_metrics" USING btree ("updated_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_campaigns_utm_campaign_uq" ON "analytics_campaigns" USING btree ("utm_campaign");--> statement-breakpoint
CREATE INDEX "analytics_campaigns_currency_idx" ON "analytics_campaigns" USING btree ("currency");--> statement-breakpoint
CREATE INDEX "analytics_campaigns_created_by_idx" ON "analytics_campaigns" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "analytics_consent_logs_anon_idx" ON "analytics_consent_logs" USING btree ("anonymous_id","created_at");--> statement-breakpoint
CREATE INDEX "analytics_consent_logs_created_idx" ON "analytics_consent_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "analytics_daily_metrics_metric_idx" ON "analytics_daily_metrics" USING btree ("metric","dimension","date");--> statement-breakpoint
CREATE INDEX "analytics_events_occurred_idx" ON "analytics_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "analytics_events_name_occurred_idx" ON "analytics_events" USING btree ("name","occurred_at");--> statement-breakpoint
CREATE INDEX "analytics_events_path_occurred_idx" ON "analytics_events" USING btree ("path","occurred_at");--> statement-breakpoint
CREATE INDEX "analytics_events_session_idx" ON "analytics_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "analytics_events_visitor_idx" ON "analytics_events" USING btree ("visitor_id","occurred_at") WHERE "analytics_events"."visitor_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_funnels_key_uq" ON "analytics_funnels" USING btree ("key");--> statement-breakpoint
CREATE INDEX "analytics_funnels_created_by_idx" ON "analytics_funnels" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "analytics_heatmap_points_page_idx" ON "analytics_heatmap_points" USING btree ("path","viewport_width_bucket","occurred_at");--> statement-breakpoint
CREATE INDEX "analytics_heatmap_points_occurred_idx" ON "analytics_heatmap_points" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "analytics_scroll_depth_path_occurred_idx" ON "analytics_scroll_depth" USING btree ("path","occurred_at");--> statement-breakpoint
CREATE INDEX "analytics_scroll_depth_occurred_idx" ON "analytics_scroll_depth" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "analytics_sessions_started_idx" ON "analytics_sessions" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "analytics_sessions_last_seen_idx" ON "analytics_sessions" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "analytics_sessions_visitor_idx" ON "analytics_sessions" USING btree ("visitor_id","started_at") WHERE "analytics_sessions"."visitor_id" is not null;--> statement-breakpoint
CREATE INDEX "analytics_sessions_user_idx" ON "analytics_sessions" USING btree ("user_id") WHERE "analytics_sessions"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "analytics_sessions_campaign_idx" ON "analytics_sessions" USING btree ("utm_campaign","started_at") WHERE "analytics_sessions"."utm_campaign" is not null;