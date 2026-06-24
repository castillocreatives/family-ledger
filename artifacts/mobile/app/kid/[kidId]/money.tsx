import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal, TextInput, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiGet, apiPost, apiPatch, centsToDisplay } from "@/lib/api";
import colors from "@/constants/colors";

const C = colors.light;

type Kid = { id: number; name: string; color: string; baseAllowanceCents: number };
type Wallet = { savedBalanceCents: number; spendBalanceCents: number };
type Goal = { id: number; name: string; targetCents: number; savedCents: number; completedAt: string | null };
type PayoutPlan = { id: number; kidId: number; modeName: number; savePct: number };

const MODE_LABELS = ["Split", "Save all", "Spend all"];

export default function MoneyScreen() {
  const { kidId } = useLocalSearchParams<{ kidId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const id = parseInt(kidId ?? "0");

  const [goalModal, setGoalModal] = useState(false);
  const [planModal, setPlanModal] = useState(false);
  const [goalName, setGoalName] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [planMode, setPlanMode] = useState(0);
  const [planPct, setPlanPct] = useState("70");

  const { data: kid } = useQuery<Kid>({
    queryKey: ["kid", id],
    queryFn: () => apiGet(`/kids/${id}`),
    enabled: !!id,
  });

  const { data: wallet } = useQuery<Wallet>({
    queryKey: ["wallet", id],
    queryFn: () => apiGet(`/kids/${id}/wallet`),
    enabled: !!id,
  });

  const { data: goals = [] } = useQuery<Goal[]>({
    queryKey: ["goals", id],
    queryFn: () => apiGet(`/kids/${id}/goals`),
    enabled: !!id,
  });

  const { data: plan } = useQuery<PayoutPlan>({
    queryKey: ["payout-plan", id],
    queryFn: () => apiGet(`/kids/${id}/payout-plan`),
    enabled: !!id,
  });

  const createGoal = useMutation({
    mutationFn: (body: object) => apiPost("/goals", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals", id] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setGoalName(""); setGoalTarget(""); setGoalModal(false);
    },
    onError: (e: any) => Alert.alert("Error", e.message),
  });

  const updatePlan = useMutation({
    mutationFn: (body: object) => apiPatch(`/kids/${id}/payout-plan`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payout-plan", id] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setPlanModal(false);
    },
    onError: (e: any) => Alert.alert("Error", e.message),
  });

  const handleCreateGoal = () => {
    if (!goalName.trim()) { Alert.alert("Name is required"); return; }
    const cents = Math.round(parseFloat(goalTarget) * 100);
    if (!cents || isNaN(cents)) { Alert.alert("Enter a valid target amount"); return; }
    createGoal.mutate({ kidId: id, name: goalName.trim(), targetCents: cents });
  };

  const handleUpdatePlan = () => {
    const pct = parseInt(planPct);
    if (planMode === 0 && (isNaN(pct) || pct < 0 || pct > 100)) {
      Alert.alert("Enter a percentage between 0 and 100");
      return;
    }
    updatePlan.mutate({ modeName: planMode, savePct: planMode === 0 ? pct : planMode === 1 ? 100 : 0 });
  };

  const activeGoal = goals.find(g => !g.completedAt);
  const completedGoals = goals.filter(g => !!g.completedAt);

  const savedTotal = wallet?.savedBalanceCents ?? 0;
  const spendTotal = wallet?.spendBalanceCents ?? 0;

  const planLabel = plan
    ? plan.modeName === 0
      ? `Save ${plan.savePct}% · Spend ${100 - plan.savePct}%`
      : plan.modeName === 1
      ? "Save all"
      : "Spend all"
    : "—";

  if (!kid) {
    return <View style={styles.center}><ActivityIndicator color={C.primary} /></View>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <Stack.Screen options={{ title: `${kid.name}'s money`, headerShown: true, headerStyle: { backgroundColor: C.background }, headerTintColor: C.foreground, headerTitleStyle: { fontFamily: "Inter_600SemiBold" }, headerShadowVisible: false }} />
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Buckets */}
        <View style={styles.bucketsRow}>
          <View style={[styles.bucket, { borderColor: C.positive + "60" }]}>
            <Text style={styles.bucketLabel}>SAVED</Text>
            <Text style={[styles.bucketAmount, { color: C.positive }]}>{centsToDisplay(savedTotal)}</Text>
          </View>
          <View style={[styles.bucket, { borderColor: C.primary + "60" }]}>
            <Text style={styles.bucketLabel}>TO SPEND</Text>
            <Text style={[styles.bucketAmount, { color: C.primary }]}>{centsToDisplay(spendTotal)}</Text>
          </View>
        </View>

        {/* Active goal */}
        {activeGoal && (() => {
          const pct = Math.min(1, activeGoal.savedCents / activeGoal.targetCents);
          const remaining = activeGoal.targetCents - activeGoal.savedCents;
          return (
            <View style={styles.goalCard}>
              <Text style={styles.sectionTitle}>SAVING FOR</Text>
              <View style={styles.goalHeader}>
                <Text style={styles.goalName}>{activeGoal.name}</Text>
                <Text style={styles.goalRemaining}>{centsToDisplay(remaining)} to go</Text>
              </View>
              <View style={styles.progressBg}>
                <View style={[styles.progressFill, { width: `${pct * 100}%` as any, backgroundColor: kid.color }]} />
              </View>
              <Text style={styles.goalProgress}>
                {centsToDisplay(activeGoal.savedCents)} of {centsToDisplay(activeGoal.targetCents)}
              </Text>
            </View>
          );
        })()}

        {/* No active goal placeholder */}
        {!activeGoal && (
          <View style={styles.goalCard}>
            <Text style={styles.sectionTitle}>SAVING FOR</Text>
            <Text style={styles.emptyGoal}>No active goal — add one below.</Text>
          </View>
        )}

        {/* Payout plan */}
        <View style={styles.planCard}>
          <View style={styles.planRow}>
            <View>
              <Text style={styles.sectionTitle}>WHEN I GET PAID</Text>
              <Text style={styles.planLabel}>{planLabel}</Text>
            </View>
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => {
                if (plan) { setPlanMode(plan.modeName); setPlanPct(String(plan.savePct)); }
                setPlanModal(true);
              }}
            >
              <Text style={styles.editBtnTxt}>edit ›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Add new goal */}
        <TouchableOpacity style={styles.newGoalBtn} onPress={() => { setGoalName(""); setGoalTarget(""); setGoalModal(true); }}>
          <Text style={styles.newGoalBtnTxt}>+ New goal</Text>
        </TouchableOpacity>

        {/* Completed goals */}
        {completedGoals.length > 0 && (
          <View style={styles.completedSection}>
            <Text style={styles.sectionTitle}>COMPLETED GOALS</Text>
            {completedGoals.map(g => (
              <View key={g.id} style={styles.completedRow}>
                <Text style={styles.completedName}>★ {g.name}</Text>
                <Text style={styles.completedAmt}>{centsToDisplay(g.targetCents)}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* New goal modal */}
      <Modal visible={goalModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New goal</Text>
            <TextInput
              style={styles.input}
              placeholder="What for? (e.g. Skateboard)"
              placeholderTextColor={C.mutedForeground}
              value={goalName}
              onChangeText={setGoalName}
            />
            <TextInput
              style={styles.input}
              placeholder="Target amount ($)"
              placeholderTextColor={C.mutedForeground}
              value={goalTarget}
              onChangeText={setGoalTarget}
              keyboardType="decimal-pad"
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setGoalModal(false)}>
                <Text style={styles.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleCreateGoal} disabled={createGoal.isPending}>
                {createGoal.isPending
                  ? <ActivityIndicator color={C.primaryForeground} size="small" />
                  : <Text style={styles.confirmTxt}>Save goal</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit plan modal */}
      <Modal visible={planModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>When I get paid</Text>
            <View style={styles.modeRow}>
              {["Split", "Save all", "Spend all"].map((label, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.modePill, planMode === i && { backgroundColor: C.primary }]}
                  onPress={() => setPlanMode(i)}
                >
                  <Text style={[styles.modePillTxt, planMode === i && { color: C.primaryForeground }]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {planMode === 0 && (
              <View style={styles.splitRow}>
                <Text style={styles.splitLabel}>Save</Text>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder="70"
                  placeholderTextColor={C.mutedForeground}
                  value={planPct}
                  onChangeText={setPlanPct}
                  keyboardType="number-pad"
                />
                <Text style={styles.splitLabel}>%</Text>
              </View>
            )}
            <View style={[styles.modalBtns, { marginTop: 16 }]}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setPlanModal(false)}>
                <Text style={styles.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleUpdatePlan} disabled={updatePlan.isPending}>
                {updatePlan.isPending
                  ? <ActivityIndicator color={C.primaryForeground} size="small" />
                  : <Text style={styles.confirmTxt}>Save</Text>
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

  bucketsRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  bucket: { flex: 1, backgroundColor: C.card, borderRadius: 14, padding: 16, borderWidth: 1 },
  bucketLabel: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: C.mutedForeground, letterSpacing: 1.2, marginBottom: 6 },
  bucketAmount: { fontFamily: "Inter_700Bold", fontSize: 28, letterSpacing: -0.5 },

  goalCard: { backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: C.mutedForeground, letterSpacing: 1.2, marginBottom: 8 },
  goalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 },
  goalName: { fontFamily: "Inter_600SemiBold", fontSize: 17, color: C.foreground },
  goalRemaining: { fontFamily: "Inter_400Regular", fontSize: 13, color: C.mutedForeground },
  progressBg: { height: 6, backgroundColor: C.border, borderRadius: 3, overflow: "hidden", marginBottom: 6 },
  progressFill: { height: 6, borderRadius: 3 },
  goalProgress: { fontFamily: "Inter_400Regular", fontSize: 12, color: C.mutedForeground },
  emptyGoal: { fontFamily: "Inter_400Regular", fontSize: 14, color: C.mutedForeground },

  planCard: { backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: C.border },
  planRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  planLabel: { fontFamily: "Inter_500Medium", fontSize: 16, color: C.foreground },
  editBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: C.surface, borderRadius: 10 },
  editBtnTxt: { fontFamily: "Inter_500Medium", fontSize: 13, color: C.primary },

  newGoalBtn: { backgroundColor: C.card, borderRadius: 14, paddingVertical: 15, alignItems: "center", borderWidth: 1, borderColor: C.primary + "60", marginBottom: 20 },
  newGoalBtnTxt: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: C.primary },

  completedSection: { marginTop: 4 },
  completedRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  completedName: { fontFamily: "Inter_500Medium", fontSize: 14, color: C.mutedForeground },
  completedAmt: { fontFamily: "Inter_400Regular", fontSize: 14, color: C.mutedForeground },

  modalOverlay: { flex: 1, backgroundColor: "#00000099", justifyContent: "flex-end" },
  modalCard: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 44 },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: C.foreground, marginBottom: 16 },
  input: { backgroundColor: C.background, color: C.foreground, fontFamily: "Inter_400Regular", borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12 },
  modalBtns: { flexDirection: "row", gap: 10 },
  cancelBtn: { flex: 1, backgroundColor: C.surface, borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  cancelTxt: { fontFamily: "Inter_600SemiBold", color: C.mutedForeground, fontSize: 15 },
  confirmBtn: { flex: 1, backgroundColor: C.primary, borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  confirmTxt: { fontFamily: "Inter_600SemiBold", color: C.primaryForeground, fontSize: 15 },

  modeRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  modePill: { flex: 1, backgroundColor: C.surface, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  modePillTxt: { fontFamily: "Inter_500Medium", fontSize: 13, color: C.foreground },
  splitRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  splitLabel: { fontFamily: "Inter_500Medium", fontSize: 15, color: C.foreground },
});
