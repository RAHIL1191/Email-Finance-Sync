import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Transaction, useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Returns income transactions that share the same amount as a pending refund (within 1%) */
function detectMatches(
  pending: Transaction[],
  allTransactions: Transaction[]
): Array<{ refund: Transaction; match: Transaction }> {
  const results: Array<{ refund: Transaction; match: Transaction }> = [];
  const seen = new Set<string>();

  for (const refund of pending) {
    const key = refund.id;
    if (seen.has(key)) continue;

    const refundDateMs = new Date(refund.date).getTime();
    const match = allTransactions.find(
      (t) =>
        t.type === "income" &&
        !t.isRefund &&
        Math.abs(t.amount - refund.amount) / refund.amount < 0.01 &&
        new Date(t.date).getTime() >= refundDateMs
    );

    if (match) {
      results.push({ refund, match });
      seen.add(key);
    }
  }

  return results;
}

function AISuggestionBanner({
  refund,
  match,
  onMarkComplete,
}: {
  refund: Transaction;
  match: Transaction;
  onMarkComplete: () => void;
}) {
  const colors = useColors();
  return (
    <View style={[s.banner, { backgroundColor: "#10b981" + "12", borderColor: "#10b981" + "40" }]}>
      <View style={s.bannerRow}>
        <View style={[s.bannerIcon, { backgroundColor: "#10b981" + "20" }]}>
          <Feather name="cpu" size={14} color="#10b981" />
        </View>
        <Text style={[s.bannerTitle, { color: "#10b981" }]}>AI Refund Match Detected</Text>
      </View>
      <Text style={[s.bannerBody, { color: colors.foreground }]}>
        Your pending refund of{" "}
        <Text style={{ fontFamily: "Inter_600SemiBold" }}>${refund.amount.toFixed(2)}</Text>
        {" "}({refund.title}) may have arrived — an income of{" "}
        <Text style={{ fontFamily: "Inter_600SemiBold" }}>${match.amount.toFixed(2)}</Text>
        {" "}was recorded on {formatDate(match.date)}.
      </Text>
      <TouchableOpacity
        style={[s.bannerBtn, { backgroundColor: "#10b981" }]}
        onPress={onMarkComplete}
        activeOpacity={0.85}
      >
        <Feather name="check" size={14} color="#fff" />
        <Text style={s.bannerBtnText}>Mark refund as complete</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function RefundsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { transactions, updateTransaction } = useApp();
  const [filter, setFilter] = useState<"all" | "pending" | "complete">("all");

  const refundTxs = useMemo(
    () =>
      transactions
        .filter(
          (t) =>
            t.isRefund ||
            t.category.trim().toLowerCase() === "refund"
        )
        .sort((a, b) => b.date.localeCompare(a.date)),
    [transactions]
  );

  const pendingRefunds = useMemo(
    () => refundTxs.filter((t) => !t.isRefundComplete),
    [refundTxs]
  );

  const completedRefunds = useMemo(
    () => refundTxs.filter((t) => t.isRefundComplete),
    [refundTxs]
  );

  const aiMatches = useMemo(
    () => detectMatches(pendingRefunds, transactions),
    [pendingRefunds, transactions]
  );

  const visibleTxs = useMemo(() => {
    if (filter === "pending") return pendingRefunds;
    if (filter === "complete") return completedRefunds;
    return refundTxs;
  }, [filter, refundTxs, pendingRefunds, completedRefunds]);

  const total = refundTxs.reduce((s, t) => s + t.amount, 0);

  const markComplete = (tx: Transaction) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    updateTransaction(tx.id, { isRefundComplete: true });
  };

  const confirmMarkComplete = (tx: Transaction) => {
    Alert.alert(
      "Mark as Complete?",
      `Mark the $${tx.amount.toFixed(2)} refund for "${tx.title}" as received?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Mark Complete", style: "default", onPress: () => markComplete(tx) },
      ]
    );
  };

  return (
    <SafeAreaView
      style={[s.container, { backgroundColor: colors.background }]}
      edges={["top"]}
    >
      {/* Header */}
      <View
        style={[
          s.header,
          { backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={10}
          style={s.headerBtn}
        >
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <View style={[s.headerIcon, { backgroundColor: "#10b981" + "18" }]}>
            <Feather name="rotate-ccw" size={16} color="#10b981" />
          </View>
          <Text style={[s.title, { color: colors.foreground }]}>Refunds</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Summary bar */}
      <View
        style={[
          s.summary,
          { backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        <View style={s.summaryItem}>
          <Text style={[s.summaryLabel, { color: colors.mutedForeground }]}>
            Total
          </Text>
          <Text style={[s.summaryValue, { color: colors.income }]}>
            ${total.toFixed(2)}
          </Text>
        </View>
        <View style={[s.sep, { backgroundColor: colors.border }]} />
        <View style={s.summaryItem}>
          <Text style={[s.summaryLabel, { color: colors.mutedForeground }]}>
            Pending
          </Text>
          <Text style={[s.summaryValue, { color: "#f59e0b" }]}>
            {pendingRefunds.length}
          </Text>
        </View>
        <View style={[s.sep, { backgroundColor: colors.border }]} />
        <View style={s.summaryItem}>
          <Text style={[s.summaryLabel, { color: colors.mutedForeground }]}>
            Completed
          </Text>
          <Text style={[s.summaryValue, { color: "#10b981" }]}>
            {completedRefunds.length}
          </Text>
        </View>
      </View>

      {/* Filter chips */}
      <View style={[s.filterRow, { backgroundColor: colors.background }]}>
        {(["all", "pending", "complete"] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[
              s.filterChip,
              {
                backgroundColor:
                  filter === f ? "#10b981" : colors.card,
                borderColor:
                  filter === f ? "#10b981" : colors.border,
              },
            ]}
            onPress={() => setFilter(f)}
            activeOpacity={0.8}
          >
            <Text
              style={[
                s.filterChipText,
                { color: filter === f ? "#fff" : colors.foreground },
              ]}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={visibleTxs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        ListHeaderComponent={
          aiMatches.length > 0 && filter !== "complete" ? (
            <View style={s.bannersWrapper}>
              {aiMatches.map(({ refund, match }) => (
                <AISuggestionBanner
                  key={refund.id}
                  refund={refund}
                  match={match}
                  onMarkComplete={() => markComplete(refund)}
                />
              ))}
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={s.empty}>
            <Feather name="rotate-ccw" size={44} color={colors.mutedForeground} />
            <Text style={[s.emptyTitle, { color: colors.foreground }]}>
              {filter === "complete"
                ? "No completed refunds yet"
                : filter === "pending"
                ? "No pending refunds"
                : "No refund transactions yet"}
            </Text>
            <Text style={[s.emptyText, { color: colors.mutedForeground }]}>
              {filter === "all"
                ? 'Tag an expense or income entry with the "Refund" category or tag to track it here.'
                : ""}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isComplete = !!item.isRefundComplete;
          return (
            <View
              style={[
                s.row,
                {
                  backgroundColor: colors.card,
                  borderBottomColor: colors.border,
                  opacity: isComplete ? 0.75 : 1,
                },
              ]}
            >
              {/* Icon */}
              <View
                style={[
                  s.icon,
                  {
                    backgroundColor: isComplete
                      ? "#10b981" + "20"
                      : "#f59e0b" + "20",
                  },
                ]}
              >
                <Feather
                  name={isComplete ? "check-circle" : "rotate-ccw"}
                  size={18}
                  color={isComplete ? "#10b981" : "#f59e0b"}
                />
              </View>

              {/* Info */}
              <View style={s.info}>
                <Text
                  style={[s.rowTitle, { color: colors.foreground }]}
                  numberOfLines={1}
                >
                  {item.title}
                </Text>
                <Text
                  style={[s.rowSub, { color: colors.mutedForeground }]}
                  numberOfLines={1}
                >
                  {item.category}
                  {item.projectName ? ` · ${item.projectName}` : ""}
                  {" · "}
                  {isComplete ? "Completed" : "Pending"}
                  {" · "}
                  {formatDate(item.date)}
                </Text>
              </View>

              {/* Amount + action */}
              <View style={s.rowRight}>
                <Text style={[s.amount, { color: colors.income }]}>
                  ${item.amount.toFixed(2)}
                </Text>
                {!isComplete ? (
                  <TouchableOpacity
                    style={[s.completeBtn, { backgroundColor: "#10b981" + "18", borderColor: "#10b981" + "40" }]}
                    onPress={() => confirmMarkComplete(item)}
                    activeOpacity={0.75}
                  >
                    <Feather name="check" size={12} color="#10b981" />
                    <Text style={[s.completeBtnText, { color: "#10b981" }]}>
                      Complete
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View style={[s.completedBadge, { backgroundColor: "#10b981" + "18" }]}>
                    <Text style={[s.completedBadgeText, { color: "#10b981" }]}>Done</Text>
                  </View>
                )}
              </View>
            </View>
          );
        }}
      />
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
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 17, fontFamily: "Inter_700Bold" },
  summary: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
  },
  summaryItem: { flex: 1, alignItems: "center", gap: 4 },
  summaryLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  summaryValue: { fontSize: 19, fontFamily: "Inter_700Bold" },
  sep: { width: 1, marginVertical: 2 },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  bannersWrapper: { padding: 12, gap: 10 },
  banner: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  bannerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  bannerIcon: {
    width: 24,
    height: 24,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  bannerBody: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  bannerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignSelf: "flex-start",
    marginTop: 2,
  },
  bannerBtnText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    gap: 10,
    marginTop: 60,
  },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 19,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  info: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14, fontFamily: "Inter_500Medium" },
  rowSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  rowRight: { alignItems: "flex-end", gap: 6 },
  amount: { fontSize: 15, fontFamily: "Inter_700Bold" },
  completeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  completeBtnText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  completedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  completedBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
});
