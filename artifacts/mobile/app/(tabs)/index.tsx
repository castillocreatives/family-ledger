import { useAuth } from "@clerk/expo";
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

type QuickModal = { visible: boolean; kidId: number | null; type: "bonus" | "penalty" };

function fmt(date: string) {
  const [, m, d] = date.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m) - 1]} ${parseInt(d)}`;
}

function KidCard({
  s, onBonus, onPenalty,
}: {
  s: KidSummary;
  onBonus: () => void;
  onPenalty: () => void;
}) {
  const router = useRouter();
  const isPositive = s.currentWeek.runningTotalCents >= 0;
  const isClosed = s.currentWeek.status === "closed";
  const goalPct = s.activeGoal
    ? Math.min(1, s.activeGoal.savedCents / s.activeGoal.targetCents)
    : 0;
  const chorePlusCents = s.currentWeek.netChangeCents > 0 ? s.currentWeek.netChangeCents : 0;
  const choreMinusCents = s.currentWeek.netChangeCents < 0 ? s.currentWeek.netChangeCents : 0;

  return (
    <View style={[styles.kidCard, { borderLeftColor: s.kid.color, borderLeftWidth: 3 }]}>
      {/* Header row */}
      <View style={styles.cardHeader}>
        <View style={[styles.avatar, { backgroundColor: s.kid.color + "25" }]}>
          <Text style={[styles.avatarTxt, { color: s.kid.color }]}>
            {s.kid.name[0].toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.kidName}>{s.kid.name}</Text>
          <Text style={styles.kidBase}>base {centsToDisplay(s.currentWeek.openingBalanceCents)}</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push({ pathname: "/(tabs)/tracker", params: { kidId: String(s.kid.id) } })}
          style={styles.todayBtn}
        >
          <Text style={styles.todayBtnTxt}>Today ›</Text>
        </TouchableOpacity>
      </View>

      {/* Big running total */}
      <Text style={[styles.bigTotal, { color: isPositive ? C.positive : C.negative }]}>
        {centsToDisplay(s.currentWeek.runningTotalCents)}
      </Text>
      <Text style={styles.totalSub}>
        {isPositive
          ? `+${centsToDisplay(s.currentWeek.netChangeCents)} this week`
          : isClosed ? "week closed" : "rolls over if < 0"}
      </Text>

      {/* Chore progress */}
      <Text style={styles.choreStats}>
        chores {s.currentWeek.choresDone}/{s.currentWeek.totalChores}
        {chorePlusCents > 0 ? ` · +${centsToDisplay(chorePlusCents)}` : ""}
        {choreMinusCents < 0 ? ` / ${centsToDisplay(choreMinusCents)}` : ""}
      </Text>

      {/* Goal bar */}
      {s.activeGoal && (
        <TouchableOpacity
          style={styles.goalBlock}
          onPress={() => router.push({ pathname: "/kid/[kidId]/money", params: { kidId: String(s.kid.id) } } as any)}
        >
          <View style={styles.goalLabelRow}>
            <Text style={styles.goalName}>{s.activeGoal.name}</Text>
            <Text style={styles.goalAmt}>
              {centsToDisplay(s.activeGoal.savedCents)} / {centsToDisplay(s.activeGoal.targetCents)}
            </Text>
          </View>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${goalPct * 100}%` as any, backgroundColor: s.kid.color }]} />
          </View>
        </TouchableOpacity>
      )}

      {/* Quick actions */}
      {!isClosed && (
        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.bonusBtn} onPress={onBonus}>
            <Text style={styles.bonusBtnTxt}>+ Bonus</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.penaltyBtn} onPress={onPenalty}>
            <Text style={styles.penaltyBtnTxt}>– Points</Text>
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
  const [modal, setModal] = useState<QuickModal>({ visible: false, kidId: null, type: "bonus" });
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
      closeModal();
    },
    onError: (e: any) => Alert.alert("Error", e.message),
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const openModal = (kidId: number, type: "bonus" | "penalty") => {
    setAmount(""); setLabel(""); setNote("");
    setModal({ visible: true, kidId, type });
  };

  const closeModal = () => setModal({ visible: false, kidId: null, type: "bonus" });

  const handleSubmit = () => {
    const cents = Math.round(parseFloat(amount) * 100);
    if (!cents || isNaN(cents)) { Alert.alert("Enter a valid amount"); return; }
    if (modal.type === "penalty" && !note.trim()) { Alert.alert("A reason is required"); return; }
    addEntry.mutate({
      kidId: modal.kidId,
      type: modal.type,
      amountCents: cents,
      label: label.trim() || (modal.type === "bonus" ? "Bonus" : "Penalty"),
      note: note.trim() || undefined,
    });
  };

  const kidSummaries = data?.kidSummaries ?? [];
  const hasOpenWeeks = kidSummaries.some(s => s.currentWeek.status !== "closed");

  const weekRange = kidSummaries[0]
    ? `${fmt(kidSummaries[0].currentWeek.startDate)} – ${fmt(kidSummaries[0].currentWeek.endDate)}`
    : "";

  if (isLoading && !data) {
    return <View style={styles.center}><ActivityIndicator color={C.primary} size="large" /></View>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
      >
        {/* Week header */}
        <View style={styles.weekHeader}>
          <Text style={styles.weekTitle}>THIS WEEK</Text>
          {weekRange ? <Text style={styles.weekRange}>{weekRange}</Text> : null}
        </View>

        {error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorTxt}>{(error as Error).message}</Text>
            <TouchableOpacity onPress={() => refetch()}><Text style={styles.link}>Retry</Text></TouchableOpacity>
          </View>
        )}

        {kidSummaries.length === 0 && !error && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No kids yet</Text>
            <Text style={styles.emptyBody}>Go to More → Kids to add your first child.</Text>
          </View>
        )}

        {kidSummaries.map(s => (
          <KidCard
            key={s.kid.id}
            s={s}
            onBonus={() => openModal(s.kid.id, "bonus")}
            onPenalty={() => openModal(s.kid.id, "penalty")}
          />
        ))}

        {hasOpenWeeks && (
          <TouchableOpacity
            style={styles.closeWeekBtn}
            onPress={() => router.push("/(tabs)/close")}
          >
            <Text style={styles.closeWeekBtnTxt}>Close out week →</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Quick entry modal */}
      <Modal visible={modal.visible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {modal.type === "bonus" ? "+ Add bonus" : "– Remove points"}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Amount ($)"
              placeholderTextColor={C.mutedForeground}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
            />
            <TextInput
              style={styles.input}
              placeholder={modal.type === "bonus" ? "Label (optional)" : "Label (optional)"}
              placeholderTextColor={C.mutedForeground}
              value={label}
              onChangeText={setLabel}
            />
            {modal.type === "penalty" && (
              <TextInput
                style={[styles.input, { minHeight: 60 }]}
                placeholder="Reason (required)"
                placeholderTextColor={C.mutedForeground}
                value={note}
                onChangeText={setNote}
                multiline
              />
            )}
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeModal}>
                <Text style={styles.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, modal.type === "penalty" && { backgroundColor: C.negative }]}
                onPress={handleSubmit}
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
  scroll: { padding: 16, paddingBottom: 120 },

  weekHeader: { marginBottom: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  weekTitle: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 11, color: C.mutedForeground, letterSpacing: 1.4 },
  weekRange: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 22, color: C.foreground, marginTop: 2 },

  kidCard: { backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: C.border },
  cardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center" },
  avatarTxt: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 18 },
  kidName: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 16, color: C.foreground },
  kidBase: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 12, color: C.mutedForeground, marginTop: 1 },
  todayBtn: { backgroundColor: C.surface, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  todayBtnTxt: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 13, color: C.primary },

  bigTotal: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 40, lineHeight: 46, letterSpacing: -1 },
  totalSub: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 13, color: C.mutedForeground, marginTop: 2 },
  choreStats: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 12, color: C.mutedForeground, marginTop: 6 },

  goalBlock: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border },
  goalLabelRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  goalName: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 12, color: C.mutedForeground },
  goalAmt: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 12, color: C.mutedForeground },
  progressBg: { height: 5, backgroundColor: C.border, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 5, borderRadius: 3 },

  quickActions: { flexDirection: "row", gap: 8, marginTop: 14 },
  bonusBtn: { flex: 1, backgroundColor: C.positive + "18", paddingVertical: 9, borderRadius: 10, alignItems: "center", borderWidth: 1, borderColor: C.positive + "40" },
  bonusBtnTxt: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 13, color: C.positive },
  penaltyBtn: { flex: 1, backgroundColor: C.negative + "18", paddingVertical: 9, borderRadius: 10, alignItems: "center", borderWidth: 1, borderColor: C.negative + "40" },
  penaltyBtnTxt: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 13, color: C.negative },

  closeWeekBtn: { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 4 },
  closeWeekBtnTxt: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 16, color: C.primaryForeground },

  emptyCard: { backgroundColor: C.card, borderRadius: 14, padding: 24, alignItems: "center", borderWidth: 1, borderColor: C.border },
  emptyTitle: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 17, color: C.foreground, marginBottom: 6 },
  emptyBody: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 13, color: C.mutedForeground, textAlign: "center" },
  errorCard: { backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.negative },
  errorTxt: { fontFamily: "SpaceGrotesk_400Regular", color: C.negative, marginBottom: 8 },
  link: { fontFamily: "SpaceGrotesk_600SemiBold", color: C.primary, fontSize: 14 },

  modalOverlay: { flex: 1, backgroundColor: "#00000099", justifyContent: "flex-end" },
  modalCard: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 44 },
  modalTitle: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 18, color: C.foreground, marginBottom: 16 },
  input: { backgroundColor: C.background, color: C.foreground, fontFamily: "SpaceGrotesk_400Regular", borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12 },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, backgroundColor: C.surface, borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  cancelTxt: { fontFamily: "SpaceGrotesk_600SemiBold", color: C.mutedForeground, fontSize: 15 },
  confirmBtn: { flex: 1, backgroundColor: C.primary, borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  confirmTxt: { fontFamily: "SpaceGrotesk_600SemiBold", color: C.primaryForeground, fontSize: 15 },
});
