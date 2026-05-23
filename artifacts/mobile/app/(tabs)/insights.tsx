import { Feather } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Animated, Dimensions, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";

import AddEntrySheet from "@/components/AddEntrySheet";
import AIChatPanel from "@/components/AIChatPanel";
import ModelDownloadGate from "@/components/ModelDownloadGate";
import { useApp } from "@/context/AppContext";
import { useAIProvider } from "@/context/AIProviderContext";
import { useDrawer } from "@/context/DrawerContext";
import { useColors } from "@/hooks/useColors";

interface Insight {
  id: string;
  type: "tip" | "alert" | "achievement" | "trend";
  title: string;
  description: string;
  icon: string;
  color: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  Food: "#f97316",
  "Food & Dining": "#f97316",
  Shopping: "#8b5cf6",
  Groceries: "#10b981",
  Entertainment: "#ec4899",
  Transport: "#3b82f6",
  Housing: "#6366f1",
  Utilities: "#f59e0b",
  Health: "#14b8a6",
  Insurance: "#64748b",
  Income: "#10b981",
  Other: "#94a3b8",
};

type EntryTab = "EXPENSE" | "INCOME" | "TRANSFER" | "BILLS";
type GroupByPeriod = "Monthly" | "Weekly" | "Bi-Weekly" | "Yearly" | "Custom";
export interface PeriodSettings {
  period: GroupByPeriod;
  monthStartDay: number;
  weekStartDay: number;
  biWeeklyStartDate: Date;
  customStartDate: Date;
  customEndDate: Date;
}

const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PERIODS: GroupByPeriod[] = ["Monthly", "Weekly", "Bi-Weekly", "Yearly", "Custom"];

