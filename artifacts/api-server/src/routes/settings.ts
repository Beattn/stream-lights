import { Router } from "express";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router = Router();

async function getOrCreateSettings() {
  const existing = await db.select().from(settingsTable);
  if (existing.length > 0) return existing[0];

  const [created] = await db.insert(settingsTable).values({}).returning();
  return created;
}

router.get("/settings", async (req, res) => {
  try {
    const settings = await getOrCreateSettings();
    res.json(settings);
  } catch (err) {
    req.log.error({ err }, "Failed to get settings");
    res.status(500).json({ error: "Failed to get settings" });
  }
});

router.patch("/settings", async (req, res) => {
  try {
    const settings = await getOrCreateSettings();

    const body = z.object({
      globalEnabled: z.boolean().optional(),
      idleColor: z.string().optional(),
      idleBrightness: z.number().int().min(0).max(100).optional(),
      idleEnabled: z.boolean().optional(),
      transitionSpeed: z.number().int().min(0).max(5000).optional(),
      notificationsEnabled: z.boolean().optional(),
      overlayEnabled: z.boolean().optional(),
      overlayPort: z.number().int().optional(),
    }).parse(req.body);

    const [updated] = await db.update(settingsTable).set(body).where(eq(settingsTable.id, settings.id)).returning();
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update settings");
    res.status(400).json({ error: "Failed to update settings" });
  }
});

export default router;
