import { useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiGet, centsToDisplay } from "@/lib/api";
import colors from "@/constants/colors";

const C = colors.light;

type Kid = { id: number; name: string; color: string };
type WeekSummary = {
  id: number; kidId: number; kidName: string; kidColor: string;
  startDate: string; endDate: string;
  openingBalanceCents: number; runningTotalCents: number; netChangeCents: number;
  status: string; paidOutCents: number | null; rolledOverCents: number | null;
  choresDone: number; choresMissed: number;
};

export default function HistoryScreen() {
  const [selectedKidId, setSelectedKidId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const { data: kids = [] } = useQuery<Kid[]>({
    queryKey: ["kids"],
    queryFn: () => apiGet("/kids"),
  });

  const activeKid = selectedKidId ? kids.find(k => k.id === selectedKidId) : kids[0];

  const { data: weeks = [], isLoading, refetch } = useQuery<WeekSummary[]>({
    queryKey: ["kid-weeks", activeKid?.id],
    queryFn: () => apiGet(`/kids/${activeKid!.id}/weeks`),
    enabled: !!activeKid?.id,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      {/* Kid tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.kidScroll} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10 }}>
        {kids.map(k => (
          <TouchableOpacity
            key={k.id}
            style={[styles.kidPill, activeKid?.id === k.id && { backgroundColor: k.color }]}
            onPress={() => setSelectedKidId(k.id)}
          >
            <Text style={[styles.kidPillTxt, activeKid?.id === k.id && { color: C.primaryForeground }]}>{k.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={C.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
        >
          {weeks.length === 0 && (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No history yet</Text>
              <Text style={styles.emptyBody}>Weeks will appear here after they're closed.</Text>
            </View>
          )}

          {weeks.map(w => {
            const isPos = w.runningTotalCents >= 0;
            const isClosed = w.status === "closed";
            return (
              <View key={w.id} style={[styles.weekCard, { borderLeftColor: w.kidColor, borderLeftWidth: 3 }]}>
                <View style={styles.weekRow}>
                  <View>
                    <Text style={styles.weekDates}>{w.startDate} – {w.endDate}</Text>
                    <Text style={[styles.statusBadge, { color: isClosed ? C.positive : C.primary }]}>
                      {isClosed ? "Closed" : "Open"}
                    </Text>
                  </View>
                  <Text style={[styles.weekTotal, { color: isPos ? C.positive : C.negative }]}>
                    {centsToDisplay(w.runningTotalCents)}
                  </Text>
                </View>

                <View style={styles.weekStats}>
                  <View style={styles.weekStat}>
                    <Text style={styles.statNum}>{w.choresDone}</Text>
                    <Text style={styles.statLbl}>done</Text>
                  </View>
                  <View style={styles.weekStat}>
                    <Text style={[styles.statNum, w.choresMissed > 0 && { color: C.negative }]}>{w.choresMissed}</Text>
                    <Text style={styles.statLbl}>missed</Text>
                  </View>
                  {isClosed && w.paidOutCents !== null && (
                    <View style={styles.weekStat}>
                      <Text style={[styles.statNum, { color: C.positive }]}>{centsToDisplay(w.paidOutCents)}</Text>
                      <Text style={styles.statLbl}>paid out</Text>
                    </View>
                  )}
                  {isClosed && w.rolledOverCents !== null && w.rolledOverCents < 0 && (
                    <View style={styles.weekStat}>
                      <Text style={[styles.statNum, { color: C.negative }]}>{centsToDisplay(w.rolledOverCents)}</Text>
                      <Text style={styles.statLbl}>rolled</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  kidScroll: { backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
  kidPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginRight: 8, backgroundColor: C.surface },
  kidPillTxt: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 14, color: C.foreground },
  scroll: { padding: 16, paddingBottom: 110 },
  weekCard: { backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  weekRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  weekDates: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 14, color: C.foreground },
  statusBadge: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 11, marginTop: 2 },
  weekTotal: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 20 },
  weekStats: { flexDirection: "row", marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border },
  weekStat: { flex: 1, alignItems: "center" },
  statNum: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 14, color: C.foreground },
  statLbl: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 11, color: C.mutedForeground, marginTop: 2 },
  emptyCard: { backgroundColor: C.card, borderRadius: 14, padding: 24, alignItems: "center", borderWidth: 1, borderColor: C.border },
  emptyTitle: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 17, color: C.foreground, marginBottom: 6 },
  emptyBody: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 13, color: C.mutedForeground, textAlign: "center" },
});
