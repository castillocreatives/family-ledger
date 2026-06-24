import { useQuery, useQueries } from "@tanstack/react-query";
import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiGet, centsToDisplay } from "@/lib/api";
import colors from "@/constants/colors";

const C = colors.light;

type Kid = { id: number; name: string; color: string };
type WeekSummary = {
  id: number; kidId: number; kidName: string; kidColor: string;
  startDate: string; endDate: string;
  openingBalanceCents: number; runningTotalCents: number;
  status: string; paidOutCents: number | null; rolledOverCents: number | null;
  choresDone: number; choresMissed: number;
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function fmt(dateStr: string) {
  const [, m, d] = dateStr.split("-");
  return `${MONTHS[parseInt(m) - 1]} ${parseInt(d)}`;
}

function closedDow(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return DOW[d.getDay()];
}

type WeekGroup = {
  startDate: string;
  endDate: string;
  rows: WeekSummary[];
};

function groupByWeek(allWeeks: WeekSummary[]): WeekGroup[] {
  const map = new Map<string, WeekGroup>();
  for (const w of allWeeks) {
    const key = w.startDate;
    if (!map.has(key)) {
      map.set(key, { startDate: w.startDate, endDate: w.endDate, rows: [] });
    }
    map.get(key)!.rows.push(w);
  }
  return Array.from(map.values()).sort((a, b) => b.startDate.localeCompare(a.startDate));
}

export default function HistoryScreen() {
  const [refreshing, setRefreshing] = useState(false);

  const { data: kids = [], isLoading: kidsLoading } = useQuery<Kid[]>({
    queryKey: ["kids"],
    queryFn: () => apiGet("/kids"),
  });

  const weekQueries = useQueries({
    queries: kids.map(k => ({
      queryKey: ["kid-weeks", k.id],
      queryFn: () => apiGet<WeekSummary[]>(`/kids/${k.id}/weeks`),
      enabled: kids.length > 0,
    })),
  });

  const allLoading = kidsLoading || weekQueries.some(q => q.isLoading);
  const allWeeks: WeekSummary[] = weekQueries.flatMap(q => q.data ?? []);
  const closedWeeks = allWeeks.filter(w => w.status === "closed");
  const groups = groupByWeek(closedWeeks);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all(weekQueries.map(q => q.refetch()));
    setRefreshing(false);
  };

  if (allLoading && !closedWeeks.length) {
    return <View style={styles.center}><ActivityIndicator color={C.primary} /></View>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
      >
        {groups.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No history yet</Text>
            <Text style={styles.emptyBody}>Closed weeks will appear here as a running ledger.</Text>
          </View>
        )}

        {groups.map(group => (
          <View key={group.startDate} style={styles.weekGroup}>
            {/* Week header */}
            <View style={styles.weekHeaderRow}>
              <Text style={styles.weekDateRange}>{fmt(group.startDate)} – {fmt(group.endDate)}</Text>
              <Text style={styles.weekClosedDow}>closed {closedDow(group.endDate)}</Text>
            </View>

            {/* Per-kid rows */}
            {group.rows.map(w => {
              const paid = w.paidOutCents !== null && w.paidOutCents > 0;
              const rolled = w.rolledOverCents !== null && w.rolledOverCents < 0;
              return (
                <View key={w.id} style={styles.kidRow}>
                  <View style={[styles.kidDot, { backgroundColor: w.kidColor }]} />
                  <Text style={styles.kidRowName}>{w.kidName}</Text>
                  <View style={styles.kidRowRight}>
                    {paid && (
                      <Text style={[styles.kidRowResult, { color: C.positive }]}>
                        paid {centsToDisplay(w.paidOutCents!)}
                      </Text>
                    )}
                    {rolled && (
                      <Text style={[styles.kidRowResult, { color: C.negative }]}>
                        rolled {centsToDisplay(w.rolledOverCents!)} → opened {centsToDisplay(w.openingBalanceCents + w.rolledOverCents!)}
                      </Text>
                    )}
                    {!paid && !rolled && (
                      <Text style={styles.kidRowResult}>
                        {centsToDisplay(w.runningTotalCents)}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        ))}

        {groups.length > 0 && (
          <Text style={styles.endLabel}>— earlier weeks —</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  scroll: { padding: 16, paddingBottom: 110 },

  weekGroup: { marginBottom: 20 },
  weekHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.border, marginBottom: 2 },
  weekDateRange: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: C.foreground },
  weekClosedDow: { fontFamily: "Inter_400Regular", fontSize: 12, color: C.mutedForeground },

  kidRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: C.border + "80" },
  kidDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  kidRowName: { fontFamily: "Inter_500Medium", fontSize: 15, color: C.foreground, width: 70 },
  kidRowRight: { flex: 1, alignItems: "flex-end" },
  kidRowResult: { fontFamily: "Inter_400Regular", fontSize: 14, color: C.mutedForeground },

  emptyCard: { backgroundColor: C.card, borderRadius: 14, padding: 24, alignItems: "center", borderWidth: 1, borderColor: C.border },
  emptyTitle: { fontFamily: "Inter_600SemiBold", fontSize: 17, color: C.foreground, marginBottom: 6 },
  emptyBody: { fontFamily: "Inter_400Regular", fontSize: 13, color: C.mutedForeground, textAlign: "center" },

  endLabel: { fontFamily: "Inter_400Regular", fontSize: 12, color: C.mutedForeground, textAlign: "center", marginTop: 8 },
});
