
CREATE TABLE "comment_alert_delivery" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"frequency" text NOT NULL,
	"annotation_ids" jsonb NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"next_attempt_at" timestamp NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"first_attempt_at" timestamp,
	"sent_at" timestamp,
	"provider_id" text,
	"mail_content" jsonb,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment_alert_preference" (
	"user_id" text PRIMARY KEY NOT NULL,
	"email_frequency" text DEFAULT 'off' NOT NULL,
	"new_comments" boolean DEFAULT true NOT NULL,
	"replies" boolean DEFAULT true NOT NULL,
	"group_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comment_alert_delivery" ADD CONSTRAINT "comment_alert_delivery_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_alert_preference" ADD CONSTRAINT "comment_alert_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comment_alert_delivery_due_idx" ON "comment_alert_delivery" USING btree ("status","next_attempt_at");