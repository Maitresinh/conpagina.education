import { pgTable, text, timestamp, boolean, integer, jsonb, index } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const commentAlertPreference = pgTable("comment_alert_preference", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  emailFrequency: text("email_frequency").$type<"off" | "immediate" | "daily">().default("off").notNull(),
  newComments: boolean("new_comments").default(true).notNull(),
  replies: boolean("replies").default(true).notNull(),
  groupIds: jsonb("group_ids").$type<string[]>().default([]).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// The first delivery attempt freezes its payload for safe provider retries.
export const commentAlertDelivery = pgTable("comment_alert_delivery", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  frequency: text("frequency").$type<"immediate" | "daily">().notNull(),
  annotationIds: jsonb("annotation_ids").$type<string[]>().notNull(),
  scheduledAt: timestamp("scheduled_at").notNull(),
  nextAttemptAt: timestamp("next_attempt_at").notNull(),
  status: text("status").$type<"pending" | "sent" | "cancelled" | "failed">().default("pending").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  firstAttemptAt: timestamp("first_attempt_at"),
  sentAt: timestamp("sent_at"),
  providerId: text("provider_id"),
  mailContent: jsonb("mail_content").$type<{ to: string; subject: string; html: string; text: string }>(),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [index("comment_alert_delivery_due_idx").on(table.status, table.nextAttemptAt)]);
