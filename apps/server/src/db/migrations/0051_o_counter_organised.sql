CREATE TABLE "o_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" integer NOT NULL,
	"media_item_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "organised_at" timestamp;--> statement-breakpoint
ALTER TABLE "profile_item_state" ADD COLUMN "o_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "o_events" ADD CONSTRAINT "o_events_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "o_events" ADD CONSTRAINT "o_events_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "o_events_profile_created_idx" ON "o_events" USING btree ("profile_id","created_at");--> statement-breakpoint
CREATE INDEX "o_events_item_idx" ON "o_events" USING btree ("media_item_id");