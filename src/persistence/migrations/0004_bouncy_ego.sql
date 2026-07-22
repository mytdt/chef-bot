CREATE TYPE "public"."llm_provider" AS ENUM('claude', 'gemini');--> statement-breakpoint
ALTER TABLE "count" ADD COLUMN "llm_used" "llm_provider" DEFAULT 'claude' NOT NULL;