import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useApp, getApiBase } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

// ─── Category definitions ─────────────────────────────────────────────────────

type CategoryId = "transactions" | "accounts" | "bills" | "budgets" | "goals" | "portfolio" | "connections";

interface Category {
  id: CategoryId;
  label: string;
  icon: string;
  color: string;
  description: string;
}

const CATEGORIES: Category[] = [
  { id: "transactions", label: "Transactions", icon: "repeat", color: "#3b82f6", description: "All income, expense & transfer entries" },
  { id: "accounts", label: "Accounts", icon: "credit-card", color: "#8b5cf6", description: "All linked bank accounts" },
  { id: "bills", label: "Bills", icon: "file-text", color: "#f59e0b", description: "All recurring bills" },
  { id: "budgets", label: "Budgets", icon: "pie-chart", color: "#10b981", description: "All monthly budgets" },
  { id: "goals", label: "Goals", icon: "target", color: "#f43f5e", description: "All savings goals" },
  { id: "portfolio", label: "Portfolio", icon: "trending-up", color: "#22c55e", description: "Holdings & investment transactions" },
  { id: "connections", label: "Plaid Connections", icon: "link", color: "#6366f1", description: "All linked institutions" },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ResetCleanupScreen() {
  const colors = useColors();
  const {
    transactions, accounts, bills, budgets, goals,
    holdings, investmentTransactions, plaidSync,
    wipeData, householdId, deviceId,
  } = useApp();

  const [step, setStep] = useState<"select" | "confirm">("select");
  const [selected, setSelected] = useState<Record<CategoryId, boolean>>({
    transactions: false,
    accounts: false,
    bills: false,
    budgets: false,
    goals: false,
    portfolio: false,
    connections: false,
  });
  const [isDeleting, setIsDeleting] = useState(false);

  const counts: Record<CategoryId, number> = {
    transactions: transactions?.length ?? 0,
    accounts: accounts?.length ?? 0,
    bills: bills?.length ?? 0,
    budgets: budgets?.length ?? 0,
    goals: goals?.length ?? 0,
    portfolio: (holdings?.length ?? 0) + (investmentTransactions?.length ?? 0),
    connections: plaidSync?.items?.length ?? 0,
  };

  const selectedCategories = CATEGORIES.filter((c) => selected[c.id]);
  const anySelected = selectedCategories.length > 0;

  const toggle = (id: CategoryId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected((prev: any) => ({ ...prev, [id]: !prev[id] }));
  };

  const apiDel = async (path: string) => {
    const res = await fetch(`${getApiBase()}${path}`, {
      method: "DELETE",
      headers: { "X-Household-ID": householdId, "X-Device-ID": deviceId },
    });
    if (!res.ok) throw new Error(`Failed: ${path}`);
  };

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      const serverOps: Promise<any>[] = [];
      if (selected.transactions) serverOps.push(apiDel("/api/transactions"));
      if (selected.accounts) serverOps.push(apiDel("/api/accounts"));
      if (selected.bills) serverOps.push(apiDel("/api/bills"));
      if (selected.budgets) serverOps.push(apiDel("/api/budgets"));
      if (selected.goals) serverOps.push(apiDel("/api/goals"));
      if (selected.connections) {
        for (const item of (plaidSync?.items ?? [])) {
          serverOps.push(apiDel(`/api/plaid/disconnect/${item.itemId}`).catch(() => {}));
        }
      }
      await Promise.all(serverOps);

      const cats = (Object.keys(selected) as CategoryId[]).filter((k) => selected[k]);
      await wipeData(cats);

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
                Only your own data will be deleted. This action cannot be undone.
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
                    {counts[cat.id]} item{counts[cat.id] !== 1 ? "s" : ""}
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

            <View style={[s.infoBox, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 8 }]}>
              <Feather name="alert-triangle" size={14} color="#f59e0b" style={{ marginTop: 1 }} />
              <Text style={[s.infoText, { color: colors.mutedForeground }]}>
                Deleting accounts will also remove their linked transactions and Plaid data.
              </Text>
            </View>
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
                    {counts[cat.id]} {cat.description.toLowerCase()} will be deleted.
                  </Text>
                </View>
              </View>
            ))}

            <View style={[s.infoBox, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 8 }]}>
              <Feather name="info" size={14} color={colors.mutedForeground} style={{ marginTop: 1 }} />
              <Text style={[s.infoText, { color: colors.mutedForeground }]}>
                This data will not be rolled back once cleaned up.
              </Text>
            </View>
            <View style={[s.infoBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="alert-circle" size={14} color="#ef4444" style={{ marginTop: 1 }} />
              <Text style={[s.infoText, { color: colors.mutedForeground }]}>
                Deleting Plaid Connections will remove all linked institution tokens.
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      {/* Bottom button */}
      <View style={[s.footer, { borderTopColor: colors.border }]}>
        {step === "select" ? (
          <Pressable
            style={[s.btn, { backgroundColor: anySelected ? "#3b82f6" : colors.border }]}
            onPress={() => { if (anySelected) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setStep("confirm"); } }}
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

// ─── Styles ───────────────────────────────────────────────────────────────────

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
  });
