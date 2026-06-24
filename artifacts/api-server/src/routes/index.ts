import { Router, type IRouter } from "express";
import healthRouter from "./health";
import householdsRouter from "./households";
import membersRouter from "./members";
import invitationsRouter from "./invitations";
import kidsRouter from "./kids";
import choresRouter from "./chores";
import weeksRouter from "./weeks";
import entriesRouter from "./entries";
import goalsRouter from "./goals";
import walletsRouter from "./wallets";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(householdsRouter);
router.use(membersRouter);
router.use(invitationsRouter);
router.use(kidsRouter);
router.use(choresRouter);
router.use(weeksRouter);
router.use(entriesRouter);
router.use(goalsRouter);
router.use(walletsRouter);
router.use(dashboardRouter);

export default router;
