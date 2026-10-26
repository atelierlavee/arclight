CREATE TABLE "performer_aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"performer_id" integer NOT NULL,
	"alias" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "performers" ADD COLUMN "gender" text;--> statement-breakpoint
ALTER TABLE "performers" ADD COLUMN "birthdate" date;--> statement-breakpoint
ALTER TABLE "performers" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "performers" ADD COLUMN "ethnicity" text;--> statement-breakpoint
ALTER TABLE "performers" ADD COLUMN "hair_color" text;--> statement-breakpoint
ALTER TABLE "performers" ADD COLUMN "eye_color" text;--> statement-breakpoint
ALTER TABLE "performers" ADD COLUMN "height_cm" integer;--> statement-breakpoint
ALTER TABLE "performers" ADD COLUMN "measurements" text;--> statement-breakpoint
ALTER TABLE "performers" ADD COLUMN "tattoos" text;--> statement-breakpoint
ALTER TABLE "performers" ADD COLUMN "piercings" text;--> statement-breakpoint
ALTER TABLE "performers" ADD COLUMN "career_start" integer;--> statement-breakpoint
ALTER TABLE "performers" ADD COLUMN "career_end" integer;--> statement-breakpoint
ALTER TABLE "performer_aliases" ADD CONSTRAINT "performer_aliases_performer_id_performers_id_fk" FOREIGN KEY ("performer_id") REFERENCES "public"."performers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "performer_aliases_alias_lower_idx" ON "performer_aliases" USING btree (lower("alias"));--> statement-breakpoint
CREATE INDEX "performer_aliases_performer_id_idx" ON "performer_aliases" USING btree ("performer_id");