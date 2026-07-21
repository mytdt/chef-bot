CREATE TYPE "public"."criticality" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."frequency" AS ENUM('daily', 'every_n_days', 'weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."movement_source" AS ENUM('manual', '3scheckout_api');--> statement-breakpoint
CREATE TYPE "public"."movement_type" AS ENUM('receipt', 'sale', 'waste');--> statement-breakpoint
CREATE TYPE "public"."supply_category" AS ENUM('burger', 'cheese', 'sauce', 'potato', 'flavors_house');--> statement-breakpoint
CREATE TYPE "public"."verification_type" AS ENUM('expected_numeric', 'binary', 'value_range', 'expiration', 'photo_evidence');--> statement-breakpoint
CREATE TABLE "alert" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"count_id" uuid NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged" boolean DEFAULT false NOT NULL,
	"acknowledged_by" text,
	"acknowledged_at" timestamp with time zone,
	"escalated" boolean DEFAULT false NOT NULL,
	"escalated_to" text
);
--> statement-breakpoint
CREATE TABLE "count" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"routine_id" uuid NOT NULL,
	"supply_id" uuid NOT NULL,
	"collaborator_telegram_id" text NOT NULL,
	"raw_text" text NOT NULL,
	"reported_value" double precision NOT NULL,
	"actual_quantity_reported" double precision,
	"expected_value" double precision NOT NULL,
	"matched" boolean NOT NULL,
	"confirmed_by_collaborator" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_movement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supply_id" uuid NOT NULL,
	"type" "movement_type" NOT NULL,
	"quantity" double precision NOT NULL,
	"source" "movement_source" DEFAULT 'manual' NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routine" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"name" text NOT NULL,
	"verification_type" "verification_type" NOT NULL,
	"frequency" "frequency" NOT NULL,
	"criticality" "criticality" NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"telegram_group_id" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supply" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"category" "supply_category" NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"default_package_quantity" double precision,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_count_id_count_id_fk" FOREIGN KEY ("count_id") REFERENCES "public"."count"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "count" ADD CONSTRAINT "count_routine_id_routine_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."routine"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "count" ADD CONSTRAINT "count_supply_id_supply_id_fk" FOREIGN KEY ("supply_id") REFERENCES "public"."supply"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_supply_id_supply_id_fk" FOREIGN KEY ("supply_id") REFERENCES "public"."supply"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine" ADD CONSTRAINT "routine_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply" ADD CONSTRAINT "supply_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE no action ON UPDATE no action;