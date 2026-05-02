import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
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

import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

export type GroupBy = "monthly" | "weekly" | "biweekly" | "custom";
export type SortBy =
  | "date_desc"
  | "date_asc"
  | "amount_high"
  | "amount_low"
  | "title_asc";

export interface BillFilterSettings {
  groupBy: GroupBy;
  startDay: number;
  sortBy: SortBy;
  accountIds: string[];
}

export const DEFAULT_FILTER: BillFilterSettings = {
  groupBy: "monthly",
  startDay: 1,
  sortBy: "date_asc",
  accountIds: [],
};

interface Props {
  visible: boolean;
  current: BillFilterSettings;
  onApply: (s: BillFilterSettings) => void;
  onClose: () => void;
}

const GROUP_OPTIONS: { key: GroupBy; label: string }[] = [
  { key: "monthly",  label: "Monthly"   },
  { key: "weekly",   label: "Weekly"    },
  { key: "biweekly", label: "Bi-Weekly" },
  { key: "custom",   label: "Custom"    },
];

const SORT_OPTIONS: { key: SortBy; label: string }[] = [
  { key: "date_desc",    label: "Date: Descending"   },
  { key: "date_asc",     label: "Date: Ascending"    },
  { key: "amount_high",  label: "Amount: High to Low" },
  { key: "amount_low",   label: "Amount: Low to High" },
  { key: "title_asc",    label: "Title: Ascending"   },
];

type ModalTab = "groupby" | "filter";

