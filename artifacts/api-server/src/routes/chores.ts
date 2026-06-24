import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db, choresTable, choreKidsTable, kidsTable } from "@workspace/db";
import { requireAuth, requireHousehold } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/chores", requireAuth, requireHousehold, async (req: Request, res: Response): Promise<void> => {
  const chores = await db.select().from(choresTable).where(eq(choresTable.householdId, req.householdId));
  const choreIds = chores.map(c => c.id);

  let kidMappings: { choreId: number; kidId: number }[] = [];
  if (choreIds.length > 0) {
    kidMappings = await db.select().from(choreKidsTable).where(inArray(choreKidsTable.choreId, choreIds));
  }

  const kidIdsByChore = new Map<number, number[]>();
  for (const m of kidMappings) {
    if (!kidIdsByChore.has(m.choreId)) kidIdsByChore.set(m.choreId, []);
    kidIdsByChore.get(m.choreId)!.push(m.kidId);
  }

  res.json(chores.map(c => ({ ...toApi(c), kidIds: kidIdsByChore.get(c.id) ?? [] })));
});

router.post("/chores", requireAuth, requireHousehold, async (req: Request, res: Response): Promise<void> => {
  const { name, valueCents = 0, kidIds = [] } = req.body;
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const [chore] = await db.insert(choresTable).values({
    householdId: req.householdId,
    name,
    valueCents,
    active: true,
  }).returning();

  if (kidIds.length > 0) {
    await db.insert(choreKidsTable).values(kidIds.map((kidId: number) => ({ choreId: chore.id, kidId })));
  }

  res.status(201).json({ ...toApi(chore), kidIds });
});

router.patch("/chores/:id", requireAuth, requireHousehold, async (req: Request, res: Response): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { name, valueCents, active, kidIds } = req.body;

  const [updated] = await db.update(choresTable)
    .set({
      ...(name && { name }),
      ...(valueCents !== undefined && { valueCents }),
      ...(active !== undefined && { active }),
    })
    .where(and(eq(choresTable.id, id), eq(choresTable.householdId, req.householdId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Chore not found" });
    return;
  }

  if (kidIds !== undefined) {
    await db.delete(choreKidsTable).where(eq(choreKidsTable.choreId, id));
    if (kidIds.length > 0) {
      await db.insert(choreKidsTable).values(kidIds.map((kidId: number) => ({ choreId: id, kidId })));
    }
  }

  const currentKidMappings = await db.select().from(choreKidsTable).where(eq(choreKidsTable.choreId, id));
  res.json({ ...toApi(updated), kidIds: currentKidMappings.map(m => m.kidId) });
});

router.delete("/chores/:id", requireAuth, requireHousehold, async (req: Request, res: Response): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  await db.delete(choreKidsTable).where(eq(choreKidsTable.choreId, id));
  await db.delete(choresTable).where(and(eq(choresTable.id, id), eq(choresTable.householdId, req.householdId)));
  res.sendStatus(204);
});

function toApi(c: typeof choresTable.$inferSelect) {
  return { id: c.id, householdId: c.householdId, name: c.name, valueCents: c.valueCents, active: c.active };
}

export default router;
