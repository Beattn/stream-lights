import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import devicesRouter from "./devices.js";
import platformsRouter from "./platforms.js";
import triggersRouter from "./triggers.js";
import commandsRouter from "./commands.js";
import activityRouter from "./activity.js";
import lightsRouter from "./lights.js";
import dashboardRouter from "./dashboard.js";
import settingsRouter from "./settings.js";
import scenesRouter from "./scenes.js";
import webhooksRouter from "./webhooks.js";
import { requireAuth } from "../middlewares/auth.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(webhooksRouter);

router.use(requireAuth);

router.use(devicesRouter);
router.use(platformsRouter);
router.use(triggersRouter);
router.use(commandsRouter);
router.use(activityRouter);
router.use(lightsRouter);
router.use(dashboardRouter);
router.use(settingsRouter);
router.use(scenesRouter);

export default router;
