import { pgTable, serial, integer, date, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { kidsTable } from "./kids";
import { membersTable } from "./members";

export const weeksTable = pgTable("weeks", {
  id: serial("id").primaryKey(),
  kidId: integer("kid_id").notNull().references(() => kidsTable.id),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  openingBalanceCents: integer("opening_balance_cents").notNull(),
  status: text("status", { enum: ["open", "closed"] }).notNull().default("open"),
  paidOutCents: integer("paid_out_cents"),
  rolledOverCents: integer("rolled_over_cents"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closedByMemberId: integer("closed_by_member_id").references(() => membersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWeekSchema = createInsertSchema(weeksTable).omit({ id: true, createdAt: true });
export type InsertWeek = z.infer<typeof insertWeekSchema>;
export type Week = typeof weeksTable.$inferSelect;
