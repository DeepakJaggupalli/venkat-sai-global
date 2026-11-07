ALTER TABLE "roles" DROP CONSTRAINT "roles_scope_key_org_uq";--> statement-breakpoint
DROP INDEX "tax_rates_definition_uq";--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "recruiting_agent_licence_id" uuid;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "recruiting_agent_name" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "recruiting_agent_certificate_number" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "recruiting_agent_certificate_valid_until" date;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "recruiting_agent_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "recruiting_agent_verified_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "started_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "tax_rates" ADD COLUMN "tax_code" text;--> statement-breakpoint
ALTER TABLE "tax_rates" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "tax_rates" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tax_rates" ADD COLUMN "confirmed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_recruiting_agent_licence_id_partner_licences_id_fk" FOREIGN KEY ("recruiting_agent_licence_id") REFERENCES "public"."partner_licences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_recruiting_agent_verified_by_user_id_users_id_fk" FOREIGN KEY ("recruiting_agent_verified_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "countries_currency_idx" ON "countries" USING btree ("currency_code");--> statement-breakpoint
CREATE INDEX "industries_parent_idx" ON "industries" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "job_categories_parent_idx" ON "job_categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "organizations_industry_idx" ON "organizations" USING btree ("industry_id");--> statement-breakpoint
CREATE INDEX "organizations_account_manager_idx" ON "organizations" USING btree ("account_manager_user_id");--> statement-breakpoint
CREATE INDEX "organizations_created_by_idx" ON "organizations" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "consent_records_captured_by_idx" ON "consent_records" USING btree ("captured_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_scope_key_org_uq" ON "roles" USING btree ("scope","key",coalesce("organization_id", '00000000-0000-0000-0000-000000000000'::uuid));--> statement-breakpoint
CREATE INDEX "user_roles_granted_by_idx" ON "user_roles" USING btree ("granted_by_user_id");--> statement-breakpoint
CREATE INDEX "organization_documents_verification_idx" ON "organization_documents" USING btree ("verification_id");--> statement-breakpoint
CREATE INDEX "organization_documents_file_idx" ON "organization_documents" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "organization_documents_uploaded_by_idx" ON "organization_documents" USING btree ("uploaded_by_user_id");--> statement-breakpoint
CREATE INDEX "organization_invitations_role_idx" ON "organization_invitations" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "organization_invitations_invited_by_idx" ON "organization_invitations" USING btree ("invited_by_user_id");--> statement-breakpoint
CREATE INDEX "organization_invitations_accepted_by_idx" ON "organization_invitations" USING btree ("accepted_by_user_id");--> statement-breakpoint
CREATE INDEX "organization_members_role_idx" ON "organization_members" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "organization_members_invited_by_idx" ON "organization_members" USING btree ("invited_by_user_id");--> statement-breakpoint
CREATE INDEX "organization_verifications_submitted_by_idx" ON "organization_verifications" USING btree ("submitted_by_user_id");--> statement-breakpoint
CREATE INDEX "organization_verifications_reviewed_by_idx" ON "organization_verifications" USING btree ("reviewed_by_user_id");--> statement-breakpoint
CREATE INDEX "approval_events_actor_idx" ON "approval_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "approval_requests_org_idx" ON "approval_requests" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "approval_requests_submitted_by_idx" ON "approval_requests" USING btree ("submitted_by_user_id");--> statement-breakpoint
CREATE INDEX "approval_requests_decided_by_idx" ON "approval_requests" USING btree ("decided_by_user_id");--> statement-breakpoint
CREATE INDEX "data_access_logs_actor_org_idx" ON "data_access_logs" USING btree ("actor_organization_id");--> statement-breakpoint
CREATE INDEX "data_requests_handled_by_idx" ON "data_requests" USING btree ("handled_by_user_id");--> statement-breakpoint
CREATE INDEX "data_requests_export_file_idx" ON "data_requests" USING btree ("export_file_id");--> statement-breakpoint
CREATE INDEX "feature_flags_updated_by_idx" ON "feature_flags" USING btree ("updated_by_user_id");--> statement-breakpoint
CREATE INDEX "file_access_grants_granted_by_idx" ON "file_access_grants" USING btree ("granted_by_user_id");--> statement-breakpoint
CREATE INDEX "platform_settings_updated_by_idx" ON "platform_settings" USING btree ("updated_by_user_id");--> statement-breakpoint
CREATE INDEX "jobs_recruiting_agent_licence_idx" ON "jobs" USING btree ("recruiting_agent_licence_id");--> statement-breakpoint
CREATE INDEX "jobs_recruiting_agent_verified_by_idx" ON "jobs" USING btree ("recruiting_agent_verified_by_user_id");--> statement-breakpoint
CREATE INDEX "tax_rates_confirmed_by_idx" ON "tax_rates" USING btree ("confirmed_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_rates_definition_uq" ON "tax_rates" USING btree ("country_code",coalesce("region", ''),"kind",coalesce("tax_code", ''),"effective_from");--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_recruiting_agent_chk" CHECK ("jobs"."recruiting_agent_verified_at" is null or ("jobs"."recruiting_agent_name" is not null and "jobs"."recruiting_agent_certificate_number" is not null));