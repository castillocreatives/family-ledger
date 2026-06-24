import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiGet, apiPost, centsToDisplay } from "@/lib/api";
import colors from "@/constants/colors";

const C = colors.light;

type Entry = {
  id: number; type: string; amountCents: number; label: string; note: string | null;
};
type WeekDetail = {
  id: number; kidId: number; kidName: string; kidColor: string;
  startDate: string; endDate: string;
  openingBalanceCents: number; runningTotalCents: number; status: string;
  entries: Entry[];
};
type WeekSummary = {
  id: number; kidId: number; kidName: string; kidColor: string;
  runningTotalCents: number; openingBalanceCents: number;
  status: string; startDate: string; endDate: string;
};
type CloseResult = {
  kidId: number; kidName: string; weekId: number;
  runningTotalCents: number; payoutCents: number;
  rolledOverCents: number; nextOpeningBalanceCents: number;
};
type PayoutResult = {
  kidId: number; payoutCents: number; toSaveCents: number; toSpendCents: number;
  goalReached: boolean; goalName: string | null;
  wallet: { savedBalanceCents: number; spendBalanceCents: number } | null;
};

function LedgerLine({ label, amount, bold }: { label: string; amount: number; bold?: boolean }) {
  const isPos = amount >= 0;
  const formatted = (amount >= 0 ? "+" : "") + centsToDisplay(amount);
  return (
    <View style={styles.ledgerLine}>
      <Text style={[styles.ledgerLabel, bold && { color: C.foreground, fontFamily: "Inter_600SemiBold" }]}>
        {label}
      </Text>
      <Text style={[styles.ledgerAmt, bold && { fontFamily: "Inter_700Bold", fontSize: 17 }, { color: bold ? (isPos ? C.positive : C.negative) : (isPos ? C.foreground : C.negative) }]}>
        {amount === 0 && !bold ? "$0" : formatted}
      </Text>
    </View>
  );
}

function KidLedger({ detail }: { detail: WeekDetail }) {
  const choresDone = detail.entries.filter(e => e.type === "chore_done").reduce((s, e) => s + e.amountCents, 0);
  const choresMissed = detail.entries.filter(e => e.type === "chore_missed").reduce((s, e) => s + e.amountCents, 0);
  const bonuses = detail.entries.filter(e => e.type === "bonus").reduce((s, e) => s + e.amountCents, 0);
  const penalties = detail.entries.filter(e => e.type === "penalty").reduce((s, e) => s + e.amountCents, 0);

  const total = detail.runningTotalCents;
  const isPos = total >= 0;

  const bonusEntries = detail.entries.filter(e => e.type === "bonus");
  const penaltyEntries = detail.entries.filter(e => e.type === "penalty");

  return (
    <View style={[styles.kidCard, { borderLeftColor: detail.kidColor, borderLeftWidth: 3 }]}>
      <Text style={styles.kidName}>{detail.kidName}</Text>

      <View style={styles.ledgerBlock}>
        <LedgerLine label="Opened" amount={detail.openingBalanceCents} />
        {choresDone > 0 && <LedgerLine label="Chores done" amount={choresDone} />}
        {bonusEntries.map(e => (
          <LedgerLine key={e.id} label={`Bonus · ${e.label}`} amount={e.amountCents} />
        ))}
        {choresMissed < 0 && <LedgerLine label="Missed chores" amount={choresMissed} />}
        {penaltyEntries.map(e => (
          <LedgerLine key={e.id} label={`Penalty · ${e.label}`} amount={e.amountCents} />
        ))}
      </View>

      <View style={styles.ledgerDivider} />
      <LedgerLine label="Total" amount={total} bold />

      <View style={[styles.outcomeNote, { backgroundColor: isPos ? C.positive + "15" : C.negative + "15" }]}>
        {isPos ? (
          <Text style={[styles.outcomeText, { color: C.positive }]}>
            Positive — pay out {centsToDisplay(total)} today. Next week resets clean to {centsToDisplay(detail.openingBalanceCents)}.
          </Text>
        ) : (
          <Text style={[styles.outcomeText, { color: C.negative }]}>
            Negative — {centsToDisplay(Math.abs(total))} rolls over. Next week opens at{" "}
            <Text style={{ fontFamily: "Inter_700Bold" }}>
              {centsToDisplay(detail.openingBalanceCents + total)}
            </Text>
            , not {centsToDisplay(detail.openingBalanceCents)}.
          </Text>
        )}
      </View>
    </View>
  );
}

