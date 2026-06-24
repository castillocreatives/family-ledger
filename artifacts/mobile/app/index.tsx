import { useAuth } from "@clerk/expo";
import { Redirect, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import colors from "@/constants/colors";
import { apiGet } from "@/lib/api";

const C = colors.light;

export default function IndexScreen() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [destination, setDestination] = useState<"/(tabs)" | "/onboarding" | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    let cancelled = false;
    setChecking(true);

    apiGet("/households/me")
      .then(() => {
        if (!cancelled) setDestination("/(tabs)");
      })
      .catch(() => {
        // 404 = no household yet → send to onboarding
        if (!cancelled) setDestination("/onboarding");
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn]);

  if (!isLoaded || checking) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: C.background }}>
        <ActivityIndicator color={C.primary} size="large" />
      </View>
    );
  }

  if (!isSignedIn) return <Redirect href="/sign-in" />;
  if (destination) return <Redirect href={destination} />;

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: C.background }}>
      <ActivityIndicator color={C.primary} size="large" />
    </View>
  );
}
