import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and } from "drizzle-orm";
import { db, kidsTable, walletsTable, payoutPlansTable } from "@workspace/db";
import { requireAuth, requireHousehold } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/kids", requireAuth, requireHousehold, async (req: Request, res: Response): Promise<void> => {
  const kids = await db.select().from(kidsTable).where(eq(kidsTable.householdId, req.householdId));
  res.json(kids.map(toApi));
});

router.post("/kids", requireAuth, requireHousehold, async (req: Request, res: Response): Promise<void> => {
  const { name, color = "#d8a657", baseAllowanceCents } = req.body;
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  // Get household default if not specified
  let allowance = baseAllowanceCents;
  if (allowance === undefined) {
    const { db: dbInst, householdsTable } = await import("@workspace/db");
    const { eq: eqInst } = await import("drizzle-orm");
    const [hh] = await dbInst.select().from(householdsTable).where(eqInst(householdsTable.id, req.householdId));
    allowance = hh?.baseDefaultCents ?? 4000;
  }

  const [kid] = await db.insert(kidsTable).values({
    householdId: req.householdId,
    name,
    color,
    baseAllowanceCents: allowance,
  }).returning();

  // Create wallet and payout plan
  await db.insert(walletsTable).values({ kidId: kid.id, savedBalanceCents: 0, spendBalanceCents: 0 });
  await db.insert(payoutPlansTable).values({ kidId: kid.id, modeName: 0, savePct: 70 });

  res.status(201).json(toApi(kid));
});

router.get("/kids/:id", requireAuth, requireHousehold, async (req: Request, res: Response): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [kid] = await db.select().from(kidsTable).where(and(eq(kidsTable.id, id), eq(kidsTable.householdId, req.householdId)));
  if (!kid) {
    res.status(404).json({ error: "Kid not found" });
    return;
  }
  res.json(toApi(kid));
});

router.patch("/kids/:id", requireAuth, requireHousehold, async (req: Request, res: Response): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { name, color, baseAllowanceCents } = req.body;
  const [updated] = await db.update(kidsTable)
    .set({
      ...(name && { name }),
      ...(color && { color }),
      ...(baseAllowanceCents !== undefined && { baseAllowanceCents }),
    })
    .where(and(eq(kidsTable.id, id), eq(kidsTable.householdId, req.householdId)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Kid not found" });
    return;
  }
  res.json(toApi(updated));
});

router.delete("/kids/:id", requireAuth, requireHousehold, async (req: Request, res: Response): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  await db.delete(kidsTable).where(and(eq(kidsTable.id, id), eq(kidsTable.householdId, req.householdId)));
  res.sendStatus(204);
});

function toApi(k: typeof kidsTable.$inferSelect) {
  return {
    id: k.id,
    householdId: k.householdId,
    name: k.name,
    color: k.color,
    baseAllowanceCents: k.baseAllowanceCents,
  };
}

export default router;
