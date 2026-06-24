import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, weeksTable, entriesTable, kidsTable, membersTable } from "@workspace/db";
import { requireAuth, requireHousehold } from "../middlewares/auth";
import {
  getOrCreateCurrentWeek,
  computeRunningTotal,
  computeChoreStats,
  processCloseOut,
  processConfirmPayout,
  materializeAutoMisses,
} from "../lib/weekEngine";

const router: IRouter = Router();

router.get("/weeks/current", requireAuth, requireHousehold, async (req: Request, res: Response): Promise<void> => {
  const kids = await db.select().from(kidsTable).where(eq(kidsTable.householdId, req.householdId));
  const { db: dbInst, householdsTable } = await import("@workspace/db");
  const { eq: eqInst } = await import("drizzle-orm");
  const [hh] = await dbInst.select().from(householdsTable).where(eqInst(householdsTable.id, req.householdId));
  const weekStartDow = hh?.weekStartDow ?? 0;

  const results = await Promise.all(kids.map(async (kid) => {
    const week = await getOrCreateCurrentWeek(kid.id, kid.baseAllowanceCents, weekStartDow);
    await materializeAutoMisses(week, kid);
    const runningTotalCents = await computeRunningTotal(week.id, week.openingBalanceCents);
    const { done, missed, total } = await computeChoreStats(week.id);
    return {
      id: week.id,
      kidId: kid.id,
      kidName: kid.name,
      kidColor: kid.color,
      startDate: week.startDate,
      endDate: week.endDate,
      openingBalanceCents: week.openingBalanceCents,
      runningTotalCents,
      netChangeCents: runningTotalCents - week.openingBalanceCents,
      status: week.status,
      paidOutCents: week.paidOutCents,
      rolledOverCents: week.rolledOverCents,
      choresDone: done,
      choresMissed: missed,
      totalChores: total,
      closedAt: week.closedAt?.toISOString() ?? null,
    };
  }));

  res.json(results);
});

router.get("/weeks/:id", requireAuth, requireHousehold, async (req: Request, res: Response): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [week] = await db.select().from(weeksTable).where(eq(weeksTable.id, id));
  if (!week) {
    res.status(404).json({ error: "Week not found" });
    return;
  }

  const [kid] = await db.select().from(kidsTable).where(eq(kidsTable.id, week.kidId));
  if (!kid || kid.householdId !== req.householdId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const runningTotalCents = await computeRunningTotal(week.id, week.openingBalanceCents);

  const rawEntries = await db
    .select({
      entry: entriesTable,
      memberName: membersTable.name,
      memberInitial: membersTable.avatarInitial,
    })
    .from(entriesTable)
    .leftJoin(membersTable, eq(entriesTable.createdByMemberId, membersTable.id))
    .where(eq(entriesTable.weekId, week.id))
    .orderBy(entriesTable.createdAt);

  const entries = rawEntries.map(row => ({
    id: row.entry.id,
    weekId: row.entry.weekId,
    kidId: row.entry.kidId,
    type: row.entry.type,
    amountCents: row.entry.amountCents,
    label: row.entry.label,
    note: row.entry.note,
    createdByMemberId: row.entry.createdByMemberId,
    createdByName: row.memberName ?? null,
    createdByInitial: row.memberInitial ?? null,
    createdAt: row.entry.createdAt.toISOString(),
  }));

  res.json({
    id: week.id,
    kidId: kid.id,
    kidName: kid.name,
    kidColor: kid.color,
    startDate: week.startDate,
    endDate: week.endDate,
    openingBalanceCents: week.openingBalanceCents,
    runningTotalCents,
    status: week.status,
    paidOutCents: week.paidOutCents,
    rolledOverCents: week.rolledOverCents,
    closedAt: week.closedAt?.toISOString() ?? null,
    entries,
  });
});

router.get("/kids/:kidId/weeks", requireAuth, requireHousehold, async (req: Request, res: Response): Promise<void> => {
  const raw = Array.isArray(req.params.kidId) ? req.params.kidId[0] : req.params.kidId;
  const kidId = parseInt(raw, 10);

  const [kid] = await db.select().from(kidsTable).where(and(eq(kidsTable.id, kidId), eq(kidsTable.householdId, req.householdId)));
  if (!kid) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const weeks = await db.select().from(weeksTable).where(eq(weeksTable.kidId, kidId)).orderBy(desc(weeksTable.startDate)).limit(20);

  const results = await Promise.all(weeks.map(async (week) => {
    const runningTotalCents = await computeRunningTotal(week.id, week.openingBalanceCents);
    const { done, missed, total } = await computeChoreStats(week.id);
    return {
      id: week.id,
      kidId: kid.id,
      kidName: kid.name,
      kidColor: kid.color,
      startDate: week.startDate,
      endDate: week.endDate,
      openingBalanceCents: week.openingBalanceCents,
      runningTotalCents,
      netChangeCents: runningTotalCents - week.openingBalanceCents,
      status: week.status,
      paidOutCents: week.paidOutCents,
      rolledOverCents: week.rolledOverCents,
      choresDone: done,
      choresMissed: missed,
      totalChores: total,
      closedAt: week.closedAt?.toISOString() ?? null,
    };
  }));

  res.json(results);
});

