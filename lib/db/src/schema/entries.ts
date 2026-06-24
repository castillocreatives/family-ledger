import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { weeksTable } from "./weeks";
import { kidsTable } from "./kids";
import { membersTable } from "./members";

export const entriesTable = pgTable("entries", {
  id: serial("id").primaryKey(),
  weekId: integer("week_id").notNull().references(() => weeksTable.id),
  kidId: integer("kid_id").notNull().references(() => kidsTable.id),
  type: text("type", { enum: ["chore_done", "chore_missed", "bonus", "penalty"] }).notNull(),
  amountCents: integer("amount_cents").notNull(),
  label: text("label").notNull(),
  note: text("note"),
  createdByMemberId: integer("created_by_member_id").references(() => membersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEntrySchema = createInsertSchema(entriesTable).omit({ id: true, createdAt: true });
export type InsertEntry = z.infer<typeof insertEntrySchema>;
export type Entry = typeof entriesTable.$inferSelect;
