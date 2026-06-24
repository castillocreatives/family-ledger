import { useSignIn, useAuth } from "@clerk/expo";
import { type Href, Link, useRouter } from "expo-router";
import React, { useState, useEffect } from "react";
import {
  Text, TextInput, TouchableOpacity, View, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import colors from "@/constants/colors";

const C = colors.light;

export default function SignInScreen() {
  const { signIn, errors, fetchStatus } = useSignIn();
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    if (isSignedIn) router.replace("/(tabs)");
  }, [isSignedIn]);

  const handleSignIn = async () => {
    const { error } = await signIn.password({ emailAddress: email, password });
    if (error) return;
    if (signIn.status === "complete") {
      await signIn.finalize({
        navigate: ({ decorateUrl }) => router.replace(decorateUrl("/") as Href),
      });
    }
  };

  const handleVerify = async () => {
    await signIn.mfa.verifyEmailCode({ code });
    if (signIn.status === "complete") {
      await signIn.finalize({
        navigate: ({ decorateUrl }) => router.replace(decorateUrl("/") as Href),
      });
    }
  };

  if (signIn.status === "needs_client_trust") {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.card}>
            <Text style={styles.heading}>Verify your identity</Text>
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
            <TouchableOpacity style={[styles.btn, fetchStatus === "fetching" && styles.btnOff]} onPress={handleVerify} disabled={fetchStatus === "fetching"}>
              {fetchStatus === "fetching" ? <ActivityIndicator color={C.primaryForeground} /> : <Text style={styles.btnTxt}>Verify</Text>}
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

          {/* Logo */}
          <View style={styles.logoWrap}>
            <View style={styles.logoOuter}>
              <View style={styles.logoInner}>
                <Text style={styles.logoMark}>💸</Text>
              </View>
            </View>
            <Text style={styles.wordmark}>Family Ledger</Text>
            <Text style={styles.tagline}>Co-run your kids' allowance</Text>
          </View>

          {/* Form card */}
          <View style={styles.card}>
            <Text style={styles.heading}>Welcome back</Text>

            <Text style={styles.label}>Email</Text>
            <TextInput style={styles.input} placeholder="you@example.com" placeholderTextColor={C.mutedForeground} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
            {errors.fields.identifier && <Text style={styles.errorTxt}>{errors.fields.identifier.message}</Text>}

            <Text style={styles.label}>Password</Text>
            <TextInput style={styles.input} placeholder="••••••••" placeholderTextColor={C.mutedForeground} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
            {errors.fields.password && <Text style={styles.errorTxt}>{errors.fields.password.message}</Text>}

            <TouchableOpacity
              style={[styles.btn, (!email || !password || fetchStatus === "fetching") && styles.btnOff]}
              onPress={handleSignIn}
              disabled={!email || !password || fetchStatus === "fetching"}
            >
              {fetchStatus === "fetching" ? <ActivityIndicator color={C.primaryForeground} /> : <Text style={styles.btnTxt}>Sign in</Text>}
            </TouchableOpacity>

            <View style={styles.footerRow}>
              <Text style={styles.footerMuted}>No account? </Text>
              <Link href="/sign-up"><Text style={styles.footerLink}>Create one</Text></Link>
            </View>
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
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 32,
    elevation: 14,
  },
  logoInner: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: C.primary + "30",
    justifyContent: "center", alignItems: "center",
    borderWidth: 1.5, borderColor: C.primary + "70",
  },
  logoMark: { fontSize: 36 },
  wordmark: { fontFamily: "Inter_700Bold", fontSize: 30, color: C.foreground, letterSpacing: -0.5 },
  tagline: { fontFamily: "Inter_400Regular", fontSize: 14, color: C.mutedForeground, marginTop: 5 },

  card: { backgroundColor: C.card, borderRadius: 22, padding: 24, borderWidth: 1, borderColor: C.border },
  heading: { fontFamily: "Inter_700Bold", fontSize: 22, color: C.foreground, marginBottom: 22 },
  label: { fontFamily: "Inter_500Medium", fontSize: 13, color: C.mutedForeground, marginBottom: 7 },
  input: {
    backgroundColor: C.input, color: C.foreground,
    fontFamily: "Inter_400Regular",
    borderWidth: 1, borderColor: C.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, marginBottom: 8,
  },
  errorTxt: { fontFamily: "Inter_400Regular", color: C.negative, fontSize: 12, marginBottom: 8 },
  btn: {
    backgroundColor: C.primary, borderRadius: 13, paddingVertical: 15,
    alignItems: "center", marginTop: 10,
    shadowColor: C.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 16, elevation: 8,
  },
  btnOff: { opacity: 0.4, shadowOpacity: 0 },
  btnTxt: { fontFamily: "Inter_700Bold", color: C.primaryForeground, fontSize: 16 },
  footerRow: { flexDirection: "row", justifyContent: "center", marginTop: 20 },
  footerMuted: { fontFamily: "Inter_400Regular", color: C.mutedForeground, fontSize: 14 },
  footerLink: { fontFamily: "Inter_600SemiBold", color: C.primary, fontSize: 14 },
});
