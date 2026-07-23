CREATE TABLE "processed_receipt_file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"drive_file_id" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processed_receipt_file_store_id_drive_file_id_unique" UNIQUE("store_id","drive_file_id")
);
--> statement-breakpoint
CREATE TABLE "processed_waste_file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"drive_file_id" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processed_waste_file_store_id_drive_file_id_unique" UNIQUE("store_id","drive_file_id")
);
--> statement-breakpoint
ALTER TABLE "daily_ingestion_run" DROP CONSTRAINT "daily_ingestion_run_store_id_date_unique";--> statement-breakpoint
-- Added nullable first, backfilled, then constrained NOT NULL: every existing row
-- predates B5/B6 and can only have come from the (until now, implicitly sales-only)
-- /ingest-xml sales ingestion, so 'sale' is the correct backfill value, not a guess.
ALTER TABLE "daily_ingestion_run" ADD COLUMN "type" "movement_type";--> statement-breakpoint
UPDATE "daily_ingestion_run" SET "type" = 'sale' WHERE "type" IS NULL;--> statement-breakpoint
ALTER TABLE "daily_ingestion_run" ALTER COLUMN "type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "processed_receipt_file" ADD CONSTRAINT "processed_receipt_file_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processed_waste_file" ADD CONSTRAINT "processed_waste_file_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_ingestion_run" ADD CONSTRAINT "daily_ingestion_run_store_id_date_type_unique" UNIQUE("store_id","date","type");