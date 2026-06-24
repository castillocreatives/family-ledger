import { useAuth } from "@clerk/expo";
import { Redirect } from "expo-router";
import React from "react";
import { ActivityIndicator, View } from "react-native";
import colors from "@/constants/colors";

export default function IndexScreen() {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.light.background }}>
        <ActivityIndicator color={colors.light.primary} />
      </View>
    );
  }

  if (isSignedIn) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/sign-in" />;
}
