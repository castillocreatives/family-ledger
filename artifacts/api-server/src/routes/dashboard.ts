import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and } from "drizzle-orm";
import { db, householdsTable, membersTable, kidsTable, walletsTable, goalsTable } from "@workspace/db";
import { requireAuth, requireHousehold } from "../middlewares/auth";
import { getOrCreateCurrentWeek, computeRunningTotal, computeChoreStats, materializeAutoMisses } from "../lib/weekEngine";

const router: IRouter = Router();

router.get("/dashboard", requireAuth, requireHousehold, async (req: Request, res: Response): Promise<void> => {
  const [household] = await db.select().from(householdsTable).where(eq(householdsTable.id, req.householdId));
  const members = await db.select().from(membersTable).where(eq(membersTable.householdId, req.householdId));
  const kids = await db.select().from(kidsTable).where(eq(kidsTable.householdId, req.householdId));

  const weekStartDow = household?.weekStartDow ?? 0;

  const kidSummaries = await Promise.all(kids.map(async (kid) => {
    const week = await getOrCreateCurrentWeek(kid.id, kid.baseAllowanceCents, weekStartDow);
    await materializeAutoMisses(week, kid);
    const runningTotalCents = await computeRunningTotal(week.id, week.openingBalanceCents);
    const { done, missed, total } = await computeChoreStats(week.id);

    const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.kidId, kid.id));
    const [activeGoal] = await db.select().from(goalsTable)
      .where(and(eq(goalsTable.kidId, kid.id)))
      .orderBy(goalsTable.createdAt)
      .limit(1);

    return {
      kid: { id: kid.id, householdId: kid.householdId, name: kid.name, color: kid.color, baseAllowanceCents: kid.baseAllowanceCents },
      currentWeek: {
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
      },
      wallet: {
        kidId: kid.id,
        savedBalanceCents: wallet?.savedBalanceCents ?? 0,
        spendBalanceCents: wallet?.spendBalanceCents ?? 0,
      },
      activeGoal: activeGoal && !activeGoal.completedAt ? {
        id: activeGoal.id,
        name: activeGoal.name,
        targetCents: activeGoal.targetCents,
        savedCents: activeGoal.savedCents,
      } : null,
    };
  }));

  res.json({
    household: household ? {
      id: household.id,
      name: household.name,
      baseDefaultCents: household.baseDefaultCents,
      weekStartDow: household.weekStartDow,
    } : null,
    members: members.map(m => ({
      id: m.id,
      householdId: m.householdId,
      userId: m.userId,
      name: m.name,
      email: m.email,
      avatarInitial: m.avatarInitial,
      role: m.role,
    })),
    kidSummaries,
  });
});

export default router;
