import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const platformsTable = pgTable("platforms", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull().unique(),
  channelName: text("channel_name"),
  connected: boolean("connected").notNull().default(false),
  clientId: text("client_id"),
  clientSecret: text("client_secret"),
  accessToken: text("access_token"),
  eventsEnabled: boolean("events_enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPlatformSchema = createInsertSchema(platformsTable).omit({ id: true, createdAt: true });
export type InsertPlatform = z.infer<typeof insertPlatformSchema>;
export type Platform = typeof platformsTable.$inferSelect;
