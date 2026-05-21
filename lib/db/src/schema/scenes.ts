import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const scenesTable = pgTable("scenes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#FF0000"),
  brightness: integer("brightness").notNull().default(100),
  effect: text("effect").notNull().default("solid"),
  deviceIds: text("device_ids").notNull().default("[]"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Scene = typeof scenesTable.$inferSelect;
