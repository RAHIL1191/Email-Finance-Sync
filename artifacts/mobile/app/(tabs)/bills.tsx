import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AddBillModal from "@/components/AddBillModal";
import { Bill, useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

function BillCard({
  bill,
  onPay,
  onDelete,
}: {
  bill: Bill;
  onPay: () => void;
  onDelete: () => void;
}) {
  const colors = useColors();
  const dueDate = new Date(bill.dueDate);
  const today = new Date();
  const daysUntil = Math.ceil(
    (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  const isOverdue = daysUntil < 0 && !bill.isPaid;
  const isDueSoon = daysUntil >= 0 && daysUntil <= 3 && !bill.isPaid;

  const statusColor = bill.isPaid
    ? colors.success
    : isOverdue
    ? colors.expense
    : isDueSoon
    ? colors.warning
    : colors.mutedForeground;

  const statusLabel = bill.isPaid
    ? "Paid"
    : isOverdue
    ? `${Math.abs(daysUntil)}d overdue`
    : daysUntil === 0
    ? "Due today"
    : `Due in ${daysUntil}d`;

  const dueDateStr = dueDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return (
    <View
      style={[
        styles.billCard,
        {
          backgroundColor: colors.card,
          borderLeftColor: statusColor,
        },
      ]}
    >
      <View style={styles.billMain}>
        <View style={styles.billInfo}>
          <Text style={[styles.billTitle, { color: colors.foreground }]}>
            {bill.title}
          </Text>
          <View style={styles.billMeta}>
            <Text
              style={[styles.billCategory, { color: colors.mutedForeground }]}
            >
              {bill.category}
            </Text>
            {bill.isRecurring && (
              <View
                style={[
                  styles.recurBadge,
                  { backgroundColor: colors.muted },
                ]}
              >
                <Feather
                  name="repeat"
                  size={10}
                  color={colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.recurText,
                    { color: colors.mutedForeground },
                  ]}
                >
                  {bill.frequency}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.dueDateRow}>
            <Feather name="calendar" size={12} color={statusColor} />
            <Text style={[styles.dueDate, { color: statusColor }]}>
              {dueDateStr} · {statusLabel}
            </Text>
          </View>
        </View>

        <View style={styles.billRight}>
          <Text style={[styles.billAmount, { color: colors.foreground }]}>
            ${bill.amount.toFixed(2)}
          </Text>
          <View style={styles.billActions}>
            {!bill.isPaid && (
              <TouchableOpacity
                style={[styles.payBtn, { backgroundColor: colors.success }]}
                onPress={() => {
                  Haptics.notificationAsync(
                    Haptics.NotificationFeedbackType.Success
                  );
                  onPay();
                }}
              >
                <Feather name="check" size={14} color="#fff" />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                Alert.alert("Delete Bill", `Remove "${bill.title}"?`, [
                  { text: "Cancel", style: "cancel" },
                  { text: "Delete", style: "destructive", onPress: onDelete },
                ]);
              }}
            >
              <Feather name="trash-2" size={15} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function BillsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { bills, markBillPaid, deleteBill } = useApp();
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState<"all" | "upcoming" | "paid">("all");
  const topPaddingWeb = Platform.OS === "web" ? 67 : insets.top;

  const filtered = useMemo(() => {
    if (filter === "upcoming") return bills.filter((b) => !b.isPaid);
    if (filter === "paid") return bills.filter((b) => b.isPaid);
    return bills;
  }, [bills, filter]);

  const totalUpcoming = bills
    .filter((b) => !b.isPaid)
    .reduce((s, b) => s + b.amount, 0);

  const overdueCount = bills.filter((b) => {
    if (b.isPaid) return false;
    const daysUntil = Math.ceil(
      (new Date(b.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    return daysUntil < 0;
  }).length;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={filtered}
        keyExtractor={(b) => b.id}
        renderItem={({ item }) => (
          <BillCard
            bill={item}
            onPay={() => markBillPaid(item.id)}
            onDelete={() => deleteBill(item.id)}
          />
        )}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingBottom: Platform.OS === "web" ? 34 + 84 : 100,
          },
        ]}
        ListHeaderComponent={
          <>
            {/* Header */}
            <View
              style={[styles.header, { paddingTop: topPaddingWeb + 12 }]}
            >
              <Text style={[styles.title, { color: colors.foreground }]}>
                Bills
              </Text>
              <TouchableOpacity
                style={[styles.addBtn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setShowAdd(true);
                }}
              >
                <Feather name="plus" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Summary */}
            <View style={styles.summaryRow}>
              <View
                style={[styles.summaryCard, { backgroundColor: colors.card }]}
              >
                <Feather name="clock" size={18} color={colors.warning} />
                <Text
                  style={[styles.summaryAmount, { color: colors.foreground }]}
                >
                  ${totalUpcoming.toFixed(0)}
                </Text>
                <Text
                  style={[
                    styles.summaryLabel,
                    { color: colors.mutedForeground },
                  ]}
                >
                  Upcoming
                </Text>
              </View>
              <View
                style={[styles.summaryCard, { backgroundColor: colors.card }]}
              >
                <Feather
                  name="alert-circle"
                  size={18}
                  color={overdueCount > 0 ? colors.expense : colors.success}
                />
                <Text
                  style={[
                    styles.summaryAmount,
                    {
                      color:
                        overdueCount > 0 ? colors.expense : colors.foreground,
                    },
                  ]}
                >
                  {overdueCount}
                </Text>
                <Text
                  style={[
                    styles.summaryLabel,
                    { color: colors.mutedForeground },
                  ]}
                >
                  Overdue
                </Text>
              </View>
              <View
                style={[styles.summaryCard, { backgroundColor: colors.card }]}
              >
                <Feather name="check-circle" size={18} color={colors.success} />
                <Text
                  style={[styles.summaryAmount, { color: colors.foreground }]}
                >
                  {bills.filter((b) => b.isPaid).length}
                </Text>
                <Text
                  style={[
                    styles.summaryLabel,
                    { color: colors.mutedForeground },
                  ]}
                >
                  Paid
                </Text>
              </View>
            </View>

            {/* Filters */}
            <View style={styles.filterRow}>
              {(["all", "upcoming", "paid"] as const).map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor:
                        filter === f ? colors.primary : colors.card,
                      borderColor:
                        filter === f ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => setFilter(f)}
                >
                  <Text
                    style={[
                      styles.filterText,
                      { color: filter === f ? "#fff" : colors.mutedForeground },
                    ]}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={[styles.empty, { backgroundColor: colors.card }]}>
            <Feather
              name="file-text"
              size={36}
              color={colors.mutedForeground}
            />
            <Text
              style={[styles.emptyText, { color: colors.mutedForeground }]}
            >
              No bills found
            </Text>
          </View>
        }
      />
      <AddBillModal visible={showAdd} onClose={() => setShowAdd(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: {
    paddingHorizontal: 16,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: { fontSize: 24, fontFamily: "Inter_700Bold" },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 14,
    padding: 14,
    gap: 5,
    alignItems: "flex-start",
  },
  summaryAmount: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  summaryLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  billCard: {
    borderRadius: 14,
    padding: 16,
    borderLeftWidth: 4,
  },
  billMain: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  billInfo: {
    flex: 1,
    gap: 4,
  },
  billTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  billMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  billCategory: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  recurBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  recurText: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
  dueDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  dueDate: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  billRight: {
    alignItems: "flex-end",
    gap: 10,
  },
  billAmount: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  billActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  payBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    padding: 40,
    borderRadius: 14,
    alignItems: "center",
    gap: 12,
    marginTop: 24,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
});
