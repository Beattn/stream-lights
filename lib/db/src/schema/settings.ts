import { pgTable, serial, text, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  globalEnabled: boolean("global_enabled").notNull().default(true),
  idleColor: text("idle_color").notNull().default("#1a1a2e"),
  idleBrightness: integer("idle_brightness").notNull().default(30),
  idleEnabled: boolean("idle_enabled").notNull().default(true),
  transitionSpeed: integer("transition_speed").notNull().default(500),
  notificationsEnabled: boolean("notifications_enabled").notNull().default(true),
  overlayEnabled: boolean("overlay_enabled").notNull().default(false),
  overlayPort: integer("overlay_port").notNull().default(3001),
  overlayConfig: text("overlay_config"),
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;
