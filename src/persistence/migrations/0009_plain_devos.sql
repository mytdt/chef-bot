CREATE TYPE "public"."routine_check_status" AS ENUM('matched', 'mismatched', 'accepted');--> statement-breakpoint
CREATE TABLE "routine_check" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"routine_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"supply_id" uuid,
	"verification_type" "verification_type" NOT NULL,
	"status" "routine_check_status" NOT NULL,
	"collaborator_telegram_id" text NOT NULL,
	"confirmed_by_telegram_id" text,
	"accepted_by_telegram_id" text,
	"accepted_at" timestamp with time zone,
	"raw_text" text NOT NULL,
	"llm_used" "llm_provider" DEFAULT 'claude' NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"_backfill_count_id" uuid
);--> statement-breakpoint
ALTER TABLE "routine_check" ADD CONSTRAINT "routine_check_routine_id_routine_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."routine"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_check" ADD CONSTRAINT "routine_check_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_check" ADD CONSTRAINT "routine_check_supply_id_supply_id_fk" FOREIGN KEY ("supply_id") REFERENCES "public"."supply"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "count" ADD COLUMN "routine_check_id" uuid;--> statement-breakpoint
-- Backfill one routine_check per existing count (seed-manual + any prior test rows).
INSERT INTO "routine_check" (
	"id",
	"routine_id",
	"store_id",
	"supply_id",
	"verification_type",
	"status",
	"collaborator_telegram_id",
	"confirmed_by_telegram_id",
	"raw_text",
	"llm_used",
	"created_at",
	"_backfill_count_id"
)
SELECT
	gen_random_uuid(),
	c."routine_id",
	r."store_id",
	c."supply_id",
	r."verification_type",
	CASE WHEN c."matched" THEN 'matched'::"routine_check_status" ELSE 'mismatched'::"routine_check_status" END,
	c."collaborator_telegram_id",
	NULL,
	c."raw_text",
	c."llm_used",
	c."created_at",
	c."id"
FROM "count" c
INNER JOIN "routine" r ON r."id" = c."routine_id";--> statement-breakpoint
UPDATE "count" AS c
SET "routine_check_id" = rc."id"
FROM "routine_check" AS rc
WHERE rc."_backfill_count_id" = c."id";--> statement-breakpoint
ALTER TABLE "routine_check" DROP COLUMN "_backfill_count_id";--> statement-breakpoint
ALTER TABLE "count" ALTER COLUMN "routine_check_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "count" ADD CONSTRAINT "count_routine_check_id_routine_check_id_fk" FOREIGN KEY ("routine_check_id") REFERENCES "public"."routine_check"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "count" ADD CONSTRAINT "count_routine_check_id_unique" UNIQUE("routine_check_id");--> statement-breakpoint
ALTER TABLE "awaiting_ingestion_count" ADD COLUMN "confirmed_by_telegram_id" text;--> statement-breakpoint
UPDATE "awaiting_ingestion_count"
SET "confirmed_by_telegram_id" = "collaborator_telegram_id"
WHERE "confirmed_by_telegram_id" IS NULL;--> statement-breakpoint
ALTER TABLE "awaiting_ingestion_count" ALTER COLUMN "confirmed_by_telegram_id" SET NOT NULL;
