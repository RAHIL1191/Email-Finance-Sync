import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import {
  Transaction,
  isPendingRefund,
  isRefundTransaction,
  useApp,
} from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { parseLocalDate } from "@/hooks/useLocalDate";

interface PendingRefundsWidgetProps {
  onRefundCompleted?: (refundId: string) => void;
}

export default function PendingRefundsWidget({ onRefundCompleted }: PendingRefundsWidgetProps) {
  const colors = useColors();
  const { transactions, updateTransaction } = useApp();

  // 1. Identify all pending refunds (must be under Pending on the Refund screen)
  const pendingRefunds = useMemo(() => {
    return transactions
      .filter(isPendingRefund)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions]);

  // 2. Track dismissed suggestion keys so users can dismiss without marking complete
  const [dismissedMatches, setDismissedMatches] = useState<Set<string>>(new Set());

  // 3. Find matching income transactions for pending refunds
  const matchingPairs = useMemo(() => {
    const pairs: Array<{ refund: Transaction; match: Transaction; key: string }> = [];
    const usedMatchIds = new Set<string>();

    for (const refund of pendingRefunds) {
      const refundDateMs = parseLocalDate(refund.date).getTime();
      const match = transactions.find((t) => {
        if (t.id === refund.id || usedMatchIds.has(t.id)) return false;
        if (t.type !== "income") return false;
        if (isRefundTransaction(t)) return false;
        // Amount within 1%
        const amountDiff = Math.abs(t.amount - refund.amount);
        const withinOnePercent = amountDiff / refund.amount < 0.01;
        // Transaction occurred on or after refund request date
        const txDateMs = parseLocalDate(t.date).getTime();
        return withinOnePercent && txDateMs >= refundDateMs;
      });

      if (match) {
        const key = `${refund.id}_${match.id}`;
        if (!dismissedMatches.has(key)) {
          pairs.push({ refund, match, key });
          usedMatchIds.add(match.id);
        }
      }
    }
    return pairs;
  }, [pendingRefunds, transactions, dismissedMatches]);

  // If there are no pending refunds, completely hide the widget
  if (pendingRefunds.length === 0) {
    return null;
  }

  const handleMarkComplete = (refund: Transaction) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    updateTransaction(refund.id, { isRefundComplete: true });
    onRefundCompleted?.(refund.id);
  };

  const confirmComplete = (refund: Transaction) => {
    Alert.alert(
      "Mark Refund Complete?",
      `Mark $${refund.amount.toFixed(2)} refund for "${refund.title}" as complete?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Mark Complete",
          style: "default",
          onPress: () => handleMarkComplete(refund),
        },
      ]
    );
  };

  const dismissMatch = (key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDismissedMatches((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    const d = parseLocalDate(dateStr);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[d.getMonth()]} ${d.getDate()}`;
  };

  return (
    <View style={s.container}>
      {/* ── A. Matching Refund Alert Cards (Same aesthetic & layout as Billing Under Review) ── */}
      {matchingPairs.length > 0 && (
        <View
          style={[
            s.alertCard,
            {
              backgroundColor: colors.card,
              borderColor: "#10b98188",
            },
          ]}
        >
          <View style={s.sectionHeaderRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View
                style={[
                  s.alertIconCircle,
                  { backgroundColor: "#10b98122" },
                ]}
              >
                <Feather name="rotate-ccw" size={15} color="#10b981" />
              </View>
              <Text style={[s.sectionTitle, { color: colors.foreground }]}>
                Matching Refund Detected
              </Text>
            </View>
            <View
              style={[
                s.countPill,
                { backgroundColor: "#10b98122" },
              ]}
            >
              <Text style={[s.countPillText, { color: "#10b981" }]}>
                {matchingPairs.length} {matchingPairs.length === 1 ? "match" : "matches"}
              </Text>
            </View>
          </View>

          <View style={{ gap: 12, marginTop: 6 }}>
            {matchingPairs.map(({ refund, match, key }) => (
              <View
                key={key}
                style={[
                  s.reviewMatchCard,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[s.reviewPromptText, { color: colors.foreground }]}>
                  A matching refund amount of{" "}
                  <Text style={{ fontFamily: "Inter_700Bold", color: "#10b981" }}>
                    ${match.amount.toFixed(2)}
                  </Text>{" "}
                  is present in your income. Do you want to mark this refund as complete?
                </Text>

                <View
                  style={[
                    s.reviewComparisonRow,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  {/* Pending Refund Column */}
                  <View style={{ flex: 1 }}>
                    <Text style={[s.reviewSubHeader, { color: colors.mutedForeground }]}>
                      Pending Refund
                    </Text>
                    <Text style={[s.reviewItemTitle, { color: colors.foreground }]} numberOfLines={1}>
                      {refund.title}
                    </Text>
                    <Text style={[s.reviewItemMeta, { color: colors.mutedForeground }]}>
                      {formatDate(refund.date)} • {refund.category}
                    </Text>
                    <Text style={[s.reviewItemAmt, { color: colors.foreground }]}>
                      ${refund.amount.toFixed(2)}
                    </Text>
                  </View>

                  {/* Arrow Divider */}
                  <View style={{ alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }}>
                    <Feather name="arrow-right" size={16} color={colors.mutedForeground} />
                  </View>

                  {/* Matching Income Transaction Column */}
                  <View style={{ flex: 1 }}>
                    <Text style={[s.reviewSubHeader, { color: colors.mutedForeground }]}>
                      Received Income
                    </Text>
                    <Text style={[s.reviewItemTitle, { color: colors.foreground }]} numberOfLines={1}>
                      {match.title}
                    </Text>
                    <Text style={[s.reviewItemMeta, { color: colors.mutedForeground }]}>
                      {formatDate(match.date)} • {match.category}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={[s.reviewItemAmt, { color: "#10b981" }]}>
                        +${match.amount.toFixed(2)}
                      </Text>
                      <View style={[s.diffBadge, { backgroundColor: "#10b98122" }]}>
                        <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: "#10b981" }}>
                          Match
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>

                {/* Actions Row */}
                <View style={s.reviewActionsRow}>
                  <TouchableOpacity
                    style={[s.reviewDismissBtn, { borderColor: colors.border }]}
                    onPress={() => dismissMatch(key)}
                    activeOpacity={0.7}
                  >
                    <Feather name="x" size={14} color={colors.mutedForeground} />
                    <Text style={[s.reviewDismissTxt, { color: colors.mutedForeground }]}>
                      Dismiss
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[s.reviewApproveBtn, { backgroundColor: "#10b981" }]}
                    onPress={() => handleMarkComplete(refund)}
                    activeOpacity={0.85}
                  >
                    <Feather name="check" size={14} color="#FFFFFF" />
                    <Text style={s.reviewApproveTxt}>Mark Complete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* ── B. Pending Refunds List Card ── */}
      <View
        style={[
          s.widgetCard,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={s.sectionHeaderRow}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={[s.iconCircle, { backgroundColor: "#f59e0b22" }]}>
              <Feather name="rotate-ccw" size={15} color="#f59e0b" />
            </View>
            <Text style={[s.sectionTitle, { color: colors.foreground }]}>
              Pending refunds
            </Text>
            <View style={[s.countPill, { backgroundColor: "#f59e0b20" }]}>
              <Text style={[s.countPillText, { color: "#f59e0b" }]}>
                {pendingRefunds.length}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={() => router.push("/refunds")}
            style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
          >
            <Text style={[s.sectionLink, { color: colors.mutedForeground }]}>View all</Text>
            <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        <View style={{ gap: 12, marginTop: 4 }}>
          {pendingRefunds.slice(0, 4).map((item) => (
            <View key={item.id} style={s.listRow}>
              <View
                style={[
                  s.iconCircle,
                  { backgroundColor: "#f59e0b22" },
                ]}
              >
                <Feather name="clock" size={16} color="#f59e0b" />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[s.rowTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={[s.rowSubtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {item.category} • {formatDate(item.date)}
                </Text>
              </View>

              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <Text style={[s.rowAmount, { color: colors.income }]}>
                  ${item.amount.toFixed(2)}
                </Text>
                <TouchableOpacity
                  style={[s.completeBtn, { backgroundColor: "#10b98118", borderColor: "#10b98144" }]}
                  onPress={() => confirmComplete(item)}
                  activeOpacity={0.75}
                >
                  <Feather name="check" size={11} color="#10b981" />
                  <Text style={[s.completeBtnText, { color: "#10b981" }]}>
                    Complete
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    gap: 16,
  },
  alertCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 16,
  },
  widgetCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  sectionLink: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  alertIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  countPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  countPillText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  reviewMatchCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  reviewPromptText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    lineHeight: 18,
  },
  reviewComparisonRow: {
    flexDirection: "row",
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    alignItems: "center",
  },
  reviewSubHeader: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  reviewItemTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  reviewItemMeta: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
    marginBottom: 4,
  },
  reviewItemAmt: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  diffBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
  },
  reviewActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  reviewDismissBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  reviewDismissTxt: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  reviewApproveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
  },
  reviewApproveTxt: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowTitle: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  rowSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  rowAmount: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  completeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  completeBtnText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
});
