import { db, weeksTable, entriesTable, kidsTable, walletsTable, payoutPlansTable, goalsTable } from "@workspace/db";
import { eq, and, desc, sum } from "drizzle-orm";

export function computeWeekDates(baseDate: Date, weekStartDow: number): { startDate: string; endDate: string } {
  const d = new Date(baseDate);
  const dow = d.getDay();
  const diff = (dow - weekStartDow + 7) % 7;
  const start = new Date(d);
  start.setDate(d.getDate() - diff);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return {
    startDate: start.toISOString().split("T")[0],
    endDate: end.toISOString().split("T")[0],
  };
}

export async function getOrCreateCurrentWeek(kidId: number, baseAllowanceCents: number, weekStartDow: number) {
  const { startDate, endDate } = computeWeekDates(new Date(), weekStartDow);

  const [existing] = await db
    .select()
    .from(weeksTable)
    .where(and(eq(weeksTable.kidId, kidId), eq(weeksTable.startDate, startDate)));

  if (existing) return existing;

  // Determine opening balance from previous week
  const [prevWeek] = await db
    .select()
    .from(weeksTable)
    .where(and(eq(weeksTable.kidId, kidId), eq(weeksTable.status, "closed")))
    .orderBy(desc(weeksTable.startDate))
    .limit(1);

  let openingBalanceCents = baseAllowanceCents;
  if (prevWeek && prevWeek.rolledOverCents !== null && prevWeek.rolledOverCents < 0) {
    openingBalanceCents = baseAllowanceCents + prevWeek.rolledOverCents; // rolledOver is negative
  }

  const [newWeek] = await db.insert(weeksTable).values({
    kidId,
    startDate,
    endDate,
    openingBalanceCents,
    status: "open",
  }).returning();

  return newWeek;
}

export async function computeRunningTotal(weekId: number, openingBalanceCents: number): Promise<number> {
  const result = await db
    .select({ total: sum(entriesTable.amountCents) })
    .from(entriesTable)
    .where(eq(entriesTable.weekId, weekId));

  const entrySum = Number(result[0]?.total ?? 0);
  return openingBalanceCents + entrySum;
}

export async function computeChoreStats(weekId: number): Promise<{ done: number; missed: number; total: number }> {
  const entries = await db
    .select({ type: entriesTable.type })
    .from(entriesTable)
    .where(eq(entriesTable.weekId, weekId));

  const done = entries.filter(e => e.type === "chore_done").length;
  const missed = entries.filter(e => e.type === "chore_missed").length;
  return { done, missed, total: done + missed };
}

export async function processCloseOut(
  weekId: number,
  kidId: number,
  memberId: number,
  baseAllowanceCents: number,
): Promise<{
  runningTotalCents: number;
  payoutCents: number;
  rolledOverCents: number;
  nextOpeningBalanceCents: number;
}> {
  const [week] = await db.select().from(weeksTable).where(eq(weeksTable.id, weekId));
  if (!week) throw new Error("Week not found");

  const runningTotalCents = await computeRunningTotal(weekId, week.openingBalanceCents);

  let payoutCents = 0;
  let rolledOverCents = 0;
  let nextOpeningBalanceCents = baseAllowanceCents;

  if (runningTotalCents > 0) {
    payoutCents = runningTotalCents;
    rolledOverCents = 0;
    nextOpeningBalanceCents = baseAllowanceCents;
  } else if (runningTotalCents < 0) {
    payoutCents = 0;
    rolledOverCents = runningTotalCents; // negative
    nextOpeningBalanceCents = baseAllowanceCents + runningTotalCents; // base - debt
  } else {
    payoutCents = 0;
    rolledOverCents = 0;
    nextOpeningBalanceCents = baseAllowanceCents;
  }

  await db.update(weeksTable)
    .set({
      status: "closed",
      paidOutCents: payoutCents,
      rolledOverCents,
      closedAt: new Date(),
      closedByMemberId: memberId,
    })
    .where(eq(weeksTable.id, weekId));

  return { runningTotalCents, payoutCents, rolledOverCents, nextOpeningBalanceCents };
}

export async function processConfirmPayout(
  weekId: number,
  kidId: number,
  payoutCents: number,
): Promise<{
  toSaveCents: number;
  toSpendCents: number;
  goalReached: boolean;
  goalName: string | null;
}> {
  if (payoutCents <= 0) {
    return { toSaveCents: 0, toSpendCents: 0, goalReached: false, goalName: null };
  }

  // Get payout plan
  const [plan] = await db.select().from(payoutPlansTable).where(eq(payoutPlansTable.kidId, kidId));
  const mode = plan?.modeName ?? 0; // 0=split, 1=save_all, 2=spend_all
  const savePct = plan?.savePct ?? 70;

  let toSaveCents = 0;
  let toSpendCents = 0;

  if (mode === 1) {
    toSaveCents = payoutCents;
    toSpendCents = 0;
  } else if (mode === 2) {
    toSaveCents = 0;
    toSpendCents = payoutCents;
  } else {
    toSaveCents = Math.round(payoutCents * savePct / 100);
    toSpendCents = payoutCents - toSaveCents;
  }

  // Find active goal (oldest incomplete goal)
  let goalReached = false;
  let goalName: string | null = null;

  const [activeGoal] = await db
    .select()
    .from(goalsTable)
    .where(and(eq(goalsTable.kidId, kidId)))
    .orderBy(goalsTable.createdAt)
    .limit(1);

  if (activeGoal && !activeGoal.completedAt && toSaveCents > 0) {
    const needed = activeGoal.targetCents - activeGoal.savedCents;
    const fillAmount = Math.min(toSaveCents, needed);
    const newSaved = activeGoal.savedCents + fillAmount;

    await db.update(goalsTable)
      .set({
        savedCents: newSaved,
        completedAt: newSaved >= activeGoal.targetCents ? new Date() : null,
      })
      .where(eq(goalsTable.id, activeGoal.id));

    if (newSaved >= activeGoal.targetCents) {
      goalReached = true;
      goalName = activeGoal.name;
    }
  }

  // Update wallet
  const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.kidId, kidId));
  if (wallet) {
    await db.update(walletsTable)
      .set({
        savedBalanceCents: wallet.savedBalanceCents + toSaveCents,
        spendBalanceCents: wallet.spendBalanceCents + toSpendCents,
      })
      .where(eq(walletsTable.kidId, kidId));
  } else {
    await db.insert(walletsTable).values({
      kidId,
      savedBalanceCents: toSaveCents,
      spendBalanceCents: toSpendCents,
    });
  }

  return { toSaveCents, toSpendCents, goalReached, goalName };
}
