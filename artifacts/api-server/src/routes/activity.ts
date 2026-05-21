import { Router } from "express";
import { db } from "@workspace/db";
import { activityTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { eventTypeSchema } from "../lib/security";

const router = Router();

router.get("/activity", async (req, res) => {
  try {
    const query = z.object({
      limit: z.coerce.number().int().min(1).max(100).optional().default(50),
      eventType: eventTypeSchema.optional(),
    }).strict().parse(req.query);

    // Filter in the DB (not in JS) so the LIMIT applies to the correct result set
    const results = await db
      .select()
      .from(activityTable)
      .where(query.eventType ? eq(activityTable.eventType, query.eventType) : undefined)
      .orderBy(desc(activityTable.triggeredAt))
      .limit(query.limit);

    res.set("Cache-Control", "no-store");
    res.json(results.map((a) => ({ ...a, triggeredAt: a.triggeredAt.toISOString() })));
  } catch (err) {
    req.log.error({ err }, "Failed to list activity");
    res.status(500).json({ error: "Failed to list activity" });
  }
});

export default router;
