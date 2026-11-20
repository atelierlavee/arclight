CREATE TABLE "media_item_markers" (
	"id" serial PRIMARY KEY NOT NULL,
	"media_item_id" integer NOT NULL,
	"title" text NOT NULL,
	"start_seconds" integer NOT NULL,
	"end_seconds" integer,
	"source" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "tpdb_scene_id" text;--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "tpdb_checked_at" timestamp;--> statement-breakpoint
ALTER TABLE "media_item_markers" ADD CONSTRAINT "media_item_markers_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_item_markers_item_idx" ON "media_item_markers" USING btree ("media_item_id","start_seconds");