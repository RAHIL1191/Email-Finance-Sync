import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useMemo } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

export default function RefundsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { transactions } = useApp();

  const refundTxs = useMemo(
    () => transactions.filter((t) => t.isRefund).sort((a, b) => b.date.localeCompare(a.date)),
    [transactions]
  );

  const total = refundTxs.reduce((s, t) => s + t.amount, 0);
  const completeCount = refundTxs.filter((t) => t.type === "income").length;
  const pendingCount = refundTxs.filter((t) => t.type !== "income").length;

  return (
    <SafeAreaView style={[s.container, { backgroundColor: colors.background }]} edges={["top"]}>
      <View style={[s.header, { paddingTop: insets.top + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={s.headerBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[s.title, { color: colors.foreground }]}>Refunds</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={[s.summary, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={s.summaryItem}>
          <Text style={[s.summaryLabel, { color: colors.mutedForeground }]}>Tagged Refunds</Text>
          <Text style={[s.summaryValue, { color: colors.income }]}>${total.toFixed(2)}</Text>
        </View>
        <View style={[s.sep, { backgroundColor: colors.border }]} />
        <View style={s.summaryItem}>
          <Text style={[s.summaryLabel, { color: colors.mutedForeground }]}>Completed</Text>
          <Text style={[s.summaryValue, { color: colors.foreground }]}>{completeCount}</Text>
        </View>
        <View style={[s.sep, { backgroundColor: colors.border }]} />
        <View style={s.summaryItem}>
          <Text style={[s.summaryLabel, { color: colors.mutedForeground }]}>Pending</Text>
          <Text style={[s.summaryValue, { color: colors.expense }]}>{pendingCount}</Text>
        </View>
      </View>

      {refundTxs.length === 0 ? (
        <View style={s.empty}>
          <Feather name="rotate-ccw" size={44} color={colors.mutedForeground} />
          <Text style={[s.emptyTitle, { color: colors.foreground }]}>No refund transactions yet</Text>
          <Text style={[s.emptyText, { color: colors.mutedForeground }]}>
            Tag an income entry as Refund to track when money returns to your account.
          </Text>
        </View>
      ) : (
        <FlatList
          data={refundTxs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          renderItem={({ item }) => (
            <View style={[s.row, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
              <View style={[s.icon, { backgroundColor: colors.income + "18" }]}>
                <Feather name="rotate-ccw" size={18} color={colors.income} />
              </View>
              <View style={s.info}>
                <Text style={[s.rowTitle, { color: colors.foreground }]} numberOfLines={1}>{item.title}</Text>
                <Text style={[s.rowSub, { color: colors.mutedForeground }]}>
                  {item.category}
                  {item.projectName ? ` · ${item.projectName}` : ""}
                  {" · "}
                  {item.type === "income" ? "Completed" : "Pending"}
                  {" · "}
                  {formatDate(item.date)}
                </Text>
              </View>
              <Text style={[s.amount, { color: colors.income }]}>+${item.amount.toFixed(2)}</Text>
            </View>
          )}
        />
      )}

      {refundTxs.length > 0 ? (
        <TouchableOpacity
          style={[s.refreshBtn, { backgroundColor: colors.primary }]}
          onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
          activeOpacity={0.85}
        >
          <Text style={s.refreshText}>Verify refunds</Text>
        </TouchableOpacity>
      ) : null}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 17, fontFamily: "Inter_700Bold" },
  summary: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
  },
  summaryItem: { flex: 1, alignItems: "center", gap: 4 },
  summaryLabel: { fontSize: 11, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.4 },
  summaryValue: { fontSize: 19, fontFamily: "Inter_700Bold" },
  sep: { width: 1, marginVertical: 2 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 19 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  icon: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  info: { flex: 1 },
  rowTitle: { fontSize: 14, fontFamily: "Inter_500Medium" },
  rowSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  amount: { fontSize: 15, fontFamily: "Inter_700Bold" },
  refreshBtn: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  refreshText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});