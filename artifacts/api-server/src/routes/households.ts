import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, householdsTable, membersTable, kidsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { getAuth } from "@clerk/express";

const router: IRouter = Router();

router.get("/households/me", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!req.householdId) {
    res.status(404).json({ error: "Not in a household" });
    return;
  }
  const [household] = await db.select().from(householdsTable).where(eq(householdsTable.id, req.householdId));
  if (!household) {
    res.status(404).json({ error: "Household not found" });
    return;
  }
  res.json(toApi(household));
});

router.post("/households", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (req.householdId) {
    res.status(409).json({ error: "Already in a household" });
    return;
  }

  const { name, baseDefaultCents = 4000, weekStartDow = 0, memberName } = req.body;
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const [household] = await db.insert(householdsTable).values({
    name,
    baseDefaultCents,
    weekStartDow,
  }).returning();

  const auth = getAuth(req);
  const email = (auth as any)?.sessionClaims?.email as string ?? "";
  const displayName = memberName || email.split("@")[0] || "Parent";

  await db.insert(membersTable).values({
    householdId: household.id,
    userId: req.userId,
    name: displayName,
    email,
    avatarInitial: displayName[0].toUpperCase(),
    role: "owner",
  });

  res.status(201).json(toApi(household));
});

router.patch("/households/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (id !== req.householdId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { name, baseDefaultCents, weekStartDow } = req.body;
  const [updated] = await db.update(householdsTable)
    .set({ ...(name && { name }), ...(baseDefaultCents !== undefined && { baseDefaultCents }), ...(weekStartDow !== undefined && { weekStartDow }) })
    .where(eq(householdsTable.id, id))
    .returning();
  res.json(toApi(updated));
});

function toApi(h: typeof householdsTable.$inferSelect) {
  return {
    id: h.id,
    name: h.name,
    baseDefaultCents: h.baseDefaultCents,
    weekStartDow: h.weekStartDow,
  };
}

export default router;
