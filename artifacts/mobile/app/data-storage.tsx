import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/context/AppContext";
import { useDbSyncPrefs, SyncableType } from "@/context/DbSyncPrefsContext";
import { useColors } from "@/hooks/useColors";

// ── Config ────────────────────────────────────────────────────────────────────

const ALWAYS_SYNCED = [
  { key: "transactions", label: "Transactions", icon: "repeat", color: "#3b82f6", desc: "All income & expense entries" },
  { key: "accounts",     label: "Accounts",     icon: "credit-card", color: "#10b981", desc: "Bank & credit card accounts" },
  { key: "bills",        label: "Bills",         icon: "file-text",   color: "#6366f1", desc: "Recurring bills & due dates" },
  { key: "categories",   label: "Categories",    icon: "tag",         color: "#f59e0b", desc: "Spending & income categories" },
  { key: "categoryRules", label: "Rules", icon: "zap", color: "#8b5cf6", desc: "Classification & split rules" },
] as const;

const OPTIONAL_SYNC: Array<{
  key: SyncableType;
  label: string;
  icon: string;
  color: string;
  desc: string;
}> = [
  { key: "budgets",  label: "Budgets",  icon: "pie-chart",    color: "#6366f1", desc: "Budget limits & periods" },
  { key: "goals",    label: "Goals",    icon: "target",       color: "#10b981", desc: "Savings & financial goals" },
  { key: "tasks",    label: "Tasks",    icon: "check-square", color: "#f59e0b", desc: "Task reminders & subscriptions" },
  { key: "projects", label: "Projects", icon: "folder",       color: "#f97316", desc: "Trips, events & goal projects" },
];

function formatDate(iso?: string) {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "Unknown";
  }
}

// ── Confirm Modal ────────────────────────────────────────────────────────────

type ConfirmButton = { text: string; onPress: () => void; destructive?: boolean };
type ConfirmConfig = { title: string; message: string; buttons: ConfirmButton[] } | null;

function ConfirmModal({
  config,
  onClose,
  colors,
}: {
  config: ConfirmConfig;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  if (!config) return null;
  // Use an absolutely-positioned View instead of a Modal — avoids the Android
  // new-arch transparent-window bug where the Fabric surface behind the Modal
  // goes black until touched.
  return (
    <Pressable style={modalStyles.backdrop} onPress={onClose}>
      <Pressable
        style={[modalStyles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={(e) => e.stopPropagation()}
      >
        <Text style={[modalStyles.title, { color: colors.foreground }]}>{config.title}</Text>
        <Text style={[modalStyles.message, { color: colors.mutedForeground }]}>{config.message}</Text>
        <View style={[modalStyles.divider, { backgroundColor: colors.border }]} />
        {config.buttons.map((btn, i) => (
          <TouchableOpacity
            key={i}
            style={modalStyles.btnRow}
            activeOpacity={0.7}
            onPress={() => { onClose(); btn.onPress(); }}
          >
            <Text
              style={[
                modalStyles.btnText,
                { color: btn.destructive ? "#ef4444" : colors.primary },
              ]}
            >
              {btn.text}
            </Text>
          </TouchableOpacity>
        ))}
      </Pressable>
    </Pressable>
  );
}

const modalStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 28,
    zIndex: 100,
    elevation: 10,
  },
  sheet: {
    width: "100%",
    borderRadius: 18,
    borderWidth: 1,
  },
  title: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  message: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 20,
    paddingBottom: 16,
    lineHeight: 19,
  },
  divider: { height: 1 },
  btnRow: { paddingVertical: 15, paddingHorizontal: 20 },
  btnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  btnLast: {},
});

// ── Screen ────────────────────────────────────────────────────────────────────

