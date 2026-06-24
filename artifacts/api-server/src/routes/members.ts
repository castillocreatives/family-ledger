import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, membersTable } from "@workspace/db";
import { requireAuth, requireHousehold } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/members/me", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!req.memberId) {
    res.status(404).json({ error: "Not a member" });
    return;
  }
  const [member] = await db.select().from(membersTable).where(eq(membersTable.id, req.memberId));
  if (!member) {
    res.status(404).json({ error: "Member not found" });
    return;
  }
  res.json(toApi(member));
});

router.patch("/members/:id", requireAuth, requireHousehold, async (req: Request, res: Response): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (id !== req.memberId) {
    res.status(403).json({ error: "Can only update your own profile" });
    return;
  }
  const { name, avatarInitial } = req.body;
  const [updated] = await db.update(membersTable)
    .set({ ...(name && { name }), ...(avatarInitial && { avatarInitial }) })
    .where(eq(membersTable.id, id))
    .returning();
  res.json(toApi(updated));
});

router.get("/households/:householdId/members", requireAuth, requireHousehold, async (req: Request, res: Response): Promise<void> => {
  const raw = Array.isArray(req.params.householdId) ? req.params.householdId[0] : req.params.householdId;
  const householdId = parseInt(raw, 10);
  if (householdId !== req.householdId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const members = await db.select().from(membersTable).where(eq(membersTable.householdId, householdId));
  res.json(members.map(toApi));
});

function toApi(m: typeof membersTable.$inferSelect) {
  return {
    id: m.id,
    householdId: m.householdId,
    userId: m.userId,
    name: m.name,
    email: m.email,
    avatarInitial: m.avatarInitial,
    role: m.role,
  };
}

export default router;