export default function CloseScreen() {
  const qc = useQueryClient();
  const [step, setStep] = useState<"preview" | "closed" | "paid">("preview");
  const [closeResults, setCloseResults] = useState<CloseResult[]>([]);
  const [payoutResults, setPayoutResults] = useState<PayoutResult[]>([]);

  const { data: currentWeeks = [], isLoading: loadingWeeks } = useQuery<WeekSummary[]>({
    queryKey: ["weeks", "current"],
    queryFn: () => apiGet("/weeks/current"),
  });

  const openWeeks = currentWeeks.filter(w => w.status !== "closed");

  const weekDetailQueries = useQuery<WeekDetail[]>({
    queryKey: ["weeks-details", openWeeks.map(w => w.id).join(",")],
    queryFn: async () => {
      const results = await Promise.all(
        openWeeks.map(w => apiGet<WeekDetail>(`/weeks/${w.id}`))
      );
      return results;
    },
    enabled: openWeeks.length > 0 && step === "preview",
  });

  const closeWeek = useMutation({
    mutationFn: () => apiPost<CloseResult[]>("/weeks/close"),
    onSuccess: (data) => {
      setCloseResults(data);
      setStep("closed");
      qc.invalidateQueries({ queryKey: ["weeks"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: any) => Alert.alert("Error", e.message),
  });

  const confirmPayout = useMutation({
    mutationFn: (weekId: number) => apiPost<PayoutResult>(`/weeks/${weekId}/payout`),
    onSuccess: (data) => setPayoutResults(prev => [...prev, data]),
    onError: (e: any) => Alert.alert("Error", e.message),
  });

  const handleCloseAndPayout = async () => {
    for (const r of closeResults) {
      if (r.payoutCents > 0) {
        await confirmPayout.mutateAsync(r.weekId);
      }
    }
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    setStep("paid");
  };

  const allClosed = currentWeeks.length > 0 && currentWeeks.every(w => w.status === "closed");

  const weekRange = currentWeeks[0]
    ? `${currentWeeks[0].startDate.slice(5).replace("-", "/")} – ${currentWeeks[0].endDate.slice(5).replace("-", "/")}`
    : "";

  if (loadingWeeks) {
    return <View style={styles.center}><ActivityIndicator color={C.primary} size="large" /></View>;
  }

  // STEP: preview
  if (step === "preview") {
    const details = weekDetailQueries.data ?? [];
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.pageLabel}>CLOSE OUT</Text>
          {weekRange ? <Text style={styles.pageTitle}>Week of {weekRange}</Text> : null}
          <Text style={styles.pageDesc}>Review the math, then reset the week.</Text>

          {allClosed ? (
            <View style={styles.closedNote}>
              <Text style={styles.closedNoteTxt}>Week already closed. Check History for details.</Text>
            </View>
          ) : weekDetailQueries.isLoading ? (
            <View style={styles.center}><ActivityIndicator color={C.primary} /></View>
          ) : (
            details.map(d => <KidLedger key={d.id} detail={d} />)
          )}

          {!allClosed && (
            <TouchableOpacity
              style={[styles.primaryBtn, closeWeek.isPending && styles.btnDisabled]}
              onPress={() => Alert.alert(
                "Close this week?",
                "This will lock in all totals and start a new week.",
                [{ text: "Cancel" }, { text: "Close out & reset", onPress: () => closeWeek.mutate() }]
              )}
              disabled={closeWeek.isPending || weekDetailQueries.isLoading}
            >
              {closeWeek.isPending
                ? <ActivityIndicator color={C.primaryForeground} />
                : <Text style={styles.primaryBtnTxt}>Close out & reset →</Text>
              }
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // STEP: closed — show results, confirm payout
  if (step === "closed") {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.pageLabel}>WEEK CLOSED</Text>
          <Text style={styles.pageTitle}>Pay out earnings</Text>
          <Text style={styles.pageDesc}>Confirm to move money into wallets.</Text>

          {closeResults.map(r => {
            const isPos = r.payoutCents > 0;
            return (
              <View key={r.kidId} style={styles.kidCard}>
                <Text style={styles.kidName}>{r.kidName}</Text>
                <View style={styles.payoutGrid}>
                  {isPos && (
                    <View style={styles.payoutItem}>
                      <Text style={[styles.payoutNum, { color: C.positive }]}>{centsToDisplay(r.payoutCents)}</Text>
                      <Text style={styles.payoutLbl}>to pay out</Text>
                    </View>
                  )}
                  {r.rolledOverCents < 0 && (
                    <View style={styles.payoutItem}>
                      <Text style={[styles.payoutNum, { color: C.negative }]}>{centsToDisplay(r.rolledOverCents)}</Text>
                      <Text style={styles.payoutLbl}>rolled over</Text>
                    </View>
                  )}
                  <View style={styles.payoutItem}>
                    <Text style={styles.payoutNum}>{centsToDisplay(r.nextOpeningBalanceCents)}</Text>
                    <Text style={styles.payoutLbl}>next week opens</Text>
                  </View>
                </View>
                {r.rolledOverCents < 0 && (
                  <Text style={[styles.rollNote, { color: C.negative }]}>
                    Nothing to pay — debt carries into next week.
                  </Text>
                )}
              </View>
            );
          })}

          <TouchableOpacity
            style={[styles.primaryBtn, confirmPayout.isPending && styles.btnDisabled]}
            onPress={handleCloseAndPayout}
            disabled={confirmPayout.isPending}
          >
            {confirmPayout.isPending
              ? <ActivityIndicator color={C.primaryForeground} />
              : <Text style={styles.primaryBtnTxt}>Mark as paid →</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipBtn} onPress={() => setStep("paid")}>
            <Text style={styles.skipTxt}>Skip for now</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // STEP: done
  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.pageLabel}>ALL DONE</Text>
        <Text style={styles.pageTitle}>A new week begins.</Text>

        {payoutResults.map(r => (
          <View key={r.kidId} style={styles.kidCard}>
            <View style={styles.payoutGrid}>
              <View style={styles.payoutItem}>
                <Text style={[styles.payoutNum, { color: C.positive }]}>{centsToDisplay(r.toSaveCents)}</Text>
                <Text style={styles.payoutLbl}>saved</Text>
              </View>
              <View style={styles.payoutItem}>
                <Text style={[styles.payoutNum, { color: C.primary }]}>{centsToDisplay(r.toSpendCents)}</Text>
                <Text style={styles.payoutLbl}>to spend</Text>
              </View>
            </View>
            {r.goalReached && (
              <View style={styles.goalBanner}>
                <Text style={styles.goalBannerTxt}>★ Goal reached: {r.goalName}!</Text>
              </View>
            )}
          </View>
        ))}

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => {
            setStep("preview");
            setCloseResults([]);
            setPayoutResults([]);
            qc.invalidateQueries({ queryKey: ["weeks"] });
            qc.invalidateQueries({ queryKey: ["dashboard"] });
          }}
        >
          <Text style={styles.primaryBtnTxt}>Done</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: C.background },
  scroll: { padding: 16, paddingBottom: 120 },

  pageLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: C.mutedForeground, letterSpacing: 1.4, marginBottom: 4 },
  pageTitle: { fontFamily: "Inter_700Bold", fontSize: 26, color: C.foreground, marginBottom: 4, letterSpacing: -0.5 },
  pageDesc: { fontFamily: "Inter_400Regular", fontSize: 14, color: C.mutedForeground, marginBottom: 24 },

  kidCard: { backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: C.border },
  kidName: { fontFamily: "Inter_600SemiBold", fontSize: 17, color: C.foreground, marginBottom: 14 },

  ledgerBlock: { gap: 6 },
  ledgerLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  ledgerLabel: { fontFamily: "Inter_400Regular", fontSize: 14, color: C.mutedForeground, flex: 1 },
  ledgerAmt: { fontFamily: "Inter_500Medium", fontSize: 14, color: C.foreground },
  ledgerDivider: { height: 1, backgroundColor: C.border, marginVertical: 10 },

  outcomeNote: { marginTop: 12, borderRadius: 10, padding: 12 },
  outcomeText: { fontFamily: "Inter_500Medium", fontSize: 13, lineHeight: 19 },

  primaryBtn: { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 8 },
  btnDisabled: { opacity: 0.6 },
  primaryBtnTxt: { fontFamily: "Inter_600SemiBold", color: C.primaryForeground, fontSize: 16 },
  skipBtn: { alignItems: "center", marginTop: 14 },
  skipTxt: { fontFamily: "Inter_500Medium", color: C.mutedForeground, fontSize: 14 },

  payoutGrid: { flexDirection: "row", justifyContent: "space-around", marginTop: 6 },
  payoutItem: { alignItems: "center" },
  payoutNum: { fontFamily: "Inter_700Bold", fontSize: 20, color: C.foreground },
  payoutLbl: { fontFamily: "Inter_400Regular", fontSize: 11, color: C.mutedForeground, marginTop: 2 },
  rollNote: { fontFamily: "Inter_400Regular", fontSize: 12, textAlign: "center", marginTop: 10 },

  goalBanner: { marginTop: 12, backgroundColor: C.primary + "20", borderRadius: 8, padding: 10, alignItems: "center" },
  goalBannerTxt: { fontFamily: "Inter_600SemiBold", color: C.primary, fontSize: 14 },

  closedNote: { backgroundColor: C.card, borderRadius: 12, padding: 20, alignItems: "center", borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  closedNoteTxt: { fontFamily: "Inter_400Regular", color: C.mutedForeground, fontSize: 14 },
});
