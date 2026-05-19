import { Router } from "express";
import { db } from "@workspace/db";
import { activityTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

const router = Router();

router.get("/activity", async (req, res) => {
  try {
    const query = z.object({
      limit: z.coerce.number().int().min(1).max(200).optional().default(50),
      eventType: z.string().optional(),
    }).parse(req.query);

    let qb = db.select().from(activityTable).orderBy(desc(activityTable.triggeredAt)).limit(query.limit);

    const results = await qb;
    const filtered = query.eventType
      ? results.filter(a => a.eventType === query.eventType)
      : results;

    res.json(filtered.map(a => ({
      ...a,
      triggeredAt: a.triggeredAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to list activity");
    res.status(500).json({ error: "Failed to list activity" });
  }
});

export default router;
