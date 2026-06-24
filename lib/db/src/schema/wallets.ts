import { pgTable, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { kidsTable } from "./kids";

export const walletsTable = pgTable("wallets", {
  kidId: integer("kid_id").notNull().references(() => kidsTable.id).primaryKey(),
  savedBalanceCents: integer("saved_balance_cents").notNull().default(0),
  spendBalanceCents: integer("spend_balance_cents").notNull().default(0),
});

export const payoutPlansTable = pgTable("payout_plans", {
  kidId: integer("kid_id").notNull().references(() => kidsTable.id).primaryKey(),
  modeName: integer("mode_name").notNull().default(0),
  savePct: integer("save_pct").notNull().default(70),
});

export const insertWalletSchema = createInsertSchema(walletsTable);
export type InsertWallet = z.infer<typeof insertWalletSchema>;
export type Wallet = typeof walletsTable.$inferSelect;

export const insertPayoutPlanSchema = createInsertSchema(payoutPlansTable);
export type InsertPayoutPlan = z.infer<typeof insertPayoutPlanSchema>;
export type PayoutPlan = typeof payoutPlansTable.$inferSelect;
