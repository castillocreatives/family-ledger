import { pgTable, serial, integer, text, timestamp, date, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { weeksTable } from "./weeks";
import { kidsTable } from "./kids";
import { membersTable } from "./members";
import { choresTable } from "./chores";

export const entriesTable = pgTable("entries", {
  id: serial("id").primaryKey(),
  weekId: integer("week_id").notNull().references(() => weeksTable.id),
  kidId: integer("kid_id").notNull().references(() => kidsTable.id),
  type: text("type", { enum: ["chore_done", "chore_missed", "bonus", "penalty"] }).notNull(),
  amountCents: integer("amount_cents").notNull(),
  label: text("label").notNull(),
  note: text("note"),
  // The calendar day (YYYY-MM-DD) this entry applies to. Distinct from createdAt
  // so auto-generated misses can be dated to the past day they belong to.
  entryDate: date("entry_date", { mode: "string" }).notNull().default(sql`CURRENT_DATE`),
  // Stable link to the source chore (set on auto-generated misses). Lets us dedupe
  // by chore identity rather than name, and guards against duplicate auto-misses.
  choreId: integer("chore_id").references(() => choresTable.id),
  createdByMemberId: integer("created_by_member_id").references(() => membersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // NULL choreId rows (manual/bonus/penalty entries) are treated as distinct by
  // Postgres, so this only constrains chore-linked rows — preventing concurrent
  // requests from inserting the same auto-miss twice.
  choreDayUniq: uniqueIndex("entries_chore_day_uniq").on(t.weekId, t.kidId, t.entryDate, t.choreId),
}));

export const insertEntrySchema = createInsertSchema(entriesTable).omit({ id: true, createdAt: true });
export type InsertEntry = z.infer<typeof insertEntrySchema>;
export type Entry = typeof entriesTable.$inferSelect;
