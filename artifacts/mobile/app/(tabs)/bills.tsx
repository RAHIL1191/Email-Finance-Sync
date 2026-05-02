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
import { SafeAreaView } from "react-native-safe-area-context";

import AddBillModal from "@/components/AddBillModal";
import BillFilterModal, {
  BillFilterSettings,
  DEFAULT_FILTER,
} from "@/components/BillFilterModal";
import { Bill, useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

// ─── Category config ──────────────────────────────────────────────────────────
const CAT_ICON: Record<string, { icon: string; bg: string; fg: string }> = {
  Housing:       { icon: "home",        bg: "#6366f1", fg: "#fff" },
  Utilities:     { icon: "zap",         bg: "#f59e0b", fg: "#fff" },
  Insurance:     { icon: "shield",      bg: "#3b82f6", fg: "#fff" },
  Subscriptions: { icon: "refresh-cw",  bg: "#8b5cf6", fg: "#fff" },
  Health:        { icon: "heart",       bg: "#ef4444", fg: "#fff" },
  Transport:     { icon: "navigation",  bg: "#10b981", fg: "#fff" },
  Food:          { icon: "coffee",      bg: "#f97316", fg: "#fff" },
  Entertainment: { icon: "film",        bg: "#ec4899", fg: "#fff" },
  Other:         { icon: "file-text",   bg: "#94a3b8", fg: "#fff" },
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
  if (d < 0)   return `${Math.abs(d)}d overdue`;
  if (d === 0) return "Due today";
  return `Due ${new Date(bill.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

// ─── Sort helper ──────────────────────────────────────────────────────────────
function sortBills(list: Bill[], sortBy: BillFilterSettings["sortBy"]): Bill[] {
  const s = list.slice();
  switch (sortBy) {
    case "date_asc":    return s.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    case "date_desc":   return s.sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());
    case "amount_high": return s.sort((a, b) => b.amount - a.amount);
    case "amount_low":  return s.sort((a, b) => a.amount - b.amount);
    case "title_asc":   return s.sort((a, b) => a.title.localeCompare(b.title));
    default:            return s;
  }
}

// ─── Group helper ─────────────────────────────────────────────────────────────
function groupBills(
  list: Bill[],
  groupBy: BillFilterSettings["groupBy"],
  startDay: number
): Record<string, Bill[]> {
  const groups: Record<string, Bill[]> = {};

  list.forEach((b) => {
    const d = new Date(b.dueDate);
    let key: string;

    if (groupBy === "weekly") {
      // ISO week label
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      key = `Week of ${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    } else if (groupBy === "biweekly") {
      // 2-week buckets from Jan 1
      const jan1 = new Date(d.getFullYear(), 0, 1);
      const dayOfYear = Math.floor((d.getTime() - jan1.getTime()) / 86400000);
      const period = Math.floor(dayOfYear / 14);
      const pStart = new Date(jan1);
      pStart.setDate(pStart.getDate() + period * 14);
      const pEnd = new Date(pStart);
      pEnd.setDate(pEnd.getDate() + 13);
      key = `${pStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${pEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    } else if (groupBy === "custom") {
      // Month starting from startDay
      let yr = d.getFullYear();
      let mo = d.getMonth();
      if (d.getDate() < startDay) {
        mo -= 1;
        if (mo < 0) { mo = 11; yr -= 1; }
      }
      const ref = new Date(yr, mo, startDay);
      key = `${ref.toLocaleDateString("en-US", { month: "long", year: "numeric" })} (from day ${startDay})`;
    } else {
      // monthly (default)
      key = d.toLocaleString("default", { month: "long", year: "numeric" });
    }

    if (!groups[key]) groups[key] = [];
    groups[key].push(b);
  });

  return groups;
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
            ? {
                text: "Mark as Paid",
                onPress: () => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  onPay();
                },
              }
            : null,
          { text: "Delete", style: "destructive", onPress: onDelete },
        ].filter(Boolean) as any);
      }}
      style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={[styles.catIcon, { backgroundColor: cfg.bg }]}>
        <Feather name={cfg.icon as any} size={18} color={cfg.fg} />
      </View>

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
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              onPay();
            }}
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

      <Text style={[styles.rowAmt, { color: colors.foreground }]}>
        ${bill.amount.toFixed(2)}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Month/period group ───────────────────────────────────────────────────────
function BillGroup({
  label,
  bills,
  onPay,
  onDelete,
}: {
  label: string;
  bills: Bill[];
  onPay: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const colors = useColors();
  const total = bills.reduce((s, b) => s + b.amount, 0);
  return (
    <View style={styles.monthGroup}>
      <View style={[styles.monthHeader, { borderBottomColor: colors.border }]}>
        <Text style={[styles.monthName, { color: colors.primary }]}>{label}</Text>
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

// ─── Calendar tab ─────────────────────────────────────────────────────────────
function CalendarView({
  bills,
  onPay,
  onDelete,
}: {
  bills: Bill[];
  onPay: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const colors = useColors();
  const today = new Date();
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [viewYear, setViewYear]   = useState(today.getFullYear());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const firstDay    = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const monthLabel  = new Date(viewYear, viewMonth).toLocaleString("default", { month: "long", year: "numeric" });

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
  const selectedBills = selectedDay ? (byDay[selectedDay] || []) : [];

  const prevMonth = () => {
    setSelectedDay(null);
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    setSelectedDay(null);
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  return (
    <View>
      <View style={[styles.calNav, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={prevMonth} hitSlop={12}>
          <Feather name="chevron-left" size={20} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.calMonthLabel, { color: colors.foreground }]}>{monthLabel}</Text>
        <TouchableOpacity onPress={nextMonth} hitSlop={12}>
          <Feather name="chevron-right" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.calDayRow}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <Text key={d} style={[styles.calDayName, { color: colors.mutedForeground }]}>{d}</Text>
        ))}
      </View>

      <View style={styles.calGrid}>
        {cells.map((day, i) => {
          if (!day) return <View key={`e${i}`} style={styles.calCell} />;
          const hasBill   = !!byDay[day];
          const isToday   = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
          const isSelected = day === selectedDay;
          return (
            <TouchableOpacity
              key={day}
              style={[styles.calCell, isSelected && { backgroundColor: colors.primary + "20", borderRadius: 8 }]}
              onPress={() => setSelectedDay(isSelected ? null : day)}
            >
              <View style={[styles.calDayCircle, isToday && { backgroundColor: colors.primary }]}>
                <Text style={[styles.calDayNum, { color: isToday ? "#fff" : colors.foreground }]}>{day}</Text>
              </View>
              {hasBill && <View style={[styles.calDot, { backgroundColor: colors.expense }]} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {selectedDay && (
        <View style={[styles.calSelected, { borderTopColor: colors.border }]}>
          <Text style={[styles.calSelectedTitle, { color: colors.foreground }]}>
            {new Date(viewYear, viewMonth, selectedDay).toLocaleDateString("en-US", {
              weekday: "long", month: "long", day: "numeric",
            })}
          </Text>
          {selectedBills.length === 0 ? (
            <Text style={[styles.calNoBills, { color: colors.mutedForeground }]}>No bills due this day</Text>
          ) : (
            selectedBills.map((b) => (
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
  const upcoming = bills.filter((b) => !b.isPaid).reduce((s, b) => s + b.amount, 0);
  const overdue  = bills.filter((b) => !b.isPaid && daysUntil(b.dueDate) < 0).length;
  const paid     = bills.filter((b) => b.isPaid).length;

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
  const { bills, markBillPaid, deleteBill } = useApp();
  const [tab, setTab]           = useState<Tab>("upcoming");
  const [showAdd, setShowAdd]   = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [filterSettings, setFilterSettings] = useState<BillFilterSettings>(DEFAULT_FILTER);
  // Has any non-default filter active?
  const isFiltered =
    filterSettings.sortBy !== DEFAULT_FILTER.sortBy ||
    filterSettings.groupBy !== DEFAULT_FILTER.groupBy ||
    filterSettings.accountIds.length > 0;

  // Apply account filter then sort, then group
  function prepare(list: Bill[]) {
    let result = list;
    if (filterSettings.accountIds.length > 0) {
      result = result.filter(
        (b) => b.accountId && filterSettings.accountIds.includes(b.accountId)
      );
    }
    result = sortBills(result, filterSettings.sortBy);
    return groupBills(result, filterSettings.groupBy, filterSettings.startDay);
  }

  const upcomingBills  = useMemo(() => bills.filter((b) => !b.isPaid), [bills]);
  const recurringBills = useMemo(() => bills.filter((b) => b.isRecurring), [bills]);
  const paidBills      = useMemo(() => bills.filter((b) => b.isPaid), [bills]);

  const upcomingGroups  = useMemo(() => prepare(upcomingBills),  [upcomingBills,  filterSettings]);
  const recurringGroups = useMemo(() => prepare(recurringBills), [recurringBills, filterSettings]);
  const paidGroups      = useMemo(() => prepare(paidBills),      [paidBills,      filterSettings]);

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
    return entries.map(([label, list]) => (
      <BillGroup
        key={label}
        label={label}
        bills={list}
        onPay={markBillPaid}
        onDelete={deleteBill}
      />
    ));
  }

  return (
    <SafeAreaView edges={["top"]} style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Platform.OS === "web" ? 64 : 14, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Bills</Text>
        <View style={styles.headerIcons}>
          {/* Filter button — dot indicator when active */}
          <TouchableOpacity
            hitSlop={8}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowFilter(true);
            }}
          >
            <View>
              <Feather name="sliders" size={20} color={colors.primary} />
              {isFiltered && (
                <View style={[styles.filterDot, { backgroundColor: colors.expense }]} />
              )}
            </View>
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
            style={[
              styles.tabItem,
              tab === t.key && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setTab(t.key);
            }}
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
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setShowAdd(true);
        }}
      >
        <Feather name="plus" size={24} color="#fff" />
      </TouchableOpacity>

      <AddBillModal visible={showAdd} onClose={() => setShowAdd(false)} />

      <BillFilterModal
        visible={showFilter}
        current={filterSettings}

        onApply={(s) => {
          setFilterSettings(s);
          setShowFilter(false);
        }}
        onClose={() => setShowFilter(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  headerIcons: { flexDirection: "row", gap: 18, alignItems: "center" },
  filterDot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 7,
    height: 7,
    borderRadius: 4,
  },
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
  // Month/period group
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
  fab: {
    position: "absolute",
    bottom: 100,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
});
