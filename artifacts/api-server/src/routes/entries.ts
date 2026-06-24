import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and } from "drizzle-orm";
import { db, entriesTable, weeksTable, kidsTable } from "@workspace/db";
import { requireAuth, requireHousehold } from "../middlewares/auth";
import { getOrCreateCurrentWeek } from "../lib/weekEngine";
import { db as dbInst, householdsTable } from "@workspace/db";
import { eq as eqInst } from "drizzle-orm";

const router: IRouter = Router();

router.post("/entries", requireAuth, requireHousehold, async (req: Request, res: Response): Promise<void> => {
  const { kidId, type, amountCents, label, note } = req.body;

  if (!kidId || !type || amountCents === undefined || !label) {
    res.status(400).json({ error: "kidId, type, amountCents, and label are required" });
    return;
  }

  if (type === "penalty" && (!note || note.trim().length === 0)) {
    res.status(400).json({ error: "A reason (note) is required for penalty entries" });
    return;
  }

  const [kid] = await db.select().from(kidsTable).where(and(eq(kidsTable.id, kidId), eq(kidsTable.householdId, req.householdId)));
  if (!kid) {
    res.status(403).json({ error: "Kid not in your household" });
    return;
  }

  const [hh] = await dbInst.select().from(householdsTable).where(eqInst(householdsTable.id, req.householdId));
  const weekStartDow = hh?.weekStartDow ?? 0;

  const week = await getOrCreateCurrentWeek(kid.id, kid.baseAllowanceCents, weekStartDow);
  if (week.status === "closed") {
    res.status(400).json({ error: "Cannot add entries to a closed week" });
    return;
  }

  // Determine signed amount
  let signedAmount = amountCents;
  if (type === "chore_missed" || type === "penalty") {
    signedAmount = -Math.abs(amountCents);
  } else {
    signedAmount = Math.abs(amountCents);
  }

  const [entry] = await db.insert(entriesTable).values({
    weekId: week.id,
    kidId: kid.id,
    type,
    amountCents: signedAmount,
    label,
    note: note || null,
    createdByMemberId: req.memberId || null,
  }).returning();

  res.status(201).json({
    id: entry.id,
    weekId: entry.weekId,
    kidId: entry.kidId,
    type: entry.type,
    amountCents: entry.amountCents,
    label: entry.label,
    note: entry.note,
    createdByMemberId: entry.createdByMemberId,
    createdByName: null,
    createdByInitial: null,
    createdAt: entry.createdAt.toISOString(),
  });
});

router.delete("/entries/:id", requireAuth, requireHousehold, async (req: Request, res: Response): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [entry] = await db.select({ entry: entriesTable, kid: kidsTable }).from(entriesTable)
    .leftJoin(kidsTable, eq(entriesTable.kidId, kidsTable.id))
    .where(eq(entriesTable.id, id));

  if (!entry || entry.kid?.householdId !== req.householdId) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }

  await db.delete(entriesTable).where(eq(entriesTable.id, id));
  res.sendStatus(204);
});

export default router;
