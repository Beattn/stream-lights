import { Router } from "express";
import { db } from "@workspace/db";
import { platformsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { platformSchema, nameSchema, omitKeys } from "../lib/security";
import { writeLimiter } from "../middlewares/rate-limit";

const router = Router();

const SENSITIVE_FIELDS = ["clientSecret", "accessToken"] as const;

function serializePlatform(p: typeof platformsTable.$inferSelect) {
  return omitKeys({ ...p, createdAt: p.createdAt.toISOString() }, SENSITIVE_FIELDS);
}

router.get("/platforms", async (req, res) => {
  try {
    const platforms = await db.select().from(platformsTable).orderBy(platformsTable.platform);
    res.json(platforms.map(serializePlatform));
  } catch (err) {
    req.log.error({ err }, "Failed to list platforms");
    res.status(500).json({ error: "Failed to list platforms" });
  }
});

router.post("/platforms/:platform/connect", writeLimiter, async (req, res) => {
  try {
    const platform = platformSchema.parse(req.params.platform);

    const body = z.object({
      channelName: nameSchema,
      clientId: z.string().max(200).optional(),
      clientSecret: z.string().max(500).optional(),
      accessToken: z.string().max(2000).optional(),
    }).strict().parse(req.body);

    const existing = await db.select().from(platformsTable).where(eq(platformsTable.platform, platform));

    let result;
    if (existing.length > 0) {
      [result] = await db.update(platformsTable).set({
        channelName: body.channelName,
        clientId: body.clientId ?? null,
        clientSecret: body.clientSecret ?? null,
        accessToken: body.accessToken ?? null,
        connected: true,
      }).where(eq(platformsTable.platform, platform)).returning();
    } else {
      [result] = await db.insert(platformsTable).values({
        platform,
        channelName: body.channelName,
        clientId: body.clientId ?? null,
        clientSecret: body.clientSecret ?? null,
        accessToken: body.accessToken ?? null,
        connected: true,
        eventsEnabled: true,
      }).returning();
    }

    res.json(serializePlatform(result));
  } catch (err) {
    req.log.error({ err }, "Failed to connect platform");
    res.status(400).json({ error: "Failed to connect platform" });
  }
});

router.post("/platforms/:platform/disconnect", writeLimiter, async (req, res) => {
  try {
    const platform = platformSchema.parse(req.params.platform);

    const existing = await db.select().from(platformsTable).where(eq(platformsTable.platform, platform));
    if (existing.length === 0) return res.status(404).json({ error: "Platform not found" });

    const [result] = await db.update(platformsTable).set({
      connected: false,
      accessToken: null,
    }).where(eq(platformsTable.platform, platform)).returning();

    res.json(serializePlatform(result));
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    res.status(status).json({ error: "Failed to disconnect platform" });
  }
});

export default router;
