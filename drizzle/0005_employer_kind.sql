ALTER TABLE "organizations" ADD COLUMN "employer_kind" text;--> statement-breakpoint
-- Existing employer organisations are direct companies (Company Portal); other types keep null.
UPDATE "organizations" SET "employer_kind" = 'direct_company' WHERE "type" = 'employer' AND "employer_kind" IS NULL;