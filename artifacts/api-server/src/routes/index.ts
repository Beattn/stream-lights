import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storageRouter from "./storage";
import audioUploadRouter from "./audio-upload";
import audioFetchRouter from "./audio-fetch";
import audioJobsRouter from "./audio-jobs";
import devicesRouter from "./devices";
import platformsRouter from "./platforms";
import triggersRouter from "./triggers";
import commandsRouter from "./commands";
import activityRouter from "./activity";
import lightsRouter from "./lights";
import dashboardRouter from "./dashboard";
import settingsRouter from "./settings";
import scenesRouter from "./scenes";
import webhooksRouter from "./webhooks";
import previewRouter from "./preview";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(webhooksRouter);

router.use(requireAuth);

router.use(storageRouter);
router.use(audioUploadRouter);
router.use(audioFetchRouter);
router.use(audioJobsRouter);

router.use(devicesRouter);
router.use(platformsRouter);
router.use(triggersRouter);
router.use(commandsRouter);
router.use(activityRouter);
router.use(lightsRouter);
router.use(dashboardRouter);
router.use(settingsRouter);
router.use(scenesRouter);
router.use(previewRouter);

export default router;
