import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  TouchableOpacity, ActivityIndicator, Modal, TextInput, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { apiGet, apiPost, centsToDisplay } from "@/lib/api";
import colors from "@/constants/colors";

const C = colors.light;

type KidSummary = {
  kid: { id: number; name: string; color: string; baseAllowanceCents: number };
  currentWeek: {
    id: number; startDate: string; endDate: string;
    openingBalanceCents: number; runningTotalCents: number; netChangeCents: number;
    status: string; choresDone: number; choresMissed: number; totalChores: number;
  };
  wallet: { savedBalanceCents: number; spendBalanceCents: number };
  activeGoal: { id: number; name: string; targetCents: number; savedCents: number } | null;
};

type Dashboard = {
  household: { id: number; name: string } | null;
  kidSummaries: KidSummary[];
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtDate(d: string) {
  const [, m, day] = d.split("-");
  return `${MONTHS[parseInt(m)-1]} ${parseInt(day)}`;
}
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function KidCard({ s, onBonus, onPenalty }: {
  s: KidSummary;
  onBonus: () => void;
  onPenalty: () => void;
}) {
  const router = useRouter();
  const total = s.currentWeek.runningTotalCents;
  const isPos = total >= 0;
  const isClosed = s.currentWeek.status === "closed";
  const goalPct = s.activeGoal
    ? Math.min(1, s.activeGoal.savedCents / s.activeGoal.targetCents)
    : 0;

  // Card background tint based on sign
  const cardTint = isPos ? C.positive + "0c" : C.negative + "0c";

  return (
    <View style={[styles.kidCard, { backgroundColor: C.card, borderColor: isPos ? C.positive + "30" : C.negative + "30" }]}>
      {/* Kid header */}
      <View style={styles.kidCardHeader}>
        <View style={styles.kidIdentity}>
          <View style={[styles.avatar, { backgroundColor: s.kid.color + "28", borderColor: s.kid.color + "80", borderWidth: 1.5 }]}>
            <Text style={[styles.avatarTxt, { color: s.kid.color }]}>{s.kid.name[0].toUpperCase()}</Text>
          </View>
          <View style={{ marginLeft: 12 }}>
            <Text style={styles.kidName}>{s.kid.name}</Text>
            <Text style={styles.kidWeek}>{fmtDate(s.currentWeek.startDate)} – {fmtDate(s.currentWeek.endDate)}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.todayPill}
          onPress={() => router.push({ pathname: "/(tabs)/tracker", params: { kidId: String(s.kid.id) } })}
        >
          <Text style={styles.todayPillTxt}>Today ›</Text>
        </TouchableOpacity>
      </View>

      {/* Big balance */}
      <View style={styles.balanceRow}>
        <Text style={[styles.balanceNum, { color: isPos ? C.positive : C.negative }]}>
          {centsToDisplay(total)}
        </Text>
        {isClosed && (
          <View style={[styles.closedBadge]}>
            <Text style={styles.closedBadgeTxt}>CLOSED</Text>
          </View>
        )}
      </View>
      <Text style={styles.balanceSub}>
        base {centsToDisplay(s.currentWeek.openingBalanceCents)}
        {isPos && s.currentWeek.netChangeCents > 0
          ? ` · +${centsToDisplay(s.currentWeek.netChangeCents)} this week`
          : !isPos ? " · rolls over" : ""}
      </Text>

      {/* Chore progress bar */}
      <View style={styles.choreProgressRow}>
        <View style={styles.choreBar}>
          <View style={[
            styles.choreBarFill,
            { width: s.currentWeek.totalChores > 0
                ? `${(s.currentWeek.choresDone / s.currentWeek.totalChores) * 100}%` as any
                : "0%",
              backgroundColor: isPos ? C.positive : C.mutedForeground },
          ]} />
        </View>
        <Text style={styles.choreLabel}>
          {s.currentWeek.choresDone}/{s.currentWeek.totalChores} chores
          {s.currentWeek.choresMissed > 0 ? ` · ${s.currentWeek.choresMissed} missed` : ""}
        </Text>
      </View>

      {/* Goal */}
      {s.activeGoal && (
        <TouchableOpacity
          style={styles.goalRow}
          onPress={() => router.push({ pathname: "/kid/[kidId]/money", params: { kidId: String(s.kid.id) } } as any)}
        >
          <View style={styles.goalDot} />
          <Text style={styles.goalText}>
            {s.activeGoal.name} · {centsToDisplay(s.activeGoal.savedCents)}/{centsToDisplay(s.activeGoal.targetCents)}
          </Text>
          <View style={styles.goalMiniBar}>
            <View style={[styles.goalMiniFill, { width: `${goalPct * 100}%` as any, backgroundColor: s.kid.color }]} />
          </View>
        </TouchableOpacity>
      )}

      {/* Actions */}
      {!isClosed && (
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionPill} onPress={onBonus}>
            <Text style={styles.actionPillTxt}>＋ Bonus</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionPill, styles.actionPillRed]} onPress={onPenalty}>
            <Text style={[styles.actionPillTxt, { color: C.negative }]}>－ Points</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState<{ visible: boolean; kidId: number | null; type: "bonus" | "penalty" }>({ visible: false, kidId: null, type: "bonus" });
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");

  const { data, isLoading, error, refetch } = useQuery<Dashboard>({
    queryKey: ["dashboard"],
    queryFn: () => apiGet("/dashboard"),
  });

  const addEntry = useMutation({
    mutationFn: (body: object) => apiPost("/entries", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["weeks"] });
      setModal({ visible: false, kidId: null, type: "bonus" });
    },
    onError: (e: any) => Alert.alert("Error", e.message),
  });

  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false); };

  const openModal = (kidId: number, type: "bonus" | "penalty") => {
    setAmount(""); setLabel(""); setNote("");
    setModal({ visible: true, kidId, type });
  };

  const submit = () => {
    const cents = Math.round(parseFloat(amount) * 100);
    if (!cents || isNaN(cents)) { Alert.alert("Enter a valid amount"); return; }
    if (modal.type === "penalty" && !note.trim()) { Alert.alert("A reason is required for deducting points"); return; }
    addEntry.mutate({ kidId: modal.kidId, type: modal.type, amountCents: cents, label: label.trim() || (modal.type === "bonus" ? "Bonus" : "Penalty"), note: note.trim() || undefined });
  };

  const summaries = data?.kidSummaries ?? [];
  const hasOpenWeek = summaries.some(s => s.currentWeek.status !== "closed");
  const weekLabel = summaries[0] ? `${fmtDate(summaries[0].currentWeek.startDate)} – ${fmtDate(summaries[0].currentWeek.endDate)}` : "";

  if (isLoading && !data) {
    return <View style={styles.center}><ActivityIndicator color={C.primary} size="large" /></View>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greeting()}</Text>
            {data?.household && <Text style={styles.householdName}>{data.household.name}</Text>}
          </View>
          {weekLabel ? <Text style={styles.weekBadge}>{weekLabel}</Text> : null}
        </View>

        {error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorTxt}>{(error as Error).message}</Text>
            <TouchableOpacity onPress={() => refetch()}><Text style={styles.link}>Retry</Text></TouchableOpacity>
          </View>
        )}

        {summaries.length === 0 && !error && !isLoading && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>👶</Text>
            <Text style={styles.emptyTitle}>No kids yet</Text>
            <Text style={styles.emptyBody}>Go to More to add your first child and set up allowances.</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push("/(tabs)/more")}>
              <Text style={styles.emptyBtnTxt}>Set up →</Text>
            </TouchableOpacity>
          </View>
        )}

        {summaries.map(s => (
          <KidCard
            key={s.kid.id}
            s={s}
            onBonus={() => openModal(s.kid.id, "bonus")}
            onPenalty={() => openModal(s.kid.id, "penalty")}
          />
        ))}

        {hasOpenWeek && (
          <TouchableOpacity style={styles.closeWeekRow} onPress={() => router.push("/(tabs)/close")}>
            <Text style={styles.closeWeekTxt}>Close out this week</Text>
            <Text style={styles.closeWeekArrow}>→</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <Modal visible={modal.visible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>
              {modal.type === "bonus" ? "＋ Add bonus" : "－ Remove points"}
            </Text>
            <TextInput style={styles.input} placeholder="Amount ($)" placeholderTextColor={C.mutedForeground} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
            <TextInput style={styles.input} placeholder="Label (optional)" placeholderTextColor={C.mutedForeground} value={label} onChangeText={setLabel} />
            {modal.type === "penalty" && (
              <TextInput style={[styles.input, { minHeight: 60 }]} placeholder="Reason (required)" placeholderTextColor={C.mutedForeground} value={note} onChangeText={setNote} multiline />
            )}
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModal({ visible: false, kidId: null, type: "bonus" })}>
                <Text style={styles.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, modal.type === "penalty" && { backgroundColor: C.negative }]}
                onPress={submit}
                disabled={addEntry.isPending}
              >
                {addEntry.isPending
                  ? <ActivityIndicator color={C.primaryForeground} size="small" />
                  : <Text style={styles.confirmTxt}>Add</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: C.background },
  scroll: { paddingHorizontal: 16, paddingBottom: 110, paddingTop: 4 },

  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, marginTop: 8 },
  greeting: { fontFamily: "Inter_400Regular", fontSize: 14, color: C.mutedForeground },
  householdName: { fontFamily: "Inter_700Bold", fontSize: 24, color: C.foreground, marginTop: 2, letterSpacing: -0.5 },
  weekBadge: { fontFamily: "Inter_500Medium", fontSize: 12, color: C.mutedForeground, backgroundColor: C.surface, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginTop: 6 },

  kidCard: { borderRadius: 20, padding: 18, marginBottom: 14, borderWidth: 1 },
  kidCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  kidIdentity: { flexDirection: "row", alignItems: "center" },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center" },
  avatarTxt: { fontFamily: "Inter_700Bold", fontSize: 20 },
  kidName: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: C.foreground },
  kidWeek: { fontFamily: "Inter_400Regular", fontSize: 11, color: C.mutedForeground, marginTop: 2 },
  todayPill: { backgroundColor: C.surface, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  todayPillTxt: { fontFamily: "Inter_500Medium", fontSize: 13, color: C.foreground },

  balanceRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  balanceNum: { fontFamily: "Inter_700Bold", fontSize: 46, letterSpacing: -1.5, lineHeight: 52 },
  closedBadge: { backgroundColor: C.surface, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: "flex-end", marginBottom: 8 },
  closedBadgeTxt: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: C.mutedForeground, letterSpacing: 0.8 },
  balanceSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: C.mutedForeground, marginBottom: 14 },

  choreProgressRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  choreBar: { flex: 1, height: 4, backgroundColor: C.border, borderRadius: 2, overflow: "hidden" },
  choreBarFill: { height: 4, borderRadius: 2 },
  choreLabel: { fontFamily: "Inter_400Regular", fontSize: 12, color: C.mutedForeground },

  goalRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border },
  goalDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.accent },
  goalText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, color: C.mutedForeground },
  goalMiniBar: { width: 50, height: 4, backgroundColor: C.border, borderRadius: 2, overflow: "hidden" },
  goalMiniFill: { height: 4, borderRadius: 2 },

  actionRow: { flexDirection: "row", gap: 8 },
  actionPill: { flex: 1, backgroundColor: C.positive + "18", paddingVertical: 10, borderRadius: 12, alignItems: "center", borderWidth: 1, borderColor: C.positive + "40" },
  actionPillRed: { backgroundColor: C.negative + "14", borderColor: C.negative + "40" },
  actionPillTxt: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: C.positive },

  closeWeekRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: C.primary, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 16, marginTop: 4 },
  closeWeekTxt: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: C.primaryForeground },
  closeWeekArrow: { fontFamily: "Inter_700Bold", fontSize: 18, color: C.primaryForeground },

  emptyCard: { backgroundColor: C.card, borderRadius: 20, padding: 32, alignItems: "center", borderWidth: 1, borderColor: C.border, marginTop: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontFamily: "Inter_700Bold", fontSize: 20, color: C.foreground, marginBottom: 6 },
  emptyBody: { fontFamily: "Inter_400Regular", fontSize: 14, color: C.mutedForeground, textAlign: "center", lineHeight: 20 },
  emptyBtn: { marginTop: 20, backgroundColor: C.primary, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12 },
  emptyBtnTxt: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: C.primaryForeground },

  errorCard: { backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.negative },
  errorTxt: { fontFamily: "Inter_400Regular", color: C.negative, marginBottom: 8 },
  link: { fontFamily: "Inter_600SemiBold", color: C.primary, fontSize: 14 },

  modalOverlay: { flex: 1, backgroundColor: "#000000bb", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 48 },
  modalHandle: { width: 36, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: "center", marginBottom: 20 },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 20, color: C.foreground, marginBottom: 18 },
  input: { backgroundColor: C.input, color: C.foreground, fontFamily: "Inter_400Regular", borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, marginBottom: 12 },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, backgroundColor: C.surface, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  cancelTxt: { fontFamily: "Inter_600SemiBold", color: C.mutedForeground, fontSize: 15 },
  confirmBtn: { flex: 1, backgroundColor: C.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  confirmTxt: { fontFamily: "Inter_600SemiBold", color: C.primaryForeground, fontSize: 15 },
});
