import { useAuth } from "@clerk/expo";
import { Redirect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import colors from "@/constants/colors";
import { apiFetch } from "@/lib/api";

const C = colors.light;

type Status = "checking" | "tabs" | "onboarding" | "error";

export default function IndexScreen() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const [status, setStatus] = useState<Status>("checking");
  // Guards against an infinite loop: Clerk's `getToken` is not a stable
  // reference across renders, so `checkHousehold` (and the effect that depends
  // on it) would otherwise re-run every render and hammer /households/me.
  const hasChecked = useRef(false);

  const checkHousehold = useCallback(async () => {
    setStatus("checking");
    // On first load the Clerk session can lag behind isSignedIn, so the token
    // may not be ready for a tick. Retry transient 401s/network errors a few
    // times before showing the error screen, so a no-household user still
    // reaches onboarding instead of getting stuck.
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const token = await getToken();
        const res = await apiFetch("/households/me", {}, token);
        if (res.ok) {
          setStatus("tabs");
          return;
        }
        if (res.status === 404) {
          // No household yet → send to onboarding
          setStatus("onboarding");
          return;
        }
        if (res.status === 401 && attempt < 3) {
          await new Promise((r) => setTimeout(r, 400));
          continue;
        }
        // Other server errors — don't misroute; let them retry
        setStatus("error");
        return;
      } catch {
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 400));
          continue;
        }
        // Network failure — allow retry rather than forcing onboarding
        setStatus("error");
        return;
      }
    }
  }, [getToken]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      hasChecked.current = false;
      return;
    }
    if (hasChecked.current) return;
    hasChecked.current = true;
    checkHousehold();
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
