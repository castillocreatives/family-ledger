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

type WeekSummary = {
  id: number; kidId: number; kidName: string; kidColor: string;
  runningTotalCents: number; openingBalanceCents: number;
  status: string; startDate: string; endDate: string;
};

export default function CloseScreen() {
  const qc = useQueryClient();
  const [step, setStep] = useState<"preview" | "closed" | "paid">("preview");
  const [closeResults, setCloseResults] = useState<CloseResult[]>([]);
  const [payoutResults, setPayoutResults] = useState<PayoutResult[]>([]);

  const { data: currentWeeks = [], isLoading } = useQuery<WeekSummary[]>({
    queryKey: ["weeks", "current"],
    queryFn: () => apiGet("/weeks/current"),
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
    mutationFn: async (weekId: number) => apiPost<PayoutResult>(`/weeks/${weekId}/payout`),
    onSuccess: (data) => {
      setPayoutResults(prev => [...prev, data]);
    },
    onError: (e: any) => Alert.alert("Error", e.message),
  });

  const handleConfirmAllPayouts = async () => {
    for (const r of closeResults) {
      if (r.payoutCents > 0) {
        await confirmPayout.mutateAsync(r.weekId);
      }
    }
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    setStep("paid");
  };

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={C.primary} size="large" /></View>;
  }

  const allClosed = currentWeeks.every(w => w.status === "closed");

  if (step === "preview") {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.pageTitle}>Close out week</Text>
          <Text style={styles.pageDesc}>
            Review each kid's running total, then close the week to lock in their payout.
          </Text>

          {currentWeeks.map(w => {
            const isPos = w.runningTotalCents >= 0;
            return (
              <View key={w.kidId} style={[styles.kidCard, { borderLeftColor: w.kidColor, borderLeftWidth: 3 }]}>
                <View style={styles.row}>
                  <Text style={styles.kidName}>{w.kidName}</Text>
                  <Text style={[styles.total, { color: isPos ? C.positive : C.negative }]}>
                    {centsToDisplay(w.runningTotalCents)}
                  </Text>
                </View>
                <Text style={styles.muted}>
                  {w.startDate} – {w.endDate} · {w.status === "closed" ? "Already closed" : "Open"}
                </Text>
                {w.runningTotalCents < 0 && (
                  <View style={styles.debtNote}>
                    <Text style={styles.debtTxt}>
                      Debt of {centsToDisplay(Math.abs(w.runningTotalCents))} will roll into next week.
                    </Text>
                  </View>
                )}
              </View>
            );
          })}

          {!allClosed && (
            <TouchableOpacity
              style={[styles.btn, closeWeek.isPending && styles.btnDisabled]}
              onPress={() => {
                Alert.alert("Close this week?", "This will lock in all kids' totals.", [
                  { text: "Cancel" },
                  { text: "Close week", onPress: () => closeWeek.mutate() },
                ]);
              }}
              disabled={closeWeek.isPending}
            >
              {closeWeek.isPending
                ? <ActivityIndicator color={C.primaryForeground} />
                : <Text style={styles.btnTxt}>Close week for all kids</Text>
              }
            </TouchableOpacity>
          )}

          {allClosed && (
            <View style={styles.closedNote}>
              <Text style={styles.closedNoteTxt}>Week already closed. Go to History to view it.</Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === "closed") {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.pageTitle}>Week closed!</Text>
          <Text style={styles.pageDesc}>Here's what each kid earned. Confirm to move to their wallets.</Text>

          {closeResults.map(r => (
            <View key={r.kidId} style={styles.kidCard}>
              <Text style={styles.kidName}>{r.kidName}</Text>
              <View style={styles.payoutGrid}>
                <View style={styles.payoutItem}>
                  <Text style={styles.payoutNum}>{centsToDisplay(r.payoutCents)}</Text>
                  <Text style={styles.payoutLbl}>payout</Text>
                </View>
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
            </View>
          ))}

          <TouchableOpacity
            style={[styles.btn, confirmPayout.isPending && styles.btnDisabled]}
            onPress={handleConfirmAllPayouts}
            disabled={confirmPayout.isPending}
          >
            {confirmPayout.isPending
              ? <ActivityIndicator color={C.primaryForeground} />
              : <Text style={styles.btnTxt}>Confirm & distribute to wallets</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity style={styles.skipBtn} onPress={() => setStep("paid")}>
            <Text style={styles.skipTxt}>Skip for now</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.pageTitle}>All done!</Text>
        <Text style={styles.pageDesc}>Payouts distributed. A new week starts fresh.</Text>

        {payoutResults.map(r => (
          <View key={r.kidId} style={styles.kidCard}>
            <View style={styles.payoutGrid}>
              <View style={styles.payoutItem}>
                <Text style={[styles.payoutNum, { color: C.positive }]}>{centsToDisplay(r.toSaveCents)}</Text>
                <Text style={styles.payoutLbl}>to save</Text>
              </View>
              <View style={styles.payoutItem}>
                <Text style={[styles.payoutNum, { color: C.primary }]}>{centsToDisplay(r.toSpendCents)}</Text>
                <Text style={styles.payoutLbl}>to spend</Text>
              </View>
            </View>
            {r.goalReached && (
              <View style={styles.goalBanner}>
                <Text style={styles.goalBannerTxt}>Goal reached: {r.goalName}!</Text>
              </View>
            )}
          </View>
        ))}

        <TouchableOpacity style={styles.btn} onPress={() => {
          setStep("preview");
          setCloseResults([]);
          setPayoutResults([]);
          qc.invalidateQueries({ queryKey: ["weeks"] });
          qc.invalidateQueries({ queryKey: ["dashboard"] });
        }}>
          <Text style={styles.btnTxt}>Done</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: C.background },
  scroll: { padding: 16, paddingBottom: 110 },
  pageTitle: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 24, color: C.primary, marginBottom: 6 },
  pageDesc: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 14, color: C.mutedForeground, marginBottom: 20 },
  kidCard: { backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: C.border },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  kidName: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 17, color: C.foreground },
  total: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 20 },
  muted: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 12, color: C.mutedForeground },
  debtNote: { marginTop: 10, backgroundColor: C.negative + "20", borderRadius: 8, padding: 10 },
  debtTxt: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 13, color: C.negative },
  btn: { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 15, alignItems: "center", marginTop: 8 },
  btnDisabled: { opacity: 0.6 },
  btnTxt: { fontFamily: "SpaceGrotesk_600SemiBold", color: C.primaryForeground, fontSize: 16 },
  skipBtn: { alignItems: "center", marginTop: 12 },
  skipTxt: { fontFamily: "SpaceGrotesk_500Medium", color: C.mutedForeground, fontSize: 14 },
  payoutGrid: { flexDirection: "row", justifyContent: "space-around", marginTop: 10 },
  payoutItem: { alignItems: "center" },
  payoutNum: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 18, color: C.foreground },
  payoutLbl: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 11, color: C.mutedForeground, marginTop: 2 },
  goalBanner: { marginTop: 12, backgroundColor: C.primary + "20", borderRadius: 8, padding: 10, alignItems: "center" },
  goalBannerTxt: { fontFamily: "SpaceGrotesk_600SemiBold", color: C.primary, fontSize: 14 },
  closedNote: { backgroundColor: C.card, borderRadius: 12, padding: 16, alignItems: "center", borderWidth: 1, borderColor: C.border },
  closedNoteTxt: { fontFamily: "SpaceGrotesk_400Regular", color: C.mutedForeground, fontSize: 14 },
});
