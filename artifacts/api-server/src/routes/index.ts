import { Router, type IRouter } from "express";
import healthRouter from "./health";
import devicesRouter from "./devices";
import platformsRouter from "./platforms";
import triggersRouter from "./triggers";
import commandsRouter from "./commands";
import activityRouter from "./activity";
import lightsRouter from "./lights";
import dashboardRouter from "./dashboard";
import settingsRouter from "./settings";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.use(healthRouter);

router.use(requireAuth);

router.use(devicesRouter);
router.use(platformsRouter);
router.use(triggersRouter);
router.use(commandsRouter);
router.use(activityRouter);
router.use(lightsRouter);
router.use(dashboardRouter);
router.use(settingsRouter);

export default router;
