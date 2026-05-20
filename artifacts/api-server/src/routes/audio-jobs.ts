import { Router, type Request, type Response } from "express";
import { db, audioJobsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/audio/jobs/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id || typeof id !== "string" || id.length > 128) {
    res.status(400).json({ error: "Invalid job ID" });
    return;
  }

  try {
    const [job] = await db
      .select()
      .from(audioJobsTable)
      .where(eq(audioJobsTable.id, id))
      .limit(1);

    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    res.json({
      status: job.status,
      url: job.resultUrl ?? null,
      title: job.title ?? null,
      error: job.error ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch audio job");
    res.status(500).json({ error: "Failed to fetch job" });
  }
});

export default router;
