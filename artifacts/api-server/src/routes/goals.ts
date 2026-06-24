import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and } from "drizzle-orm";
import { db, goalsTable, kidsTable, walletsTable } from "@workspace/db";
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

// Manually allocate a kid's unallocated saved money toward a specific goal.
// "Unallocated" = wallet.savedBalanceCents minus the sum of savedCents already
// earmarked across all of that kid's goals. The applied amount is capped at the
// requested amount, the unallocated balance, and the goal's remaining need.
router.post("/goals/:id/contribute", requireAuth, requireHousehold, async (req: Request, res: Response): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const amountCents = req.body?.amountCents;
  if (typeof amountCents !== "number" || !Number.isInteger(amountCents) || amountCents <= 0) {
    res.status(400).json({ error: "amountCents must be a positive integer" });
    return;
  }

  const [goal] = await db.select().from(goalsTable).where(eq(goalsTable.id, id));
  if (!goal) {
    res.status(404).json({ error: "Goal not found" });
    return;
  }

  const [kid] = await db.select().from(kidsTable).where(and(eq(kidsTable.id, goal.kidId), eq(kidsTable.householdId, req.householdId)));
  if (!kid) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // Run the read-modify-write in a transaction with row locks so two concurrent
  // contributions can't both read the same unallocated balance and over-allocate.
  const result = await db.transaction(async (tx) => {
    const [wallet] = await tx
      .select()
      .from(walletsTable)
      .where(eq(walletsTable.kidId, goal.kidId))
      .for("update");

    const lockedGoals = await tx
      .select()
      .from(goalsTable)
      .where(eq(goalsTable.kidId, goal.kidId))
      .for("update");

    const current = lockedGoals.find((g) => g.id === id);
    if (!current) {
      return { ok: false as const, status: 404, error: "Goal not found" };
    }
    if (current.completedAt) {
      return { ok: false as const, status: 400, error: "Goal is already complete" };
    }

    const savedBalance = wallet?.savedBalanceCents ?? 0;
    const allocated = lockedGoals.reduce((s, g) => s + g.savedCents, 0);
    const unallocated = savedBalance - allocated;
    const needed = current.targetCents - current.savedCents;
    const applied = Math.min(amountCents, unallocated, needed);

    if (applied <= 0) {
      const message = unallocated <= 0
        ? "No unallocated savings available to apply"
        : "Goal is already fully funded";
      return { ok: false as const, status: 400, error: message };
    }

    const newSaved = current.savedCents + applied;
    const [updated] = await tx
      .update(goalsTable)
      .set({
        savedCents: newSaved,
        completedAt: newSaved >= current.targetCents ? new Date() : null,
      })
      .where(eq(goalsTable.id, id))
      .returning();

    return { ok: true as const, updated, appliedCents: applied, unallocatedCents: unallocated - applied };
  });

  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  res.json({
    goal: toApi(result.updated),
    appliedCents: result.appliedCents,
    unallocatedCents: result.unallocatedCents,
  });
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
