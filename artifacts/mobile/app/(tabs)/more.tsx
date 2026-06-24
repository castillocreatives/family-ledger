import { useAuth } from "@clerk/expo";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Modal, TextInput, ActivityIndicator, Share, Platform,
} from "react-native";
import * as Clipboard from "expo-clipboard";
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
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [signOutConfirm, setSignOutConfirm] = useState(false);
  const [confirmDeleteKid, setConfirmDeleteKid] = useState(false);

  const { data: kids = [] } = useQuery<Kid[]>({ queryKey: ["kids"], queryFn: () => apiGet("/kids") });
  const { data: chores = [] } = useQuery<Chore[]>({ queryKey: ["chores"], queryFn: () => apiGet("/chores") });
  const { data: member } = useQuery<Member>({
    queryKey: ["member", "me"],
    queryFn: () => apiGet<Member>("/members/me"),
  });
  const { data: household } = useQuery<Household>({ queryKey: ["household"], queryFn: () => apiGet("/households/me") });

  const resetKidForm = () => { setKidName(""); setKidColor("#d8a657"); setKidAllowance(""); };
  const closeKidModal = () => { setKidModal({ visible: false }); setConfirmDeleteKid(false); resetKidForm(); };
  const refreshKids = () => { qc.invalidateQueries({ queryKey: ["kids"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); };

  const createKid = useMutation({
    mutationFn: (body: object) => apiPost<Kid>("/kids", body),
    onSuccess: () => { refreshKids(); closeKidModal(); },
    onError: (e: any) => Alert.alert("Couldn't save kid", e?.message ?? "Please try again."),
  });
  const updateKid = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) => apiPatch<Kid>(`/kids/${id}`, body),
    onSuccess: () => { refreshKids(); closeKidModal(); },
    onError: (e: any) => Alert.alert("Couldn't save kid", e?.message ?? "Please try again."),
  });
  const deleteKid = useMutation({
    mutationFn: (id: number) => apiDelete(`/kids/${id}`),
    onSuccess: () => { refreshKids(); closeKidModal(); },
    onError: (e: any) => Alert.alert("Couldn't delete kid", e?.message ?? "Please try again."),
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
      setCopied(false);
      setInviteCode(data.token);
    },
    onError: (e: any) => Alert.alert("Error", e.message),
  });

  const inviteMessage = (code: string) =>
    `Join our Family Ledger household! Open the app, choose "Join with invite code", and paste this code:\n\n${code}`;

  const handleCopyCode = async () => {
    if (!inviteCode) return;
    try {
      await Clipboard.setStringAsync(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      Alert.alert("Couldn't copy", "Please select and copy the code manually.");
    }
  };

  const handleShareCode = async () => {
    if (!inviteCode) return;
    const message = inviteMessage(inviteCode);
    if (Platform.OS === "web") {
      const nav = typeof navigator !== "undefined" ? (navigator as any) : undefined;
      try {
        if (nav?.share) {
          await nav.share({ title: "Family Ledger invite", text: message });
        } else {
          await handleCopyCode();
        }
      } catch {
        // user dismissed the share sheet — no-op
      }
      return;
    }
    try {
      await Share.share({ message });
    } catch {
      await handleCopyCode();
    }
  };

  const handleSignOut = async () => {
    setSignOutConfirm(false);
    try {
      await signOut();
    } catch (e: any) {
      Alert.alert("Couldn't sign out", e?.message ?? "Please try again.");
    }
  };

  const KID_COLORS = ["#8b6fff", "#10d9a0", "#ff6b72", "#60a5fa", "#fbbf24", "#f472b6"];

  const openKidModal = (kid?: Kid) => {
    setConfirmDeleteKid(false);
    if (kid) {
      setKidName(kid.name);
      setKidColor(kid.color);
      setKidAllowance((kid.baseAllowanceCents / 100).toFixed(2));
    } else {
      resetKidForm();
    }
    setKidModal({ visible: true, kid });
  };

  const handleSaveKid = () => {
    if (!kidName.trim()) { Alert.alert("Name is required"); return; }
    const cents = kidAllowance ? Math.round(parseFloat(kidAllowance) * 100) : undefined;
    if (cents !== undefined && (isNaN(cents) || cents < 0)) {
      Alert.alert("Enter a valid allowance, or leave it blank for the household default");
      return;
    }
    const body = { name: kidName.trim(), color: kidColor, baseAllowanceCents: cents };
    if (kidModal.kid) {
      updateKid.mutate({ id: kidModal.kid.id, body });
    } else {
      createKid.mutate(body);
    }
  };

  const handleSaveChore = () => {
    if (!choreName.trim()) { Alert.alert("Name is required"); return; }
    const trimmed = choreValue.trim();
    const cents = trimmed === "" ? 0 : Math.round(parseFloat(trimmed) * 100);
    if (isNaN(cents) || cents < 0) { Alert.alert("Enter a valid value, or leave blank for a checklist chore"); return; }
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
              onPress={() => openKidModal(k)}
            />
          ))}
          <TouchableOpacity style={styles.addBtn} onPress={() => openKidModal()}>
            <Text style={styles.addBtnTxt}>+ Add kid</Text>
          </TouchableOpacity>
        </Section>

        {/* Chores */}
        <Section title="Chores">
          {chores.map(c => (
            <View key={c.id} style={styles.row}>
              <Text style={[styles.rowLabel, !c.active && { color: C.mutedForeground }]}>{c.name}</Text>
              <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                <Text style={styles.rowValue}>{c.valueCents > 0 ? centsToDisplay(c.valueCents) : "Checklist"}</Text>
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
          <Row label="Sign out" destructive onPress={() => setSignOutConfirm(true)} />
        </Section>
      </ScrollView>

      {/* Add Kid Modal */}
      <Modal visible={kidModal.visible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{kidModal.kid ? "Edit kid" : "Add a kid"}</Text>
            <TextInput style={styles.input} placeholder="Name" placeholderTextColor={C.mutedForeground} value={kidName} onChangeText={(t) => { setKidName(t); setConfirmDeleteKid(false); }} />
            <TextInput style={styles.input} placeholder="Weekly allowance (e.g. 5.00)" placeholderTextColor={C.mutedForeground} value={kidAllowance} onChangeText={(t) => { setKidAllowance(t); setConfirmDeleteKid(false); }} keyboardType="decimal-pad" />
            <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>Color</Text>
            <View style={styles.colorRow}>
              {KID_COLORS.map(col => (
                <TouchableOpacity
                  key={col}
                  style={[styles.colorDot, { backgroundColor: col }, kidColor === col && styles.colorDotActive]}
                  onPress={() => { setKidColor(col); setConfirmDeleteKid(false); }}
                />
              ))}
            </View>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeKidModal}>
                <Text style={styles.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleSaveKid} disabled={createKid.isPending || updateKid.isPending}>
                {createKid.isPending || updateKid.isPending
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.confirmTxt}>{kidModal.kid ? "Save" : "Add kid"}</Text>}
              </TouchableOpacity>
            </View>
            {kidModal.kid && (
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => {
                  if (confirmDeleteKid) {
                    deleteKid.mutate(kidModal.kid!.id);
                  } else {
                    setConfirmDeleteKid(true);
                  }
                }}
                disabled={deleteKid.isPending}
              >
                {deleteKid.isPending
                  ? <ActivityIndicator color={C.negative} />
                  : <Text style={styles.deleteTxt}>{confirmDeleteKid ? "Tap again to delete" : "Delete kid"}</Text>}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* Add Chore Modal */}
      <Modal visible={choreModal.visible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add a chore</Text>
            <TextInput style={styles.input} placeholder="Chore name" placeholderTextColor={C.mutedForeground} value={choreName} onChangeText={setChoreName} />
            <TextInput style={styles.input} placeholder="Reward per completion (e.g. 0.50)" placeholderTextColor={C.mutedForeground} value={choreValue} onChangeText={setChoreValue} keyboardType="decimal-pad" />
            <Text style={styles.modalHint}>Leave the reward blank for a checklist chore — it's expected as part of the base allowance and doesn't pay extra.</Text>
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

      {/* Invite Partner Modal */}
      <Modal visible={inviteCode !== null} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Invite your partner</Text>
            <Text style={styles.modalHint}>
              Share this code with your partner. They sign up, choose “Join with invite code”, and paste it in. The code expires in 7 days.
            </Text>
            <TouchableOpacity style={styles.codeBox} onPress={handleCopyCode} activeOpacity={0.7}>
              <Text style={styles.codeText} selectable numberOfLines={2}>{inviteCode}</Text>
              <Text style={styles.codeCopyHint}>{copied ? "Copied ✓" : "Tap to copy"}</Text>
            </TouchableOpacity>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={handleCopyCode}>
                <Text style={styles.cancelTxt}>{copied ? "Copied ✓" : "Copy code"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleShareCode}>
                <Text style={styles.confirmTxt}>Share</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.doneBtn} onPress={() => setInviteCode(null)}>
              <Text style={styles.doneTxt}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Sign Out Confirm Modal */}
      <Modal visible={signOutConfirm} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Sign out?</Text>
            <Text style={styles.modalHint}>You'll need to sign back in to manage your household.</Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setSignOutConfirm(false)}>
                <Text style={styles.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: C.negative }]} onPress={handleSignOut}>
                <Text style={styles.confirmTxt}>Sign out</Text>
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
  modalHint: { fontFamily: "Inter_400Regular", fontSize: 12, color: C.mutedForeground, lineHeight: 17, marginTop: -4, marginBottom: 14 },
  input: { backgroundColor: C.background, color: C.foreground, fontFamily: "Inter_400Regular", borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12 },
  colorRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  colorDot: { width: 34, height: 34, borderRadius: 17 },
  colorDotActive: { borderWidth: 3, borderColor: C.foreground },
  modalBtns: { flexDirection: "row", gap: 10 },
  cancelBtn: { flex: 1, backgroundColor: C.surface, borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  cancelTxt: { fontFamily: "Inter_600SemiBold", color: C.mutedForeground, fontSize: 15 },
  confirmBtn: { flex: 1, backgroundColor: C.primary, borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  confirmTxt: { fontFamily: "Inter_600SemiBold", color: C.primaryForeground, fontSize: 15 },
  codeBox: { backgroundColor: C.background, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 16, marginBottom: 16, alignItems: "center" },
  codeText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: C.foreground, textAlign: "center", letterSpacing: 0.5 },
  codeCopyHint: { fontFamily: "Inter_500Medium", fontSize: 12, color: C.primary, marginTop: 8 },
  doneBtn: { paddingVertical: 14, alignItems: "center", marginTop: 4 },
  doneTxt: { fontFamily: "Inter_500Medium", fontSize: 15, color: C.mutedForeground },
  deleteBtn: { paddingVertical: 14, alignItems: "center", marginTop: 4 },
  deleteTxt: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: C.negative },
});
