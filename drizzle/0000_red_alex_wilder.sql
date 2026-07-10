CREATE TYPE "public"."edited_by" AS ENUM('internal', 'customer');--> statement-breakpoint
CREATE TYPE "public"."prompt_kind" AS ENUM('internal', 'custom');--> statement-breakpoint
CREATE TABLE "prompt_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"template" text NOT NULL,
	"tags" text[] NOT NULL,
	"edited_by" "edited_by" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prompt_versions_prompt_version_uq" UNIQUE("prompt_id","version_number")
);
--> statement-breakpoint
CREATE TABLE "prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "prompt_kind" DEFAULT 'custom' NOT NULL,
	"source_prompt_id" uuid,
	"synced_source_version" integer,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"template" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"render_count" integer DEFAULT 0 NOT NULL,
	"last_rendered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prompt_versions" ADD CONSTRAINT "prompt_versions_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prompts_tags_gin" ON "prompts" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "prompts_source_idx" ON "prompts" USING btree ("source_prompt_id");