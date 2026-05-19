import { Router } from "express";
import { db } from "@workspace/db";
import { devicesTable, platformsTable, triggersTable, commandsTable, activityTable } from "@workspace/db";
import { eq, gte, sql } from "drizzle-orm";

const router = Router();

router.get("/dashboard/stats", async (req, res) => {
  try {
    const [devices, platforms, triggers, commands] = await Promise.all([
      db.select().from(devicesTable),
      db.select().from(platformsTable),
      db.select().from(triggersTable),
      db.select().from(commandsTable),
    ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayActivity = await db.select().from(activityTable).where(gte(activityTable.triggeredAt, today));

    const eventTypeCounts: Record<string, number> = {};
    for (const entry of todayActivity) {
      eventTypeCounts[entry.eventType] = (eventTypeCounts[entry.eventType] ?? 0) + 1;
    }

    const topEventTypes = Object.entries(eventTypeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([eventType, count]) => ({ eventType, count }));

    res.json({
      totalDevices: devices.length,
      onlineDevices: devices.filter(d => d.isOnline || d.enabled).length,
      activePlatforms: platforms.filter(p => p.connected).length,
      totalTriggers: triggers.length,
      activeTriggers: triggers.filter(t => t.enabled).length,
      totalCommands: commands.length,
      eventsToday: todayActivity.length,
      topEventTypes,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get dashboard stats");
    res.status(500).json({ error: "Failed to get dashboard stats" });
  }
});

export default router;
