CREATE TABLE "studio_aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"studio_id" integer NOT NULL,
	"alias" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tag_aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"tag_id" integer NOT NULL,
	"alias" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tag_parents" (
	"tag_id" integer NOT NULL,
	"parent_id" integer NOT NULL,
	CONSTRAINT "tag_parents_tag_id_parent_id_pk" PRIMARY KEY("tag_id","parent_id")
);
--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "parent_id" integer;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "origin" text DEFAULT 'scanner' NOT NULL;--> statement-breakpoint
ALTER TABLE "tags" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "studio_aliases" ADD CONSTRAINT "studio_aliases_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_aliases" ADD CONSTRAINT "tag_aliases_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_parents" ADD CONSTRAINT "tag_parents_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_parents" ADD CONSTRAINT "tag_parents_parent_id_tags_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "studio_aliases_alias_lower_idx" ON "studio_aliases" USING btree (lower("alias"));--> statement-breakpoint
CREATE INDEX "studio_aliases_studio_id_idx" ON "studio_aliases" USING btree ("studio_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tag_aliases_alias_lower_idx" ON "tag_aliases" USING btree (lower("alias"));--> statement-breakpoint
CREATE INDEX "tag_aliases_tag_id_idx" ON "tag_aliases" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "tag_parents_parent_id_idx" ON "tag_parents" USING btree ("parent_id");--> statement-breakpoint
ALTER TABLE "studios" ADD CONSTRAINT "studios_parent_id_studios_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."studios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "studios_parent_id_idx" ON "studios" USING btree ("parent_id");