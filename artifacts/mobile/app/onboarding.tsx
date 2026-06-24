import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Text, TextInput, TouchableOpacity, View, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import colors from "@/constants/colors";
import { apiPost } from "@/lib/api";

const C = colors.light;
type Mode = "choose" | "create" | "join";

export default function OnboardingScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("choose");
  const [householdName, setHouseholdName] = useState("");
  const [memberName, setMemberName] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!householdName.trim()) { Alert.alert("Enter a household name"); return; }
    setLoading(true);
    try {
      await apiPost("/households", { name: householdName.trim(), memberName: memberName.trim() || undefined });
      router.replace("/(tabs)");
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally { setLoading(false); }
  };

  const handleJoin = async () => {
    if (!inviteToken.trim()) { Alert.alert("Paste an invite code"); return; }
    setLoading(true);
    try {
      await apiPost("/invitations/accept", { token: inviteToken.trim(), memberName: memberName.trim() || undefined });
      router.replace("/(tabs)");
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally { setLoading(false); }
  };

  // ── Choose screen ──────────────────────────────────────────────────────────
  if (mode === "choose") {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.choosePage}>
          {/* Logo */}
          <View style={styles.logoWrap}>
            <View style={styles.logoOuter}>
              <View style={styles.logoInner}>
                <Text style={styles.logoMark}>🏠</Text>
              </View>
            </View>
            <Text style={styles.wordmark}>Family Ledger</Text>
            <Text style={styles.tagline}>Let's get your household set up.</Text>
          </View>

          {/* Choices */}
          <TouchableOpacity style={styles.choiceCard} onPress={() => setMode("create")}>
            <View style={styles.choiceIcon}><Text style={styles.choiceEmoji}>✨</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.choiceTitle}>Create a household</Text>
              <Text style={styles.choiceDesc}>Start fresh — you can invite your partner after setup.</Text>
            </View>
            <Text style={styles.choiceArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.choiceCard, styles.choiceCardSecondary]} onPress={() => setMode("join")}>
            <View style={[styles.choiceIcon, { backgroundColor: C.accent + "22" }]}>
              <Text style={styles.choiceEmoji}>🔗</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.choiceTitle}>Join with invite code</Text>
              <Text style={styles.choiceDesc}>Your partner already set things up.</Text>
            </View>
            <Text style={styles.choiceArrow}>›</Text>
          </TouchableOpacity>

          <Text style={styles.once}>You only do this once.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Create screen ──────────────────────────────────────────────────────────
  if (mode === "create") {
    return (
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.formPage} keyboardShouldPersistTaps="handled">
            <TouchableOpacity onPress={() => setMode("choose")} style={styles.backBtn}>
              <Text style={styles.backTxt}>← Back</Text>
            </TouchableOpacity>

            <Text style={styles.formHeading}>Name your household</Text>
            <Text style={styles.formSub}>This appears on both parents' home screens.</Text>

            <Text style={styles.label}>Household name</Text>
            <TextInput
              style={styles.input}
              placeholder="The Smith Family"
              placeholderTextColor={C.mutedForeground}
              value={householdName}
              onChangeText={setHouseholdName}
            />

            <Text style={styles.label}>Your name (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Mom or Dad"
              placeholderTextColor={C.mutedForeground}
              value={memberName}
              onChangeText={setMemberName}
            />

            <TouchableOpacity style={[styles.btn, (!householdName.trim() || loading) && styles.btnOff]} onPress={handleCreate} disabled={!householdName.trim() || loading}>
              {loading ? <ActivityIndicator color={C.primaryForeground} /> : <Text style={styles.btnTxt}>Create household →</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Join screen ────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.formPage} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => setMode("choose")} style={styles.backBtn}>
            <Text style={styles.backTxt}>← Back</Text>
          </TouchableOpacity>

          <Text style={styles.formHeading}>Join a household</Text>
          <Text style={styles.formSub}>Ask your partner to share an invite code from the More tab.</Text>

          <Text style={styles.label}>Invite code</Text>
          <TextInput
            style={styles.input}
            placeholder="Paste code from your partner"
            placeholderTextColor={C.mutedForeground}
            value={inviteToken}
            onChangeText={setInviteToken}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Your name (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Mom or Dad"
            placeholderTextColor={C.mutedForeground}
            value={memberName}
            onChangeText={setMemberName}
          />

          <TouchableOpacity style={[styles.btn, (!inviteToken.trim() || loading) && styles.btnOff]} onPress={handleJoin} disabled={!inviteToken.trim() || loading}>
            {loading ? <ActivityIndicator color={C.primaryForeground} /> : <Text style={styles.btnTxt}>Join household →</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },

  // Choose page
  choosePage: { flex: 1, padding: 24, justifyContent: "center" },
  logoWrap: { alignItems: "center", marginBottom: 44 },
  logoOuter: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: C.primary + "18",
    justifyContent: "center", alignItems: "center", marginBottom: 18,
    shadowColor: C.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 28, elevation: 12,
  },
  logoInner: {
    width: 70, height: 70, borderRadius: 35,
    backgroundColor: C.primary + "2e",
    justifyContent: "center", alignItems: "center",
    borderWidth: 1.5, borderColor: C.primary + "70",
  },
  logoMark: { fontSize: 34 },
  wordmark: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 28, color: C.foreground, letterSpacing: -0.5 },
  tagline: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 14, color: C.mutedForeground, marginTop: 5 },

  choiceCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: C.card, borderRadius: 18, padding: 18, marginBottom: 12,
    borderWidth: 1, borderColor: C.primary + "50",
  },
  choiceCardSecondary: { borderColor: C.border },
  choiceIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: C.primary + "22",
    justifyContent: "center", alignItems: "center",
  },
  choiceEmoji: { fontSize: 22 },
  choiceTitle: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 16, color: C.foreground, marginBottom: 3 },
  choiceDesc: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 13, color: C.mutedForeground },
  choiceArrow: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 20, color: C.mutedForeground },
  once: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 13, color: C.mutedForeground, textAlign: "center", marginTop: 24 },

  // Form pages
  formPage: { flexGrow: 1, padding: 24, paddingTop: 60 },
  backBtn: { marginBottom: 32 },
  backTxt: { fontFamily: "SpaceGrotesk_500Medium", color: C.primary, fontSize: 15 },
  formHeading: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 28, color: C.foreground, letterSpacing: -0.5, marginBottom: 8 },
  formSub: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 14, color: C.mutedForeground, marginBottom: 32, lineHeight: 20 },

  label: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 13, color: C.mutedForeground, marginBottom: 8 },
  input: {
    backgroundColor: C.input, color: C.foreground,
    fontFamily: "SpaceGrotesk_400Regular",
    borderWidth: 1, borderColor: C.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, marginBottom: 18,
  },
  btn: {
    backgroundColor: C.primary, borderRadius: 13, paddingVertical: 15,
    alignItems: "center", marginTop: 8,
    shadowColor: C.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 8,
  },
  btnOff: { opacity: 0.4, shadowOpacity: 0 },
  btnTxt: { fontFamily: "SpaceGrotesk_700Bold", color: C.primaryForeground, fontSize: 16 },
});
