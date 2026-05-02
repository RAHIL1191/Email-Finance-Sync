import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AddBillModal from "@/components/AddBillModal";
import { Bill, useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

// ─── Category config ──────────────────────────────────────────────────────────
const CAT_ICON: Record<string, { icon: string; bg: string; fg: string }> = {
  Housing:       { icon: "home",         bg: "#6366f1", fg: "#fff" },
  Utilities:     { icon: "zap",          bg: "#f59e0b", fg: "#fff" },
  Insurance:     { icon: "shield",       bg: "#3b82f6", fg: "#fff" },
  Subscriptions: { icon: "refresh-cw",   bg: "#8b5cf6", fg: "#fff" },
  Health:        { icon: "heart",        bg: "#ef4444", fg: "#fff" },
  Transport:     { icon: "navigation",   bg: "#10b981", fg: "#fff" },
  Food:          { icon: "coffee",       bg: "#f97316", fg: "#fff" },
  Entertainment: { icon: "film",         bg: "#ec4899", fg: "#fff" },
  Other:         { icon: "file-text",    bg: "#94a3b8", fg: "#fff" },
};

function catConfig(category: string) {
  return CAT_ICON[category] ?? CAT_ICON.Other;
}

// ─── Status helpers ───────────────────────────────────────────────────────────
function daysUntil(dueDate: string) {
  return Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86400000);
}

