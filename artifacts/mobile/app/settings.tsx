import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
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
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";

// ─── Constants ────────────────────────────────────────────────────────────────

const SETTINGS_KEY = "app_settings_v1";

const DEFAULT_SETTINGS = {
  currencyLabel: "Canadian Dollar ($)",
  currencyCode: "CAD",
  currencyConversion: false,
  firstDayOfWeek: "Sunday",
  language: "English",
  theme: "Dark",
  biometricLogin: false,
};

type SettingsState = typeof DEFAULT_SETTINGS;
type PickerMode = "currency" | "firstDay" | "language" | "theme" | "security" | null;

const CURRENCIES = [
  { code: "CAD", label: "Canadian Dollar ($)" },
  { code: "USD", label: "US Dollar ($)" },
  { code: "EUR", label: "Euro (€)" },
  { code: "GBP", label: "British Pound (£)" },
  { code: "JPY", label: "Japanese Yen (¥)" },
  { code: "AUD", label: "Australian Dollar ($)" },
  { code: "CHF", label: "Swiss Franc (Fr)" },
  { code: "CNY", label: "Chinese Yuan (¥)" },
  { code: "INR", label: "Indian Rupee (₹)" },
  { code: "MXN", label: "Mexican Peso ($)" },
];

const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const LANGUAGES = ["English", "French", "Spanish", "German", "Portuguese", "Arabic", "Chinese", "Hindi", "Japanese", "Korean"];

const THEMES = ["Light", "Dark", "System"];

// ─── Section / Row types ───────────────────────────────────────────────────────

interface SettingsSection {
  title: string;
  items: SettingsRow[];
}

