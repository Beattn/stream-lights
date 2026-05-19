import { Router } from "express";
import { db } from "@workspace/db";
import { platformsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router = Router();

router.get("/platforms", async (req, res) => {
  try {
    const platforms = await db.select().from(platformsTable).orderBy(platformsTable.platform);
    res.json(platforms.map(p => ({
      ...p,
      clientSecret: undefined,
      accessToken: undefined,
      createdAt: p.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to list platforms");
    res.status(500).json({ error: "Failed to list platforms" });
  }
});

router.post("/platforms/:platform/connect", async (req, res) => {
  try {
    const { platform } = req.params;
    const body = z.object({
      channelName: z.string().min(1),
      clientId: z.string().optional(),
      clientSecret: z.string().optional(),
      accessToken: z.string().optional(),
    }).parse(req.body);

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

    res.json({ ...result, clientSecret: undefined, accessToken: undefined, createdAt: result.createdAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Failed to connect platform");
    res.status(400).json({ error: "Failed to connect platform" });
  }
});

router.post("/platforms/:platform/disconnect", async (req, res) => {
  try {
    const { platform } = req.params;
    const existing = await db.select().from(platformsTable).where(eq(platformsTable.platform, platform));

    if (existing.length === 0) {
      return res.status(404).json({ error: "Platform not found" });
    }

    const [result] = await db.update(platformsTable).set({
      connected: false,
      accessToken: null,
    }).where(eq(platformsTable.platform, platform)).returning();

    res.json({ ...result, clientSecret: undefined, accessToken: undefined, createdAt: result.createdAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Failed to disconnect platform");
    res.status(500).json({ error: "Failed to disconnect platform" });
  }
});

export default router;
