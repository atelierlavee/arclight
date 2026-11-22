ALTER TABLE "media_items" ADD COLUMN "kind_source" text DEFAULT 'scanner' NOT NULL;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "default_category_id" integer;--> statement-breakpoint
ALTER TABLE "studios" ADD CONSTRAINT "studios_default_category_id_categories_id_fk" FOREIGN KEY ("default_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;