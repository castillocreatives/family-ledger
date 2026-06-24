import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { householdsTable } from "./households";

export const membersTable = pgTable("members", {
  id: serial("id").primaryKey(),
  householdId: integer("household_id").notNull().references(() => householdsTable.id),
  userId: text("user_id").notNull().unique(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  avatarInitial: text("avatar_initial").notNull(),
  role: text("role", { enum: ["owner", "member"] }).notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMemberSchema = createInsertSchema(membersTable).omit({ id: true, createdAt: true });
export type InsertMember = z.infer<typeof insertMemberSchema>;
export type Member = typeof membersTable.$inferSelect;
