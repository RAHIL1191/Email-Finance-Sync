import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";

import { useApp, getApiBase } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

type CategoryId = "bills" | "expenses" | "income" | "transfers";

interface Category {
  id: CategoryId;
  label: string;
  icon: string;
  color: string;
  description: string;
}

const CATEGORIES: Category[] = [
  { id: "bills", label: "Bills", icon: "file-text", color: "#f59e0b", description: "Recurring bills" },
  { id: "expenses", label: "Expenses", icon: "arrow-up", color: "#ef4444", description: "Expense transactions" },
  { id: "income", label: "Income", icon: "arrow-down", color: "#22c55e", description: "Income transactions" },
  { id: "transfers", label: "Transfers", icon: "repeat", color: "#3b82f6", description: "Transfer transactions" },
];

export default function ResetCleanupScreen() {
  const colors = useColors();
  const {
    transactions, accounts, bills, plaidSync,
    wipeData, householdId, deviceId,
  } = useApp();

  const [step, setStep] = useState<"select" | "confirm">("select");
  const [selected, setSelected] = useState<Record<CategoryId, boolean>>({
    bills: false,
    expenses: false,
    income: false,
    transfers: false,
  });

  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);

  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Filter helper
  const isFiltered = (t: any) => {
    if (fromDate && new Date(t.date) < fromDate) return false;
    if (toDate && new Date(t.date) > toDate) return false;
    if (selectedAccounts.length > 0 && !selectedAccounts.includes(t.accountId)) return false;
    return true;
  };

  // Dynamically calculate filtered counts
  const filteredCounts: Record<CategoryId, number> = {
    bills: bills ? bills.filter((b: any) => selectedAccounts.length === 0 || (b.accountId && selectedAccounts.includes(b.accountId))).length : 0,
    expenses: transactions ? transactions.filter((t: any) => t.type === "expense" && t.category !== "Transfer" && isFiltered(t)).length : 0,
    income: transactions ? transactions.filter((t: any) => t.type === "income" && t.category !== "Transfer" && isFiltered(t)).length : 0,
    transfers: transactions ? transactions.filter((t: any) => t.category === "Transfer" && isFiltered(t)).length : 0,
  };

  const selectedCategories = CATEGORIES.filter((c) => selected[c.id]);
  const anySelected = selectedCategories.length > 0;

  const toggle = (id: CategoryId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const formatDateLabel = (d: Date | null) => {
    if (!d) return "Select Date";
    return d.toLocaleDateString("en-CA", { weekday: "short", year: "numeric", month: "short", day: "numeric" });
  };

  const apiDel = async (path: string, queryParams: string) => {
    const res = await fetch(`${getApiBase()}${path}?${queryParams}`, {
      method: "DELETE",
      headers: { "X-Household-ID": householdId, "X-Device-ID": deviceId },
    });
    if (!res.ok) throw new Error(`Failed: ${path}`);
  };

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      const serverOps: Promise<any>[] = [];
      const fStart = fromDate ? fromDate.toISOString().slice(0, 10) : undefined;
      const fEnd = toDate ? toDate.toISOString().slice(0, 10) : undefined;
      const fAccs = selectedAccounts.length > 0 ? selectedAccounts.join(",") : undefined;

      const qBuilder = (typeStr?: string) => {
        const parts = [];
        if (typeStr) parts.push(`type=${typeStr}`);
        if (fStart) parts.push(`startDate=${fStart}`);
        if (fEnd) parts.push(`endDate=${fEnd}`);
        if (fAccs) parts.push(`accountIds=${fAccs}`);
        return parts.join("&");
      };

      if (selected.expenses) {
        serverOps.push(apiDel("/api/transactions", qBuilder("expense")));
      }
      if (selected.income) {
        serverOps.push(apiDel("/api/transactions", qBuilder("income")));
      }
      if (selected.transfers) {
        // Transfers are category Transfer, let's delete them
        const transQuery = qBuilder() + "&category=Transfer";
        serverOps.push(apiDel("/api/transactions", transQuery));
      }
      if (selected.bills) {
        // Simple wipe of bills on the server matching account filter
        const billsQuery = fAccs ? `accountIds=${fAccs}` : "";
        serverOps.push(apiDel("/api/bills", billsQuery));
      }

      await Promise.all(serverOps);

      // Local State wipe
      const catsToWipe: any[] = [];
      if (selected.expenses) catsToWipe.push("expenses");
      if (selected.income) catsToWipe.push("income");
      if (selected.transfers) catsToWipe.push("transfers");
      if (selected.bills) catsToWipe.push("bills");

      await wipeData(catsToWipe, {
        startDate: fStart,
        endDate: fEnd,
        accountIds: selectedAccounts.length > 0 ? selectedAccounts : undefined,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Done", "Selected data has been deleted.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Something went wrong. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleAccountSelection = (id: string) => {
    setSelectedAccounts((prev) =>
      prev.includes(id) ? prev.filter((aId) => aId !== id) : [...prev, id]
    );
  };

  const getAccountNamesString = () => {
    if (selectedAccounts.length === 0) return "All Accounts";
    return accounts
      .filter((a: any) => selectedAccounts.includes(a.id))
      .map((a: any) => a.name)
      .join(", ");
  };

  const s = styles(colors);

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => step === "confirm" ? setStep("select") : router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={s.headerTitle}>Reset &amp; Clean Up</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {step === "select" ? (
          <>
            <Text style={s.sectionLabel}>Select type of data to be cleaned up:</Text>

            <View style={[s.infoBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="info" size={14} color={colors.mutedForeground} style={{ marginTop: 1 }} />
              <Text style={[s.infoText, { color: colors.mutedForeground }]}>
                You can only delete your data and not other group members.
              </Text>
            </View>

            {CATEGORIES.map((cat) => (
              <Pressable
                key={cat.id}
                style={[s.row, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => toggle(cat.id)}
              >
                <View style={[s.iconBox, { backgroundColor: cat.color + "22" }]}>
                  <Feather name={cat.icon as any} size={18} color={cat.color} />
                </View>
                <View style={s.rowText}>
                  <Text style={[s.rowLabel, { color: colors.foreground }]}>{cat.label}</Text>
                  <Text style={[s.rowSub, { color: colors.mutedForeground }]}>
                    {filteredCounts[cat.id]} items based on filters
                  </Text>
                </View>
                <Switch
                  value={selected[cat.id]}
                  onValueChange={() => toggle(cat.id)}
                  trackColor={{ false: colors.border, true: "#ef444460" }}
                  thumbColor={selected[cat.id] ? "#ef4444" : colors.mutedForeground}
                />
              </Pressable>
            ))}

            {/* Date Range Section */}
            <Text style={[s.sectionLabel, { marginTop: 16 }]}>Select Date Range:</Text>
            <View style={s.datePickerContainer}>
              <TouchableOpacity
                style={[s.dateField, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => setShowFromPicker(true)}
              >
                <Text style={[s.dateFieldLabel, { color: colors.mutedForeground }]}>From Date</Text>
                <View style={s.dateValueRow}>
                  <Text style={[s.dateValue, { color: fromDate ? colors.foreground : colors.mutedForeground }]}>
                    {formatDateLabel(fromDate)}
                  </Text>
                  <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.dateField, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => setShowToPicker(true)}
              >
                <Text style={[s.dateFieldLabel, { color: colors.mutedForeground }]}>To Date</Text>
                <View style={s.dateValueRow}>
                  <Text style={[s.dateValue, { color: toDate ? colors.foreground : colors.mutedForeground }]}>
                    {formatDateLabel(toDate)}
                  </Text>
                  <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
                </View>
              </TouchableOpacity>
            </View>

            {/* Account Filters */}
            <TouchableOpacity
              style={[s.accountFilterRow, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => setShowAccountModal(true)}
            >
              <Text style={[s.accountFilterLabel, { color: colors.foreground }]}>Accounts Filter</Text>
              <View style={s.accountFilterRight}>
                <Text style={[s.accountFilterText, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {getAccountNamesString()}
                </Text>
                <View style={[s.plusBtn, { backgroundColor: "#3b82f6" }]}>
                  <Feather name="plus" size={14} color="#fff" />
                </View>
              </View>
            </TouchableOpacity>

            {/* Info Footer Notes */}
            <View style={[s.infoBox, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 16 }]}>
              <Feather name="info" size={14} color={colors.mutedForeground} style={{ marginTop: 1 }} />
              <Text style={[s.infoText, { color: colors.mutedForeground }]}>
                Goals, budgets and accounts needs to be deleted separately.
              </Text>
            </View>
            <View style={[s.infoBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="alert-triangle" size={14} color="#f59e0b" style={{ marginTop: 1 }} />
              <Text style={[s.infoText, { color: colors.mutedForeground }]}>
                Respective goals need to be deleted first, before deleting an account, if any.
              </Text>
            </View>

            {/* Date Pickers */}
            {showFromPicker && (
              <DateTimePicker
                value={fromDate || new Date()}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(event, date) => {
                  setShowFromPicker(false);
                  if (date) setFromDate(date);
                }}
              />
            )}

            {showToPicker && (
              <DateTimePicker
                value={toDate || new Date()}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(event, date) => {
                  setShowToPicker(false);
                  if (date) setToDate(date);
                }}
              />
            )}
          </>
        ) : (
          <>
            <Text style={s.sectionLabel}>Confirm deletion of data:</Text>

            {selectedCategories.map((cat) => (
              <View
                key={cat.id}
                style={[s.confirmRow, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={[s.iconBox, { backgroundColor: cat.color + "22" }]}>
                  <Feather name={cat.icon as any} size={18} color={cat.color} />
                </View>
                <View style={s.rowText}>
                  <Text style={[s.rowLabel, { color: colors.foreground }]}>{cat.label}</Text>
                  <Text style={[s.rowSub, { color: colors.mutedForeground }]}>
                    {filteredCounts[cat.id]} {cat.description.toLowerCase()} between {formatDateLabel(fromDate || new Date(Date.now() - 365*24*3600*1000))} to {formatDateLabel(toDate || new Date())} will be deleted.
                  </Text>
                </View>
              </View>
            ))}

            <View style={[s.infoBox, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 8 }]}>
              <Feather name="info" size={14} color={colors.mutedForeground} style={{ marginTop: 1 }} />
              <Text style={[s.infoText, { color: colors.mutedForeground }]}>
                If any of your data is shared in family, that will be unshared automatically on deletion.
              </Text>
            </View>
            <View style={[s.infoBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="alert-circle" size={14} color="#ef4444" style={{ marginTop: 1 }} />
              <Text style={[s.infoText, { color: colors.mutedForeground }]}>
                This data will not be rolled back, once cleaned up.
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      {/* Account Picker Modal */}
      <Modal visible={showAccountModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: colors.background }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: colors.foreground }]}>Filter Accounts</Text>
              <TouchableOpacity onPress={() => setShowAccountModal(false)}>
                <Text style={{ color: "#3b82f6", fontWeight: "600" }}>Done</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              {accounts && accounts.map((acc: any) => (
                <Pressable
                  key={acc.id}
                  style={s.accountSelectItem}
                  onPress={() => toggleAccountSelection(acc.id)}
                >
                  <Text style={[s.accountSelectItemName, { color: colors.foreground }]}>
                    {acc.name}
                  </Text>
                  <Feather
                    name={selectedAccounts.includes(acc.id) ? "check-square" : "square"}
                    size={20}
                    color={selectedAccounts.includes(acc.id) ? "#3b82f6" : colors.mutedForeground}
                  />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Bottom button */}
      <View style={[s.footer, { borderTopColor: colors.border }]}>
        {step === "select" ? (
          <Pressable
            style={[s.btn, { backgroundColor: anySelected ? "#3b82f6" : colors.border }]}
            onPress={() => {
              if (anySelected) {
                if (!fromDate || !toDate) {
                  Alert.alert("Date Range Required", "Please select date range first.");
                  return;
                }
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setStep("confirm");
              }
            }}
            disabled={!anySelected}
          >
            <Text style={[s.btnText, { color: anySelected ? "#fff" : colors.mutedForeground }]}>NEXT</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[s.btn, { backgroundColor: isDeleting ? colors.border : "#ef4444" }]}
            onPress={handleConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={[s.btnText, { color: "#fff" }]}>CONFIRM</Text>
            )}
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = (colors: any) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backBtn: { width: 38, height: 38, justifyContent: "center" },
    headerTitle: { fontSize: 18, fontWeight: "700", color: colors.foreground },
    scroll: { padding: 16, paddingBottom: 32 },
    sectionLabel: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.foreground,
      marginBottom: 12,
    },
    infoBox: {
      flexDirection: "row",
      gap: 8,
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
      marginBottom: 8,
    },
    infoText: { flex: 1, fontSize: 13, lineHeight: 18 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      marginBottom: 8,
      gap: 12,
    },
    confirmRow: {
      flexDirection: "row",
      alignItems: "center",
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      marginBottom: 8,
      gap: 12,
    },
    iconBox: {
      width: 38,
      height: 38,
      borderRadius: 10,
      justifyContent: "center",
      alignItems: "center",
    },
    rowText: { flex: 1 },
    rowLabel: { fontSize: 15, fontWeight: "600", marginBottom: 2 },
    rowSub: { fontSize: 12 },
    datePickerContainer: {
      flexDirection: "row",
      gap: 12,
      marginBottom: 16,
    },
    dateField: {
      flex: 1,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
    },
    dateFieldLabel: {
      fontSize: 12,
      fontWeight: "600",
      marginBottom: 4,
    },
    dateValueRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    dateValue: {
      fontSize: 14,
      fontWeight: "500",
    },
    accountFilterRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
    },
    accountFilterLabel: {
      fontSize: 15,
      fontWeight: "600",
    },
    accountFilterRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flex: 1,
      justifyContent: "flex-end",
    },
    accountFilterText: {
      fontSize: 14,
      maxWidth: 150,
      textAlign: "right",
    },
    plusBtn: {
      width: 24,
      height: 24,
      borderRadius: 12,
      justifyContent: "center",
      alignItems: "center",
    },
    footer: {
      padding: 16,
      borderTopWidth: 1,
    },
    btn: {
      height: 52,
      borderRadius: 14,
      justifyContent: "center",
      alignItems: "center",
    },
    btnText: { fontSize: 15, fontWeight: "700", letterSpacing: 1 },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end",
    },
    modalContent: {
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 16,
      maxHeight: "60%",
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: "#eee",
      paddingBottom: 12,
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: "700",
    },
    accountSelectItem: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: "#eee",
    },
    accountSelectItemName: {
      fontSize: 15,
    },
  });
