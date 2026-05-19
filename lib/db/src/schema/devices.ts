import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const devicesTable = pgTable("devices", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  bridgeIp: text("bridge_ip"),
  apiKey: text("api_key"),
  deviceId: text("device_id"),
  enabled: boolean("enabled").notNull().default(true),
  isOnline: boolean("is_online").notNull().default(false),
  currentColor: text("current_color"),
  brightness: integer("brightness").default(100),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDeviceSchema = createInsertSchema(devicesTable).omit({ id: true, createdAt: true, isOnline: true });
export type InsertDevice = z.infer<typeof insertDeviceSchema>;
export type Device = typeof devicesTable.$inferSelect;
