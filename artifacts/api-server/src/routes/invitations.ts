import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and } from "drizzle-orm";
import { db, invitationsTable, membersTable, householdsTable } from "@workspace/db";
import { requireAuth, requireHousehold } from "../middlewares/auth";
import { getAuth } from "@clerk/express";
import crypto from "crypto";

const router: IRouter = Router();

router.post("/invitations", requireAuth, requireHousehold, async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;
  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const [inv] = await db.insert(invitationsTable).values({
    householdId: req.householdId,
    token,
    email: email || null,
    status: "pending",
    expiresAt,
  }).returning();

  res.status(201).json(toApi(inv));
});

router.get("/invitations/:token", async (req: Request, res: Response): Promise<void> => {
  const token = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
  const [inv] = await db.select().from(invitationsTable).where(eq(invitationsTable.token, token));
  if (!inv) {
    res.status(404).json({ error: "Invitation not found" });
    return;
  }
  res.json(toApi(inv));
});

router.post("/invitations/accept", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { token, memberName } = req.body;
  if (!token) {
    res.status(400).json({ error: "token is required" });
    return;
  }

  const [inv] = await db.select().from(invitationsTable).where(
    and(eq(invitationsTable.token, token), eq(invitationsTable.status, "pending"))
  );
  if (!inv) {
    res.status(404).json({ error: "Invitation not found or already used" });
    return;
  }

  if (inv.expiresAt && new Date() > inv.expiresAt) {
    await db.update(invitationsTable).set({ status: "expired" }).where(eq(invitationsTable.id, inv.id));
    res.status(410).json({ error: "Invitation expired" });
    return;
  }

  // Check if already a member
  const [existing] = await db.select().from(membersTable).where(eq(membersTable.userId, req.userId));
  if (existing) {
    res.status(409).json({ error: "Already a member of a household" });
    return;
  }

  const auth = getAuth(req);
  const email = (auth as any)?.sessionClaims?.email as string ?? inv.email ?? "";
  const displayName = memberName || email.split("@")[0] || "Parent";

  const [member] = await db.insert(membersTable).values({
    householdId: inv.householdId,
    userId: req.userId,
    name: displayName,
    email,
    avatarInitial: displayName[0].toUpperCase(),
    role: "member",
  }).returning();

  await db.update(invitationsTable).set({ status: "accepted" }).where(eq(invitationsTable.id, inv.id));

  res.json({
    id: member.id,
    householdId: member.householdId,
    userId: member.userId,
    name: member.name,
    email: member.email,
    avatarInitial: member.avatarInitial,
    role: member.role,
  });
});

function toApi(inv: typeof invitationsTable.$inferSelect) {
  return {
    id: inv.id,
    householdId: inv.householdId,
    token: inv.token,
    email: inv.email,
    status: inv.status,
    createdAt: inv.createdAt?.toISOString(),
  };
}

export default router;
