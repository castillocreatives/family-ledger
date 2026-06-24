import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and } from "drizzle-orm";
import { db, walletsTable, payoutPlansTable, kidsTable } from "@workspace/db";
import { requireAuth, requireHousehold } from "../middlewares/auth";

const router: IRouter = Router();

const modeNameMap: Record<string, number> = { split: 0, save_all: 1, spend_all: 2 };
const modeNumberMap: Record<number, string> = { 0: "split", 1: "save_all", 2: "spend_all" };

router.get("/kids/:kidId/wallet", requireAuth, requireHousehold, async (req: Request, res: Response): Promise<void> => {
  const raw = Array.isArray(req.params.kidId) ? req.params.kidId[0] : req.params.kidId;
  const kidId = parseInt(raw, 10);

  const [kid] = await db.select().from(kidsTable).where(and(eq(kidsTable.id, kidId), eq(kidsTable.householdId, req.householdId)));
  if (!kid) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.kidId, kidId));
  res.json({
    kidId,
    savedBalanceCents: wallet?.savedBalanceCents ?? 0,
    spendBalanceCents: wallet?.spendBalanceCents ?? 0,
  });
});

router.get("/kids/:kidId/payout-plan", requireAuth, requireHousehold, async (req: Request, res: Response): Promise<void> => {
  const raw = Array.isArray(req.params.kidId) ? req.params.kidId[0] : req.params.kidId;
  const kidId = parseInt(raw, 10);

  const [kid] = await db.select().from(kidsTable).where(and(eq(kidsTable.id, kidId), eq(kidsTable.householdId, req.householdId)));
  if (!kid) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [plan] = await db.select().from(payoutPlansTable).where(eq(payoutPlansTable.kidId, kidId));
  res.json({
    kidId,
    mode: modeNumberMap[plan?.modeName ?? 0] ?? "split",
    savePct: plan?.savePct ?? 70,
  });
});

router.patch("/kids/:kidId/payout-plan", requireAuth, requireHousehold, async (req: Request, res: Response): Promise<void> => {
  const raw = Array.isArray(req.params.kidId) ? req.params.kidId[0] : req.params.kidId;
  const kidId = parseInt(raw, 10);

  const [kid] = await db.select().from(kidsTable).where(and(eq(kidsTable.id, kidId), eq(kidsTable.householdId, req.householdId)));
  if (!kid) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { mode, savePct } = req.body;
  const modeNum = modeNameMap[mode] ?? 0;

  const [existing] = await db.select().from(payoutPlansTable).where(eq(payoutPlansTable.kidId, kidId));
  if (existing) {
    await db.update(payoutPlansTable)
      .set({ modeName: modeNum, ...(savePct !== undefined && { savePct }) })
      .where(eq(payoutPlansTable.kidId, kidId));
  } else {
    await db.insert(payoutPlansTable).values({ kidId, modeName: modeNum, savePct: savePct ?? 70 });
  }

  const [updated] = await db.select().from(payoutPlansTable).where(eq(payoutPlansTable.kidId, kidId));
  res.json({
    kidId,
    mode: modeNumberMap[updated?.modeName ?? 0] ?? "split",
    savePct: updated?.savePct ?? 70,
  });
});

export default router;