export default function DataStorageScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { budgets, goals, tasks, projects, bills, holdings, investmentTransactions, uploadToDb, pullFromDb } = useApp();
  const { prefs, toggleDbSync, setLastSync } = useDbSyncPrefs();
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<ConfirmConfig>(null);

  const countMap: Record<SyncableType, number> = {
    budgets: budgets.length,
    goals: goals.length,
    tasks: tasks.length,
    projects: projects.length,
    bills: bills.length,
    holdings: holdings.length,
    investmentTransactions: investmentTransactions.length,
  };

  const setItemLoading = (key: string, val: boolean) =>
    setLoading((prev) => ({ ...prev, [key]: val }));

  // ── Handlers ──────────────────────────────────────────────────────────────

  const showConfirm = (cfg: NonNullable<ConfirmConfig>) => setConfirm(cfg);

  const handleToggle = (type: SyncableType, newValue: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const label = OPTIONAL_SYNC.find((i) => i.key === type)?.label ?? type;
    const count = countMap[type];
    const stoppedAt = (prefs as any)[`${type}_stoppedAt`] as string | undefined;

    if (newValue) {
      if (stoppedAt) {
        showConfirm({
          title: `Resume DB Sync — ${label}`,
          message: `Sync was stopped on ${formatDate(stoppedAt)}. Changes made in the DB since then will be pulled and merged with your local data.`,
          buttons: [
            { text: "Cancel", onPress: () => {} },
            { text: "Resume Sync", onPress: () => handleResume(type, stoppedAt, label) },
          ],
        });
      } else {
        showConfirm({
          title: `Enable DB Sync — ${label}`,
          message: `Store ${label} in the server database for cross-device access. You have ${count} local record${count !== 1 ? "s" : ""}.`,
          buttons: [
            { text: "Cancel", onPress: () => {} },
            { text: "Upload All + Sync", onPress: () => handleEnable(type, true, label) },
            { text: "Start Fresh Sync", onPress: () => handleEnable(type, false, label) },
          ],
        });
      }
    } else {
      showConfirm({
        title: `Disable DB Sync — ${label}`,
        message: `New changes to ${label} will only be saved locally. Data already in the DB will remain there. You can re-enable sync later and resume from this point.`,
        buttons: [
          { text: "Cancel", onPress: () => {} },
          { text: "Disable", destructive: true, onPress: () => handleDisable(type) },
        ],
      });
    }
  };

  const handleEnable = async (type: SyncableType, uploadExisting: boolean, label: string) => {
    setItemLoading(type, true);
    try {
      await toggleDbSync(type, true);
      if (uploadExisting) {
        const { uploaded, error } = await uploadToDb(type, true);
        if (error) {
          showConfirm({
            title: "Partial Sync",
            message: `Enabled sync but upload had errors. ${uploaded} records uploaded.`,
            buttons: [{ text: "OK", onPress: () => {} }],
          });
        } else {
          await setLastSync(type, new Date().toISOString());
        }
      } else {
        await setLastSync(type, new Date().toISOString());
      }
    } finally {
      setItemLoading(type, false);
    }
  };

  const handleDisable = async (type: SyncableType) => {
    setItemLoading(type, true);
    try {
      await toggleDbSync(type, false);
    } finally {
      setItemLoading(type, false);
    }
  };

  const handleResume = async (type: SyncableType, stoppedAt: string, label: string) => {
    setItemLoading(type, true);
    try {
      const { pulled, error } = await pullFromDb(type, stoppedAt);
      await toggleDbSync(type, true);
      await setLastSync(type, new Date().toISOString());
      if (pulled > 0 && !error) {
        showConfirm({
          title: "Sync Resumed",
          message: `Pulled ${pulled} updated record${pulled !== 1 ? "s" : ""} from the DB.`,
          buttons: [{ text: "OK", onPress: () => {} }],
        });
      } else if (error) {
        showConfirm({
          title: "Sync Resumed",
          message: "Sync enabled but pull failed. New changes will sync going forward.",
          buttons: [{ text: "OK", onPress: () => {} }],
        });
      }
    } finally {
      setItemLoading(type, false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

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
        <View style={[styles.legendRow]}>
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
            <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>AsyncStorage</Text>
          </View>
        </View>

        {/* ── Always Synced ── */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ALWAYS SYNCED TO SERVER</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {ALWAYS_SYNCED.map((item, idx) => (
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
                  <View style={[styles.lockBadge, { backgroundColor: colors.muted }]}>
                    <Feather name="lock" size={10} color={colors.mutedForeground} />
                  </View>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* ── Optional Sync ── */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>OPTIONAL SERVER SYNC</Text>
        <Text style={[styles.sectionHint, { color: colors.mutedForeground }]}>
          Toggle on to back up to the server DB and sync across devices.
        </Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {OPTIONAL_SYNC.map((item, idx) => {
            const enabled = prefs[item.key];
            const isLoading = !!loading[item.key];
            const lastSync = (prefs as any)[`${item.key}_lastSync`] as string | undefined;
            const stoppedAt = (prefs as any)[`${item.key}_stoppedAt`] as string | undefined;
            const count = countMap[item.key];

            return (
              <View key={item.key}>
                {idx > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                <View style={styles.optionalRow}>
                  {/* Icon + labels */}
                  <View style={styles.optionalLeft}>
                    <View style={[styles.iconWrap, { backgroundColor: item.color + "18" }]}>
                      <Feather name={item.icon as any} size={16} color={item.color} />
                    </View>
                    <View style={styles.optionalText}>
                      <View style={styles.optionalTitleRow}>
                        <Text style={[styles.rowTitle, { color: colors.foreground }]}>{item.label}</Text>
                        <Text style={[styles.countPill, { backgroundColor: colors.muted, color: colors.mutedForeground }]}>
                          {count}
                        </Text>
                      </View>
                      <View style={styles.storageIndicator}>
                        <View style={[styles.badge, { backgroundColor: enabled ? "#10b981" + "20" : colors.muted }]}>
                          <Feather
                            name={enabled ? "database" : "smartphone"}
                            size={10}
                            color={enabled ? "#10b981" : colors.mutedForeground}
                          />
                          <Text style={[styles.badgeText, { color: enabled ? "#10b981" : colors.mutedForeground }]}>
                            {enabled ? "DB + Local" : "Local only"}
                          </Text>
                        </View>
                        {enabled && lastSync && (
                          <Text style={[styles.syncTime, { color: colors.mutedForeground }]}>
                            Synced {formatDate(lastSync)}
                          </Text>
                        )}
                        {!enabled && stoppedAt && (
                          <Text style={[styles.syncTime, { color: colors.warning }]}>
                            Stopped {formatDate(stoppedAt)}
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>

                  {/* Toggle */}
                  <View style={styles.toggleWrap}>
                    {isLoading ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Switch
                        value={enabled}
                        onValueChange={(val) => handleToggle(item.key, val)}
                        trackColor={{ false: colors.border, true: item.color + "60" }}
                        thumbColor={enabled ? item.color : colors.mutedForeground}
                        ios_backgroundColor={colors.border}
                      />
                    )}
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        {/* ── Info note ── */}
        <View style={[styles.infoBox, { backgroundColor: colors.accent, borderColor: colors.accentForeground + "30" }]}>
          <Feather name="info" size={14} color={colors.accentForeground} style={{ marginTop: 1 }} />
          <Text style={[styles.infoText, { color: colors.accentForeground }]}>
            Toggling off does not delete your data from the DB — it only stops syncing new changes.
            When you turn sync back on, you can resume from the point you stopped.
          </Text>
        </View>
      </ScrollView>
      <ConfirmModal config={confirm} onClose={() => setConfirm(null)} colors={colors} />
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
  sectionHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginBottom: 8,
    paddingHorizontal: 4,
    lineHeight: 17,
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
  optionalRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  optionalLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  optionalText: { flex: 1 },
  optionalTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  countPill: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 20,
  },
  storageIndicator: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  syncTime: { fontSize: 10, fontFamily: "Inter_400Regular" },
  toggleWrap: { width: 52, alignItems: "flex-end" },
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
