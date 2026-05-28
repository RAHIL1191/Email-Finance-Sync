import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

// ── Data ──────────────────────────────────────────────────────────────────────

const SYNCED_ITEMS = [
  { key: "transactions",        label: "Transactions",         icon: "repeat",       color: "#3b82f6", desc: "All income & expense entries" },
  { key: "accounts",            label: "Accounts",             icon: "credit-card",  color: "#10b981", desc: "Bank & credit card accounts" },
  { key: "bills",               label: "Bills",                icon: "file-text",    color: "#6366f1", desc: "Recurring bills & due dates" },
  { key: "budgets",             label: "Budgets",              icon: "pie-chart",    color: "#f59e0b", desc: "Budget limits & periods" },
  { key: "goals",               label: "Goals",                icon: "target",       color: "#10b981", desc: "Savings & financial goals" },
  { key: "tasks",               label: "Tasks",                icon: "check-square", color: "#f97316", desc: "Task reminders & subscriptions" },
  { key: "projects",            label: "Projects",             icon: "folder",       color: "#8b5cf6", desc: "Trips, events & projects" },
  { key: "categories",          label: "Categories",           icon: "tag",          color: "#f59e0b", desc: "Spending & income categories" },
  { key: "rules",               label: "Rules",                icon: "zap",          color: "#8b5cf6", desc: "Classification & split rules" },
  { key: "plaid",               label: "Bank Connections",     icon: "link",         color: "#3b82f6", desc: "Plaid-linked bank accounts" },
  { key: "holdings",            label: "Holdings",             icon: "trending-up",  color: "#10b981", desc: "Investment holdings" },
  { key: "investmentTxs",       label: "Investment Txs",       icon: "bar-chart-2",  color: "#6366f1", desc: "Investment transactions" },
] as const;

const LOCAL_ONLY_ITEMS = [
  { label: "Email credentials",    icon: "mail",     desc: "Gmail app password — never stored in DB for security" },
  { label: "Theme",                icon: "moon",     desc: "Device-specific UI preference" },
  { label: "Notification settings",icon: "bell",     desc: "Per-device notification preferences" },
] as const;

// ── Screen ────────────────────────────────────────────────────────────────────

export default function DataStorageScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: Platform.OS === "web" ? 20 : insets.top + 8,
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Data Storage</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            Where your data lives
          </Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Legend ── */}
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.badge, { backgroundColor: "#10b981" + "20" }]}>
              <Feather name="database" size={11} color="#10b981" />
              <Text style={[styles.badgeText, { color: "#10b981" }]}>DB</Text>
            </View>
            <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>Server database</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.badge, { backgroundColor: colors.muted }]}>
              <Feather name="smartphone" size={11} color={colors.mutedForeground} />
              <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>Local</Text>
            </View>
            <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>AsyncStorage cache</Text>
          </View>
        </View>

        {/* ── Always Synced ── */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>SYNCED TO SERVER + CACHED LOCALLY</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {SYNCED_ITEMS.map((item, idx) => (
            <View key={item.key}>
              {idx > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
              <View style={styles.row}>
                <View style={[styles.iconWrap, { backgroundColor: item.color + "18" }]}>
                  <Feather name={item.icon as any} size={16} color={item.color} />
                </View>
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]}>{item.label}</Text>
                  <Text style={[styles.rowDesc, { color: colors.mutedForeground }]}>{item.desc}</Text>
                </View>
                <View style={styles.badgesWrap}>
                  <View style={[styles.badge, { backgroundColor: "#10b981" + "20" }]}>
                    <Feather name="database" size={10} color="#10b981" />
                    <Text style={[styles.badgeText, { color: "#10b981" }]}>DB</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: colors.muted }]}>
                    <Feather name="smartphone" size={10} color={colors.mutedForeground} />
                    <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>Local</Text>
                  </View>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* ── Local Only ── */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>LOCAL ONLY (NEVER SYNCED)</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {LOCAL_ONLY_ITEMS.map((item, idx) => (
            <View key={item.label}>
              {idx > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
              <View style={styles.row}>
                <View style={[styles.iconWrap, { backgroundColor: colors.muted }]}>
                  <Feather name={item.icon as any} size={16} color={colors.mutedForeground} />
                </View>
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]}>{item.label}</Text>
                  <Text style={[styles.rowDesc, { color: colors.mutedForeground }]}>{item.desc}</Text>
                </View>
                <View style={styles.badgesWrap}>
                  <View style={[styles.badge, { backgroundColor: colors.muted }]}>
                    <Feather name="smartphone" size={10} color={colors.mutedForeground} />
                    <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>Local</Text>
                  </View>
                  <View style={[styles.lockBadge, { backgroundColor: colors.muted }]}>
                    <Feather name="lock" size={10} color={colors.mutedForeground} />
                  </View>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* ── Info note ── */}
        <View style={[styles.infoBox, { backgroundColor: colors.accent, borderColor: colors.accentForeground + "30" }]}>
          <Feather name="info" size={14} color={colors.accentForeground} style={{ marginTop: 1 }} />
          <Text style={[styles.infoText, { color: colors.accentForeground }]}>
            All data is automatically synced to the server and cached locally. The local cache loads instantly on startup and the server copy keeps your data safe across devices.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, overflow: "hidden" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 8 },
  legendRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.7,
    marginTop: 12,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
  },
  divider: { height: 1, marginHorizontal: 16 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  rowDesc: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  badgesWrap: { flexDirection: "row", gap: 5, alignItems: "center" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 20,
  },
  badgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  lockBadge: {
    width: 22,
    height: 22,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  infoBox: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
});
