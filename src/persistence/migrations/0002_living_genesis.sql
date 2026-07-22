CREATE TABLE "processed_sales_file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"drive_file_id" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processed_sales_file_store_id_drive_file_id_unique" UNIQUE("store_id","drive_file_id")
);
--> statement-breakpoint
ALTER TABLE "processed_sales_file" ADD CONSTRAINT "processed_sales_file_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE no action ON UPDATE no action;