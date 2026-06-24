import { useAuth } from "@clerk/expo";
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
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("choose");
  const [householdName, setHouseholdName] = useState("");
  const [memberName, setMemberName] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!householdName.trim()) {
      Alert.alert("Missing field", "Please enter a household name.");
      return;
    }
    setLoading(true);
    try {
      await apiPost("/households", { name: householdName.trim(), memberName: memberName.trim() || undefined });
      router.replace("/(tabs)");
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!inviteToken.trim()) {
      Alert.alert("Missing field", "Please enter an invite code.");
      return;
    }
    setLoading(true);
    try {
      await apiPost("/invitations/accept", { token: inviteToken.trim(), memberName: memberName.trim() || undefined });
      router.replace("/(tabs)");
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
    }
  };

  if (mode === "choose") {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.scroll}>
          <Text style={styles.wordmark}>Family Ledger</Text>
          <Text style={styles.subtitle}>Welcome! Let's get you set up.</Text>

          <TouchableOpacity style={styles.choiceCard} onPress={() => setMode("create")}>
            <Text style={styles.choiceTitle}>Create a household</Text>
            <Text style={styles.choiceDesc}>Start fresh and invite your partner later.</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.choiceCard, styles.choiceCardSecondary]} onPress={() => setMode("join")}>
            <Text style={styles.choiceTitle}>Join with invite code</Text>
            <Text style={styles.choiceDesc}>Your partner already set things up.</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (mode === "create") {
    return (
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <TouchableOpacity onPress={() => setMode("choose")} style={styles.back}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
            <View style={styles.card}>
              <Text style={styles.heading}>Name your household</Text>

              <Text style={styles.label}>Household name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. The Smith Family"
                placeholderTextColor={C.mutedForeground}
                value={householdName}
                onChangeText={setHouseholdName}
              />

              <Text style={styles.label}>Your name (optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Mom or Dad"
                placeholderTextColor={C.mutedForeground}
                value={memberName}
                onChangeText={setMemberName}
              />

              <TouchableOpacity
                style={[styles.btn, loading && styles.btnDisabled]}
                onPress={handleCreate}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color={C.primaryForeground} />
                  : <Text style={styles.btnText}>Create household</Text>
                }
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => setMode("choose")} style={styles.back}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <View style={styles.card}>
            <Text style={styles.heading}>Join with an invite</Text>

            <Text style={styles.label}>Invite code</Text>
            <TextInput
              style={styles.input}
              placeholder="Paste code from your partner"
              placeholderTextColor={C.mutedForeground}
              value={inviteToken}
              onChangeText={setInviteToken}
              autoCapitalize="none"
            />

            <Text style={styles.label}>Your name (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Mom or Dad"
              placeholderTextColor={C.mutedForeground}
              value={memberName}
              onChangeText={setMemberName}
            />

            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleJoin}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color={C.primaryForeground} />
                : <Text style={styles.btnText}>Join household</Text>
              }
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  scroll: { flexGrow: 1, padding: 24, justifyContent: "center" },
  wordmark: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 30, color: C.primary, textAlign: "center", marginBottom: 8 },
  subtitle: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 15, color: C.mutedForeground, textAlign: "center", marginBottom: 36 },
  choiceCard: {
    backgroundColor: C.card, borderRadius: 14, padding: 20, marginBottom: 12,
    borderWidth: 1, borderColor: C.border,
  },
  choiceCardSecondary: { borderColor: C.border },
  choiceTitle: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 17, color: C.foreground, marginBottom: 4 },
  choiceDesc: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 13, color: C.mutedForeground },
  back: { marginBottom: 16 },
  backText: { fontFamily: "SpaceGrotesk_500Medium", color: C.primary, fontSize: 14 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: C.border },
  heading: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 22, color: C.foreground, marginBottom: 20 },
  label: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 13, color: C.mutedForeground, marginBottom: 6 },
  input: {
    backgroundColor: C.background, color: C.foreground, fontFamily: "SpaceGrotesk_400Regular",
    borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14,
    paddingVertical: 12, fontSize: 15, marginBottom: 16,
  },
  btn: {
    backgroundColor: C.primary, borderRadius: 10, paddingVertical: 14,
    alignItems: "center", marginTop: 4,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontFamily: "SpaceGrotesk_600SemiBold", color: C.primaryForeground, fontSize: 16 },
});
