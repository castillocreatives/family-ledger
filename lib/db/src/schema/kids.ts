import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { householdsTable } from "./households";

export const kidsTable = pgTable("kids", {
  id: serial("id").primaryKey(),
  householdId: integer("household_id").notNull().references(() => householdsTable.id),
  name: text("name").notNull(),
  color: text("color").notNull().default("#d8a657"),
  baseAllowanceCents: integer("base_allowance_cents").notNull().default(4000),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertKidSchema = createInsertSchema(kidsTable).omit({ id: true, createdAt: true });
export type InsertKid = z.infer<typeof insertKidSchema>;
export type Kid = typeof kidsTable.$inferSelect;
