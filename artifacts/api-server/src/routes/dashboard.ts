import { Router } from "express";
import { db } from "@workspace/db";
import { devicesTable, platformsTable, triggersTable, commandsTable, activityTable } from "@workspace/db";
import { eq, gte, sql, count } from "drizzle-orm";

const router = Router();

router.get("/dashboard/stats", async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Run all DB queries in parallel using COUNT aggregates — never pull full rows into memory
    const [
      deviceCounts,
      platformCounts,
      triggerCounts,
      commandCounts,
      eventsCount,
      topEventTypes,
    ] = await Promise.all([
      db.select({
        total: count(),
        online: sql<number>`count(*) filter (where ${devicesTable.enabled} = true or ${devicesTable.isOnline} = true)`,
      }).from(devicesTable),

      db.select({
        active: sql<number>`count(*) filter (where ${platformsTable.connected} = true)`,
      }).from(platformsTable),

      db.select({
        total: count(),
        active: sql<number>`count(*) filter (where ${triggersTable.enabled} = true)`,
      }).from(triggersTable),

      db.select({ total: count() }).from(commandsTable),

      db.select({ total: count() }).from(activityTable)
        .where(gte(activityTable.triggeredAt, today)),

      db.select({
        eventType: activityTable.eventType,
        cnt: count(),
      })
        .from(activityTable)
        .where(gte(activityTable.triggeredAt, today))
        .groupBy(activityTable.eventType)
        .orderBy(sql`count(*) desc`)
        .limit(5),
    ]);

    res.set("Cache-Control", "no-store");
    res.json({
      totalDevices: Number(deviceCounts[0]?.total ?? 0),
      onlineDevices: Number(deviceCounts[0]?.online ?? 0),
      activePlatforms: Number(platformCounts[0]?.active ?? 0),
      totalTriggers: Number(triggerCounts[0]?.total ?? 0),
      activeTriggers: Number(triggerCounts[0]?.active ?? 0),
      totalCommands: Number(commandCounts[0]?.total ?? 0),
      eventsToday: Number(eventsCount[0]?.total ?? 0),
      topEventTypes: topEventTypes.map((r) => ({ eventType: r.eventType, count: Number(r.cnt) })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get dashboard stats");
    res.status(500).json({ error: "Failed to get dashboard stats" });
  }
});

export default router;
