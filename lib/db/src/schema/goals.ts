import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { kidsTable } from "./kids";

export const goalsTable = pgTable("goals", {
  id: serial("id").primaryKey(),
  kidId: integer("kid_id").notNull().references(() => kidsTable.id),
  name: text("name").notNull(),
  imageUrl: text("image_url"),
  targetCents: integer("target_cents").notNull(),
  savedCents: integer("saved_cents").notNull().default(0),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertGoalSchema = createInsertSchema(goalsTable).omit({ id: true, createdAt: true });
export type InsertGoal = z.infer<typeof insertGoalSchema>;
export type Goal = typeof goalsTable.$inferSelect;
