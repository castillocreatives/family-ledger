import { useAuth } from "@clerk/expo";
import { Redirect } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import colors from "@/constants/colors";
import { apiFetch } from "@/lib/api";

const C = colors.light;

type Status = "checking" | "tabs" | "onboarding" | "error";

export default function IndexScreen() {
  const { isSignedIn, isLoaded } = useAuth();
  const [status, setStatus] = useState<Status>("checking");

  const checkHousehold = useCallback(async () => {
    setStatus("checking");
    try {
      const res = await apiFetch("/households/me");
      if (res.ok) {
        setStatus("tabs");
      } else if (res.status === 404) {
        // No household yet → send to onboarding
        setStatus("onboarding");
      } else {
        // 401/500/etc — don't misroute an existing member; let them retry
        setStatus("error");
      }
    } catch {
      // Network failure — allow retry rather than forcing onboarding
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (isLoaded && isSignedIn) checkHousehold();
  }, [isLoaded, isSignedIn, checkHousehold]);

  if (!isLoaded) return <Loading />;
  if (!isSignedIn) return <Redirect href="/sign-in" />;
  if (status === "tabs") return <Redirect href="/(tabs)" />;
  if (status === "onboarding") return <Redirect href="/onboarding" />;

  if (status === "error") {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Couldn't load your account</Text>
        <Text style={styles.errorBody}>Check your connection and try again.</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={checkHousehold}>
          <Text style={styles.retryTxt}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return <Loading />;
}

function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={C.primary} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: C.background, padding: 24 },
  errorTitle: { fontFamily: "Inter_600SemiBold", fontSize: 17, color: C.foreground, marginBottom: 6 },
  errorBody: { fontFamily: "Inter_400Regular", fontSize: 13, color: C.mutedForeground, textAlign: "center", marginBottom: 20 },
  retryBtn: { backgroundColor: C.primary, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12 },
  retryTxt: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: C.primaryForeground },
});
