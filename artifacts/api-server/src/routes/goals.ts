import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and } from "drizzle-orm";
import { db, goalsTable, kidsTable } from "@workspace/db";
import { requireAuth, requireHousehold } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/kids/:kidId/goals", requireAuth, requireHousehold, async (req: Request, res: Response): Promise<void> => {
  const raw = Array.isArray(req.params.kidId) ? req.params.kidId[0] : req.params.kidId;
  const kidId = parseInt(raw, 10);

  const [kid] = await db.select().from(kidsTable).where(and(eq(kidsTable.id, kidId), eq(kidsTable.householdId, req.householdId)));
  if (!kid) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const goals = await db.select().from(goalsTable).where(eq(goalsTable.kidId, kidId));
  res.json(goals.map(toApi));
});

router.post("/goals", requireAuth, requireHousehold, async (req: Request, res: Response): Promise<void> => {
  const { kidId, name, imageUrl, targetCents } = req.body;
  if (!kidId || !name || targetCents === undefined) {
    res.status(400).json({ error: "kidId, name, and targetCents are required" });
    return;
  }

  const [kid] = await db.select().from(kidsTable).where(and(eq(kidsTable.id, kidId), eq(kidsTable.householdId, req.householdId)));
  if (!kid) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [goal] = await db.insert(goalsTable).values({
    kidId,
    name,
    imageUrl: imageUrl || null,
    targetCents,
    savedCents: 0,
  }).returning();

  res.status(201).json(toApi(goal));
});

router.patch("/goals/:id", requireAuth, requireHousehold, async (req: Request, res: Response): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { name, imageUrl, targetCents } = req.body;

  const [updated] = await db.update(goalsTable)
    .set({
      ...(name && { name }),
      ...(imageUrl !== undefined && { imageUrl: imageUrl || null }),
      ...(targetCents !== undefined && { targetCents }),
    })
    .where(eq(goalsTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Goal not found" });
    return;
  }

  res.json(toApi(updated));
});

router.delete("/goals/:id", requireAuth, requireHousehold, async (req: Request, res: Response): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  await db.delete(goalsTable).where(eq(goalsTable.id, id));
  res.sendStatus(204);
});

function toApi(g: typeof goalsTable.$inferSelect) {
  return {
    id: g.id,
    kidId: g.kidId,
    name: g.name,
    imageUrl: g.imageUrl,
    targetCents: g.targetCents,
    savedCents: g.savedCents,
    completedAt: g.completedAt?.toISOString() ?? null,
  };
}

export default router;
