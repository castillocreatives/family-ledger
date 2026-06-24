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
import GoalsModal from "@/components/GoalsModal";
import colors from "@/constants/colors";

const C = colors.light;

type Kid = { id: number; name: string; color: string; baseAllowanceCents: number };
type ActiveGoal = { id: number; name: string; targetCents: number; savedCents: number };
type KidSummary = { kid: { id: number }; activeGoal: ActiveGoal | null };
type Dashboard = { kidSummaries: KidSummary[] };
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
  const [choreKidIds, setChoreKidIds] = useState<number[]>([]);
  const [choreActive, setChoreActive] = useState(true);
  const [confirmDeleteChore, setConfirmDeleteChore] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [signOutConfirm, setSignOutConfirm] = useState(false);
  const [confirmDeleteKid, setConfirmDeleteKid] = useState(false);
  const [goalsKid, setGoalsKid] = useState<Kid | null>(null);

  const { data: kids = [] } = useQuery<Kid[]>({ queryKey: ["kids"], queryFn: () => apiGet("/kids") });
  const { data: chores = [] } = useQuery<Chore[]>({ queryKey: ["chores"], queryFn: () => apiGet("/chores") });
  const { data: dashboard } = useQuery<Dashboard>({ queryKey: ["dashboard"], queryFn: () => apiGet("/dashboard") });
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
  const refreshChores = () => qc.invalidateQueries({ queryKey: ["chores"] });
  const closeChoreModal = () => {
    setChoreModal({ visible: false });
    setConfirmDeleteChore(false);
    setChoreName(""); setChoreValue(""); setChoreKidIds([]); setChoreActive(true);
  };
  const createChore = useMutation({
    mutationFn: (body: object) => apiPost<Chore>("/chores", body),
    onSuccess: () => { refreshChores(); closeChoreModal(); },
    onError: (e: Error) => Alert.alert("Couldn't save chore", e?.message ?? "Please try again."),
  });
  const updateChore = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) => apiPatch<Chore>(`/chores/${id}`, body),
    onSuccess: () => { refreshChores(); closeChoreModal(); },
    onError: (e: Error) => Alert.alert("Couldn't save chore", e?.message ?? "Please try again."),
  });
  const deleteChore = useMutation({
    mutationFn: (id: number) => apiDelete(`/chores/${id}`),
    onSuccess: () => { refreshChores(); closeChoreModal(); },
    onError: (e: Error) => Alert.alert("Couldn't delete chore", e?.message ?? "Please try again."),
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

  const openChoreModal = (chore?: Chore) => {
    setConfirmDeleteChore(false);
    if (chore) {
      setChoreName(chore.name);
      setChoreValue(chore.valueCents > 0 ? (chore.valueCents / 100).toFixed(2) : "");
      setChoreKidIds(chore.kidIds ?? []);
      setChoreActive(chore.active);
    } else {
      setChoreName(""); setChoreValue(""); setChoreKidIds([]); setChoreActive(true);
    }
    setChoreModal({ visible: true, chore });
  };

  const choreAppliesLabel = (c: Chore) => {
    if (!c.kidIds?.length) return "All kids";
    const names = c.kidIds.map(id => kids.find(k => k.id === id)?.name).filter(Boolean);
    return names.length ? names.join(", ") : "All kids";
  };

  const handleSaveChore = () => {
    if (!choreName.trim()) { Alert.alert("Name is required"); return; }
    const trimmed = choreValue.trim();
    const cents = trimmed === "" ? 0 : Math.round(parseFloat(trimmed) * 100);
    if (isNaN(cents) || cents < 0) { Alert.alert("Enter a valid value, or leave blank for a checklist chore"); return; }
    const body = { name: choreName.trim(), valueCents: cents, kidIds: choreKidIds };
    if (choreModal.chore) {
      updateChore.mutate({ id: choreModal.chore.id, body: { ...body, active: choreActive } });
    } else {
      createChore.mutate(body);
    }
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
            <TouchableOpacity key={c.id} style={styles.row} onPress={() => openChoreModal(c)}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={[styles.rowLabel, !c.active && { color: C.mutedForeground }]}>
                  {c.name}{!c.active ? " · off" : ""}
                </Text>
                <Text style={styles.choreAppliesTo}>{choreAppliesLabel(c)}</Text>
              </View>
              <Text style={styles.rowValue}>{c.valueCents > 0 ? centsToDisplay(c.valueCents) : "Checklist"}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.addBtn} onPress={() => openChoreModal()}>
            <Text style={styles.addBtnTxt}>+ Add chore</Text>
          </TouchableOpacity>
        </Section>

        {/* Savings goals */}
        <Section title="Savings goals">
          {kids.length === 0 ? (
            <View style={styles.row}><Text style={styles.choreAppliesTo}>Add a kid first to set up savings goals.</Text></View>
          ) : kids.map(k => {
            const summary = dashboard?.kidSummaries.find(s => s.kid.id === k.id);
            const goal = summary?.activeGoal ?? null;
            return (
              <TouchableOpacity key={k.id} style={styles.row} onPress={() => setGoalsKid(k)}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={styles.rowLabel}>{k.name}</Text>
                  <Text style={styles.choreAppliesTo}>
                    {goal
                      ? `${goal.name} · ${centsToDisplay(goal.savedCents)} / ${centsToDisplay(goal.targetCents)}`
                      : "No active goal"}
                  </Text>
                </View>
                <Text style={styles.rowChevron}>›</Text>
              </TouchableOpacity>
            );
          })}
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

      {/* Savings goals modal */}
      <GoalsModal kid={goalsKid} visible={goalsKid !== null} onClose={() => setGoalsKid(null)} />

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

      {/* Add / Edit Chore Modal */}
      <Modal visible={choreModal.visible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{choreModal.chore ? "Edit chore" : "Add a chore"}</Text>
            <TextInput style={styles.input} placeholder="Chore name" placeholderTextColor={C.mutedForeground} value={choreName} onChangeText={(t) => { setChoreName(t); setConfirmDeleteChore(false); }} />
            <TextInput style={styles.input} placeholder="Reward per completion (e.g. 0.50)" placeholderTextColor={C.mutedForeground} value={choreValue} onChangeText={(t) => { setChoreValue(t); setConfirmDeleteChore(false); }} keyboardType="decimal-pad" />
            <Text style={styles.modalHint}>Leave the reward blank for a checklist chore — it's expected as part of the base allowance and doesn't pay extra.</Text>

            <Text style={styles.choreFieldLabel}>Applies to</Text>
            {kids.length === 0 ? (
              <Text style={styles.modalHint}>Add kids first to assign chores to specific kids.</Text>
            ) : (
              <View style={styles.choreKidWrap}>
                <TouchableOpacity
                  style={[styles.choreKidPill, choreKidIds.length === 0 && styles.choreKidPillActive]}
                  onPress={() => setChoreKidIds([])}
                >
                  <Text style={[styles.choreKidPillTxt, choreKidIds.length === 0 && styles.choreKidPillTxtActive]}>All kids</Text>
                </TouchableOpacity>
                {kids.map(k => {
                  const on = choreKidIds.includes(k.id);
                  return (
                    <TouchableOpacity
                      key={k.id}
                      style={[styles.choreKidPill, on && { backgroundColor: k.color, borderColor: k.color }]}
                      onPress={() => setChoreKidIds(prev => prev.includes(k.id) ? prev.filter(id => id !== k.id) : [...prev, k.id])}
                    >
                      <Text style={[styles.choreKidPillTxt, on && styles.choreKidPillTxtActive]}>{k.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {choreModal.chore && (
              <TouchableOpacity style={styles.activeToggleRow} onPress={() => setChoreActive(a => !a)}>
                <Text style={styles.activeToggleLabel}>Active</Text>
                <View style={[styles.activeToggle, choreActive && styles.activeToggleOn]}>
                  <Text style={[styles.activeToggleTxt, choreActive && styles.activeToggleTxtOn]}>{choreActive ? "On" : "Off"}</Text>
                </View>
              </TouchableOpacity>
            )}

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeChoreModal}>
                <Text style={styles.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleSaveChore}>
                <Text style={styles.confirmTxt}>{choreModal.chore ? "Save" : "Add chore"}</Text>
              </TouchableOpacity>
            </View>

            {choreModal.chore && (
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => {
                  if (confirmDeleteChore) deleteChore.mutate(choreModal.chore!.id);
                  else setConfirmDeleteChore(true);
                }}
              >
                <Text style={styles.deleteTxt}>{confirmDeleteChore ? "Tap again to delete" : "Delete chore"}</Text>
              </TouchableOpacity>
            )}
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
  choreAppliesTo: { fontFamily: "Inter_400Regular", fontSize: 12, color: C.mutedForeground, marginTop: 3 },
  choreFieldLabel: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: C.mutedForeground, letterSpacing: 0.8, marginBottom: 10 },
  choreKidWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  choreKidPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: C.border, backgroundColor: C.background },
  choreKidPillActive: { backgroundColor: C.primary, borderColor: C.primary },
  choreKidPillTxt: { fontFamily: "Inter_500Medium", fontSize: 14, color: C.foreground },
  choreKidPillTxtActive: { color: C.primaryForeground },
  activeToggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, marginBottom: 8 },
  activeToggleLabel: { fontFamily: "Inter_500Medium", fontSize: 15, color: C.foreground },
  activeToggle: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: C.border, backgroundColor: C.background },
  activeToggleOn: { backgroundColor: C.positive + "20", borderColor: C.positive },
  activeToggleTxt: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: C.mutedForeground },
  activeToggleTxtOn: { color: C.positive },
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
