ALTER TABLE "media_items" ADD COLUMN "series_source" text DEFAULT 'scanner' NOT NULL;--> statement-breakpoint
ALTER TABLE "performers" ADD COLUMN "origin" text DEFAULT 'scanner' NOT NULL;--> statement-breakpoint
ALTER TABLE "scan_jobs" ADD COLUMN "items_failed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_events_type_idx" ON "activity_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_events_created_at_idx" ON "activity_events" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "collection_items_media_item_id_idx" ON "collection_items" USING btree ("media_item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_files_content_hash_idx" ON "media_files" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_files_media_item_id_idx" ON "media_files" USING btree ("media_item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_item_performers_performer_id_idx" ON "media_item_performers" USING btree ("performer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_items_album_id_idx" ON "media_items" USING btree ("album_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_items_series_id_idx" ON "media_items" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_items_studio_id_idx" ON "media_items" USING btree ("studio_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_items_parent_id_idx" ON "media_items" USING btree ("parent_id");