router.post("/weeks/close", requireAuth, requireHousehold, async (req: Request, res: Response): Promise<void> => {
  const kids = await db.select().from(kidsTable).where(eq(kidsTable.householdId, req.householdId));
  const { db: dbInst, householdsTable } = await import("@workspace/db");
  const { eq: eqInst } = await import("drizzle-orm");
  const [hh] = await dbInst.select().from(householdsTable).where(eqInst(householdsTable.id, req.householdId));
  const weekStartDow = hh?.weekStartDow ?? 0;

  const results = await Promise.all(kids.map(async (kid) => {
    const week = await getOrCreateCurrentWeek(kid.id, kid.baseAllowanceCents, weekStartDow);
    if (week.status === "closed") {
      const runningTotalCents = await computeRunningTotal(week.id, week.openingBalanceCents);
      return {
        kidId: kid.id,
        kidName: kid.name,
        weekId: week.id,
        runningTotalCents,
        payoutCents: week.paidOutCents ?? 0,
        rolledOverCents: week.rolledOverCents ?? 0,
        nextOpeningBalanceCents: kid.baseAllowanceCents + (week.rolledOverCents ?? 0),
      };
    }

    await materializeAutoMisses(week, kid, { includeToday: true });
    const result = await processCloseOut(week.id, kid.id, req.memberId, kid.baseAllowanceCents);
    return {
      kidId: kid.id,
      kidName: kid.name,
      weekId: week.id,
      ...result,
    };
  }));

  res.json(results);
});

router.post("/weeks/:weekId/payout", requireAuth, requireHousehold, async (req: Request, res: Response): Promise<void> => {
  const raw = Array.isArray(req.params.weekId) ? req.params.weekId[0] : req.params.weekId;
  const weekId = parseInt(raw, 10);

  const [week] = await db.select().from(weeksTable).where(eq(weeksTable.id, weekId));
  if (!week || week.status !== "closed") {
    res.status(400).json({ error: "Week must be closed before payout" });
    return;
  }

  const [kid] = await db.select().from(kidsTable).where(and(eq(kidsTable.id, week.kidId), eq(kidsTable.householdId, req.householdId)));
  if (!kid) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const payoutCents = week.paidOutCents ?? 0;

  const rawAction = req.body?.action;
  if (rawAction !== undefined && !["save", "spend", "rollover"].includes(rawAction)) {
    res.status(400).json({ error: "Invalid action — must be save, spend, or rollover" });
    return;
  }
  const action = rawAction as "save" | "spend" | "rollover" | undefined;

  const { walletsTable } = await import("@workspace/db");
  const { eq: eqInst } = await import("drizzle-orm");

  // Roll a positive balance forward instead of paying it out: zero the payout
  // and stash it as rolledOverCents so next week opens with the surplus.
  // Guard: only positive balances can be rolled over this way — never overwrite
  // a negative rolledOverCents (carried debt) from close-out with zero.
  if (action === "rollover") {
    if (payoutCents <= 0) {
      res.status(400).json({ error: "Nothing to roll over — balance is not positive" });
      return;
    }
    await db.update(weeksTable)
      .set({ paidOutCents: 0, rolledOverCents: payoutCents })
      .where(eq(weeksTable.id, weekId));
    const [wallet] = await db.select().from(walletsTable).where(eqInst(walletsTable.kidId, kid.id));
    res.json({
      kidId: kid.id,
      payoutCents,
      toSaveCents: 0,
      toSpendCents: 0,
      goalReached: false,
      goalName: null,
      action: "rollover",
      rolledOverCents: payoutCents,
      wallet: wallet ? {
        kidId: wallet.kidId,
        savedBalanceCents: wallet.savedBalanceCents,
        spendBalanceCents: wallet.spendBalanceCents,
      } : null,
    });
    return;
  }

  const forceMode = action === "save" ? "save" : action === "spend" ? "spend" : undefined;
  const result = await processConfirmPayout(weekId, kid.id, payoutCents, forceMode);

  const [wallet] = await db.select().from(walletsTable).where(eqInst(walletsTable.kidId, kid.id));

  res.json({
    kidId: kid.id,
    payoutCents,
    toSaveCents: result.toSaveCents,
    toSpendCents: result.toSpendCents,
    goalReached: result.goalReached,
    goalName: result.goalName,
    // Only echo an explicit choice; when omitted the kid's standing plan decided the split.
    action,
    rolledOverCents: 0,
    wallet: wallet ? {
      kidId: wallet.kidId,
      savedBalanceCents: wallet.savedBalanceCents,
      spendBalanceCents: wallet.spendBalanceCents,
    } : null,
  });
});

export default router;
