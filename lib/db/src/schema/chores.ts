import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { householdsTable } from "./households";
import { kidsTable } from "./kids";

export const choresTable = pgTable("chores", {
  id: serial("id").primaryKey(),
  householdId: integer("household_id").notNull().references(() => householdsTable.id),
  name: text("name").notNull(),
  valueCents: integer("value_cents").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const choreKidsTable = pgTable("chore_kids", {
  choreId: integer("chore_id").notNull().references(() => choresTable.id),
  kidId: integer("kid_id").notNull().references(() => kidsTable.id),
});

export const insertChoreSchema = createInsertSchema(choresTable).omit({ id: true, createdAt: true });
export type InsertChore = z.infer<typeof insertChoreSchema>;
export type Chore = typeof choresTable.$inferSelect;
