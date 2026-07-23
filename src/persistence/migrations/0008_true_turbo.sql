ALTER TABLE "supply" ADD COLUMN "sku" integer;--> statement-breakpoint
ALTER TABLE "supply" ADD CONSTRAINT "supply_store_id_sku_unique" UNIQUE("store_id","sku");