import { useSignUp, useAuth } from "@clerk/expo";
import { type Href, Link, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Text, TextInput, TouchableOpacity, View, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import colors from "@/constants/colors";

const C = colors.light;

export default function SignUpScreen() {
  const { signUp, errors, fetchStatus } = useSignUp();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  const handleSignUp = async () => {
    const { error } = await signUp.password({ emailAddress: email, password });
    if (error) return;
    if (!error) await signUp.verifications.sendEmailCode();
  };

  const handleVerify = async () => {
    await signUp.verifications.verifyEmailCode({ code });
    if (signUp.status === "complete") {
      await signUp.finalize({
        navigate: ({ decorateUrl }) => {
          router.replace("/onboarding" as Href);
        },
      });
    }
  };

  // Email sent — show code input
  if (
    signUp.status === "missing_requirements" &&
    signUp.unverifiedFields?.includes("email_address") &&
    signUp.missingFields?.length === 0
  ) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.heading}>Check your email</Text>
            <Text style={styles.body}>Enter the 6-digit code we sent you.</Text>

            <TextInput
              style={[styles.input, { fontSize: 28, letterSpacing: 8, textAlign: "center" }]}
              placeholder="000000"
              placeholderTextColor={C.mutedForeground}
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={6}
            />
            {errors.fields.code && <Text style={styles.errorTxt}>{errors.fields.code.message}</Text>}

            <TouchableOpacity
              style={[styles.btn, fetchStatus === "fetching" && styles.btnDisabled]}
              onPress={handleVerify}
              disabled={fetchStatus === "fetching"}
            >
              {fetchStatus === "fetching"
                ? <ActivityIndicator color={C.primaryForeground} />
                : <Text style={styles.btnText}>Verify</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={styles.resendBtn} onPress={() => signUp.verifications.sendEmailCode()}>
              <Text style={styles.resendTxt}>Resend code</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.wordmark}>Family Ledger</Text>
            <Text style={styles.subtitle}>Set up your kids' allowance</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.heading}>Create an account</Text>

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={C.mutedForeground}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            {errors.fields.emailAddress && <Text style={styles.errorTxt}>{errors.fields.emailAddress.message}</Text>}

            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={C.mutedForeground}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
            />
            {errors.fields.password && <Text style={styles.errorTxt}>{errors.fields.password.message}</Text>}

            <TouchableOpacity
              style={[styles.btn, (!email || !password || fetchStatus === "fetching") && styles.btnDisabled]}
              onPress={handleSignUp}
              disabled={!email || !password || fetchStatus === "fetching"}
            >
              {fetchStatus === "fetching"
                ? <ActivityIndicator color={C.primaryForeground} />
                : <Text style={styles.btnText}>Continue</Text>}
            </TouchableOpacity>

            <View style={styles.row}>
              <Text style={styles.muted}>Already have an account? </Text>
              <Link href="/sign-in"><Text style={styles.link}>Sign in</Text></Link>
            </View>

            {/* Required for Clerk bot protection */}
            <View nativeID="clerk-captcha" />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  scroll: { flexGrow: 1, padding: 24, justifyContent: "center" },
  header: { alignItems: "center", marginBottom: 40 },
  wordmark: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 32, color: C.primary, letterSpacing: 0.5 },
  subtitle: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 14, color: C.mutedForeground, marginTop: 4 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: C.border },
  heading: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 22, color: C.foreground, marginBottom: 8 },
  body: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 14, color: C.mutedForeground, marginBottom: 20 },
  label: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 13, color: C.mutedForeground, marginBottom: 6 },
  input: {
    backgroundColor: C.background, color: C.foreground, fontFamily: "SpaceGrotesk_400Regular",
    borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14,
    paddingVertical: 12, fontSize: 15, marginBottom: 8,
  },
  errorTxt: { fontFamily: "SpaceGrotesk_400Regular", color: C.negative, fontSize: 12, marginBottom: 10 },
  btn: {
    backgroundColor: C.primary, borderRadius: 10, paddingVertical: 14,
    alignItems: "center", marginTop: 8,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontFamily: "SpaceGrotesk_600SemiBold", color: C.primaryForeground, fontSize: 16 },
  resendBtn: { alignItems: "center", marginTop: 14 },
  resendTxt: { fontFamily: "SpaceGrotesk_500Medium", color: C.primary, fontSize: 14 },
  row: { flexDirection: "row", justifyContent: "center", marginTop: 16 },
  muted: { fontFamily: "SpaceGrotesk_400Regular", color: C.mutedForeground, fontSize: 14 },
  link: { fontFamily: "SpaceGrotesk_600SemiBold", color: C.primary, fontSize: 14 },
});
