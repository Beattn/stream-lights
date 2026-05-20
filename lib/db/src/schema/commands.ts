import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const commandsTable = pgTable("commands", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  command: text("command").notNull().unique(),
  color: text("color").notNull().default("#FFFFFF"),
  brightness: integer("brightness").notNull().default(100),
  durationMs: integer("duration_ms").notNull().default(5000),
  effect: text("effect").notNull().default("solid"),
  enabled: boolean("enabled").notNull().default(true),
  cooldownSeconds: integer("cooldown_seconds").notNull().default(30),
  usageCount: integer("usage_count").notNull().default(0),
  audioUrl: text("audio_url"),
  audioFile: text("audio_file"),
  audioVolume: integer("audio_volume").default(100),
  customSteps: text("custom_steps").default("[]"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCommandSchema = createInsertSchema(commandsTable).omit({ id: true, createdAt: true, usageCount: true });
export type InsertCommand = z.infer<typeof insertCommandSchema>;
export type Command = typeof commandsTable.$inferSelect;
