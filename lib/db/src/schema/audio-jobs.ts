import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const audioJobsTable = pgTable("audio_jobs", {
  id: text("id").primaryKey(),
  url: text("url").notNull(),
  status: text("status").notNull().default("pending"),
  resultUrl: text("result_url"),
  title: text("title"),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AudioJob = typeof audioJobsTable.$inferSelect;
