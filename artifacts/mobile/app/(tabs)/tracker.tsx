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

type AddEntryModal = { visible: boolean; kidId: number | null; type: "chore_done" | "chore_missed" | "bonus" | "penalty" };

function EntryItem({ entry, onDelete }: { entry: Entry; onDelete: () => void }) {
  const isPositive = entry.amountCents >= 0;
  const typeLabel: Record<string, string> = {
    chore_done: "✓", chore_missed: "✗", bonus: "+", penalty: "−",
  };
  return (
    <TouchableOpacity
      style={styles.entryRow}
      onLongPress={() => Alert.alert("Delete entry?", entry.label, [
        { text: "Cancel" },
        { text: "Delete", style: "destructive", onPress: onDelete },
      ])}
    >
      <View style={[styles.entryBadge, { backgroundColor: isPositive ? C.positive + "20" : C.negative + "20" }]}>
        <Text style={{ color: isPositive ? C.positive : C.negative, fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 14 }}>
          {typeLabel[entry.type] ?? "·"}
        </Text>
      </View>
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={styles.entryLabel}>{entry.label}</Text>
        {entry.note ? <Text style={styles.entryNote}>{entry.note}</Text> : null}
      </View>
      <Text style={[styles.entryAmt, { color: isPositive ? C.positive : C.negative }]}>
        {centsToDisplay(entry.amountCents)}
      </Text>
    </TouchableOpacity>
  );
}

