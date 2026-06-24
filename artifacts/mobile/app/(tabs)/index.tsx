import { useAuth } from "@clerk/expo";
import { useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  TouchableOpacity, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { apiGet, centsToDisplay } from "@/lib/api";
import colors from "@/constants/colors";

const C = colors.light;

type KidSummary = {
  kid: { id: number; name: string; color: string; baseAllowanceCents: number };
  currentWeek: {
    id: number; startDate: string; endDate: string;
    openingBalanceCents: number; runningTotalCents: number; netChangeCents: number;
    status: string; paidOutCents: number | null; rolledOverCents: number | null;
    choresDone: number; choresMissed: number; totalChores: number; closedAt: string | null;
  };
  wallet: { savedBalanceCents: number; spendBalanceCents: number };
  activeGoal: { id: number; name: string; targetCents: number; savedCents: number } | null;
};

type Dashboard = {
  household: { id: number; name: string } | null;
  kidSummaries: KidSummary[];
};

function KidCard({ s }: { s: KidSummary }) {
  const router = useRouter();
  const isPositive = s.currentWeek.runningTotalCents >= 0;
  const goalPct = s.activeGoal ? Math.min(1, s.activeGoal.savedCents / s.activeGoal.targetCents) : 0;

  return (
    <TouchableOpacity
      style={[styles.kidCard, { borderLeftWidth: 3, borderLeftColor: s.kid.color }]}
      onPress={() => router.push({ pathname: "/(tabs)/tracker", params: { kidId: String(s.kid.id) } })}
      activeOpacity={0.8}
    >
      <View style={styles.row}>
        <View style={[styles.avatar, { backgroundColor: s.kid.color + "30" }]}>
          <Text style={[styles.avatarTxt, { color: s.kid.color }]}>{s.kid.name[0].toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.kidName}>{s.kid.name}</Text>
          <Text style={styles.weekRange}>{s.currentWeek.startDate.slice(5)} – {s.currentWeek.endDate.slice(5)}
            {s.currentWeek.status === "closed" ? "  · closed" : ""}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={[styles.total, { color: isPositive ? C.positive : C.negative }]}>
            {centsToDisplay(s.currentWeek.runningTotalCents)}
          </Text>
          <Text style={styles.base}>base {centsToDisplay(s.currentWeek.openingBalanceCents)}</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statNum}>{s.currentWeek.choresDone}</Text>
          <Text style={styles.statLbl}>done</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statNum, s.currentWeek.choresMissed > 0 && { color: C.negative }]}>
            {s.currentWeek.choresMissed}
          </Text>
          <Text style={styles.statLbl}>missed</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statNum}>
            {centsToDisplay(s.wallet.savedBalanceCents + s.wallet.spendBalanceCents)}
          </Text>
          <Text style={styles.statLbl}>wallet</Text>
        </View>
      </View>

      {s.activeGoal && (
        <View style={styles.goalBlock}>
          <View style={styles.goalLabelRow}>
            <Text style={styles.goalName}>{s.activeGoal.name}</Text>
            <Text style={styles.goalAmt}>
              {centsToDisplay(s.activeGoal.savedCents)} / {centsToDisplay(s.activeGoal.targetCents)}
            </Text>
          </View>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${goalPct * 100}%` as any, backgroundColor: s.kid.color }]} />
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const { data, isLoading, error, refetch } = useQuery<Dashboard>({
    queryKey: ["dashboard"],
    queryFn: () => apiGet("/dashboard"),
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  if (isLoading && !data) {
    return <View style={styles.center}><ActivityIndicator color={C.primary} size="large" /></View>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
      >
        {data?.household && (
          <View style={styles.headerBlock}>
            <Text style={styles.hhName}>{data.household.name}</Text>
            <Text style={styles.hhSub}>This week's allowance</Text>
          </View>
        )}

        {error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorTxt}>{(error as Error).message}</Text>
            <TouchableOpacity onPress={() => refetch()}><Text style={styles.link}>Retry</Text></TouchableOpacity>
          </View>
        )}

        {(data?.kidSummaries ?? []).length === 0 && !error && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No kids yet</Text>
            <Text style={styles.emptyBody}>Go to More → Kids to add your first child.</Text>
          </View>
        )}

        {(data?.kidSummaries ?? []).map(s => <KidCard key={s.kid.id} s={s} />)}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: C.background },
  scroll: { padding: 16, paddingBottom: 110 },
  headerBlock: { marginBottom: 20 },
  hhName: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 26, color: C.primary },
  hhSub: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 13, color: C.mutedForeground, marginTop: 2 },
  kidCard: { backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: C.border },
  row: { flexDirection: "row", alignItems: "center" },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center" },
  avatarTxt: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 20 },
  kidName: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 16, color: C.foreground },
  weekRange: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 11, color: C.mutedForeground, marginTop: 2 },
  total: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 20 },
  base: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 11, color: C.mutedForeground },
  statsRow: { flexDirection: "row", marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border },
  stat: { flex: 1, alignItems: "center" },
  statNum: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 15, color: C.foreground },
  statLbl: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 11, color: C.mutedForeground, marginTop: 2 },
  goalBlock: { marginTop: 12 },
  goalLabelRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  goalName: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 12, color: C.mutedForeground },
  goalAmt: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 12, color: C.mutedForeground },
  progressBg: { height: 6, backgroundColor: C.border, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3 },
  emptyCard: { backgroundColor: C.card, borderRadius: 14, padding: 24, alignItems: "center", borderWidth: 1, borderColor: C.border },
  emptyTitle: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 17, color: C.foreground, marginBottom: 6 },
  emptyBody: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 13, color: C.mutedForeground, textAlign: "center" },
  errorCard: { backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.negative },
  errorTxt: { fontFamily: "SpaceGrotesk_400Regular", color: C.negative, marginBottom: 8 },
  link: { fontFamily: "SpaceGrotesk_600SemiBold", color: C.primary, fontSize: 14 },
});
