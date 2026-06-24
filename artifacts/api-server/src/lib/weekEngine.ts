import { db, weeksTable, entriesTable, kidsTable, walletsTable, payoutPlansTable, goalsTable, choresTable, choreKidsTable } from "@workspace/db";
import { eq, and, desc, sum, inArray } from "drizzle-orm";

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
}

/**
 * Auto-generate `chore_missed` entries for any paid chore a kid was assigned but
 * did not log (done or missed) on a completed day of the open week. This is what
 * makes incomplete days deduct from the weekly allowance without a parent acting.
 *
 * Idempotent: dedupes on (entryDate, chore name) against existing chore entries.
 * - Only paid chores (valueCents > 0) — checklist chores have no money impact.
 * - Only days that are already complete. By default "today" is still in progress;
 *   pass includeToday when finalizing (close-out) so the current day counts too.
 * - Never penalizes a day before the chore existed.
 */
export async function materializeAutoMisses(
  week: typeof weeksTable.$inferSelect,
  kid: typeof kidsTable.$inferSelect,
  opts: { includeToday?: boolean } = {},
): Promise<void> {
  if (week.status !== "open") return;

  const today = isoDate(new Date());
  const days: string[] = [];
  let day = week.startDate;
  while (day <= week.endDate) {
    const complete = opts.includeToday ? day <= today : day < today;
    if (!complete) break;
    days.push(day);
    day = addDays(day, 1);
  }
  if (days.length === 0) return;

  const chores = await db
    .select()
    .from(choresTable)
    .where(and(eq(choresTable.householdId, kid.householdId), eq(choresTable.active, true)));
  const paidChores = chores.filter(c => c.valueCents > 0);
  if (paidChores.length === 0) return;

  const choreIds = paidChores.map(c => c.id);
  const mappings = await db.select().from(choreKidsTable).where(inArray(choreKidsTable.choreId, choreIds));
  const assigned = new Map<number, Set<number>>();
  for (const m of mappings) {
    if (!assigned.has(m.choreId)) assigned.set(m.choreId, new Set());
    assigned.get(m.choreId)!.add(m.kidId);
  }
  // A chore with no kid mapping applies to all kids in the household.
  const applicable = paidChores.filter(c => {
    const set = assigned.get(c.id);
    return !set || set.size === 0 || set.has(kid.id);
  });
  if (applicable.length === 0) return;

  const existing = await db
    .select({
      label: entriesTable.label,
      entryDate: entriesTable.entryDate,
      type: entriesTable.type,
      choreId: entriesTable.choreId,
    })
    .from(entriesTable)
    .where(and(eq(entriesTable.weekId, week.id), eq(entriesTable.kidId, kid.id)));
  // Dedupe by chore identity (choreId) for chore-linked rows, and by name for
  // manual chore entries the tracker logs without a choreId.
  const seenChore = new Set<string>();
  const seenLabel = new Set<string>();
  for (const e of existing) {
    if (e.choreId != null) seenChore.add(`${e.entryDate}|${e.choreId}`);
    if (e.type === "chore_done" || e.type === "chore_missed") seenLabel.add(`${e.entryDate}|${e.label}`);
  }

  const toInsert: (typeof entriesTable.$inferInsert)[] = [];
  for (const c of applicable) {
    const choreStart = isoDate(c.createdAt);
    for (const d of days) {
      if (d < choreStart) continue;
      if (seenChore.has(`${d}|${c.id}`) || seenLabel.has(`${d}|${c.name}`)) continue;
      toInsert.push({
        weekId: week.id,
        kidId: kid.id,
        type: "chore_missed",
        amountCents: -Math.abs(c.valueCents),
        label: c.name,
        note: "Auto: chore not completed",
        entryDate: d,
        choreId: c.id,
        createdByMemberId: null,
      });
    }
  }
  // onConflictDoNothing: the unique index on (weekId,kidId,entryDate,choreId)
  // makes concurrent materialization safe — no double deductions.
  if (toInsert.length > 0) await db.insert(entriesTable).values(toInsert).onConflictDoNothing();
}

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
  if (prevWeek && prevWeek.rolledOverCents !== null && prevWeek.rolledOverCents !== 0) {
    // rolledOver may be negative (debt carried) or positive (chose to roll a surplus forward)
    openingBalanceCents = baseAllowanceCents + prevWeek.rolledOverCents;
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
  forceMode?: "save" | "spend",
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
  // forceMode (chosen at close-out) overrides the kid's standing plan.
  let mode = plan?.modeName ?? 0; // 0=split, 1=save_all, 2=spend_all
  if (forceMode === "save") mode = 1;
  else if (forceMode === "spend") mode = 2;
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
