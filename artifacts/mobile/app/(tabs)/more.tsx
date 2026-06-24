import { useAuth } from "@clerk/expo";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Modal, TextInput, ActivityIndicator, Share,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiGet, apiPost, apiPatch, apiDelete, centsToDisplay } from "@/lib/api";
import colors from "@/constants/colors";

const C = colors.light;

type Kid = { id: number; name: string; color: string; baseAllowanceCents: number };
type Chore = { id: number; name: string; valueCents: number; active: boolean; kidIds: number[] };
type Member = { id: number; name: string; avatarInitial: string; role: string };
type Household = { id: number; name: string; baseDefaultCents: number; weekStartDow: number };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value, onPress, destructive }: { label: string; value?: string; onPress?: () => void; destructive?: boolean }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} disabled={!onPress}>
      <Text style={[styles.rowLabel, destructive && { color: C.negative }]}>{label}</Text>
      {value ? <Text style={styles.rowValue}>{value}</Text> : <Text style={styles.rowChevron}>›</Text>}
    </TouchableOpacity>
  );
}

type KidModal = { visible: boolean; kid?: Kid };
type ChoreModal = { visible: boolean; chore?: Chore };

export default function MoreScreen() {
  const { signOut } = useAuth();
  const qc = useQueryClient();
  const [kidModal, setKidModal] = useState<KidModal>({ visible: false });
  const [choreModal, setChoreModal] = useState<ChoreModal>({ visible: false });
  const [kidName, setKidName] = useState("");
  const [kidColor, setKidColor] = useState("#d8a657");
  const [kidAllowance, setKidAllowance] = useState("");
  const [choreName, setChoreName] = useState("");
  const [choreValue, setChoreValue] = useState("");

  const { data: kids = [] } = useQuery<Kid[]>({ queryKey: ["kids"], queryFn: () => apiGet("/kids") });
  const { data: chores = [] } = useQuery<Chore[]>({ queryKey: ["chores"], queryFn: () => apiGet("/chores") });
  const { data: member } = useQuery<Member>({
    queryKey: ["member", "me"],
    queryFn: () => apiGet<Member>("/members/me"),
  });
  const { data: household } = useQuery<Household>({ queryKey: ["household"], queryFn: () => apiGet("/households/me") });

  const createKid = useMutation({
    mutationFn: (body: object) => apiPost<Kid>("/kids", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["kids"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); },
  });
  const deleteKid = useMutation({
    mutationFn: (id: number) => apiDelete(`/kids/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["kids"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); },
  });
  const createChore = useMutation({
    mutationFn: (body: object) => apiPost<Chore>("/chores", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chores"] }),
  });
  const toggleChore = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => apiPatch(`/chores/${id}`, { active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chores"] }),
  });
  const deleteChore = useMutation({
    mutationFn: (id: number) => apiDelete(`/chores/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chores"] }),
  });
  const createInvite = useMutation({
    mutationFn: () => apiPost<{ token: string }>("/invitations"),
    onSuccess: (data) => {
      Share.share({ message: `Join our Family Ledger household! Code: ${data.token}` });
    },
    onError: (e: any) => Alert.alert("Error", e.message),
  });

  const KID_COLORS = ["#8b6fff", "#10d9a0", "#ff6b72", "#60a5fa", "#fbbf24", "#f472b6"];

  const handleSaveKid = () => {
    if (!kidName.trim()) { Alert.alert("Name is required"); return; }
    const cents = kidAllowance ? Math.round(parseFloat(kidAllowance) * 100) : undefined;
    createKid.mutate({ name: kidName.trim(), color: kidColor, baseAllowanceCents: cents });
    setKidName(""); setKidColor("#d8a657"); setKidAllowance("");
    setKidModal({ visible: false });
  };

  const handleSaveChore = () => {
    if (!choreName.trim()) { Alert.alert("Name is required"); return; }
    const cents = Math.round(parseFloat(choreValue) * 100);
    if (!cents || isNaN(cents)) { Alert.alert("Enter a valid value"); return; }
    createChore.mutate({ name: choreName.trim(), valueCents: cents });
    setChoreName(""); setChoreValue("");
    setChoreModal({ visible: false });
  };

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Kids */}
        <Section title="Kids">
          {kids.map(k => (
            <Row
              key={k.id}
              label={k.name}
              value={centsToDisplay(k.baseAllowanceCents) + "/wk"}
              onPress={() => Alert.alert(k.name, "Delete this kid?", [
                { text: "Cancel" },
                { text: "Delete", style: "destructive", onPress: () => deleteKid.mutate(k.id) },
              ])}
            />
          ))}
          <TouchableOpacity style={styles.addBtn} onPress={() => setKidModal({ visible: true })}>
            <Text style={styles.addBtnTxt}>+ Add kid</Text>
          </TouchableOpacity>
        </Section>

        {/* Chores */}
        <Section title="Chores">
          {chores.map(c => (
            <View key={c.id} style={styles.row}>
              <Text style={[styles.rowLabel, !c.active && { color: C.mutedForeground }]}>{c.name}</Text>
              <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                <Text style={styles.rowValue}>{centsToDisplay(c.valueCents)}</Text>
                <TouchableOpacity onPress={() => toggleChore.mutate({ id: c.id, active: !c.active })}>
                  <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: c.active ? C.positive : C.mutedForeground }}>
                    {c.active ? "Active" : "Off"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => Alert.alert("Delete?", c.name, [
                  { text: "Cancel" },
                  { text: "Delete", style: "destructive", onPress: () => deleteChore.mutate(c.id) },
                ])}>
                  <Text style={{ color: C.negative, fontSize: 16 }}>×</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          <TouchableOpacity style={styles.addBtn} onPress={() => setChoreModal({ visible: true })}>
            <Text style={styles.addBtnTxt}>+ Add chore</Text>
          </TouchableOpacity>
        </Section>

        {/* Household */}
        <Section title="Household">
          {household && <Row label={household.name} value={`base ${centsToDisplay(household.baseDefaultCents)}/wk`} />}
          <Row label="Invite partner" onPress={() => createInvite.mutate()} />
        </Section>

        {/* Account */}
        <Section title="Account">
          <Row label="Sign out" destructive onPress={() => Alert.alert("Sign out?", undefined, [
            { text: "Cancel" },
            { text: "Sign out", style: "destructive", onPress: () => signOut() },
          ])} />
        </Section>
      </ScrollView>

      {/* Add Kid Modal */}
      <Modal visible={kidModal.visible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add a kid</Text>
            <TextInput style={styles.input} placeholder="Name" placeholderTextColor={C.mutedForeground} value={kidName} onChangeText={setKidName} />
            <TextInput style={styles.input} placeholder="Weekly allowance (e.g. 5.00)" placeholderTextColor={C.mutedForeground} value={kidAllowance} onChangeText={setKidAllowance} keyboardType="decimal-pad" />
            <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>Color</Text>
            <View style={styles.colorRow}>
              {KID_COLORS.map(col => (
                <TouchableOpacity
                  key={col}
                  style={[styles.colorDot, { backgroundColor: col }, kidColor === col && styles.colorDotActive]}
                  onPress={() => setKidColor(col)}
                />
              ))}
            </View>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setKidModal({ visible: false })}>
                <Text style={styles.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleSaveKid}>
                <Text style={styles.confirmTxt}>Add kid</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Chore Modal */}
      <Modal visible={choreModal.visible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add a chore</Text>
            <TextInput style={styles.input} placeholder="Chore name" placeholderTextColor={C.mutedForeground} value={choreName} onChangeText={setChoreName} />
            <TextInput style={styles.input} placeholder="Value per completion (e.g. 0.50)" placeholderTextColor={C.mutedForeground} value={choreValue} onChangeText={setChoreValue} keyboardType="decimal-pad" />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setChoreModal({ visible: false })}>
                <Text style={styles.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleSaveChore}>
                <Text style={styles.confirmTxt}>Add chore</Text>
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
  scroll: { paddingBottom: 110 },
  section: { marginBottom: 4 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: C.mutedForeground, letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
  rowLabel: { fontFamily: "Inter_500Medium", fontSize: 16, color: C.foreground },
  rowValue: { fontFamily: "Inter_400Regular", fontSize: 14, color: C.mutedForeground },
  rowChevron: { fontFamily: "Inter_400Regular", fontSize: 20, color: C.mutedForeground },
  addBtn: { paddingHorizontal: 16, paddingVertical: 13, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
  addBtnTxt: { fontFamily: "Inter_500Medium", fontSize: 15, color: C.primary },
  modalOverlay: { flex: 1, backgroundColor: "#00000099", justifyContent: "flex-end" },
  modalCard: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: C.foreground, marginBottom: 16 },
  input: { backgroundColor: C.background, color: C.foreground, fontFamily: "Inter_400Regular", borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12 },
  colorRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  colorDot: { width: 34, height: 34, borderRadius: 17 },
  colorDotActive: { borderWidth: 3, borderColor: C.foreground },
  modalBtns: { flexDirection: "row", gap: 10 },
  cancelBtn: { flex: 1, backgroundColor: C.surface, borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  cancelTxt: { fontFamily: "Inter_600SemiBold", color: C.mutedForeground, fontSize: 15 },
  confirmBtn: { flex: 1, backgroundColor: C.primary, borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  confirmTxt: { fontFamily: "Inter_600SemiBold", color: C.primaryForeground, fontSize: 15 },
});
