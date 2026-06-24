import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, ActivityIndicator, Alert,
} from "react-native";
import { apiGet, apiPost, centsToDisplay } from "@/lib/api";
import colors from "@/constants/colors";

const C = colors.light;

type Kid = { id: number; name: string; color: string };
type Goal = { id: number; name: string; targetCents: number; savedCents: number; completedAt: string | null };
type Wallet = { savedBalanceCents: number; spendBalanceCents: number };

export default function GoalsModal({ kid, visible, onClose }: { kid: Kid | null; visible: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const enabled = !!kid && visible;

  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [applyGoalId, setApplyGoalId] = useState<number | null>(null);
  const [applyAmount, setApplyAmount] = useState("");

  const { data: goals = [] } = useQuery<Goal[]>({
    queryKey: ["goals", kid?.id],
    queryFn: () => apiGet(`/kids/${kid!.id}/goals`),
    enabled,
  });
  const { data: wallet } = useQuery<Wallet>({
    queryKey: ["wallet", kid?.id],
    queryFn: () => apiGet(`/kids/${kid!.id}/wallet`),
    enabled,
  });

  const saved = wallet?.savedBalanceCents ?? 0;
  const allocated = goals.reduce((s, g) => s + g.savedCents, 0);
  const unallocated = Math.max(0, saved - allocated);

  const activeGoals = goals.filter(g => !g.completedAt);
  const completedGoals = goals.filter(g => !!g.completedAt);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["goals", kid?.id] });
    qc.invalidateQueries({ queryKey: ["wallet", kid?.id] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const resetNew = () => { setShowNew(false); setName(""); setTarget(""); };
  const resetApply = () => { setApplyGoalId(null); setApplyAmount(""); };

  const handleClose = () => { resetNew(); resetApply(); onClose(); };

  const createGoal = useMutation({
    mutationFn: (body: object) => apiPost("/goals", body),
    onSuccess: () => { refresh(); resetNew(); },
    onError: (e: any) => Alert.alert("Couldn't add goal", e?.message ?? "Please try again."),
  });

  const contribute = useMutation({
    mutationFn: ({ goalId, amountCents }: { goalId: number; amountCents: number }) =>
      apiPost<{ appliedCents: number }>(`/goals/${goalId}/contribute`, { amountCents }),
    onSuccess: (data) => {
      refresh();
      resetApply();
      Alert.alert("Applied", `${centsToDisplay(data.appliedCents)} added toward this goal.`);
    },
    onError: (e: any) => Alert.alert("Couldn't apply savings", e?.message ?? "Please try again."),
  });

  const handleCreateGoal = () => {
    if (!kid) return;
    if (!name.trim()) { Alert.alert("Name is required"); return; }
    const cents = Math.round(parseFloat(target) * 100);
    if (!cents || isNaN(cents) || cents <= 0) { Alert.alert("Enter a valid target amount"); return; }
    createGoal.mutate({ kidId: kid.id, name: name.trim(), targetCents: cents });
  };

  const handleApply = (goal: Goal) => {
    const remaining = goal.targetCents - goal.savedCents;
    const max = Math.min(unallocated, remaining);
    const cents = Math.round(parseFloat(applyAmount) * 100);
    if (!cents || isNaN(cents) || cents <= 0) { Alert.alert("Enter a valid amount"); return; }
    if (cents > max) {
      Alert.alert("Too much", `You can apply up to ${centsToDisplay(max)} to this goal.`);
      return;
    }
    contribute.mutate({ goalId: goal.id, amountCents: cents });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{kid ? `${kid.name}'s goals` : "Goals"}</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={10}>
              <Text style={styles.close}>Done</Text>
            </TouchableOpacity>
          </View>

          {/* Savings summary */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>SAVED</Text>
              <Text style={[styles.summaryAmt, { color: C.positive }]}>{centsToDisplay(saved)}</Text>
            </View>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>TO ASSIGN</Text>
              <Text style={[styles.summaryAmt, { color: unallocated > 0 ? C.primary : C.mutedForeground }]}>
                {centsToDisplay(unallocated)}
              </Text>
            </View>
          </View>

          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingBottom: 8 }}>
            {activeGoals.length === 0 && !showNew && (
              <Text style={styles.empty}>No goals yet. Add one below.</Text>
            )}

            {activeGoals.map(goal => {
              const remaining = goal.targetCents - goal.savedCents;
              const pct = Math.min(1, goal.savedCents / goal.targetCents);
              const max = Math.min(unallocated, remaining);
              const isApplying = applyGoalId === goal.id;
              return (
                <View key={goal.id} style={[styles.goalCard, { borderLeftColor: kid?.color ?? C.primary, borderLeftWidth: 3 }]}>
                  <View style={styles.goalHead}>
                    <Text style={styles.goalName}>{goal.name}</Text>
                    <Text style={styles.goalRemaining}>{centsToDisplay(remaining)} to go</Text>
                  </View>
                  <View style={styles.progressBg}>
                    <View style={[styles.progressFill, { width: `${pct * 100}%` as any, backgroundColor: kid?.color ?? C.primary }]} />
                  </View>
                  <Text style={styles.goalProgress}>
                    {centsToDisplay(goal.savedCents)} of {centsToDisplay(goal.targetCents)}
                  </Text>

                  {isApplying ? (
                    <View style={styles.applyRow}>
                      <TextInput
                        style={styles.applyInput}
                        placeholder={`$ up to ${centsToDisplay(max)}`}
                        placeholderTextColor={C.mutedForeground}
                        value={applyAmount}
                        onChangeText={setApplyAmount}
                        keyboardType="decimal-pad"
                        autoFocus
                      />
                      <TouchableOpacity style={styles.applyCancel} onPress={resetApply}>
                        <Text style={styles.applyCancelTxt}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.applyConfirm, contribute.isPending && { opacity: 0.6 }]}
                        onPress={() => handleApply(goal)}
                        disabled={contribute.isPending}
                      >
                        {contribute.isPending
                          ? <ActivityIndicator color={C.primaryForeground} size="small" />
                          : <Text style={styles.applyConfirmTxt}>Add</Text>}
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.applyBtn, max <= 0 && styles.applyBtnDisabled]}
                      onPress={() => { setApplyAmount(""); setApplyGoalId(goal.id); }}
                      disabled={max <= 0}
                    >
                      <Text style={[styles.applyBtnTxt, max <= 0 && { color: C.mutedForeground }]}>
                        {max <= 0 ? (unallocated <= 0 ? "No savings to assign" : "Goal funded") : "Apply savings"}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}

            {/* New goal form */}
            {showNew ? (
              <View style={styles.newCard}>
                <TextInput
                  style={styles.input}
                  placeholder="What for? (e.g. Skateboard)"
                  placeholderTextColor={C.mutedForeground}
                  value={name}
                  onChangeText={setName}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Target amount ($)"
                  placeholderTextColor={C.mutedForeground}
                  value={target}
                  onChangeText={setTarget}
                  keyboardType="decimal-pad"
                />
                <View style={styles.newBtns}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={resetNew}>
                    <Text style={styles.cancelTxt}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.confirmBtn} onPress={handleCreateGoal} disabled={createGoal.isPending}>
                    {createGoal.isPending
                      ? <ActivityIndicator color={C.primaryForeground} size="small" />
                      : <Text style={styles.confirmTxt}>Save goal</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={styles.newGoalBtn} onPress={() => setShowNew(true)}>
                <Text style={styles.newGoalBtnTxt}>+ New goal</Text>
              </TouchableOpacity>
            )}

            {completedGoals.length > 0 && (
              <View style={styles.completedSection}>
                <Text style={styles.completedTitle}>COMPLETED</Text>
                {completedGoals.map(g => (
                  <View key={g.id} style={styles.completedRow}>
                    <Text style={styles.completedName}>★ {g.name}</Text>
                    <Text style={styles.completedAmt}>{centsToDisplay(g.targetCents)}</Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "#00000099", justifyContent: "flex-end" },
  card: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { fontFamily: "Inter_700Bold", fontSize: 18, color: C.foreground },
  close: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: C.primary },

  summaryRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  summaryBox: { flex: 1, backgroundColor: C.background, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border },
  summaryLabel: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: C.mutedForeground, letterSpacing: 1.2, marginBottom: 6 },
  summaryAmt: { fontFamily: "Inter_700Bold", fontSize: 22, letterSpacing: -0.5 },

  empty: { fontFamily: "Inter_400Regular", fontSize: 14, color: C.mutedForeground, paddingVertical: 12 },

  goalCard: { backgroundColor: C.background, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  goalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 },
  goalName: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: C.foreground },
  goalRemaining: { fontFamily: "Inter_400Regular", fontSize: 13, color: C.mutedForeground },
  progressBg: { height: 6, backgroundColor: C.border, borderRadius: 3, overflow: "hidden", marginBottom: 6 },
  progressFill: { height: 6, borderRadius: 3 },
  goalProgress: { fontFamily: "Inter_400Regular", fontSize: 12, color: C.mutedForeground, marginBottom: 12 },

  applyBtn: { backgroundColor: C.primary + "14", borderRadius: 10, paddingVertical: 11, alignItems: "center" },
  applyBtnDisabled: { backgroundColor: C.surface },
  applyBtnTxt: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: C.primary },

  applyRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  applyInput: { flex: 1, backgroundColor: C.card, color: C.foreground, fontFamily: "Inter_400Regular", borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  applyCancel: { paddingHorizontal: 12, paddingVertical: 10 },
  applyCancelTxt: { fontFamily: "Inter_500Medium", fontSize: 14, color: C.mutedForeground },
  applyConfirm: { backgroundColor: C.primary, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 11, alignItems: "center", minWidth: 64 },
  applyConfirmTxt: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: C.primaryForeground },

  newCard: { backgroundColor: C.background, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 12 },
  input: { backgroundColor: C.card, color: C.foreground, fontFamily: "Inter_400Regular", borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12 },
  newBtns: { flexDirection: "row", gap: 10 },
  cancelBtn: { flex: 1, backgroundColor: C.surface, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  cancelTxt: { fontFamily: "Inter_600SemiBold", color: C.mutedForeground, fontSize: 15 },
  confirmBtn: { flex: 1, backgroundColor: C.primary, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  confirmTxt: { fontFamily: "Inter_600SemiBold", color: C.primaryForeground, fontSize: 15 },

  newGoalBtn: { backgroundColor: C.background, borderRadius: 12, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: C.primary + "60", marginBottom: 12 },
  newGoalBtnTxt: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: C.primary },

  completedSection: { marginTop: 4 },
  completedTitle: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: C.mutedForeground, letterSpacing: 1.2, marginBottom: 8 },
  completedRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.border },
  completedName: { fontFamily: "Inter_500Medium", fontSize: 14, color: C.mutedForeground },
  completedAmt: { fontFamily: "Inter_400Regular", fontSize: 14, color: C.mutedForeground },
});
