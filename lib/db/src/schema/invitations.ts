import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { householdsTable } from "./households";

export const invitationsTable = pgTable("invitations", {
  id: serial("id").primaryKey(),
  householdId: integer("household_id").notNull().references(() => householdsTable.id),
  token: text("token").notNull().unique(),
  email: text("email"),
  status: text("status", { enum: ["pending", "accepted", "expired"] }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

export const insertInvitationSchema = createInsertSchema(invitationsTable).omit({ id: true, createdAt: true });
export type InsertInvitation = z.infer<typeof insertInvitationSchema>;
export type Invitation = typeof invitationsTable.$inferSelect;
