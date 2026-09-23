import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { toLocalYMD } from "@/hooks/useLocalDate";

// ── Constants ────────────────────────────────────────────────────────────────

const BACKUP_SETTINGS_KEY = "@fintrack/backup_settings";
const LAST_BACKUP_KEY = "@fintrack/last_backup_date";

const BACKUP_KEYS = [
  "@fintrack/transactions",
  "@fintrack/accounts",
  "@fintrack/bills",
  "@fintrack/budgets",
  "@fintrack/goals",
  "@fintrack/projects",
  "@fintrack/categories",
  "@fintrack/categoryRules",
  "@fintrack/tasks",
  "@fintrack/investmentTransactions",
  "@fintrack/holdings",
  "@fintrack/rrspLimit",
  "@fintrack/userName",
  "@fintrack/reviewedTransactionIds",
  "@fintrack/emailSync",
  "@fintrack/plaidSync",
  "@fintrack/deviceId",
  "@fintrack/householdId",
  "@fintrack/storageVersion",
];

interface BackupData {
  version: number;
  createdAt: string;
  appVersion: string;
  data: Record<string, string | null>;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function BackupRestoreScreen() {
  const colors = useColors();
  const {
    transactions,
    accounts,
    bills,
    budgets,
    goals,
    projects,
    categories,
    categoryRules,
    tasks,
  } = useApp();

  const [autoBackup, setAutoBackup] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(BACKUP_SETTINGS_KEY).then((raw) => {
      if (raw) {
        try {
          const settings = JSON.parse(raw);
          setAutoBackup(settings.autoBackup ?? false);
        } catch {}
      }
    });
    AsyncStorage.getItem(LAST_BACKUP_KEY).then((val) => setLastBackup(val));
  }, []);

  const toggleAutoBackup = useCallback(async () => {
    const next = !autoBackup;
    setAutoBackup(next);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await AsyncStorage.setItem(BACKUP_SETTINGS_KEY, JSON.stringify({ autoBackup: next }));
    if (next) {
      await performBackup(true);
    }
  }, [autoBackup]);

  const performBackup = useCallback(async (silent = false) => {
    try {
      const pairs = await AsyncStorage.multiGet(BACKUP_KEYS);
      const data: Record<string, string | null> = {};
      for (const [key, value] of pairs) {
        data[key] = value;
      }
      const backup: BackupData = {
        version: 1,
        createdAt: new Date().toISOString(),
        appVersion: "1.0.0",
        data,
      };
      const json = JSON.stringify(backup, null, 2);
      const dateStr = toLocalYMD(new Date());
      const fileName = `fintrack-backup-${dateStr}.json`;
      const filePath = `${FileSystem.documentDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(filePath, json);

      const now = new Date().toISOString();
      await AsyncStorage.setItem(LAST_BACKUP_KEY, now);
      setLastBackup(now);

      return { filePath, fileName };
    } catch (err) {
      if (!silent) {
        Alert.alert("Backup Failed", `Could not create backup: ${err}`);
      }
      return null;
    }
  }, []);

  const handleExport = useCallback(async () => {
    setExporting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      const result = await performBackup();
      if (!result) { setExporting(false); return; }
      const { filePath } = result;
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(filePath, {
          mimeType: "application/json",
          dialogTitle: "Save FinTrack Backup",
        });
      } else {
        Alert.alert("Export Complete", `Backup saved to:\n${filePath}`);
      }
    } catch (err) {
      Alert.alert("Export Failed", `${err}`);
    }
    setExporting(false);
  }, [performBackup]);

  const handleImport = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/json",
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      setImporting(true);
      const file = result.assets[0];
      const content = await FileSystem.readAsStringAsync(file.uri);
      let backup: BackupData;
      try {
        backup = JSON.parse(content);
      } catch {
        Alert.alert("Invalid File", "The selected file is not a valid FinTrack backup.");
        setImporting(false);
        return;
      }
      if (!backup.version || !backup.data) {
        Alert.alert("Invalid Backup", "This file does not contain valid backup data.");
        setImporting(false);
        return;
      }

      const itemCount = countItems(backup.data);

      Alert.alert(
        "Restore Backup?",
        `This backup was created on ${formatBackupDate(backup.createdAt)}.\n\n` +
          `It contains:\n${itemCount}\n\n` +
          `This will replace all current local data. Data synced to the server will not be affected.`,
        [
          { text: "Cancel", style: "cancel", onPress: () => setImporting(false) },
          {
            text: "Restore",
            style: "destructive",
            onPress: async () => {
              try {
                const entries = Object.entries(backup.data).filter(
                  ([, v]) => v !== null && v !== undefined
                ) as [string, string][];
                await AsyncStorage.multiSet(entries);
                Alert.alert(
                  "Restore Complete",
                  "Your data has been restored. Please restart the app for changes to take effect.",
                );
              } catch (err) {
                Alert.alert("Restore Failed", `${err}`);
              }
              setImporting(false);
            },
          },
        ],
      );
    } catch (err) {
      Alert.alert("Import Failed", `${err}`);
      setImporting(false);
    }
  }, []);

  const dataCounts = {
    transactions: transactions.length,
    accounts: accounts.length,
    bills: bills.length,
    budgets: budgets.length,
    goals: goals.length,
    projects: projects.length,
    categories: categories.length,
    rules: categoryRules.length,
    tasks: tasks.length,
  };

  const totalItems = Object.values(dataCounts).reduce((s, n) => s + n, 0);

  return (
    <SafeAreaView style={[st.container, { backgroundColor: colors.background }]} edges={["top"]}>
      {/* Header */}
      <View style={[st.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[st.headerTitle, { color: colors.foreground }]}>Backup & Restore</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView style={st.scroll} contentContainerStyle={st.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Info banner */}
        <View style={[st.banner, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "30" }]}>
          <Feather name="info" size={16} color={colors.primary} />
          <Text style={[st.bannerText, { color: colors.foreground }]}>
            Backups save all your local data (transactions, accounts, bills, budgets, etc.) so you can restore it after reinstalling the app.
          </Text>
        </View>

        {/* Current data summary */}
        <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[st.cardTitle, { color: colors.foreground }]}>Current Data</Text>
          <View style={st.statsGrid}>
            {Object.entries(dataCounts).map(([key, count]) => (
              <View key={key} style={st.statItem}>
                <Text style={[st.statCount, { color: colors.primary }]}>{count}</Text>
                <Text style={[st.statLabel, { color: colors.mutedForeground }]}>
                  {key.charAt(0).toUpperCase() + key.slice(1)}
                </Text>
              </View>
            ))}
          </View>
          <View style={[st.totalRow, { borderTopColor: colors.border }]}>
            <Text style={[st.totalLabel, { color: colors.mutedForeground }]}>Total items</Text>
            <Text style={[st.totalCount, { color: colors.foreground }]}>{totalItems}</Text>
          </View>
        </View>

        {/* Auto backup */}
        <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={st.autoRow}>
            <View style={st.autoInfo}>
              <View style={[st.iconWrap, { backgroundColor: "#10b981" + "18" }]}>
                <Feather name="refresh-cw" size={16} color="#10b981" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[st.autoTitle, { color: colors.foreground }]}>Auto Backup</Text>
                <Text style={[st.autoSub, { color: colors.mutedForeground }]}>
                  Automatically save a backup when app data changes
                </Text>
              </View>
            </View>
            <Switch
              value={autoBackup}
              onValueChange={toggleAutoBackup}
              trackColor={{ false: colors.border, true: "#10b981" + "aa" }}
              thumbColor={autoBackup ? "#10b981" : colors.mutedForeground}
              ios_backgroundColor={colors.border}
            />
          </View>
          {lastBackup && (
            <View style={[st.lastBackupRow, { borderTopColor: colors.border }]}>
              <Feather name="clock" size={12} color={colors.mutedForeground} />
              <Text style={[st.lastBackupText, { color: colors.mutedForeground }]}>
                Last backup: {formatBackupDate(lastBackup)}
              </Text>
            </View>
          )}
        </View>

        {/* Export */}
        <TouchableOpacity
          style={[st.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={handleExport}
          disabled={exporting}
          activeOpacity={0.7}
        >
          <View style={[st.iconWrap, { backgroundColor: "#3b82f6" + "18" }]}>
            {exporting ? (
              <ActivityIndicator size="small" color="#3b82f6" />
            ) : (
              <Feather name="upload" size={16} color="#3b82f6" />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[st.actionTitle, { color: colors.foreground }]}>Export Backup</Text>
            <Text style={[st.actionSub, { color: colors.mutedForeground }]}>
              Save a backup file to your device or cloud storage
            </Text>
          </View>
          <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
        </TouchableOpacity>

        {/* Import */}
        <TouchableOpacity
          style={[st.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={handleImport}
          disabled={importing}
          activeOpacity={0.7}
        >
          <View style={[st.iconWrap, { backgroundColor: "#f97316" + "18" }]}>
            {importing ? (
              <ActivityIndicator size="small" color="#f97316" />
            ) : (
              <Feather name="download" size={16} color="#f97316" />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[st.actionTitle, { color: colors.foreground }]}>Restore from Backup</Text>
            <Text style={[st.actionSub, { color: colors.mutedForeground }]}>
              Import a previously exported backup file
            </Text>
          </View>
          <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
        </TouchableOpacity>

        {/* Tips */}
        <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[st.cardTitle, { color: colors.foreground }]}>Tips</Text>
          <View style={st.tipRow}>
            <Feather name="check-circle" size={14} color="#10b981" />
            <Text style={[st.tipText, { color: colors.mutedForeground }]}>
              Export a backup before deleting the app
            </Text>
          </View>
          <View style={st.tipRow}>
            <Feather name="check-circle" size={14} color="#10b981" />
            <Text style={[st.tipText, { color: colors.mutedForeground }]}>
              Save backups to Google Drive or another cloud service
            </Text>
          </View>
          <View style={st.tipRow}>
            <Feather name="check-circle" size={14} color="#10b981" />
            <Text style={[st.tipText, { color: colors.mutedForeground }]}>
              Enable auto backup to keep backups current
            </Text>
          </View>
          <View style={st.tipRow}>
            <Feather name="check-circle" size={14} color="#10b981" />
            <Text style={[st.tipText, { color: colors.mutedForeground }]}>
              After restoring, restart the app for changes to take effect
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBackupDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "Unknown";
  }
}

function countItems(data: Record<string, string | null>): string {
  const lines: string[] = [];
  const keyMap: Record<string, string> = {
    "@fintrack/transactions": "Transactions",
    "@fintrack/accounts": "Accounts",
    "@fintrack/bills": "Bills",
    "@fintrack/budgets": "Budgets",
    "@fintrack/goals": "Goals",
    "@fintrack/projects": "Projects",
    "@fintrack/categories": "Categories",
    "@fintrack/categoryRules": "Rules",
    "@fintrack/tasks": "Tasks",
    "@fintrack/investmentTransactions": "Investment TXs",
    "@fintrack/holdings": "Holdings",
  };
  for (const [key, label] of Object.entries(keyMap)) {
    const raw = data[key];
    if (raw) {
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          lines.push(`• ${arr.length} ${label}`);
        }
      } catch {}
    }
  }
  return lines.length > 0 ? lines.join("\n") : "No data found";
}

// ── Styles ──────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 40 },
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statItem: {
    width: "30%",
    alignItems: "center",
    paddingVertical: 8,
  },
  statCount: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
    textTransform: "capitalize",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  totalLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  totalCount: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  autoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  autoInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    marginRight: 12,
  },
  autoTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  autoSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  lastBackupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  lastBackupText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  actionTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  actionSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  tipRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 8,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
});
