import { useSignUp } from "@clerk/expo";
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
    await signUp.verifications.sendEmailCode();
  };

  const handleVerify = async () => {
    await signUp.verifications.verifyEmailCode({ code });
    if (signUp.status === "complete") {
      await signUp.finalize({
        navigate: () => router.replace("/onboarding" as Href),
      });
    }
  };

  // Verification step
  if (
    signUp.status === "missing_requirements" &&
    signUp.unverifiedFields?.includes("email_address") &&
    signUp.missingFields?.length === 0
  ) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.logoWrap}>
            <View style={styles.logoOuter}>
              <View style={styles.logoInner}>
                <Text style={styles.logoMark}>📬</Text>
              </View>
            </View>
            <Text style={styles.wordmark}>Check your email</Text>
            <Text style={styles.tagline}>Enter the 6-digit code we sent to {email}.</Text>
          </View>

          <View style={styles.card}>
            <TextInput
              style={[styles.input, { fontSize: 30, letterSpacing: 10, textAlign: "center", paddingVertical: 16 }]}
              placeholder="000000"
              placeholderTextColor={C.mutedForeground}
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={6}
            />
            {errors.fields.code && <Text style={styles.errorTxt}>{errors.fields.code.message}</Text>}
            <TouchableOpacity style={[styles.btn, fetchStatus === "fetching" && styles.btnOff]} onPress={handleVerify} disabled={fetchStatus === "fetching"}>
              {fetchStatus === "fetching" ? <ActivityIndicator color={C.primaryForeground} /> : <Text style={styles.btnTxt}>Verify & continue →</Text>}
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

          <View style={styles.logoWrap}>
            <View style={styles.logoOuter}>
              <View style={styles.logoInner}>
                <Text style={styles.logoMark}>✨</Text>
              </View>
            </View>
            <Text style={styles.wordmark}>Family Ledger</Text>
            <Text style={styles.tagline}>Track chores. Pay allowances. Together.</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.heading}>Create an account</Text>

            <Text style={styles.label}>Email</Text>
            <TextInput style={styles.input} placeholder="you@example.com" placeholderTextColor={C.mutedForeground} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
            {errors.fields.emailAddress && <Text style={styles.errorTxt}>{errors.fields.emailAddress.message}</Text>}

            <Text style={styles.label}>Password</Text>
            <TextInput style={styles.input} placeholder="••••••••" placeholderTextColor={C.mutedForeground} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
            {errors.fields.password && <Text style={styles.errorTxt}>{errors.fields.password.message}</Text>}

            <TouchableOpacity
              style={[styles.btn, (!email || !password || fetchStatus === "fetching") && styles.btnOff]}
              onPress={handleSignUp}
              disabled={!email || !password || fetchStatus === "fetching"}
            >
              {fetchStatus === "fetching" ? <ActivityIndicator color={C.primaryForeground} /> : <Text style={styles.btnTxt}>Continue →</Text>}
            </TouchableOpacity>

            <View style={styles.footerRow}>
              <Text style={styles.footerMuted}>Already have an account? </Text>
              <Link href="/sign-in"><Text style={styles.footerLink}>Sign in</Text></Link>
            </View>
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

  logoWrap: { alignItems: "center", marginBottom: 40 },
  logoOuter: {
    width: 108, height: 108, borderRadius: 54,
    backgroundColor: C.primary + "1a",
    justifyContent: "center", alignItems: "center",
    marginBottom: 20,
    shadowColor: C.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.55, shadowRadius: 32, elevation: 14,
  },
  logoInner: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: C.primary + "30",
    justifyContent: "center", alignItems: "center",
    borderWidth: 1.5, borderColor: C.primary + "70",
  },
  logoMark: { fontSize: 36 },
  wordmark: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 30, color: C.foreground, letterSpacing: -0.5 },
  tagline: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 14, color: C.mutedForeground, marginTop: 5, textAlign: "center", paddingHorizontal: 20 },

  card: { backgroundColor: C.card, borderRadius: 22, padding: 24, borderWidth: 1, borderColor: C.border },
  heading: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 22, color: C.foreground, marginBottom: 22 },
  label: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 13, color: C.mutedForeground, marginBottom: 7 },
  input: {
    backgroundColor: C.input, color: C.foreground,
    fontFamily: "SpaceGrotesk_400Regular",
    borderWidth: 1, borderColor: C.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, marginBottom: 8,
  },
  errorTxt: { fontFamily: "SpaceGrotesk_400Regular", color: C.negative, fontSize: 12, marginBottom: 8 },
  btn: {
    backgroundColor: C.primary, borderRadius: 13, paddingVertical: 15,
    alignItems: "center", marginTop: 10,
    shadowColor: C.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 16, elevation: 8,
  },
  btnOff: { opacity: 0.4, shadowOpacity: 0 },
  btnTxt: { fontFamily: "SpaceGrotesk_700Bold", color: C.primaryForeground, fontSize: 16 },
  resendBtn: { alignItems: "center", marginTop: 16 },
  resendTxt: { fontFamily: "SpaceGrotesk_500Medium", color: C.primary, fontSize: 14 },
  footerRow: { flexDirection: "row", justifyContent: "center", marginTop: 20 },
  footerMuted: { fontFamily: "SpaceGrotesk_400Regular", color: C.mutedForeground, fontSize: 14 },
  footerLink: { fontFamily: "SpaceGrotesk_600SemiBold", color: C.primary, fontSize: 14 },
});
