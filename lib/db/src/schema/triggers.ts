import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const triggersTable = pgTable("triggers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  eventType: text("event_type").notNull(),
  platform: text("platform"),
  enabled: boolean("enabled").notNull().default(true),
  color: text("color").notNull().default("#FF0000"),
  brightness: integer("brightness").notNull().default(100),
  durationMs: integer("duration_ms").notNull().default(3000),
  effect: text("effect").notNull().default("solid"),
  returnToIdle: boolean("return_to_idle").notNull().default(true),
  minAmount: integer("min_amount"),
  deviceIds: text("device_ids").notNull().default("[]"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTriggerSchema = createInsertSchema(triggersTable).omit({ id: true, createdAt: true });
export type InsertTrigger = z.infer<typeof insertTriggerSchema>;
export type Trigger = typeof triggersTable.$inferSelect;
