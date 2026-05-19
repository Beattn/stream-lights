import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const activityTable = pgTable("activity", {
  id: serial("id").primaryKey(),
  eventType: text("event_type").notNull(),
  platform: text("platform"),
  username: text("username"),
  message: text("message"),
  amount: integer("amount"),
  colorTriggered: text("color_triggered"),
  effectTriggered: text("effect_triggered"),
  triggeredAt: timestamp("triggered_at").notNull().defaultNow(),
});

export const insertActivitySchema = createInsertSchema(activityTable).omit({ id: true, triggeredAt: true });
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Activity = typeof activityTable.$inferSelect;
