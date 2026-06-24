import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity,
  ActivityIndicator, Alert, Modal, TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiGet, apiPost, apiDelete, centsToDisplay } from "@/lib/api";
import colors from "@/constants/colors";

const C = colors.light;

type Kid = { id: number; name: string; color: string; baseAllowanceCents: number };
type Chore = { id: number; name: string; valueCents: number; active: boolean; kidIds: number[] };
type Entry = {
  id: number; weekId: number; kidId: number; type: string;
  amountCents: number; label: string; note: string | null;
  createdByName: string | null; createdAt: string;
};
type WeekDetail = {
  id: number; kidId: number; kidName: string; kidColor: string;
  startDate: string; endDate: string; openingBalanceCents: number;
  runningTotalCents: number; status: string; entries: Entry[];
};
type WeekSummary = {
  id: number; kidId: number; kidName: string; runningTotalCents: number;
  openingBalanceCents: number; status: string; startDate: string; endDate: string;
  choresDone: number; choresMissed: number;
};

const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function today() { return new Date().toISOString().slice(0, 10); }

function formatDayHeader(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return `${DOW[d.getDay()]} · ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

type ChoreState = "done" | "missed" | "none";

export default function TrackerScreen() {
  const params = useLocalSearchParams<{ kidId?: string }>();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedKidId, setSelectedKidId] = useState<number | null>(
    params.kidId ? parseInt(params.kidId) : null
  );
  const [bonusModal, setBonusModal] = useState(false);
  const [penaltyModal, setPenaltyModal] = useState(false);
  const [amount, setAmount] = useState("");
  const [entryLabel, setEntryLabel] = useState("");
  const [penaltyNote, setPenaltyNote] = useState("");

  const { data: kids = [] } = useQuery<Kid[]>({
    queryKey: ["kids"],
    queryFn: () => apiGet("/kids"),
  });

  const { data: chores = [] } = useQuery<Chore[]>({
    queryKey: ["chores"],
    queryFn: () => apiGet("/chores"),
  });

  const activeKid = selectedKidId ? kids.find(k => k.id === selectedKidId) ?? kids[0] : kids[0];
  const kidId = activeKid?.id;

  const { data: currentWeeks = [], refetch: refetchWeeks } = useQuery<WeekSummary[]>({
    queryKey: ["weeks", "current"],
    queryFn: () => apiGet("/weeks/current"),
    enabled: kids.length > 0,
  });

  const currentWeek = currentWeeks.find(w => w.kidId === kidId);

  const { data: weekDetail, refetch: refetchDetail } = useQuery<WeekDetail>({
    queryKey: ["week", currentWeek?.id],
    queryFn: () => apiGet(`/weeks/${currentWeek!.id}`),
    enabled: !!currentWeek?.id,
  });

  const addEntry = useMutation({
    mutationFn: (body: object) => apiPost("/entries", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["weeks"] });
      qc.invalidateQueries({ queryKey: ["week"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const deleteEntry = useMutation({
    mutationFn: (id: number) => apiDelete(`/entries/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["weeks"] });
      qc.invalidateQueries({ queryKey: ["week"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const todayStr = today();
  const todayEntries = (weekDetail?.entries ?? []).filter(e => e.createdAt.slice(0, 10) === todayStr);
  const dayNet = todayEntries.reduce((sum, e) => sum + e.amountCents, 0);

  const kidChores = chores.filter(
    c => c.active && (!c.kidIds.length || c.kidIds.includes(kidId ?? 0))
  );

  const choreState = (chore: Chore): ChoreState => {
    const match = todayEntries.find(e => e.label === chore.name);
    if (!match) return "none";
    return match.type === "chore_done" ? "done" : "missed";
  };

  const todayExtras = todayEntries.filter(e => e.type === "bonus" || e.type === "penalty");

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchWeeks(), refetchDetail()]);
    setRefreshing(false);
  };

  const handleChore = (chore: Chore, type: "chore_done" | "chore_missed") => {
    const existing = todayEntries.find(e => e.label === chore.name);
    if (existing) {
      deleteEntry.mutate(existing.id);
      return;
    }
    addEntry.mutate({ kidId, type, amountCents: Math.abs(chore.valueCents), label: chore.name });
  };

  const handleBonus = () => {
    const cents = Math.round(parseFloat(amount) * 100);
    if (!cents || isNaN(cents)) { Alert.alert("Enter a valid amount"); return; }
    addEntry.mutate({ kidId, type: "bonus", amountCents: cents, label: entryLabel.trim() || "Bonus" });
    setAmount(""); setEntryLabel(""); setBonusModal(false);
  };

  const handlePenalty = () => {
    if (!penaltyNote.trim()) { Alert.alert("A reason is required"); return; }
    const cents = Math.round(parseFloat(amount) * 100);
    if (!cents || isNaN(cents)) { Alert.alert("Enter a valid amount"); return; }
    addEntry.mutate({ kidId, type: "penalty", amountCents: cents, label: entryLabel.trim() || "Penalty", note: penaltyNote.trim() });
    setAmount(""); setEntryLabel(""); setPenaltyNote(""); setPenaltyModal(false);
  };

  if (!kids.length) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>No kids yet</Text>
        <Text style={styles.emptyBody}>Add kids in More → Kids first.</Text>
      </View>
    );
  }

  const isOpen = currentWeek?.status !== "closed";

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      {/* Kid selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.kidScroll}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10 }}
      >
        {kids.map(k => (
          <TouchableOpacity
            key={k.id}
            style={[styles.kidPill, kidId === k.id && { backgroundColor: k.color }]}
            onPress={() => setSelectedKidId(k.id)}
          >
            <Text style={[styles.kidPillTxt, kidId === k.id && { color: C.primaryForeground }]}>
              {k.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
      >
        {/* Day header + net */}
        {currentWeek && (
          <View style={styles.dayHeader}>
            <Text style={styles.dayLabel}>{formatDayHeader(todayStr)}</Text>
            <View style={styles.dayNetPill}>
              <Text style={styles.dayNetLabel}>day net</Text>
              <Text style={[styles.dayNet, { color: dayNet >= 0 ? C.positive : C.negative }]}>
                {dayNet >= 0 ? "+" : ""}{centsToDisplay(dayNet)}
              </Text>
            </View>
          </View>
        )}

        {/* Week total banner */}
        {currentWeek && (
          <View style={styles.weekBanner}>
            <Text style={styles.weekBannerLabel}>
              {currentWeek.startDate.slice(5)} – {currentWeek.endDate.slice(5)}
              {!isOpen ? " · closed" : ""}
            </Text>
            <Text style={[styles.weekBannerTotal, { color: (currentWeek.runningTotalCents ?? 0) >= 0 ? C.positive : C.negative }]}>
              {centsToDisplay(currentWeek.runningTotalCents)}
            </Text>
          </View>
        )}

        {/* Chores */}
        {isOpen && (
          <>
            <Text style={styles.sectionTitle}>REGULAR CHORES</Text>
            {kidChores.length === 0 && (
              <Text style={styles.emptyBody}>No chores assigned — add them in More → Chores.</Text>
            )}
            {kidChores.map(chore => {
              const state = choreState(chore);
              return (
                <View key={chore.id} style={styles.choreRow}>
                  {/* State indicator */}
                  <View style={[styles.stateBox, state === "done" && styles.stateBoxDone, state === "missed" && styles.stateBoxMissed]}>
                    <Text style={[styles.stateIcon, state === "done" && { color: C.positive }, state === "missed" && { color: C.negative }]}>
                      {state === "done" ? "✓" : state === "missed" ? "✗" : " "}
                    </Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.choreName, state !== "none" && { color: C.mutedForeground }]}>
                      {chore.name}
                      {state === "missed" ? " · missed" : ""}
                    </Text>
                    <Text style={[styles.choreAmt, { color: state === "done" ? C.positive : state === "missed" ? C.negative : C.mutedForeground }]}>
                      {state === "missed" ? "−" : "+"}{centsToDisplay(chore.valueCents)}
                    </Text>
                  </View>
                  {state === "none" && (
                    <View style={styles.choreButtons}>
                      <TouchableOpacity
                        style={styles.doneBtn}
                        onPress={() => handleChore(chore, "chore_done")}
                      >
                        <Text style={styles.doneBtnTxt}>Done</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.missBtn}
                        onPress={() => handleChore(chore, "chore_missed")}
                      >
                        <Text style={styles.missBtnTxt}>Miss</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {state !== "none" && (
                    <TouchableOpacity
                      onPress={() => {
                        const e = todayEntries.find(e => e.label === chore.name);
                        if (e) deleteEntry.mutate(e.id);
                      }}
                      style={styles.undoBtn}
                    >
                      <Text style={styles.undoBtnTxt}>Undo</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </>
        )}

        {/* Today's extras */}
        {todayExtras.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>TODAY'S EXTRAS</Text>
            {todayExtras.map(e => (
              <TouchableOpacity
                key={e.id}
                style={styles.extraRow}
                onLongPress={() => Alert.alert("Delete entry?", e.label, [
                  { text: "Cancel" },
                  { text: "Delete", style: "destructive", onPress: () => deleteEntry.mutate(e.id) },
                ])}
              >
                <Text style={styles.extraLabel}>
                  {e.label}
                  {e.createdByName ? ` · ${e.createdByName}` : ""}
                </Text>
                {e.note ? <Text style={styles.extraNote}>{e.note}</Text> : null}
                <Text style={[styles.extraAmt, { color: e.amountCents >= 0 ? C.positive : C.negative }]}>
                  {e.amountCents >= 0 ? "+" : ""}{centsToDisplay(e.amountCents)}
                </Text>
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* Previous entries */}
        {(weekDetail?.entries ?? []).filter(e => e.createdAt.slice(0,10) !== todayStr).length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>EARLIER THIS WEEK</Text>
            {[...(weekDetail?.entries ?? [])].filter(e => e.createdAt.slice(0,10) !== todayStr).reverse().map(e => (
              <TouchableOpacity
                key={e.id}
                style={styles.extraRow}
                onLongPress={() => Alert.alert("Delete entry?", e.label, [
                  { text: "Cancel" },
                  { text: "Delete", style: "destructive", onPress: () => deleteEntry.mutate(e.id) },
                ])}
              >
                <Text style={styles.extraLabel}>{e.label}</Text>
                <Text style={[styles.extraAmt, { color: e.amountCents >= 0 ? C.positive : C.negative }]}>
                  {e.amountCents >= 0 ? "+" : ""}{centsToDisplay(e.amountCents)}
                </Text>
              </TouchableOpacity>
            ))}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Sticky bottom actions */}
      {isOpen && (
        <View style={styles.stickyBottom}>
          <TouchableOpacity
            style={styles.bottomBonus}
            onPress={() => { setAmount(""); setEntryLabel(""); setBonusModal(true); }}
          >
            <Text style={styles.bottomBonusTxt}>+ Add bonus</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.bottomPenalty}
            onPress={() => { setAmount(""); setEntryLabel(""); setPenaltyNote(""); setPenaltyModal(true); }}
          >
            <Text style={styles.bottomPenaltyTxt}>– Remove points</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Bonus modal */}
      <Modal visible={bonusModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add bonus</Text>
            <TextInput style={styles.input} placeholder="Amount ($)" placeholderTextColor={C.mutedForeground} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
            <TextInput style={styles.input} placeholder="Label (optional)" placeholderTextColor={C.mutedForeground} value={entryLabel} onChangeText={setEntryLabel} />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setBonusModal(false)}>
                <Text style={styles.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleBonus}>
                <Text style={styles.confirmTxt}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Penalty modal */}
      <Modal visible={penaltyModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Remove points</Text>
            <TextInput style={styles.input} placeholder="Amount ($)" placeholderTextColor={C.mutedForeground} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
            <TextInput style={styles.input} placeholder="Label (optional)" placeholderTextColor={C.mutedForeground} value={entryLabel} onChangeText={setEntryLabel} />
            <TextInput style={[styles.input, { minHeight: 60 }]} placeholder="Reason — why are points removed? (required)" placeholderTextColor={C.mutedForeground} value={penaltyNote} onChangeText={setPenaltyNote} multiline />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setPenaltyModal(false)}>
                <Text style={styles.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: C.negative }]} onPress={handlePenalty}>
                <Text style={styles.confirmTxt}>Remove</Text>
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
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: C.background, padding: 24 },
  kidScroll: { backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
  kidPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginRight: 8, backgroundColor: C.surface },
  kidPillTxt: { fontFamily: "Inter_500Medium", fontSize: 14, color: C.foreground },
  scroll: { padding: 16 },

  dayHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  dayLabel: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: C.foreground },
  dayNetPill: { alignItems: "flex-end" },
  dayNetLabel: { fontFamily: "Inter_400Regular", fontSize: 10, color: C.mutedForeground, letterSpacing: 0.6 },
  dayNet: { fontFamily: "Inter_700Bold", fontSize: 22 },

  weekBanner: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: C.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 20 },
  weekBannerLabel: { fontFamily: "Inter_400Regular", fontSize: 12, color: C.mutedForeground },
  weekBannerTotal: { fontFamily: "Inter_700Bold", fontSize: 18 },

  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: C.mutedForeground, letterSpacing: 1.2, marginBottom: 10 },
  choreRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  stateBox: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: C.border, justifyContent: "center", alignItems: "center" },
  stateBoxDone: { backgroundColor: C.positive + "20", borderColor: C.positive },
  stateBoxMissed: { backgroundColor: C.negative + "20", borderColor: C.negative },
  stateIcon: { fontFamily: "Inter_700Bold", fontSize: 14, color: C.mutedForeground },
  choreName: { fontFamily: "Inter_500Medium", fontSize: 15, color: C.foreground },
  choreAmt: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  choreButtons: { flexDirection: "row", gap: 6 },
  doneBtn: { backgroundColor: C.positive + "20", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  doneBtnTxt: { fontFamily: "Inter_600SemiBold", color: C.positive, fontSize: 13 },
  missBtn: { backgroundColor: C.negative + "20", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  missBtnTxt: { fontFamily: "Inter_600SemiBold", color: C.negative, fontSize: 13 },
  undoBtn: { backgroundColor: C.surface, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  undoBtnTxt: { fontFamily: "Inter_500Medium", color: C.mutedForeground, fontSize: 13 },

  extraRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  extraLabel: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 14, color: C.foreground },
  extraNote: { fontFamily: "Inter_400Regular", fontSize: 12, color: C.mutedForeground, marginTop: 2 },
  extraAmt: { fontFamily: "Inter_600SemiBold", fontSize: 14 },

  stickyBottom: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", gap: 10, padding: 16, paddingBottom: 32, backgroundColor: C.background, borderTopWidth: 1, borderTopColor: C.border },
  bottomBonus: { flex: 1, backgroundColor: C.positive + "18", paddingVertical: 13, borderRadius: 12, alignItems: "center", borderWidth: 1, borderColor: C.positive + "50" },
  bottomBonusTxt: { fontFamily: "Inter_600SemiBold", color: C.positive, fontSize: 14 },
  bottomPenalty: { flex: 1, backgroundColor: C.negative + "18", paddingVertical: 13, borderRadius: 12, alignItems: "center", borderWidth: 1, borderColor: C.negative + "50" },
  bottomPenaltyTxt: { fontFamily: "Inter_600SemiBold", color: C.negative, fontSize: 14 },

  modalOverlay: { flex: 1, backgroundColor: "#00000099", justifyContent: "flex-end" },
  modalCard: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 44 },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: C.foreground, marginBottom: 16 },
  input: { backgroundColor: C.background, color: C.foreground, fontFamily: "Inter_400Regular", borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12 },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, backgroundColor: C.surface, borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  cancelTxt: { fontFamily: "Inter_600SemiBold", color: C.mutedForeground, fontSize: 15 },
  confirmBtn: { flex: 1, backgroundColor: C.primary, borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  confirmTxt: { fontFamily: "Inter_600SemiBold", color: C.primaryForeground, fontSize: 15 },
  emptyTitle: { fontFamily: "Inter_600SemiBold", fontSize: 17, color: C.foreground, marginBottom: 6 },
  emptyBody: { fontFamily: "Inter_400Regular", fontSize: 13, color: C.mutedForeground, textAlign: "center" },
});