type SettingsRow =
  | { kind: "picker"; key: keyof SettingsState; valueKey: keyof SettingsState; label: string; sub?: string; icon: string; color: string; pickerMode: PickerMode }
  | { kind: "toggle"; key: keyof SettingsState; label: string; sub?: string; icon: string; color: string }
  | { kind: "nav"; label: string; sub?: string; icon: string; color: string; onPress: () => void }
  | { kind: "destructive"; label: string; icon: string; onPress: () => void };

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const colors = useColors();
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [picker, setPicker] = useState<PickerMode>(null);

  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY).then((raw) => {
      if (raw) {
        try {
          setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
        } catch {}
      }
    });
  }, []);

  const toggle = useCallback((key: keyof SettingsState) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSettings((prev) => {
      const next = { ...prev, [key]: !(prev[key] as boolean) };
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const pickValue = useCallback(
    (updates: Partial<SettingsState>) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setSettings((prev) => {
        const next = { ...prev, ...updates };
        AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
        return next;
      });
      setPicker(null);
    },
    []
  );

  const handleReset = useCallback(() => {
    router.push("/reset-cleanup" as any);
  }, []);

  const SECTIONS: SettingsSection[] = [
    {
      title: "General",
      items: [
        {
          kind: "picker",
          key: "currencyCode",
          valueKey: "currencyLabel",
          label: "Currency",
          icon: "dollar-sign",
          color: "#3b82f6",
          pickerMode: "currency",
        },
        {
          kind: "toggle",
          key: "currencyConversion",
          label: "Currency Conversion",
          icon: "refresh-cw",
          color: "#8b5cf6",
        },
        {
          kind: "picker",
          key: "firstDayOfWeek",
          valueKey: "firstDayOfWeek",
          label: "First day of week",
          icon: "calendar",
          color: "#f59e0b",
          pickerMode: "firstDay",
        },
        {
          kind: "picker",
          key: "language",
          valueKey: "language",
          label: "Language",
          icon: "globe",
          color: "#10b981",
          pickerMode: "language",
        },
        {
          kind: "picker",
          key: "theme",
          valueKey: "theme",
          label: "Theme",
          icon: "moon",
          color: "#6366f1",
          pickerMode: "theme",
        },
      ],
    },
    {
      title: "Data",
      items: [
        {
          kind: "nav",
          label: "Bills & Transactions",
          icon: "credit-card",
          color: "#f97316",
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
            setTimeout(() => router.push("/(tabs)/bills" as any), 220);
          },
        },
        {
          kind: "nav",
          label: "Category Mapping Rule",
          sub: "Remap merchant or category → category",
          icon: "tag",
          color: "#ec4899",
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/category-mapping" as any);
          },
        },
        {
          kind: "nav",
          label: "Merchants",
          icon: "shopping-bag",
          color: "#14b8a6",
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            Alert.alert("Merchants", "Merchant management coming soon.");
          },
        },
      ],
    },
    {
      title: "Account",
      items: [
        {
          kind: "nav",
          label: "Notifications",
          icon: "bell",
          color: "#3b82f6",
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/notifications" as any);
          },
        },
        {
          kind: "nav",
          label: "Security",
          icon: "lock",
          color: "#64748b",
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setPicker("security");
          },
        },
      ],
    },
    {
      title: "Advanced",
      items: [
        {
          kind: "destructive",
          label: "Reset & Clean Up",
          icon: "trash-2",
          onPress: handleReset,
        },
      ],
    },
  ];

  const renderRow = (row: SettingsRow, idx: number, arr: SettingsRow[]) => {
    const isLast = idx === arr.length - 1;

    if (row.kind === "toggle") {
      return (
        <View key={row.key}>
          {idx > 0 && <View style={[s.divider, { backgroundColor: colors.border }]} />}
          <Pressable
            style={s.row}
            onPress={() => toggle(row.key)}
            android_ripple={{ color: colors.muted }}
          >
            <View style={[s.iconWrap, { backgroundColor: row.color + "18" }]}>
              <Feather name={row.icon as any} size={16} color={row.color} />
            </View>
            <View style={s.rowText}>
              <Text style={[s.rowLabel, { color: colors.foreground }]}>{row.label}</Text>
              {row.sub && (
                <Text style={[s.rowSub, { color: colors.mutedForeground }]}>{row.sub}</Text>
              )}
            </View>
            <Switch
              value={!!(settings[row.key] as boolean)}
              onValueChange={() => toggle(row.key)}
              trackColor={{ false: colors.border, true: colors.primary + "aa" }}
              thumbColor={settings[row.key] ? colors.primary : colors.mutedForeground}
              ios_backgroundColor={colors.border}
            />
          </Pressable>
        </View>
      );
    }

    if (row.kind === "picker") {
      const displayValue = settings[row.valueKey] as string;
      return (
        <View key={row.key}>
          {idx > 0 && <View style={[s.divider, { backgroundColor: colors.border }]} />}
          <TouchableOpacity
            style={s.row}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setPicker(row.pickerMode);
            }}
            activeOpacity={0.7}
          >
            <View style={[s.iconWrap, { backgroundColor: row.color + "18" }]}>
              <Feather name={row.icon as any} size={16} color={row.color} />
            </View>
            <View style={s.rowText}>
              <Text style={[s.rowLabel, { color: colors.foreground }]}>{row.label}</Text>
              {row.sub && (
                <Text style={[s.rowSub, { color: colors.mutedForeground }]}>{row.sub}</Text>
              )}
            </View>
            <View style={s.rowRight}>
              <Text style={[s.rowValue, { color: colors.mutedForeground }]}>{displayValue}</Text>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </View>
          </TouchableOpacity>
        </View>
      );
    }

    if (row.kind === "nav") {
      return (
        <View key={row.label}>
          {idx > 0 && <View style={[s.divider, { backgroundColor: colors.border }]} />}
          <TouchableOpacity style={s.row} onPress={row.onPress} activeOpacity={0.7}>
            <View style={[s.iconWrap, { backgroundColor: row.color + "18" }]}>
              <Feather name={row.icon as any} size={16} color={row.color} />
            </View>
            <View style={s.rowText}>
              <Text style={[s.rowLabel, { color: colors.foreground }]}>{row.label}</Text>
              {row.sub && (
                <Text style={[s.rowSub, { color: colors.mutedForeground }]}>{row.sub}</Text>
              )}
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      );
    }

    if (row.kind === "destructive") {
      return (
        <View key={row.label}>
          {idx > 0 && <View style={[s.divider, { backgroundColor: colors.border }]} />}
          <TouchableOpacity style={s.row} onPress={row.onPress} activeOpacity={0.7}>
            <View style={[s.iconWrap, { backgroundColor: colors.destructive + "18" }]}>
              <Feather name={row.icon as any} size={16} color={colors.destructive} />
            </View>
            <View style={s.rowText}>
              <Text style={[s.rowLabel, { color: colors.destructive }]}>{row.label}</Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.destructive + "88"} />
          </TouchableOpacity>
        </View>
      );
    }

    return null;
  };

  // ── Picker sheet content ──────────────────────────────────────────────────

  const renderPickerItems = () => {
    if (picker === "currency") {
      return CURRENCIES.map((c) => (
        <TouchableOpacity
          key={c.code}
          style={[s.pickerItem, { borderBottomColor: colors.border }]}
          onPress={() => pickValue({ currencyCode: c.code, currencyLabel: c.label })}
          activeOpacity={0.7}
        >
          <Text style={[s.pickerItemText, { color: colors.foreground }]}>{c.label}</Text>
          {settings.currencyCode === c.code && (
            <Feather name="check" size={16} color={colors.primary} />
          )}
        </TouchableOpacity>
      ));
    }
    if (picker === "firstDay") {
      return DAYS_OF_WEEK.map((d) => (
        <TouchableOpacity
          key={d}
          style={[s.pickerItem, { borderBottomColor: colors.border }]}
          onPress={() => pickValue({ firstDayOfWeek: d })}
          activeOpacity={0.7}
        >
          <Text style={[s.pickerItemText, { color: colors.foreground }]}>{d}</Text>
          {settings.firstDayOfWeek === d && (
            <Feather name="check" size={16} color={colors.primary} />
          )}
        </TouchableOpacity>
      ));
    }
    if (picker === "language") {
      return LANGUAGES.map((l) => (
        <TouchableOpacity
          key={l}
          style={[s.pickerItem, { borderBottomColor: colors.border }]}
          onPress={() => pickValue({ language: l })}
          activeOpacity={0.7}
        >
          <Text style={[s.pickerItemText, { color: colors.foreground }]}>{l}</Text>
          {settings.language === l && (
            <Feather name="check" size={16} color={colors.primary} />
          )}
        </TouchableOpacity>
      ));
    }
    if (picker === "theme") {
      return THEMES.map((t) => (
        <TouchableOpacity
          key={t}
          style={[s.pickerItem, { borderBottomColor: colors.border }]}
          onPress={() => pickValue({ theme: t })}
          activeOpacity={0.7}
        >
          <Text style={[s.pickerItemText, { color: colors.foreground }]}>{t}</Text>
          {settings.theme === t && (
            <Feather name="check" size={16} color={colors.primary} />
          )}
        </TouchableOpacity>
      ));
    }
    if (picker === "security") {
      return (
        <View>
          <View style={[s.pickerItem, { borderBottomColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.pickerItemText, { color: colors.foreground }]}>Biometric Login</Text>
              <Text style={[s.pickerItemSub, { color: colors.mutedForeground }]}>
                Use Face ID or fingerprint to unlock
              </Text>
            </View>
            <Switch
              value={settings.biometricLogin}
              onValueChange={() => toggle("biometricLogin")}
              trackColor={{ false: colors.border, true: colors.primary + "aa" }}
              thumbColor={settings.biometricLogin ? colors.primary : colors.mutedForeground}
              ios_backgroundColor={colors.border}
            />
          </View>
          <View style={[s.pickerItem, { borderBottomColor: "transparent" }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.pickerItemText, { color: colors.foreground }]}>PIN Lock</Text>
              <Text style={[s.pickerItemSub, { color: colors.mutedForeground }]}>
                Set a PIN to protect your data
              </Text>
            </View>
            <Text style={[s.comingSoon, { color: colors.mutedForeground }]}>Coming soon</Text>
          </View>
        </View>
      );
    }
    return null;
  };

  const pickerTitle = () => {
    if (picker === "currency") return "Select Currency";
    if (picker === "firstDay") return "First Day of Week";
    if (picker === "language") return "Select Language";
    if (picker === "theme") return "Select Theme";
    if (picker === "security") return "Security";
    return "";
  };

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView edges={["top"]} style={[s.screen, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          s.header,
          {
            borderBottomColor: colors.border,
            backgroundColor: colors.background,
            paddingTop: Platform.OS === "web" ? 52 : 8,
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>Settings</Text>
        <View style={[s.headerIcon, { backgroundColor: colors.muted }]}>
          <Feather name="settings" size={18} color={colors.mutedForeground} />
        </View>
      </View>

      {/* Sections */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          s.scroll,
          { paddingBottom: Platform.OS === "web" ? 100 : 120 },
        ]}
      >
        {SECTIONS.map((section) => (
          <View key={section.title}>
            <Text style={[s.sectionTitle, { color: colors.primary }]}>{section.title}</Text>
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {section.items.map((row, idx) => renderRow(row, idx, section.items))}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Picker / Security bottom sheet modal */}
      <Modal
        visible={picker !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setPicker(null)}
      >
        <Pressable
          style={s.modalBackdrop}
          onPress={() => setPicker(null)}
        />
        <View style={[s.sheet, { backgroundColor: colors.card }]}>
          {/* Sheet handle */}
          <View style={[s.handle, { backgroundColor: colors.border }]} />

          {/* Sheet header */}
          <View style={[s.sheetHeader, { borderBottomColor: colors.border }]}>
            <Text style={[s.sheetTitle, { color: colors.foreground }]}>{pickerTitle()}</Text>
            <TouchableOpacity onPress={() => setPicker(null)} hitSlop={8}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {/* Sheet items */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 32 }}
          >
            {renderPickerItems()}
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },

  scroll: { paddingHorizontal: 16, paddingTop: 16, gap: 6 },

  sectionTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.2,
    paddingHorizontal: 4,
    paddingBottom: 8,
    paddingTop: 14,
    textTransform: "uppercase",
  },

  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },

  divider: { height: StyleSheet.hairlineWidth, marginLeft: 52 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
    minHeight: 56,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  rowSub: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16 },
  rowRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  rowValue: { fontSize: 13, fontFamily: "Inter_400Regular" },

  // Modal / sheet
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "65%",
    paddingBottom: Platform.OS === "ios" ? 34 : 16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },

  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  pickerItemText: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  pickerItemSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  comingSoon: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
