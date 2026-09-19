import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CATEGORY_COLORS, CATEGORY_ICONS } from "./TransactionItem";
import { Account, Transaction } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

interface Props {
  visible: boolean;
  onClose: () => void;
  merchantName: string;
  previousCategory: string;
  newCategory: string;
  similarTransactions: Transaction[];
  accounts: Account[];
  onConfirmUpdateSelected: (selectedIds: string[]) => void;
  onConfirmOnlyThis: () => void;
}

export default function SimilarTransactionsModal({
  visible,
  onClose,
  merchantName,
  previousCategory,
  newCategory,
  similarTransactions,
  accounts,
  onConfirmUpdateSelected,
  onConfirmOnlyThis,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // When modal becomes visible or list changes, select all by default
  useEffect(() => {
    if (visible && similarTransactions.length > 0) {
      setSelectedIds(similarTransactions.map((t) => t.id));
    }
  }, [visible, similarTransactions]);

  const toggleSelect = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const allSelected =
    similarTransactions.length > 0 &&
    selectedIds.length === similarTransactions.length;

  const toggleSelectAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(similarTransactions.map((t) => t.id));
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const parts = dateStr.split("T")[0].split("-");
      if (parts.length === 3) {
        const d = new Date(
          parseInt(parts[0], 10),
          parseInt(parts[1], 10) - 1,
          parseInt(parts[2], 10)
        );
        return d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  const pb = Platform.OS === "web" ? 24 : insets.bottom + 16;
  const count = similarTransactions.length;
  const selectedCount = selectedIds.length;

  const newCatColor = CATEGORY_COLORS[newCategory] || colors.primary;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={s.overlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />

        <View
          style={[
            s.sheetCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              paddingBottom: pb,
            },
          ]}
        >
          {/* Top Handle */}
          <View style={[s.handle, { backgroundColor: colors.border }]} />

          {/* Header */}
          <View style={s.header}>
            <View
              style={[
                s.badgeIcon,
                { backgroundColor: colors.primary + "18" },
              ]}
            >
              <Feather name="layers" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={s.titleRow}>
                <Text style={[s.title, { color: colors.foreground }]}>
                  Similar Transactions Found
                </Text>
                <View
                  style={[
                    s.countBadge,
                    { backgroundColor: colors.primary + "20" },
                  ]}
                >
                  <Text style={[s.countBadgeText, { color: colors.primary }]}>
                    {count} {count === 1 ? "match" : "matches"}
                  </Text>
                </View>
              </View>
              <Text style={[s.subtitle, { color: colors.mutedForeground }]}>
                Found {count} other {count === 1 ? "transaction" : "transactions"}{" "}
                in{" "}
                <Text
                  style={{
                    color: colors.foreground,
                    fontFamily: "Inter_600SemiBold",
                  }}
                >
                  "{previousCategory}"
                </Text>
                {merchantName && merchantName !== previousCategory ? (
                  <>
                    {" "}matching{" "}
                    <Text
                      style={{
                        color: colors.foreground,
                        fontFamily: "Inter_600SemiBold",
                      }}
                    >
                      "{merchantName}"
                    </Text>
                  </>
                ) : null}
                . Update {count === 1 ? "it" : "them"} to{" "}
                <Text
                  style={{
                    color: newCatColor,
                    fontFamily: "Inter_600SemiBold",
                  }}
                >
                  {newCategory}
                </Text>
                ?
              </Text>
            </View>
          </View>

          {/* Selection Toolbar */}
          <View
            style={[
              s.toolbar,
              {
                borderTopColor: colors.border,
                borderBottomColor: colors.border,
              },
            ]}
          >
            <TouchableOpacity
              style={s.selectToggleBtn}
              activeOpacity={0.7}
              onPress={toggleSelectAll}
            >
              <Feather
                name={allSelected ? "check-square" : "square"}
                size={16}
                color={colors.primary}
              />
              <Text style={[s.selectToggleText, { color: colors.primary }]}>
                {allSelected ? "Deselect All" : "Select All"}
              </Text>
            </TouchableOpacity>

            <Text style={[s.selectedCounter, { color: colors.mutedForeground }]}>
              {selectedCount} of {count} selected
            </Text>
          </View>

          {/* Fixed Scrollable Area for Transactions */}
          <View
            style={[
              s.scrollContainer,
              {
                backgroundColor: colors.background + "90",
                borderColor: colors.border,
              },
            ]}
          >
            <ScrollView
              style={s.scroll}
              contentContainerStyle={s.scrollContent}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
            >
              {similarTransactions.map((tx) => {
                const isChecked = selectedIds.includes(tx.id);
                const acc = accounts.find((a) => a.id === tx.accountId);
                const catIcon =
                  (CATEGORY_ICONS[tx.category] || "circle") as any;
                const catColor =
                  CATEGORY_COLORS[tx.category] || colors.primary;

                return (
                  <TouchableOpacity
                    key={tx.id}
                    style={[
                      s.txRow,
                      {
                        borderColor: isChecked
                          ? colors.primary + "60"
                          : colors.border,
                        backgroundColor: isChecked
                          ? colors.primary + "0A"
                          : colors.card,
                      },
                    ]}
                    activeOpacity={0.7}
                    onPress={() => toggleSelect(tx.id)}
                  >
                    {/* Checkbox */}
                    <View
                      style={[
                        s.checkbox,
                        {
                          borderColor: isChecked
                            ? colors.primary
                            : colors.border,
                          backgroundColor: isChecked
                            ? colors.primary
                            : "transparent",
                        },
                      ]}
                    >
                      {isChecked && (
                        <Feather name="check" size={13} color="#ffffff" />
                      )}
                    </View>

                    {/* Category icon */}
                    <View
                      style={[
                        s.catIconBadge,
                        { backgroundColor: catColor + "18" },
                      ]}
                    >
                      <Feather name={catIcon} size={15} color={catColor} />
                    </View>

                    {/* Center Info */}
                    <View style={s.txInfo}>
                      <Text
                        style={[s.txTitle, { color: colors.foreground }]}
                        numberOfLines={1}
                      >
                        {tx.title}
                      </Text>

                      <View style={s.txSubRow}>
                        <Text
                          style={[
                            s.txDate,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          {formatDate(tx.date)}
                        </Text>
                        {acc ? (
                          <>
                            <Text
                              style={[
                                s.txDot,
                                { color: colors.mutedForeground },
                              ]}
                            >
                              ·
                            </Text>
                            <Text
                              style={[
                                s.txAccount,
                                { color: colors.mutedForeground },
                              ]}
                              numberOfLines={1}
                            >
                              {acc.bank}
                            </Text>
                          </>
                        ) : null}
                      </View>

                      {/* Category transition pill */}
                      <View style={s.catPillRow}>
                        <View
                          style={[
                            s.catChip,
                            { backgroundColor: colors.muted },
                          ]}
                        >
                          <Text
                            style={[
                              s.catChipText,
                              { color: colors.mutedForeground },
                            ]}
                          >
                            {tx.category}
                          </Text>
                        </View>
                        <Feather
                          name="arrow-right"
                          size={11}
                          color={colors.primary}
                          style={{ marginHorizontal: 4 }}
                        />
                        <View
                          style={[
                            s.catChip,
                            { backgroundColor: newCatColor + "18" },
                          ]}
                        >
                          <Text
                            style={[
                              s.catChipText,
                              {
                                color: newCatColor,
                                fontFamily: "Inter_600SemiBold",
                              },
                            ]}
                          >
                            {newCategory}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Amount */}
                    <View style={s.amountWrap}>
                      <Text
                        style={[
                          s.txAmount,
                          {
                            color:
                              tx.type === "income"
                                ? "#10b981"
                                : colors.foreground,
                          },
                        ]}
                      >
                        {tx.type === "income" ? "+" : "-"}$
                        {tx.amount.toFixed(2)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Action Buttons */}
          <View style={s.actionsContainer}>
            {/* Primary update button */}
            <TouchableOpacity
              style={[
                s.primaryBtn,
                {
                  backgroundColor:
                    selectedCount > 0 ? colors.primary : colors.muted,
                  opacity: selectedCount > 0 ? 1 : 0.6,
                },
              ]}
              disabled={selectedCount === 0}
              activeOpacity={0.8}
              onPress={() => {
                Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Success
                );
                onConfirmUpdateSelected(selectedIds);
              }}
            >
              <Feather
                name="check-circle"
                size={18}
                color="#ffffff"
                style={{ marginRight: 8 }}
              />
              <Text style={s.primaryBtnText}>
                {selectedCount === count
                  ? `Update All (${count + 1}) & Save`
                  : `Update Selected (${selectedCount + 1}) & Save`}
              </Text>
            </TouchableOpacity>

            {/* Secondary: Only this transaction */}
            <TouchableOpacity
              style={[
                s.secondaryBtn,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                },
              ]}
              activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onConfirmOnlyThis();
              }}
            >
              <Text
                style={[
                  s.secondaryBtnText,
                  { color: colors.foreground },
                ]}
              >
                Only Update This Transaction
              </Text>
            </TouchableOpacity>

            {/* Cancel */}
            <TouchableOpacity
              style={s.cancelBtn}
              activeOpacity={0.7}
              onPress={onClose}
            >
              <Text
                style={[s.cancelBtnText, { color: colors.mutedForeground }]}
              >
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "flex-end",
  },
  sheetCard: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingTop: 12,
    paddingHorizontal: 20,
    maxHeight: "90%",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    marginBottom: 14,
  },
  badgeIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 4,
  },
  title: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    flex: 1,
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  countBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  selectToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 2,
  },
  selectToggleText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  selectedCounter: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  scrollContainer: {
    height: 260,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 16,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 8,
    gap: 8,
  },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  catIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  txInfo: {
    flex: 1,
    gap: 3,
  },
  txTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  txSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  txDate: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  txDot: {
    fontSize: 11,
  },
  txAccount: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    maxWidth: 120,
  },
  catPillRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  catChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  catChipText: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
  amountWrap: {
    alignItems: "flex-end",
  },
  txAmount: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  actionsContainer: {
    gap: 10,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
  },
  primaryBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#ffffff",
  },
  secondaryBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  cancelBtn: {
    alignItems: "center",
    paddingVertical: 8,
  },
  cancelBtnText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
});