function fmt(d: Date) {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Period Settings Sheet ──────────────────────────────────────────────────────
function PeriodSettingsSheet({
  visible, onClose, onApply, initial,
}: {
  visible: boolean;
  onClose: () => void;
  onApply: (s: PeriodSettings) => void;
  initial: PeriodSettings;
}) {
  const colors = useColors();
  const [activeTab, setActiveTab] = useState<"GROUP BY" | "FILTER">("GROUP BY");
  const [period, setPeriod] = useState<GroupByPeriod>(initial.period);
  const [monthStartDate, setMonthStartDate] = useState(new Date());
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [weekStartDay, setWeekStartDay] = useState(initial.weekStartDay);
  const [biWeeklyDate, setBiWeeklyDate] = useState(initial.biWeeklyStartDate);
  const [showBiWeeklyPicker, setShowBiWeeklyPicker] = useState(false);
  const [customStart, setCustomStart] = useState(initial.customStartDate);
  const [customEnd, setCustomEnd] = useState(initial.customEndDate);
  const [showCustomStart, setShowCustomStart] = useState(false);
  const [showCustomEnd, setShowCustomEnd] = useState(false);

  const snapToSunday = (d: Date) => {
    const s = new Date(d);
    s.setDate(d.getDate() - d.getDay());
    return s;
  };

  const handleApply = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onApply({ period, monthStartDay: monthStartDate.getDate(), weekStartDay, biWeeklyStartDate: biWeeklyDate, customStartDate: customStart, customEndDate: customEnd });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={sh.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={[sh.sheet, { backgroundColor: colors.card, paddingBottom: Platform.OS === "ios" ? 34 : 16 }]}>
          {/* Tab row */}
          <View style={[sh.tabRow, { borderBottomColor: colors.border }]}>
            {(["GROUP BY", "FILTER"] as const).map(tab => (
              <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)} style={sh.tabBtn}>
                <Text style={[sh.tabLabel, { color: activeTab === tab ? colors.primary : colors.mutedForeground }]}>{tab}</Text>
                {activeTab === tab && <View style={[sh.tabUnderline, { backgroundColor: colors.primary }]} />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={onClose} hitSlop={8} style={sh.closeBtn}>
              <Feather name="x" size={20} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {activeTab === "GROUP BY" ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 20, paddingTop: 4 }}>
              {/* Period pills */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                {PERIODS.map(p => (
                  <TouchableOpacity
                    key={p}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPeriod(p); }}
                    style={[sh.pill, period === p ? { backgroundColor: colors.primary } : { backgroundColor: colors.muted, borderColor: colors.border, borderWidth: 1 }]}
                  >
                    <Text style={[sh.pillText, { color: period === p ? "#fff" : colors.foreground }]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Monthly */}
              {period === "Monthly" && (
                <View style={{ gap: 10 }}>
                  <Text style={[sh.sectionLabel, { color: colors.foreground }]}>Start day of month</Text>
                  <TouchableOpacity
                    style={[sh.dateField, { backgroundColor: colors.muted, borderColor: colors.border }]}
                    onPress={() => setShowMonthPicker(true)}
                    activeOpacity={0.8}
                  >
                    <Feather name="calendar" size={15} color={colors.mutedForeground} />
                    <Text style={[sh.dateFieldText, { color: colors.foreground }]}>{fmt(monthStartDate)}</Text>
                  </TouchableOpacity>
                  {showMonthPicker && (
                    <DateTimePicker
                      value={monthStartDate}
                      mode="date"
                      display={Platform.OS === "ios" ? "spinner" : "default"}
                      onChange={(_, d) => { setShowMonthPicker(false); if (d) setMonthStartDate(d); }}
                    />
                  )}
                  <View style={sh.infoRow}>
                    <Feather name="info" size={13} color={colors.mutedForeground} />
                    <Text style={[sh.infoText, { color: colors.mutedForeground }]}>Month will start from Day {monthStartDate.getDate()}</Text>
                  </View>
                </View>
              )}

              {/* Weekly */}
              {period === "Weekly" && (
                <View style={{ gap: 10 }}>
                  <Text style={[sh.sectionLabel, { color: colors.foreground }]}>Start day of week</Text>
                  <View style={sh.dayRow}>
                    {WEEK_DAYS.map((day, i) => (
                      <TouchableOpacity
                        key={day}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setWeekStartDay(i); }}
                        style={[sh.dayBtn, weekStartDay === i ? { backgroundColor: colors.primary } : { backgroundColor: colors.muted, borderColor: colors.border, borderWidth: 1 }]}
                      >
                        <Text style={[sh.dayBtnText, { color: weekStartDay === i ? "#fff" : colors.foreground }]}>{day}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={sh.infoRow}>
                    <Feather name="info" size={13} color={colors.mutedForeground} />
                    <Text style={[sh.infoText, { color: colors.mutedForeground }]}>Week will start every {WEEK_DAYS[weekStartDay]}</Text>
                  </View>
                </View>
              )}

              {/* Bi-Weekly */}
              {period === "Bi-Weekly" && (
                <View style={{ gap: 10 }}>
                  <Text style={[sh.sectionLabel, { color: colors.foreground }]}>Start date (Sundays only)</Text>
                  <TouchableOpacity
                    style={[sh.dateField, { backgroundColor: colors.muted, borderColor: colors.border }]}
                    onPress={() => setShowBiWeeklyPicker(true)}
                    activeOpacity={0.8}
                  >
                    <Feather name="calendar" size={15} color={colors.mutedForeground} />
                    <Text style={[sh.dateFieldText, { color: colors.foreground }]}>{fmt(biWeeklyDate)}</Text>
                  </TouchableOpacity>
                  {showBiWeeklyPicker && (
                    <DateTimePicker
                      value={biWeeklyDate}
                      mode="date"
                      display={Platform.OS === "ios" ? "spinner" : "default"}
                      onChange={(_, d) => { setShowBiWeeklyPicker(false); if (d) setBiWeeklyDate(snapToSunday(d)); }}
                    />
                  )}
                  <View style={sh.infoRow}>
                    <Feather name="info" size={13} color={colors.mutedForeground} />
                    <Text style={[sh.infoText, { color: colors.mutedForeground }]}>Bi-weekly period starts Sunday, {fmt(biWeeklyDate)}</Text>
                  </View>
                </View>
              )}

              {/* Yearly */}
              {period === "Yearly" && (
                <View style={sh.infoRow}>
                  <Feather name="info" size={13} color={colors.mutedForeground} />
                  <Text style={[sh.infoText, { color: colors.mutedForeground }]}>Yearly period starts from January 1st</Text>
                </View>
              )}

              {/* Custom */}
              {period === "Custom" && (
                <View style={{ gap: 14 }}>
                  <View style={{ gap: 8 }}>
                    <Text style={[sh.sectionLabel, { color: colors.foreground }]}>Start date</Text>
                    <TouchableOpacity
                      style={[sh.dateField, { backgroundColor: colors.muted, borderColor: colors.border }]}
                      onPress={() => setShowCustomStart(true)}
                      activeOpacity={0.8}
                    >
                      <Feather name="calendar" size={15} color={colors.mutedForeground} />
                      <Text style={[sh.dateFieldText, { color: colors.foreground }]}>{fmt(customStart)}</Text>
                    </TouchableOpacity>
                    {showCustomStart && (
                      <DateTimePicker
                        value={customStart}
                        mode="date"
                        display={Platform.OS === "ios" ? "spinner" : "default"}
                        onChange={(_, d) => { setShowCustomStart(false); if (d) setCustomStart(d); }}
                      />
                    )}
                  </View>
                  <View style={{ gap: 8 }}>
                    <Text style={[sh.sectionLabel, { color: colors.foreground }]}>End date</Text>
                    <TouchableOpacity
                      style={[sh.dateField, { backgroundColor: colors.muted, borderColor: colors.border }]}
                      onPress={() => setShowCustomEnd(true)}
                      activeOpacity={0.8}
                    >
                      <Feather name="calendar" size={15} color={colors.mutedForeground} />
                      <Text style={[sh.dateFieldText, { color: colors.foreground }]}>{fmt(customEnd)}</Text>
                    </TouchableOpacity>
                    {showCustomEnd && (
                      <DateTimePicker
                        value={customEnd}
                        mode="date"
                        minimumDate={customStart}
                        display={Platform.OS === "ios" ? "spinner" : "default"}
                        onChange={(_, d) => { setShowCustomEnd(false); if (d) setCustomEnd(d); }}
                      />
                    )}
                  </View>
                </View>
              )}
            </ScrollView>
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Feather name="sliders" size={36} color={colors.border} />
              <Text style={[sh.infoText, { color: colors.mutedForeground, marginTop: 10 }]}>Filters coming soon</Text>
            </View>
          )}

          {/* Apply */}
          <TouchableOpacity style={[sh.applyBtn, { backgroundColor: colors.primary }]} onPress={handleApply} activeOpacity={0.85}>
            <Text style={sh.applyText}>APPLY</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── FAB ───────────────────────────────────────────────────────────────────────

function InsightsFAB({
  onAddExpense,
  onAddIncome,
  onTransfer,
}: {
  onAddExpense: () => void;
  onAddIncome: () => void;
  onTransfer: () => void;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const scale = React.useRef(new Animated.Value(0)).current;
  const opacity = React.useRef(new Animated.Value(0)).current;

  const native = Platform.OS !== "web";

  const toggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (open) {
      Animated.parallel([
        Animated.spring(scale, { toValue: 0, useNativeDriver: native }),
        Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: native }),
      ]).start(() => setOpen(false));
    } else {
      setOpen(true);
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: native, tension: 80, friction: 8 }),
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: native }),
      ]).start();
    }
  };

  const close = () => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 0, useNativeDriver: native }),
      Animated.timing(opacity, { toValue: 0, duration: 120, useNativeDriver: native }),
    ]).start(() => setOpen(false));
  };

  const handleAction = (cb: () => void) => {
    close();
    setTimeout(cb, 180);
  };

  return (
    <>
      {/* Backdrop */}
      {open && (
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={toggle}
        />
      )}

      <View style={styles.fabContainer} pointerEvents="box-none">
        {/* Action buttons */}
        {open && (
          <Animated.View style={[styles.fabActions, { opacity, transform: [{ scale }] }]}>
            <TouchableOpacity
              style={[styles.fabAction, { backgroundColor: colors.card, shadowColor: "#000" }]}
              onPress={() => handleAction(onAddExpense)}
              activeOpacity={0.85}
            >
              <View style={styles.fabActionIcon}>
                <Feather name="arrow-up" size={18} color="#ef4444" />
              </View>
              <Text style={[styles.fabActionLabel, { color: colors.foreground }]}>Add Expense</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.fabAction, { backgroundColor: colors.card, shadowColor: "#000" }]}
              onPress={() => handleAction(onAddIncome)}
              activeOpacity={0.85}
            >
              <View style={styles.fabActionIcon}>
                <Feather name="arrow-down" size={18} color="#10b981" />
              </View>
              <Text style={[styles.fabActionLabel, { color: colors.foreground }]}>Add Income</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.fabAction, { backgroundColor: colors.card, shadowColor: "#000" }]}
              onPress={() => handleAction(onTransfer)}
              activeOpacity={0.85}
            >
              <View style={styles.fabActionIcon}>
                <Feather name="repeat" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.fabActionLabel, { color: colors.foreground }]}>Transfer</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Close / Open FAB */}
        <TouchableOpacity
          style={[
            styles.fab,
            open
              ? { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border }
              : { backgroundColor: "#2d6a2d" },
          ]}
          onPress={toggle}
          activeOpacity={0.85}
        >
          {open ? (
            <Feather name="x" size={22} color={colors.foreground} />
          ) : (
            <Feather name="more-horizontal" size={22} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function InsightsScreen() {
  const colors = useColors();
  const { openDrawer } = useDrawer();
  const { transactions, accounts, bills, monthlyIncome, monthlyExpense } = useApp();
  const { mode, setMode, modelPath } = useAIProvider();
  const [showProviderSheet, setShowProviderSheet] = useState(false);

  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetTab, setSheetTab] = useState<EntryTab>("EXPENSE");
  const openSheet = (tab: EntryTab) => {
    setSheetTab(tab);
    setSheetVisible(true);
  };

  const categorySpend = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const thisMonth = transactions.filter((t) => t.date >= monthStart && t.type === "expense" && t.category !== "Transfer" && t.category?.toLowerCase() !== "transfer");
    const totals: Record<string, number> = {};
    thisMonth.forEach((t) => { totals[t.category] = (totals[t.category] || 0) + t.amount; });
    return Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [transactions]);

  const totalSpend = categorySpend.reduce((s, [, v]) => s + v, 0);
  const savingsRate = monthlyIncome > 0 ? ((monthlyIncome - monthlyExpense) / monthlyIncome) * 100 : 0;
  const emailTxCount = transactions.filter((t) => t.fromEmail).length;

  const insights: Insight[] = useMemo(() => {
    const result: Insight[] = [];
    if (savingsRate > 20) {
      result.push({ id: "savings", type: "achievement", title: "Great Savings Rate!", description: `You're saving ${savingsRate.toFixed(0)}% of your income this month. Keep it up!`, icon: "award", color: colors.success });
    } else if (savingsRate < 0) {
      result.push({ id: "overspend", type: "alert", title: "Spending Over Income", description: `You've spent $${(monthlyExpense - monthlyIncome).toFixed(0)} more than you earned this month. Review your expenses.`, icon: "alert-triangle", color: colors.expense });
    }
    const unpaidBills = bills.filter((b) => !b.isPaid);
    const upcomingBills = unpaidBills.filter((b) => { const d = Math.ceil((new Date(b.dueDate).getTime() - Date.now()) / 86400000); return d >= 0 && d <= 7; });
    if (upcomingBills.length > 0) {
      result.push({ id: "bills", type: "alert", title: `${upcomingBills.length} Bill${upcomingBills.length > 1 ? "s" : ""} Due This Week`, description: `$${upcomingBills.reduce((s, b) => s + b.amount, 0).toFixed(2)} due soon. Mark them paid to stay on track.`, icon: "calendar", color: colors.warning });
    }
    if (categorySpend.length > 0) {
      const [topCat, topAmount] = categorySpend[0];
      const pct = totalSpend > 0 ? ((topAmount / totalSpend) * 100).toFixed(0) : 0;
      result.push({ id: "topcat", type: "trend", title: `${topCat} is Your Top Expense`, description: `${pct}% of this month's spending went to ${topCat} ($${topAmount.toFixed(2)}).`, icon: "pie-chart", color: CATEGORY_COLORS[topCat] || colors.primary });
    }
    if (emailTxCount > 0) {
      result.push({ id: "email", type: "tip", title: `${emailTxCount} Transactions Auto-Imported`, description: "Email sync is working. All bank alert transactions are tracked automatically.", icon: "mail", color: colors.primary });
    }
    result.push({ id: "tip1", type: "tip", title: "50/30/20 Budget Rule", description: "Aim for 50% needs, 30% wants, and 20% savings. Pull down to refresh for the latest AI analysis.", icon: "target", color: colors.primary });
    return result;
  }, [transactions, bills, savingsRate, categorySpend]);

  return (
    <SafeAreaView edges={["top"]} style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: Platform.OS === "web" ? 34 + 84 : 120 }]}
        bottomOffset={80}
      >
        <View style={[styles.header, { paddingTop: Platform.OS === "web" ? 64 : 12 }]}>
          <TouchableOpacity hitSlop={8} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openDrawer(); }}>
            <Feather name="menu" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.foreground }]}>AI Insights</Text>
          <TouchableOpacity
            onPress={() => setShowProviderSheet(true)}
            style={[styles.providerPill, { backgroundColor: mode === "local" ? "#f59e0b20" : colors.muted }]}
          >
            <Feather name={mode === "local" ? "cpu" : "globe"} size={13} color={mode === "local" ? "#f59e0b" : colors.mutedForeground} />
            <Text style={{ color: mode === "local" ? "#f59e0b" : colors.mutedForeground, fontSize: 11, fontWeight: "600" }}>
              {mode === "local" ? "On-Device" : "API"}
            </Text>
          </TouchableOpacity>
        </View>

          <>
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>This Month's Spending</Text>
              {categorySpend.length === 0 ? (
                <Text style={[styles.noData, { color: colors.mutedForeground }]}>Add transactions to see breakdown</Text>
              ) : (
                categorySpend.map(([cat, amount]) => {
                  const pct = totalSpend > 0 ? (amount / totalSpend) * 100 : 0;
                  const catColor = CATEGORY_COLORS[cat] || colors.primary;
                  return (
                    <View key={cat} style={styles.catRow}>
                      <View style={styles.catLabel}>
                        <View style={[styles.catDot, { backgroundColor: catColor }]} />
                        <Text style={[styles.catName, { color: colors.foreground }]}>{cat}</Text>
                      </View>
                      <View style={styles.catBarContainer}>
                        <View style={[styles.catBar, { backgroundColor: catColor + "30", width: "100%" }]}>
                          <View style={[styles.catBarFill, { backgroundColor: catColor, width: `${Math.min(pct, 100)}%` as any }]} />
                        </View>
                      </View>
                      <Text style={[styles.catAmount, { color: colors.foreground }]}>${amount.toFixed(0)}</Text>
                    </View>
                  );
                })
              )}
            </View>
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Financial Health</Text>
              <View style={styles.healthRow}>
                <View style={styles.healthItem}>
                  <Text style={[styles.healthScore, { color: savingsRate >= 20 ? colors.success : savingsRate >= 10 ? colors.warning : colors.expense }]}>
                    {Math.max(0, Math.round(savingsRate))}%
                  </Text>
                  <Text style={[styles.healthLabel, { color: colors.mutedForeground }]}>Savings Rate</Text>
                </View>
                <View style={[styles.healthDivider, { backgroundColor: colors.border }]} />
                <View style={styles.healthItem}>
                  <Text style={[styles.healthScore, { color: accounts.length > 0 ? colors.success : colors.expense }]}>{accounts.length}</Text>
                  <Text style={[styles.healthLabel, { color: colors.mutedForeground }]}>Accounts</Text>
                </View>
                <View style={[styles.healthDivider, { backgroundColor: colors.border }]} />
                <View style={styles.healthItem}>
                  <Text style={[styles.healthScore, { color: bills.filter((b) => !b.isPaid).length === 0 ? colors.success : colors.warning }]}>
                    {bills.filter((b) => !b.isPaid).length}
                  </Text>
                  <Text style={[styles.healthLabel, { color: colors.mutedForeground }]}>Pending Bills</Text>
                </View>
              </View>
            </View>
            <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 4 }]}>Smart Insights</Text>
            {insights.map((insight) => (
              <View key={insight.id} style={[styles.insightCard, { backgroundColor: colors.card }]}>
                <View style={[styles.insightIcon, { backgroundColor: insight.color + "18" }]}>
                  <Feather name={insight.icon as any} size={18} color={insight.color} />
                </View>
                <View style={styles.insightContent}>
                  <View style={styles.insightHeader}>
                    <Text style={[styles.insightTitle, { color: colors.foreground }]}>{insight.title}</Text>
                    <View style={[styles.insightBadge, { backgroundColor: insight.color + "18" }]}>
                      <Text style={[styles.insightBadgeText, { color: insight.color }]}>{insight.type}</Text>
                    </View>
                  </View>
                  <Text style={[styles.insightDesc, { color: colors.mutedForeground }]}>{insight.description}</Text>
                </View>
              </View>
            ))}
            <ModelDownloadGate>
              <AIChatPanel />
            </ModelDownloadGate>
          </>
      </KeyboardAwareScrollView>

      {/* FAB */}
      <InsightsFAB
        onAddExpense={() => openSheet("EXPENSE")}
        onAddIncome={() => openSheet("INCOME")}
        onTransfer={() => openSheet("TRANSFER")}
      />

      <AddEntrySheet
        visible={sheetVisible}
        initialTab={sheetTab}
        onClose={() => setSheetVisible(false)}
      />

      {/* Provider settings modal */}
      <Modal visible={showProviderSheet} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowProviderSheet(false)}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>AI Provider</Text>

            <TouchableOpacity
              style={[styles.providerOption, mode === "local" && { borderColor: "#f59e0b", backgroundColor: "#f59e0b10" }]}
              onPress={() => { setMode("local"); setShowProviderSheet(false); }}
            >
              <Feather name="cpu" size={18} color={mode === "local" ? "#f59e0b" : colors.mutedForeground} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.providerOptionTitle, { color: colors.foreground }]}>On-Device (Private)</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                  Runs AI locally. Your data never leaves your phone.
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.providerOption, mode === "api" && { borderColor: colors.primary, backgroundColor: colors.primary + "10" }]}
              onPress={() => { setMode("api"); setShowProviderSheet(false); }}
            >
              <Feather name="globe" size={18} color={mode === "api" ? colors.primary : colors.mutedForeground} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.providerOptionTitle, { color: colors.foreground }]}>API (via Server)</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                  Uses your api-server. Configure model in .env
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.modalClose, { backgroundColor: colors.muted }]} onPress={() => setShowProviderSheet(false)}>
              <Text style={{ color: colors.foreground, fontWeight: "600" }}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, gap: 14 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 24, fontFamily: "Inter_700Bold" },
  providerPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 14 },
  modalTitle: { fontSize: 18, fontWeight: "700", textAlign: "center", marginBottom: 4 },
  providerOption: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: "transparent" },
  providerOptionTitle: { fontSize: 15, fontWeight: "600", marginBottom: 2 },
  modalClose: { alignItems: "center", paddingVertical: 12, borderRadius: 12, marginTop: 4 },
  genBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 },
  genBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  card: { borderRadius: 16, padding: 18, gap: 14 },
  cardTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  catRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  catLabel: { flexDirection: "row", alignItems: "center", gap: 7, width: 90 },
  catDot: { width: 8, height: 8, borderRadius: 4 },
  catName: { fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },
  catBarContainer: { flex: 1 },
  catBar: { height: 6, borderRadius: 3, overflow: "hidden" },
  catBarFill: { height: 6, borderRadius: 3 },
  catAmount: { fontSize: 13, fontFamily: "Inter_600SemiBold", width: 44, textAlign: "right" },
  healthRow: { flexDirection: "row", alignItems: "center", gap: 0 },
  healthItem: { flex: 1, alignItems: "center", gap: 4 },
  healthScore: { fontSize: 26, fontFamily: "Inter_700Bold" },
  healthLabel: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center" },
  healthDivider: { width: 1, height: 40, marginHorizontal: 8 },
  noData: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 8 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  aiCard: { flexDirection: "row", gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, alignItems: "flex-start" },
  aiText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  insightCard: { flexDirection: "row", gap: 14, padding: 16, borderRadius: 14, alignItems: "flex-start" },
  insightIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  insightContent: { flex: 1, gap: 4 },
  insightHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  insightTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1 },
  insightBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  insightBadgeText: { fontSize: 10, fontFamily: "Inter_500Medium", textTransform: "capitalize" },
  insightDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },

  // FAB
  fabContainer: {
    position: "absolute",
    bottom: Platform.OS === "web" ? 100 : 80,
    left: 20,
    alignItems: "flex-start",
    gap: 10,
  },
  fabActions: {
    gap: 8,
    alignItems: "flex-start",
  },
  fabAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 14,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
    minWidth: 160,
  },
  fabActionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f5f7fb",
    alignItems: "center",
    justifyContent: "center",
  },
  fabActionLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
});

const WIN_H = Dimensions.get("window").height;
const sh = StyleSheet.create({
  backdrop:      { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  sheet:         { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, minHeight: WIN_H * 0.48, maxHeight: WIN_H * 0.82, gap: 14 },
  tabRow:        { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, paddingBottom: 0 },
  tabBtn:        { paddingVertical: 14, paddingHorizontal: 2, marginRight: 28, position: "relative" },
  tabLabel:      { fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  tabUnderline:  { position: "absolute", bottom: 0, left: 0, right: 0, height: 2, borderRadius: 1 },
  closeBtn:      { flex: 1, alignItems: "flex-end", paddingVertical: 8 },
  pill:          { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20 },
  pillText:      { fontSize: 14, fontFamily: "Inter_500Medium" },
  sectionLabel:  { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  dateField:     { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13 },
  dateFieldText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  infoRow:       { flexDirection: "row", alignItems: "center", gap: 6 },
  infoText:      { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  dayRow:        { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  dayBtn:        { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 10 },
  dayBtnText:    { fontSize: 13, fontFamily: "Inter_500Medium" },
  applyBtn:      { borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 4 },
  applyText:     { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 1 },
});