export default function TrackerScreen() {
  const params = useLocalSearchParams<{ kidId?: string }>();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedKidId, setSelectedKidId] = useState<number | null>(params.kidId ? parseInt(params.kidId) : null);
  const [modal, setModal] = useState<AddEntryModal>({ visible: false, kidId: null, type: "chore_done" });
  const [bonusAmt, setBonusAmt] = useState("");
  const [bonusLabel, setBonusLabel] = useState("");
  const [penaltyAmt, setPenaltyAmt] = useState("");
  const [penaltyLabel, setPenaltyLabel] = useState("");
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

  const kidChores = chores.filter(c => c.active && (!c.kidIds.length || c.kidIds.includes(kidId ?? 0)));

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchWeeks(), refetchDetail()]);
    setRefreshing(false);
  };

  const handleChore = (chore: Chore, type: "chore_done" | "chore_missed") => {
    addEntry.mutate({
      kidId,
      type,
      amountCents: Math.abs(chore.valueCents),
      label: chore.name,
    });
  };

  const handleBonus = () => {
    const cents = Math.round(parseFloat(bonusAmt) * 100);
    if (!cents || isNaN(cents)) { Alert.alert("Enter a valid amount"); return; }
    addEntry.mutate({ kidId, type: "bonus", amountCents: cents, label: bonusLabel || "Bonus" });
    setBonusAmt(""); setBonusLabel("");
    setModal({ ...modal, visible: false });
  };

  const handlePenalty = () => {
    if (!penaltyNote.trim()) { Alert.alert("A reason is required for a penalty"); return; }
    const cents = Math.round(parseFloat(penaltyAmt) * 100);
    if (!cents || isNaN(cents)) { Alert.alert("Enter a valid amount"); return; }
    addEntry.mutate({ kidId, type: "penalty", amountCents: cents, label: penaltyLabel || "Penalty", note: penaltyNote });
    setPenaltyAmt(""); setPenaltyLabel(""); setPenaltyNote("");
    setModal({ ...modal, visible: false });
  };

  if (!kids.length) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>No kids yet</Text>
        <Text style={styles.emptyBody}>Add kids in More → Kids first.</Text>
      </View>
    );
  }

  const isPositive = (currentWeek?.runningTotalCents ?? 0) >= 0;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      {/* Kid selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.kidScroll} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10 }}>
        {kids.map(k => (
          <TouchableOpacity
            key={k.id}
            style={[styles.kidPill, kidId === k.id && { backgroundColor: k.color }]}
            onPress={() => setSelectedKidId(k.id)}
          >
            <Text style={[styles.kidPillTxt, kidId === k.id && { color: C.primaryForeground }]}>{k.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
      >
        {currentWeek && (
          <View style={styles.weekBanner}>
            <View>
              <Text style={styles.weekLabel}>{currentWeek.startDate} – {currentWeek.endDate}</Text>
              <Text style={styles.weekStatus}>{currentWeek.status === "closed" ? "Week closed" : "Week in progress"}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[styles.weekTotal, { color: isPositive ? C.positive : C.negative }]}>
                {centsToDisplay(currentWeek.runningTotalCents)}
              </Text>
              <Text style={styles.weekBase}>/{centsToDisplay(currentWeek.openingBalanceCents)} base</Text>
            </View>
          </View>
        )}

        {currentWeek?.status !== "closed" && (
          <>
            <Text style={styles.sectionTitle}>Chores</Text>
            {kidChores.length === 0 && (
              <Text style={styles.emptyBody}>No chores assigned. Add chores in More → Chores.</Text>
            )}
            {kidChores.map(chore => (
              <View key={chore.id} style={styles.choreRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.choreName}>{chore.name}</Text>
                  <Text style={styles.choreAmt}>{centsToDisplay(chore.valueCents)}</Text>
                </View>
                <View style={styles.choreButtons}>
                  <TouchableOpacity
                    style={styles.doneBtn}
                    onPress={() => handleChore(chore, "chore_done")}
                  >
                    <Text style={styles.doneBtnTxt}>Done ✓</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.missBtn}
                    onPress={() => handleChore(chore, "chore_missed")}
                  >
                    <Text style={styles.missBtnTxt}>Missed ✗</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            <View style={styles.manualRow}>
              <TouchableOpacity style={styles.manualBtn} onPress={() => setModal({ visible: true, kidId: kidId ?? null, type: "bonus" })}>
                <Text style={styles.manualBtnTxt}>+ Bonus</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.manualBtn, styles.penaltyBtn]} onPress={() => setModal({ visible: true, kidId: kidId ?? null, type: "penalty" })}>
                <Text style={[styles.manualBtnTxt, { color: C.negative }]}>− Penalty</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {weekDetail?.entries && weekDetail.entries.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>This week's entries</Text>
            {[...weekDetail.entries].reverse().map(e => (
              <EntryItem
                key={e.id}
                entry={e}
                onDelete={() => deleteEntry.mutate(e.id)}
              />
            ))}
          </>
        )}
      </ScrollView>

      {/* Bonus modal */}
      <Modal visible={modal.visible && modal.type === "bonus"} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add bonus</Text>
            <TextInput style={styles.input} placeholder="Amount ($)" placeholderTextColor={C.mutedForeground} value={bonusAmt} onChangeText={setBonusAmt} keyboardType="decimal-pad" />
            <TextInput style={styles.input} placeholder="Label (e.g. Extra effort)" placeholderTextColor={C.mutedForeground} value={bonusLabel} onChangeText={setBonusLabel} />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModal({ ...modal, visible: false })}>
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
      <Modal visible={modal.visible && modal.type === "penalty"} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add penalty</Text>
            <TextInput style={styles.input} placeholder="Amount ($)" placeholderTextColor={C.mutedForeground} value={penaltyAmt} onChangeText={setPenaltyAmt} keyboardType="decimal-pad" />
            <TextInput style={styles.input} placeholder="Label" placeholderTextColor={C.mutedForeground} value={penaltyLabel} onChangeText={setPenaltyLabel} />
            <TextInput style={[styles.input, { minHeight: 70 }]} placeholder="Reason (required)" placeholderTextColor={C.mutedForeground} value={penaltyNote} onChangeText={setPenaltyNote} multiline />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModal({ ...modal, visible: false })}>
                <Text style={styles.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: C.negative }]} onPress={handlePenalty}>
                <Text style={styles.confirmTxt}>Add</Text>
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
  kidPillTxt: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 14, color: C.foreground },
  scroll: { padding: 16, paddingBottom: 110 },
  weekBanner: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: C.border },
  weekLabel: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 13, color: C.mutedForeground },
  weekStatus: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 15, color: C.foreground, marginTop: 2 },
  weekTotal: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 22 },
  weekBase: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 11, color: C.mutedForeground },
  sectionTitle: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 13, color: C.mutedForeground, letterSpacing: 0.8, marginBottom: 10, marginTop: 4 },
  choreRow: { flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: C.border },
  choreName: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 15, color: C.foreground },
  choreAmt: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 12, color: C.mutedForeground, marginTop: 2 },
  choreButtons: { flexDirection: "row", gap: 8 },
  doneBtn: { backgroundColor: C.positive + "20", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  doneBtnTxt: { fontFamily: "SpaceGrotesk_600SemiBold", color: C.positive, fontSize: 13 },
  missBtn: { backgroundColor: C.negative + "20", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  missBtnTxt: { fontFamily: "SpaceGrotesk_600SemiBold", color: C.negative, fontSize: 13 },
  manualRow: { flexDirection: "row", gap: 10, marginTop: 6, marginBottom: 20 },
  manualBtn: { flex: 1, backgroundColor: C.card, borderRadius: 10, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: C.primary },
  penaltyBtn: { borderColor: C.negative },
  manualBtnTxt: { fontFamily: "SpaceGrotesk_600SemiBold", color: C.primary, fontSize: 14 },
  entryRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  entryBadge: { width: 30, height: 30, borderRadius: 15, justifyContent: "center", alignItems: "center" },
  entryLabel: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 14, color: C.foreground },
  entryNote: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 12, color: C.mutedForeground, marginTop: 2 },
  entryAmt: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: "#00000099", justifyContent: "flex-end" },
  modalCard: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalTitle: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 18, color: C.foreground, marginBottom: 16 },
  input: { backgroundColor: C.background, color: C.foreground, fontFamily: "SpaceGrotesk_400Regular", borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12 },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, backgroundColor: C.surface, borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  cancelTxt: { fontFamily: "SpaceGrotesk_600SemiBold", color: C.mutedForeground, fontSize: 15 },
  confirmBtn: { flex: 1, backgroundColor: C.primary, borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  confirmTxt: { fontFamily: "SpaceGrotesk_600SemiBold", color: C.primaryForeground, fontSize: 15 },
  emptyTitle: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 17, color: C.foreground, marginBottom: 6 },
  emptyBody: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 13, color: C.mutedForeground, textAlign: "center" },
});
