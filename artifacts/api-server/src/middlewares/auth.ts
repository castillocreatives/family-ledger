import { type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db, membersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      userId: string;
      memberId: number;
      householdId: number;
    }
  }
}

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [member] = await db
    .select()
    .from(membersTable)
    .where(eq(membersTable.userId, userId));

  if (!member) {
    req.userId = userId;
    req.memberId = 0;
    req.householdId = 0;
    next();
    return;
  }

  req.userId = userId;
  req.memberId = member.id;
  req.householdId = member.householdId;
  next();
};

export const requireHousehold = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (!req.householdId) {
    res.status(403).json({ error: "Not a member of a household" });
    return;
  }
  next();
};
