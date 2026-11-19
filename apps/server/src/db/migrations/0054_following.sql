CREATE TABLE "profile_studio_state" (
	"profile_id" integer NOT NULL,
	"studio_id" integer NOT NULL,
	"followed_at" timestamp,
	CONSTRAINT "profile_studio_state_profile_id_studio_id_pk" PRIMARY KEY("profile_id","studio_id")
);
--> statement-breakpoint
ALTER TABLE "profile_performer_state" ADD COLUMN "followed_at" timestamp;--> statement-breakpoint
ALTER TABLE "profile_studio_state" ADD CONSTRAINT "profile_studio_state_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_studio_state" ADD CONSTRAINT "profile_studio_state_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE cascade ON UPDATE no action;