export default function BillFilterModal({ visible, current, onApply, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { accounts } = useApp();

  const [activeTab, setActiveTab] = useState<ModalTab>("groupby");
  const [groupBy, setGroupBy] = useState<GroupBy>(current.groupBy);
  const [startDay, setStartDay] = useState(current.startDay);
  const [sortBy, setSortBy] = useState<SortBy>(current.sortBy);
  const [accountIds, setAccountIds] = useState<string[]>(current.accountIds);

  const handleOpen = () => {
    setGroupBy(current.groupBy);
    setStartDay(current.startDay);
    setSortBy(current.sortBy);
    setAccountIds(current.accountIds);
    setActiveTab("groupby");
  };

  const handleApply = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onApply({ groupBy, startDay, sortBy, accountIds });
  };

  const handleClear = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAccountIds([]);
  };

  const toggleAccount = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAccountIds((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  const startDayLabel = (() => {
    const d = new Date();
    d.setDate(startDay);
    return d.toLocaleDateString("en-US", { day: "2-digit", month: "long", year: "numeric" });
  })();

  const adjustStartDay = (delta: number) => {
    setStartDay((prev) => Math.max(1, Math.min(28, prev + delta)));
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      onShow={handleOpen}
    >
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.background,
            paddingBottom: insets.bottom + 16,
          },
        ]}
      >
        {/* Two-tab header */}
        <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.tab, activeTab === "groupby" && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveTab("groupby"); }}
          >
            <Text style={[styles.tabLabel, { color: activeTab === "groupby" ? colors.primary : colors.mutedForeground }]}>
              GROUP BY
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === "filter" && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveTab("filter"); }}
          >
            <Text style={[styles.tabLabel, { color: activeTab === "filter" ? colors.primary : colors.mutedForeground }]}>
              FILTER
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={8}>
            <Feather name="x" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {/* GROUP BY content */}
        {activeTab === "groupby" && (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            {/* Period chips */}
            <View style={styles.chipRow}>
              {GROUP_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: groupBy === opt.key ? colors.primary : colors.card,
                      borderColor: groupBy === opt.key ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setGroupBy(opt.key); }}
                >
                  <Text style={[styles.chipText, { color: groupBy === opt.key ? "#fff" : colors.foreground }]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Start day */}
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Start day of month</Text>
            <View style={[styles.dayRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TouchableOpacity onPress={() => adjustStartDay(-1)} hitSlop={12}>
                <Feather name="chevron-left" size={18} color={colors.primary} />
              </TouchableOpacity>
              <Text style={[styles.dayText, { color: colors.foreground }]}>{startDayLabel}</Text>
              <TouchableOpacity onPress={() => adjustStartDay(1)} hitSlop={12}>
                <Feather name="chevron-right" size={18} color={colors.primary} />
              </TouchableOpacity>
            </View>

            {/* Info note */}
            <View style={[styles.infoBox, { backgroundColor: colors.muted }]}>
              <Feather name="info" size={13} color={colors.mutedForeground} />
              <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
                Month will start from Day {startDay}
              </Text>
            </View>

            {/* Sort section */}
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Upcoming Sort By</Text>
            <View style={[styles.radioBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {SORT_OPTIONS.map((opt, i) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.radioRow,
                    i < SORT_OPTIONS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                  ]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSortBy(opt.key); }}
                >
                  <View style={[styles.radioOuter, { borderColor: sortBy === opt.key ? colors.primary : colors.mutedForeground }]}>
                    {sortBy === opt.key && (
                      <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />
                    )}
                  </View>
                  <Text style={[styles.radioLabel, { color: colors.foreground }]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Apply */}
            <TouchableOpacity style={[styles.applyBtn, { backgroundColor: colors.primary }]} onPress={handleApply}>
              <Text style={styles.applyText}>APPLY</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* FILTER content */}
        {activeTab === "filter" && (
          <View style={styles.content}>
            {/* Accounts section */}
            <View style={styles.accountsHeader}>
              <Text style={[styles.sectionLabel, { color: colors.foreground, marginBottom: 0 }]}>Accounts</Text>
              <TouchableOpacity
                style={[styles.addAccountBtn, { borderColor: colors.border }]}
                onPress={() => setAccountIds([])}
                hitSlop={8}
              >
                <Feather name="plus" size={16} color={colors.primary} />
              </TouchableOpacity>
            </View>

            {accounts.length === 0 ? (
              <Text style={[styles.noAccountsText, { color: colors.mutedForeground }]}>
                No accounts added yet
              </Text>
            ) : (
              <View style={styles.accountsList}>
                {accounts.map((acc) => {
                  const selected = accountIds.includes(acc.id);
                  return (
                    <TouchableOpacity
                      key={acc.id}
                      style={[
                        styles.accountChip,
                        {
                          backgroundColor: selected ? colors.primary + "18" : colors.card,
                          borderColor: selected ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => toggleAccount(acc.id)}
                    >
                      <View style={[styles.accountDot, { backgroundColor: acc.color || colors.primary }]} />
                      <Text style={[styles.accountChipText, { color: selected ? colors.primary : colors.foreground }]}>
                        {acc.name}
                      </Text>
                      {selected && <Feather name="check" size={14} color={colors.primary} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Bottom buttons */}
            <View style={[styles.filterActions, Platform.OS !== "web" && { marginTop: "auto" as any }]}>
              <TouchableOpacity
                style={[styles.clearBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
                onPress={handleClear}
              >
                <Text style={[styles.clearText, { color: colors.foreground }]}>CLEAR</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.applyBtnHalf, { backgroundColor: colors.primary }]} onPress={handleApply}>
                <Text style={styles.applyText}>APPLY</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "75%",
  },
  tabRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    alignItems: "center",
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabLabel: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  closeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  content: {
    padding: 20,
    gap: 14,
    flexGrow: 1,
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 22,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  sectionLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    marginBottom: 4,
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dayText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
  },
  infoText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  radioBox: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  radioRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  radioLabel: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  applyBtn: {
    borderRadius: 30,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 6,
  },
  applyText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: 0.5,
  },
  accountsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  addAccountBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  noAccountsText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingVertical: 20,
  },
  accountsList: {
    gap: 8,
  },
  accountChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  accountDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  accountChipText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  filterActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
  },
  clearBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: "center",
  },
  clearText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  applyBtnHalf: {
    flex: 2,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
});