function statusLabel(bill: Bill) {
  if (bill.isPaid) return "Paid";
  const d = daysUntil(bill.dueDate);
  if (d < 0)  return `${Math.abs(d)}d overdue`;
  if (d === 0) return "Due today";
  return `Due ${new Date(bill.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

// ─── Single bill row ──────────────────────────────────────────────────────────
function BillRow({
  bill,
  onPay,
  onDelete,
}: {
  bill: Bill;
  onPay: () => void;
  onDelete: () => void;
}) {
  const colors = useColors();
  const cfg = catConfig(bill.category);
  const d = daysUntil(bill.dueDate);
  const isOverdue = !bill.isPaid && d < 0;
  const isDueSoon = !bill.isPaid && d >= 0 && d <= 3;
  const label = statusLabel(bill);

  const statusColor = bill.isPaid
    ? colors.success
    : isOverdue
    ? colors.expense
    : isDueSoon
    ? "#f59e0b"
    : colors.mutedForeground;

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        Alert.alert(bill.title, "What would you like to do?", [
          { text: "Cancel", style: "cancel" },
          !bill.isPaid
            ? { text: "Mark as Paid", onPress: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); onPay(); } }
            : null,
          { text: "Delete", style: "destructive", onPress: onDelete },
        ].filter(Boolean) as any);
      }}
      style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      {/* Category icon */}
      <View style={[styles.catIcon, { backgroundColor: cfg.bg }]}>
        <Feather name={cfg.icon as any} size={18} color={cfg.fg} />
      </View>

      {/* Info */}
      <View style={styles.rowInfo}>
        <Text style={[styles.rowTitle, { color: colors.foreground }]}>{bill.title}</Text>
        <View style={styles.rowMeta}>
          <Text style={[styles.rowSub, { color: statusColor }]}>{label}</Text>
          {bill.isRecurring && (
            <>
              <Text style={[styles.dot, { color: colors.mutedForeground }]}>·</Text>
              <Feather name="repeat" size={10} color={colors.mutedForeground} />
              <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{bill.frequency}</Text>
            </>
          )}
        </View>
        {!bill.isPaid && (
          <TouchableOpacity
            onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); onPay(); }}
            hitSlop={8}
          >
            <Text style={[styles.payNow, { color: colors.expense }]}>Pay now</Text>
          </TouchableOpacity>
        )}
        {bill.isPaid && (
          <View style={styles.paidBadge}>
            <Feather name="check-circle" size={11} color={colors.success} />
            <Text style={[styles.paidText, { color: colors.success }]}>Paid</Text>
          </View>
        )}
      </View>

      {/* Amount */}
      <Text style={[styles.rowAmt, { color: colors.foreground }]}>
        ${bill.amount.toFixed(2)}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Month group ──────────────────────────────────────────────────────────────
function MonthGroup({ month, bills, onPay, onDelete }: {
  month: string;
  bills: Bill[];
  onPay: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const colors = useColors();
  const total = bills.reduce((s, b) => s + b.amount, 0);
  return (
    <View style={styles.monthGroup}>
      <View style={[styles.monthHeader, { borderBottomColor: colors.border }]}>
        <Text style={[styles.monthName, { color: colors.primary }]}>{month}</Text>
        <Text style={[styles.monthTotal, { color: colors.primary }]}>
          ${total.toFixed(2)}
        </Text>
      </View>
      {bills.map((b) => (
        <BillRow
          key={b.id}
          bill={b}
          onPay={() => onPay(b.id)}
          onDelete={() => onDelete(b.id)}
        />
      ))}
    </View>
  );
}

// ─── Calendar tab: simple month grid ─────────────────────────────────────────
function CalendarView({ bills, onPay, onDelete }: {
  bills: Bill[];
  onPay: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const colors = useColors();
  const today = new Date();
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [viewYear, setViewYear] = useState(today.getFullYear());

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const monthLabel = new Date(viewYear, viewMonth).toLocaleString("default", { month: "long", year: "numeric" });

  // map day → bills
  const byDay: Record<number, Bill[]> = {};
  bills.forEach((b) => {
    const d = new Date(b.dueDate);
    if (d.getMonth() === viewMonth && d.getFullYear() === viewYear) {
      const day = d.getDate();
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(b);
    }
  });

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const selectedBills = selectedDay ? (byDay[selectedDay] || []) : [];

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
    setSelectedDay(null);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
    setSelectedDay(null);
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Month nav */}
      <View style={[styles.calNav, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={prevMonth} hitSlop={12}>
          <Feather name="chevron-left" size={20} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.calMonthLabel, { color: colors.foreground }]}>{monthLabel}</Text>
        <TouchableOpacity onPress={nextMonth} hitSlop={12}>
          <Feather name="chevron-right" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Day headers */}
      <View style={styles.calDayRow}>
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
          <Text key={d} style={[styles.calDayName, { color: colors.mutedForeground }]}>{d}</Text>
        ))}
      </View>

      {/* Grid */}
      <View style={styles.calGrid}>
        {cells.map((day, i) => {
          if (!day) return <View key={`e${i}`} style={styles.calCell} />;
          const hasBill = !!byDay[day];
          const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
          const isSelected = day === selectedDay;
          return (
            <TouchableOpacity
              key={day}
              style={[
                styles.calCell,
                isSelected && { backgroundColor: colors.primary + "20", borderRadius: 8 },
              ]}
              onPress={() => setSelectedDay(isSelected ? null : day)}
            >
              <View style={[
                styles.calDayCircle,
                isToday && { backgroundColor: colors.primary },
              ]}>
                <Text style={[
                  styles.calDayNum,
                  { color: isToday ? "#fff" : colors.foreground },
                ]}>{day}</Text>
              </View>
              {hasBill && (
                <View style={[styles.calDot, { backgroundColor: colors.expense }]} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Selected day bills */}
      {selectedDay && (
        <View style={[styles.calSelected, { borderTopColor: colors.border }]}>
          <Text style={[styles.calSelectedTitle, { color: colors.foreground }]}>
            {new Date(viewYear, viewMonth, selectedDay).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </Text>
          {selectedBills.length === 0 ? (
            <Text style={[styles.calNoBills, { color: colors.mutedForeground }]}>No bills due this day</Text>
          ) : (
            selectedBills.map(b => (
              <BillRow key={b.id} bill={b} onPay={() => onPay(b.id)} onDelete={() => onDelete(b.id)} />
            ))
          )}
        </View>
      )}
    </View>
  );
}

// ─── Summary strip ────────────────────────────────────────────────────────────
function SummaryStrip() {
  const colors = useColors();
  const { bills } = useApp();
  const upcoming = bills.filter(b => !b.isPaid).reduce((s, b) => s + b.amount, 0);
  const overdue = bills.filter(b => !b.isPaid && daysUntil(b.dueDate) < 0).length;
  const paid = bills.filter(b => b.isPaid).length;

  return (
    <View style={[styles.strip, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
      <View style={styles.stripItem}>
        <Text style={[styles.stripAmt, { color: colors.foreground }]}>${upcoming.toFixed(0)}</Text>
        <Text style={[styles.stripLabel, { color: colors.mutedForeground }]}>Upcoming</Text>
      </View>
      <View style={[styles.stripDivider, { backgroundColor: colors.border }]} />
      <View style={styles.stripItem}>
        <Text style={[styles.stripAmt, { color: overdue > 0 ? colors.expense : colors.foreground }]}>{overdue}</Text>
        <Text style={[styles.stripLabel, { color: colors.mutedForeground }]}>Overdue</Text>
      </View>
      <View style={[styles.stripDivider, { backgroundColor: colors.border }]} />
      <View style={styles.stripItem}>
        <Text style={[styles.stripAmt, { color: colors.success }]}>{paid}</Text>
        <Text style={[styles.stripLabel, { color: colors.mutedForeground }]}>Paid</Text>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
type Tab = "upcoming" | "calendar" | "recurring" | "paid";
const TABS: { key: Tab; label: string }[] = [
  { key: "upcoming",  label: "UPCOMING"  },
  { key: "calendar",  label: "CALENDAR"  },
  { key: "recurring", label: "RECURRING" },
  { key: "paid",      label: "PAID"      },
];

export default function BillsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { bills, markBillPaid, deleteBill } = useApp();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [showAdd, setShowAdd] = useState(false);
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  // Group bills by month label
  function groupByMonth(list: Bill[]) {
    const groups: Record<string, Bill[]> = {};
    list
      .slice()
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .forEach((b) => {
        const key = new Date(b.dueDate).toLocaleString("default", { month: "long", year: "numeric" });
        if (!groups[key]) groups[key] = [];
        groups[key].push(b);
      });
    return groups;
  }

  const upcomingBills   = useMemo(() => bills.filter(b => !b.isPaid), [bills]);
  const recurringBills  = useMemo(() => bills.filter(b => b.isRecurring), [bills]);
  const paidBills       = useMemo(() => bills.filter(b => b.isPaid), [bills]);

  const upcomingGroups  = useMemo(() => groupByMonth(upcomingBills), [upcomingBills]);
  const recurringGroups = useMemo(() => groupByMonth(recurringBills), [recurringBills]);
  const paidGroups      = useMemo(() => groupByMonth(paidBills), [paidBills]);

  function renderGroups(groups: Record<string, Bill[]>) {
    const entries = Object.entries(groups);
    if (entries.length === 0) {
      return (
        <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="file-text" size={36} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No bills here</Text>
          <TouchableOpacity onPress={() => setShowAdd(true)}>
            <Text style={[styles.emptyAction, { color: colors.primary }]}>+ Add Bill</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return entries.map(([month, list]) => (
      <MonthGroup
        key={month}
        month={month}
        bills={list}
        onPay={markBillPaid}
        onDelete={deleteBill}
      />
    ));
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 14, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Bills</Text>
        <View style={styles.headerIcons}>
          <TouchableOpacity hitSlop={8}>
            <Feather name="sliders" size={20} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity hitSlop={8}>
            <Feather name="download" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Summary strip */}
      <SummaryStrip />

      {/* Tab bar */}
      <View style={[styles.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabItem, tab === t.key && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setTab(t.key); }}
          >
            <Text style={[styles.tabLabel, { color: tab === t.key ? colors.primary : colors.mutedForeground }]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {tab === "calendar" ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingBottom: Platform.OS === "web" ? 34 + 84 : 100 }]}
        >
          <CalendarView
            bills={bills}
            onPay={markBillPaid}
            onDelete={deleteBill}
          />
        </ScrollView>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingBottom: Platform.OS === "web" ? 34 + 84 : 100 }]}
        >
          {tab === "upcoming"  && renderGroups(upcomingGroups)}
          {tab === "recurring" && renderGroups(recurringGroups)}
          {tab === "paid"      && renderGroups(paidGroups)}
        </ScrollView>
      )}

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowAdd(true); }}
      >
        <Feather name="plus" size={24} color="#fff" />
      </TouchableOpacity>

      <AddBillModal visible={showAdd} onClose={() => setShowAdd(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // Header
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 18, paddingBottom: 14, borderBottomWidth: 1 },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  headerIcons: { flexDirection: "row", gap: 18, alignItems: "center" },
  // Summary strip
  strip: { flexDirection: "row", paddingVertical: 12, paddingHorizontal: 18, borderBottomWidth: 1 },
  stripItem: { flex: 1, alignItems: "center", gap: 2 },
  stripAmt: { fontSize: 18, fontFamily: "Inter_700Bold" },
  stripLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  stripDivider: { width: 1, marginVertical: 4 },
  // Tabs
  tabBar: { flexDirection: "row", borderBottomWidth: 1 },
  tabItem: { flex: 1, paddingVertical: 12, alignItems: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabLabel: { fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  // Scroll
  scroll: { paddingHorizontal: 16, paddingTop: 14, gap: 20 },
  // Month group
  monthGroup: { gap: 10 },
  monthHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 8, borderBottomWidth: 1 },
  monthName: { fontSize: 16, fontFamily: "Inter_700Bold" },
  monthTotal: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  // Bill row
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  catIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  rowInfo: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  rowSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  dot: { fontSize: 12 },
  payNow: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  paidBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  paidText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  rowAmt: { fontSize: 15, fontFamily: "Inter_700Bold" },
  // Empty
  empty: { padding: 40, borderRadius: 16, borderWidth: 1, alignItems: "center", gap: 12, marginTop: 16 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  emptyAction: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  // Calendar
  calNav: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1 },
  calMonthLabel: { fontSize: 16, fontFamily: "Inter_700Bold" },
  calDayRow: { flexDirection: "row", paddingTop: 10, paddingBottom: 4 },
  calDayName: { flex: 1, textAlign: "center", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  calGrid: { flexDirection: "row", flexWrap: "wrap" },
  calCell: { width: "14.28%", alignItems: "center", paddingVertical: 4, gap: 2 },
  calDayCircle: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  calDayNum: { fontSize: 13, fontFamily: "Inter_500Medium" },
  calDot: { width: 5, height: 5, borderRadius: 3 },
  calSelected: { borderTopWidth: 1, marginTop: 8, paddingTop: 12, gap: 10 },
  calSelectedTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  calNoBills: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 12 },
  // FAB
  fab: { position: "absolute", bottom: 100, right: 20, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
});
