import { Feather } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dimensions,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import AddEntrySheet from "@/components/AddEntrySheet";
import TransactionFilterModal, { DEFAULT_TX_FILTER, TxFilterSettings } from "@/components/TransactionFilterModal";
import MonthDetailModal from "@/components/MonthDetailModal";
import TransactionDetailModal from "@/components/TransactionDetailModal";
import TransactionItem from "@/components/TransactionItem";
import { Account, Bill, Category, Transaction, InvestmentTransaction, Holding, computeBalance, useApp } from "@/context/AppContext";
import { useDrawer } from "@/context/DrawerContext";
import { useColors } from "@/hooks/useColors";
import { parseLocalDate, localYM, toLocalYMD } from "@/hooks/useLocalDate";

// ── Period Settings Sheet ──────────────────────────────────────────────────────
type GroupByPeriod = "Monthly" | "Weekly" | "Bi-Weekly" | "Yearly" | "Custom";
interface PeriodSettings {
  period: GroupByPeriod;
  monthStartDay: number;
  weekStartDay: number;
  biWeeklyStartDate: Date;
  customStartDate: Date;
  customEndDate: Date;
  accountIds: string[];
}
const DEFAULT_PERIOD_SETTINGS: PeriodSettings = {
  period: "Monthly", monthStartDay: 1, weekStartDay: 0,
  biWeeklyStartDate: new Date(), customStartDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1), customEndDate: new Date(),
  accountIds: [],
};
const WEEK_DAYS_PS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PERIODS_PS: GroupByPeriod[] = ["Monthly", "Weekly", "Bi-Weekly", "Yearly", "Custom"];
function fmtPS(d: Date) { return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
const WIN_H_PS = Dimensions.get("window").height;

function PeriodSettingsSheet({ visible, onClose, onApply, initial }: {
  visible: boolean; onClose: () => void; onApply: (s: PeriodSettings) => void; initial: PeriodSettings;
}) {
  const colors = useColors();
  const { accounts = [] } = useApp();
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
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>(initial.accountIds ?? []);
  const [showAccountPicker, setShowAccountPicker] = useState(false);

  const snapSun = (d: Date) => { const s = new Date(d); s.setDate(d.getDate() - d.getDay()); return s; };

  const toggleAccount = (id: string) =>
    setSelectedAccountIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const apply = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onApply({ period, monthStartDay: monthStartDate.getDate(), weekStartDay, biWeeklyStartDate: biWeeklyDate, customStartDate: customStart, customEndDate: customEnd, accountIds: selectedAccountIds });
    onClose();
  };

  const clearFilter = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedAccountIds([]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={psSt.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={[psSt.sheet, { backgroundColor: colors.card, paddingBottom: Platform.OS === "ios" ? 34 : 16 }]}>
          {/* Tabs */}
          <View style={[psSt.tabRow, { borderBottomColor: colors.border }]}>
            {(["GROUP BY", "FILTER"] as const).map(t => (
              <TouchableOpacity key={t} onPress={() => setActiveTab(t)} style={psSt.tabBtn}>
                <Text style={[psSt.tabLabel, { color: activeTab === t ? colors.primary : colors.mutedForeground }]}>{t}</Text>
                {activeTab === t && <View style={[psSt.tabUnderline, { backgroundColor: colors.primary }]} />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={onClose} hitSlop={8} style={psSt.closeBtn}>
              <Feather name="x" size={20} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {activeTab === "GROUP BY" ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 20, paddingTop: 4 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                {PERIODS_PS.map(p => (
                  <TouchableOpacity key={p} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPeriod(p); }}
                    style={[psSt.pill, period === p ? { backgroundColor: colors.primary } : { backgroundColor: colors.muted, borderColor: colors.border, borderWidth: 1 }]}>
                    <Text style={[psSt.pillText, { color: period === p ? "#fff" : colors.foreground }]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {period === "Monthly" && (
                <View style={{ gap: 10 }}>
                  <Text style={[psSt.label, { color: colors.foreground }]}>Start day of month</Text>
                  <TouchableOpacity style={[psSt.dateField, { backgroundColor: colors.muted, borderColor: colors.border }]} onPress={() => setShowMonthPicker(true)} activeOpacity={0.8}>
                    <Feather name="calendar" size={15} color={colors.mutedForeground} />
                    <Text style={[psSt.dateText, { color: colors.foreground }]}>{fmtPS(monthStartDate)}</Text>
                  </TouchableOpacity>
                  {showMonthPicker && <DateTimePicker value={monthStartDate} mode="date" display={Platform.OS === "ios" ? "spinner" : "default"} onChange={(_, d) => { setShowMonthPicker(false); if (d) setMonthStartDate(d); }} />}
                  <View style={psSt.infoRow}><Feather name="info" size={13} color={colors.mutedForeground} /><Text style={[psSt.infoText, { color: colors.mutedForeground }]}>Month will start from Day {monthStartDate.getDate()}</Text></View>
                </View>
              )}

              {period === "Weekly" && (
                <View style={{ gap: 10 }}>
                  <Text style={[psSt.label, { color: colors.foreground }]}>Start day of week</Text>
                  <View style={psSt.dayRow}>
                    {WEEK_DAYS_PS.map((day, i) => (
                      <TouchableOpacity key={day} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setWeekStartDay(i); }}
                        style={[psSt.dayBtn, weekStartDay === i ? { backgroundColor: colors.primary } : { backgroundColor: colors.muted, borderColor: colors.border, borderWidth: 1 }]}>
                        <Text style={[psSt.dayBtnText, { color: weekStartDay === i ? "#fff" : colors.foreground }]}>{day}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={psSt.infoRow}><Feather name="info" size={13} color={colors.mutedForeground} /><Text style={[psSt.infoText, { color: colors.mutedForeground }]}>Week will start every {WEEK_DAYS_PS[weekStartDay]}</Text></View>
                </View>
              )}

              {period === "Bi-Weekly" && (
                <View style={{ gap: 10 }}>
                  <Text style={[psSt.label, { color: colors.foreground }]}>Start date (Sundays only)</Text>
                  <TouchableOpacity style={[psSt.dateField, { backgroundColor: colors.muted, borderColor: colors.border }]} onPress={() => setShowBiWeeklyPicker(true)} activeOpacity={0.8}>
                    <Feather name="calendar" size={15} color={colors.mutedForeground} />
                    <Text style={[psSt.dateText, { color: colors.foreground }]}>{fmtPS(biWeeklyDate)}</Text>
                  </TouchableOpacity>
                  {showBiWeeklyPicker && <DateTimePicker value={biWeeklyDate} mode="date" display={Platform.OS === "ios" ? "spinner" : "default"} onChange={(_, d) => { setShowBiWeeklyPicker(false); if (d) setBiWeeklyDate(snapSun(d)); }} />}
                  <View style={psSt.infoRow}><Feather name="info" size={13} color={colors.mutedForeground} /><Text style={[psSt.infoText, { color: colors.mutedForeground }]}>Bi-weekly starts Sunday, {fmtPS(biWeeklyDate)}</Text></View>
                </View>
              )}

              {period === "Yearly" && (
                <View style={psSt.infoRow}><Feather name="info" size={13} color={colors.mutedForeground} /><Text style={[psSt.infoText, { color: colors.mutedForeground }]}>Yearly period starts from January 1st</Text></View>
              )}

              {period === "Custom" && (
                <View style={{ gap: 14 }}>
                  <View style={{ gap: 8 }}>
                    <Text style={[psSt.label, { color: colors.foreground }]}>Start date</Text>
                    <TouchableOpacity style={[psSt.dateField, { backgroundColor: colors.muted, borderColor: colors.border }]} onPress={() => setShowCustomStart(true)} activeOpacity={0.8}>
                      <Feather name="calendar" size={15} color={colors.mutedForeground} />
                      <Text style={[psSt.dateText, { color: colors.foreground }]}>{fmtPS(customStart)}</Text>
                    </TouchableOpacity>
                    {showCustomStart && <DateTimePicker value={customStart} mode="date" display={Platform.OS === "ios" ? "spinner" : "default"} onChange={(_, d) => { setShowCustomStart(false); if (d) setCustomStart(d); }} />}
                  </View>
                  <View style={{ gap: 8 }}>
                    <Text style={[psSt.label, { color: colors.foreground }]}>End date</Text>
                    <TouchableOpacity style={[psSt.dateField, { backgroundColor: colors.muted, borderColor: colors.border }]} onPress={() => setShowCustomEnd(true)} activeOpacity={0.8}>
                      <Feather name="calendar" size={15} color={colors.mutedForeground} />
                      <Text style={[psSt.dateText, { color: colors.foreground }]}>{fmtPS(customEnd)}</Text>
                    </TouchableOpacity>
                    {showCustomEnd && <DateTimePicker value={customEnd} mode="date" minimumDate={customStart} display={Platform.OS === "ios" ? "spinner" : "default"} onChange={(_, d) => { setShowCustomEnd(false); if (d) setCustomEnd(d); }} />}
                  </View>
                </View>
              )}
            </ScrollView>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 20, paddingTop: 8 }}>
              {/* Accounts row */}
              <View style={{ gap: 12 }}>
                <View style={psSt.filterSectionRow}>
                  <Text style={[psSt.label, { color: colors.foreground }]}>Accounts</Text>
                  <TouchableOpacity
                    style={[psSt.addBtn, { backgroundColor: colors.primary }]}
                    onPress={() => setShowAccountPicker(true)}
                    activeOpacity={0.85}
                  >
                    <Feather name="plus" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
                {(selectedAccountIds ?? []).length > 0 && (
                  <View style={psSt.chipRow}>
                    {(selectedAccountIds ?? []).map(id => {
                      const acc = accounts.find(a => a.id === id);
                      if (!acc) return null;
                      return (
                        <View key={id} style={[psSt.chip, { backgroundColor: (acc.color || colors.primary) + "22", borderColor: acc.color || colors.primary }]}>
                          <Text style={[psSt.chipText, { color: acc.color || colors.primary }]} numberOfLines={1}>{acc.name}</Text>
                          <TouchableOpacity onPress={() => toggleAccount(id)} hitSlop={6}>
                            <Feather name="x" size={12} color={acc.color || colors.primary} />
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>

              {/* Account Picker sub-modal */}
              <Modal visible={showAccountPicker} animationType="fade" transparent onRequestClose={() => setShowAccountPicker(false)}>
                <View style={psSt.pickerBackdrop}>
                  <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowAccountPicker(false)} />
                  <View style={[psSt.pickerBox, { backgroundColor: colors.card }]}>
                    <Text style={[psSt.label, { color: colors.foreground, marginBottom: 12 }]}>Select Accounts</Text>
                    <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
                      {(accounts ?? []).map(acc => {
                        const selected = (selectedAccountIds ?? []).includes(acc.id);
                        return (
                          <TouchableOpacity
                            key={acc.id}
                            style={[psSt.pickerRow, { borderBottomColor: colors.border }]}
                            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); toggleAccount(acc.id); }}
                            activeOpacity={0.7}
                          >
                            <View style={[psSt.pickerDot, { backgroundColor: acc.color || colors.primary }]} />
                            <View style={{ flex: 1 }}>
                              <Text style={[psSt.pickerName, { color: colors.foreground }]} numberOfLines={1}>{acc.name}</Text>
                              {acc.bank ? <Text style={[psSt.pickerSub, { color: colors.mutedForeground }]} numberOfLines={1}>{acc.bank}</Text> : null}
                            </View>
                            <View style={[psSt.checkbox, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : "transparent" }]}>
                              {selected && <Feather name="check" size={12} color="#fff" />}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                    <TouchableOpacity style={[psSt.applyBtn, { backgroundColor: colors.primary, marginTop: 16 }]} onPress={() => setShowAccountPicker(false)} activeOpacity={0.85}>
                      <Text style={psSt.applyText}>DONE</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Modal>
            </ScrollView>
          )}

          {/* Bottom buttons */}
          {activeTab === "FILTER" ? (
            <View style={psSt.btnRow}>
              <TouchableOpacity style={[psSt.clearBtn, { backgroundColor: colors.muted }]} onPress={clearFilter} activeOpacity={0.85}>
                <Text style={[psSt.clearText, { color: colors.foreground }]}>CLEAR</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[psSt.applyBtn, { backgroundColor: colors.primary, flex: 1 }]} onPress={apply} activeOpacity={0.85}>
                <Text style={psSt.applyText}>APPLY</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={[psSt.applyBtn, { backgroundColor: colors.primary }]} onPress={apply} activeOpacity={0.85}>
              <Text style={psSt.applyText}>APPLY</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const psSt = StyleSheet.create({
  backdrop:   { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  sheet:      { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 8, minHeight: WIN_H_PS * 0.48, maxHeight: WIN_H_PS * 0.82, gap: 14 },
  tabRow:     { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, paddingBottom: 0 },
  tabBtn:     { paddingVertical: 14, paddingHorizontal: 2, marginRight: 28, position: "relative" },
  tabLabel:   { fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  tabUnderline: { position: "absolute", bottom: 0, left: 0, right: 0, height: 2, borderRadius: 1 },
  closeBtn:   { flex: 1, alignItems: "flex-end", paddingVertical: 8 },
  pill:       { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20 },
  pillText:   { fontSize: 14, fontFamily: "Inter_500Medium" },
  label:      { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  dateField:  { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13 },
  dateText:   { fontSize: 15, fontFamily: "Inter_500Medium" },
  infoRow:    { flexDirection: "row", alignItems: "center", gap: 6 },
  infoText:   { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  dayRow:     { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  dayBtn:     { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 10 },
  dayBtnText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  applyBtn:        { borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 4 },
  applyText:       { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 1 },
  filterSectionRow:{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  addBtn:          { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  chipRow:         { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip:            { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, maxWidth: 160 },
  chipText:        { fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },
  btnRow:          { flexDirection: "row", gap: 12, marginTop: 4 },
  clearBtn:        { borderRadius: 14, paddingVertical: 16, alignItems: "center", flex: 1 },
  clearText:       { fontSize: 15, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  pickerBackdrop:  { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.6)", padding: 24 },
  pickerBox:       { borderRadius: 20, padding: 20, width: "100%" },
  pickerRow:       { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: 1 },
  pickerDot:       { width: 12, height: 12, borderRadius: 6 },
  pickerName:      { fontSize: 14, fontFamily: "Inter_500Medium" },
  pickerSub:       { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  checkbox:        { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },
});

const SUBTABS = ["CASH FLOW", "SPENDING", "TRENDS", "TRANSACTIONS", "PORTFOLIO", "REVIEW"] as const;
type Subtab = (typeof SUBTABS)[number];

const CHART_VIEWS = ["Chart", "Calendar", "Monthly"] as const;
type ChartView = (typeof CHART_VIEWS)[number];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FULL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getMonthData(transactions: Transaction[], year: number, bills?: Bill[]) {
  return MONTHS.map((label, idx) => {
    const monthStart = `${year}-${String(idx + 1).padStart(2, "0")}`;
    const income = transactions
      .filter((t) => t.type === "income" && t.category !== "Transfer" && t.category?.toLowerCase() !== "transfer" && localYM(t.date) === monthStart)
      .reduce((s, t) => s + t.amount, 0);
    let expense = transactions
      .filter((t) => t.type === "expense" && t.category !== "Transfer" && t.category?.toLowerCase() !== "transfer" && localYM(t.date) === monthStart)
      .reduce((s, t) => s + t.amount, 0);

    if (bills) {
      const todayStr = toLocalYMD(new Date());
      const upcomingBillsTotal = bills
        .filter((b) => localYM(b.dueDate) === monthStart && !b.isPaid && toLocalYMD(parseLocalDate(b.dueDate)) > todayStr)
        .reduce((s, b) => s + b.amount, 0);
      expense += upcomingBillsTotal;
    }

    return { label, income, expense };
  });
}

function getMonthDataForYearMonth(transactions: Transaction[], year: number, month: number, bills?: Bill[]) {
  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}`;
  const income = transactions
    .filter((t) => t.type === "income" && t.category !== "Transfer" && t.category?.toLowerCase() !== "transfer" && localYM(t.date) === monthStart)
    .reduce((s, t) => s + t.amount, 0);
  let expense = transactions
    .filter((t) => t.type === "expense" && t.category !== "Transfer" && t.category?.toLowerCase() !== "transfer" && localYM(t.date) === monthStart)
    .reduce((s, t) => s + t.amount, 0);

  if (bills) {
    const todayStr = toLocalYMD(new Date());
    const upcomingBillsTotal = bills
      .filter((b) => localYM(b.dueDate) === monthStart && !b.isPaid && toLocalYMD(parseLocalDate(b.dueDate)) > todayStr)
      .reduce((s, b) => s + b.amount, 0);
    expense += upcomingBillsTotal;
  }

  return { income, expense };
}

function ProjectedSection({
  colors,
  monthLabel,
  income,
  expense,
  prevExpense,
  onPress,
}: {
  colors: any;
  monthLabel: string;
  income: number;
  expense: number;
  prevExpense: number;
  onPress?: () => void;
}) {
  const projected = income - expense;
  const expensePct = income > 0 ? Math.min((expense / income) * 100, 100) : expense > 0 ? 100 : 0;

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} disabled={!onPress} style={[styles.projectedCard, { backgroundColor: colors.card }]}>
      <View style={styles.projectedHeader}>
        <Text style={[styles.projectedTitle, { color: colors.foreground }]}>Projected ({monthLabel})</Text>
        <TouchableOpacity style={styles.moreBtn} onPress={onPress}>
          <Text style={[styles.moreText, { color: colors.primary }]}>More</Text>
          <Feather name="chevron-right" size={14} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Income Row */}
      <View style={styles.projectedRow}>
        <Text style={[styles.projectedMonth, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Total Income</Text>
        <Text style={[styles.projectedAmount, { color: "#4caf50", fontFamily: "Inter_600SemiBold" }]}>
          ${income.toFixed(0)}
        </Text>
      </View>

      {/* Expense Row */}
      <View style={styles.projectedRow}>
        <Text style={[styles.projectedMonth, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Total Expense</Text>
        <Text style={[styles.projectedAmount, { color: "#f97316", fontFamily: "Inter_600SemiBold" }]}>
          ${expense.toFixed(0)}
        </Text>
      </View>

      {/* Progress Track */}
      <View style={[styles.progressTrack, { backgroundColor: colors.muted, marginVertical: 4 }]}>
        <View
          style={[
            styles.progressFill,
            { backgroundColor: "#f97316", width: `${expensePct}%` as any },
          ]}
        />
      </View>

      {/* Overall Balance Row */}
      <View style={styles.balanceRow}>
        <Text style={[styles.balanceLabel, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Overall Balance</Text>
        <View style={styles.projectedRight}>
          <Text style={[styles.projectedPct, { color: colors.mutedForeground }]}>{expensePct.toFixed(1)}%</Text>
          <Text style={[styles.projectedAmount, { fontSize: 16, fontFamily: "Inter_700Bold", color: projected >= 0 ? "#4caf50" : "#ef4444" }]}>
            {`$${Math.abs(projected).toFixed(0)}`}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function CalendarView({
  colors,
  currentMonth,
  setCurrentMonth,
  transactions,
  setChartView,
  onMonthPress,
}: {
  colors: any;
  currentMonth: number;
  setCurrentMonth: (m: number) => void;
  transactions: Transaction[];
  setChartView: (v: ChartView) => void;
  onMonthPress: (year: number, month: number) => void;
}) {
  const today = new Date();
  const year = today.getFullYear();
  const todayDay = today.getDate();
  const todayMonth = today.getMonth();
  const todayYear = today.getFullYear();

  const firstDayOfMonth = new Date(year, currentMonth, 1).getDay();
  const daysInMonth = new Date(year, currentMonth + 1, 0).getDate();

  const { bills = [] } = useApp();

  const { income, expense } = useMemo(
    () => getMonthDataForYearMonth(transactions, year, currentMonth, bills),
    [transactions, year, currentMonth, bills]
  );
  const prevData = useMemo(
    () => getMonthDataForYearMonth(transactions, currentMonth - 1 < 0 ? year - 1 : year, currentMonth - 1 < 0 ? 11 : currentMonth - 1, bills),
    [transactions, year, currentMonth, bills]
  );

  const txDays = useMemo(() => {
    const monthStr = `${year}-${String(currentMonth + 1).padStart(2, "0")}`;
    const days = new Set<number>();
    transactions
      .filter((t) => localYM(t.date) === monthStr)
      .forEach((t) => {
        const d = parseLocalDate(t.date).getDate();
        days.add(d);
      });
    return days;
  }, [transactions, year, currentMonth]);

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  const monthLabel = MONTHS[currentMonth];

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={() => setCurrentMonth(Math.max(0, currentMonth - 1))}>
          <Feather name="chevron-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.monthCenter} onPress={() => onMonthPress(year, currentMonth)} activeOpacity={0.7}>
          <Text style={[styles.monthName, { color: colors.foreground }]}>{monthLabel}</Text>
          <Text style={[styles.monthSub, { color: colors.mutedForeground }]}>Monthly</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setCurrentMonth(Math.min(11, currentMonth + 1))}>
          <Feather name="chevron-right" size={22} color={colors.foreground} />
        </TouchableOpacity>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
      <View style={[styles.chartCard, { backgroundColor: colors.card }]}>
        {/* Toggle */}
        <View style={[styles.toggleRow, { backgroundColor: colors.muted }]}>
          {CHART_VIEWS.map((v) => (
            <TouchableOpacity
              key={v}
              style={[styles.toggleBtn, v === "Calendar" && { backgroundColor: colors.background }]}
              onPress={() => setChartView(v)}
            >
              <Text style={[styles.toggleText, { color: v === "Calendar" ? colors.foreground : colors.mutedForeground }]}>
                {v}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Day headers */}
        <View style={styles.calDayHeaders}>
          {DAY_HEADERS.map((d) => (
            <Text key={d} style={[styles.calDayHeader, { color: colors.mutedForeground }]}>{d}</Text>
          ))}
        </View>

        {/* Calendar rows */}
        {rows.map((row, ri) => (
          <View key={ri} style={styles.calRow}>
            {row.map((day, di) => {
              const isToday =
                day !== null &&
                day === todayDay &&
                currentMonth === todayMonth &&
                year === todayYear;
              const hasTx = day !== null && txDays.has(day);
              return (
                <TouchableOpacity key={di} style={styles.calCell} activeOpacity={0.7} onPress={() => { if (day !== null) onMonthPress(year, currentMonth); }}>
                  {day !== null ? (
                    <View
                      style={[
                        styles.calDayCircle,
                        isToday && { backgroundColor: "#1e90ff" },
                      ]}
                    >
                      <Text
                        style={[
                          styles.calDayText,
                          { color: isToday ? "#fff" : colors.foreground },
                        ]}
                      >
                        {day}
                      </Text>
                      {hasTx && !isToday && (
                        <View style={[styles.calDot, { backgroundColor: "#f59e0b" }]} />
                      )}
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
            {/* fill remaining cells in last row */}
            {row.length < 7 && Array.from({ length: 7 - row.length }).map((_, i) => (
              <View key={`empty-${i}`} style={styles.calCell} />
            ))}
          </View>
        ))}
      </View>

      <ProjectedSection
        colors={colors}
        monthLabel={monthLabel}
        income={income}
        expense={expense}
        prevExpense={prevData.expense}
        onPress={() => onMonthPress(year, currentMonth)}
      />
      </ScrollView>
    </View>
  );
}

function MonthlyView({
  colors,
  transactions,
  setChartView,
  onMonthPress,
}: {
  colors: any;
  transactions: Transaction[];
  setChartView: (v: ChartView) => void;
  onMonthPress: (year: number, month: number) => void;
}) {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonthIdx = today.getMonth();

  const monthList = useMemo(() => {
    const list: { year: number; month: number; label: string }[] = [];
    for (let i = 0; i < 18; i++) {
      let m = currentMonthIdx - i;
      let y = currentYear;
      if (m < 0) { m += 12; y -= 1; }
      const isCurrentYear = y === currentYear;
      const label = isCurrentYear ? FULL_MONTHS[m] : `${FULL_MONTHS[m]} ${y}`;
      list.push({ year: y, month: m, label });
    }
    return list;
  }, [currentYear, currentMonthIdx]);

  const { bills = [] } = useApp();

  const monthDataList = useMemo(() => {
    return monthList.map(({ year, month, label }, idx) => {
      const cur = getMonthDataForYearMonth(transactions, year, month, bills);
      const prevIdx = idx + 1 < monthList.length ? idx + 1 : null;
      const prev = prevIdx !== null
        ? getMonthDataForYearMonth(transactions, monthList[prevIdx].year, monthList[prevIdx].month, bills)
        : { income: 0, expense: 0 };
      const netIncome = cur.income - cur.expense;
      const incomeChangePct = prev.income > 0
        ? ((cur.income - prev.income) / prev.income) * 100
        : cur.income > 0 ? 100 : 0;
      const balancePct = prev.expense > 0
        ? Math.abs(((cur.expense - prev.expense) / prev.expense) * 100)
        : cur.expense > 0 ? 100 : 0;
      const incomeUp = cur.income >= prev.income;
      const balanceUp = cur.expense >= prev.expense;
      const expensePct = cur.income > 0
        ? Math.min((cur.expense / cur.income) * 100, 100)
        : cur.expense > 0 ? 100 : 0;
      return { label, ...cur, netIncome, incomeChangePct, balancePct, incomeUp, balanceUp, expensePct };
    });
  }, [transactions, monthList, bills]);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 120, gap: 10, paddingTop: 10 }}>
      {/* Toggle */}
      <View style={[styles.toggleRow, { backgroundColor: colors.muted, alignSelf: "center" }]}>
        {CHART_VIEWS.map((v) => (
          <TouchableOpacity
            key={v}
            style={[styles.toggleBtn, v === "Monthly" && { backgroundColor: colors.background }]}
            onPress={() => setChartView(v)}
          >
            <Text style={[styles.toggleText, { color: v === "Monthly" ? colors.foreground : colors.mutedForeground }]}>
              {v}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {monthDataList.map((m, idx) => (
        <TouchableOpacity key={idx} onPress={() => onMonthPress(monthList[idx].year, monthList[idx].month)} activeOpacity={0.82} style={[styles.monthlyCard, { backgroundColor: colors.card }]}>
          {/* Top row: month name | pct | income */}
          <View style={styles.monthlyTopRow}>
            <Text style={[styles.monthlyLabel, { color: colors.foreground }]}>{m.label}</Text>
            <View style={styles.monthlyRight}>
              <View style={styles.monthlyPctBadge}>
                <Feather
                  name={m.incomeUp ? "arrow-up" : "arrow-down"}
                  size={10}
                  color={m.incomeUp ? "#4caf50" : "#f97316"}
                />
                <Text style={[styles.monthlyPct, { color: m.incomeUp ? "#4caf50" : "#f97316" }]}>
                  {m.incomeChangePct.toFixed(1)}%
                </Text>
              </View>
              <Text style={[styles.monthlyIncome, { color: "#4caf50" }]}>
                {`$${m.income.toFixed(0)}`}
              </Text>
            </View>
          </View>

          {/* Progress bar */}
          <View style={[styles.monthlyProgressTrack, { backgroundColor: "#f9731630" }]}>
            <View
              style={[
                styles.monthlyProgressFill,
                { width: `${m.expensePct}%` as any },
              ]}
            />
          </View>

          {/* Balance row */}
          <View style={styles.monthlyBalanceRow}>
            <View style={styles.monthlyBalanceLeft}>
              <Text style={[styles.monthlyBalanceLabel, { color: colors.mutedForeground }]}>Balance</Text>
              <Text style={[styles.monthlyBalanceAmt, { color: m.netIncome >= 0 ? "#4caf50" : "#ef4444" }]}>
                {m.netIncome >= 0 ? `$${m.netIncome.toFixed(0)}` : `-$${Math.abs(m.netIncome).toFixed(0)}`}
              </Text>
            </View>
            <View style={styles.monthlyBalanceRight}>
              <View style={styles.monthlyPctBadge}>
                <Feather
                  name={m.balanceUp ? "arrow-up" : "arrow-down"}
                  size={10}
                  color={m.balanceUp ? "#f97316" : "#4caf50"}
                />
                <Text style={[styles.monthlyPct, { color: m.balanceUp ? "#f97316" : "#4caf50" }]}>
                  {m.balancePct.toFixed(1)}%
                </Text>
              </View>
              <Text style={[styles.monthlyBalanceFinal, { color: colors.foreground }]}>
                {`$${m.expense.toFixed(0)}`}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function CashFlowTab({
  transactions,
  colors,
  currentMonth,
  setCurrentMonth,
  chartView,
  setChartView,
  onMonthPress,
}: {
  transactions: Transaction[];
  colors: any;
  currentMonth: number;
  setCurrentMonth: (m: number) => void;
  chartView: ChartView;
  setChartView: (v: ChartView) => void;
  onMonthPress: (year: number, month: number) => void;
}) {
  const { bills = [] } = useApp();
  const year = new Date().getFullYear();

  const monthData = useMemo(() => getMonthData(transactions, year, bills), [transactions, year, bills]);

  const maxVal = useMemo(() => {
    return Math.max(...monthData.map((m) => Math.max(m.income, m.expense)), 1);
  }, [monthData]);

  const BAR_HEIGHT = 120;
  const visibleMonths = monthData.slice(0, 7);

  const thisMonthData = monthData[currentMonth];
  const prevMonthData = currentMonth > 0 ? monthData[currentMonth - 1] : { income: 0, expense: 0 };

  const monthName = MONTHS[currentMonth];

  const Toggle = () => (
    <View style={[styles.toggleRow, { backgroundColor: colors.muted }]}>
      {CHART_VIEWS.map((v) => (
        <TouchableOpacity
          key={v}
          style={[styles.toggleBtn, chartView === v && { backgroundColor: colors.background }]}
          onPress={() => setChartView(v)}
        >
          <Text style={[styles.toggleText, { color: chartView === v ? colors.foreground : colors.mutedForeground }]}>
            {v}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  if (chartView === "Calendar") {
    return (
      <View style={{ flex: 1 }}>
        <CalendarView
          colors={colors}
          currentMonth={currentMonth}
          setCurrentMonth={setCurrentMonth}
          transactions={transactions}
          setChartView={setChartView}
          onMonthPress={onMonthPress}
        />
      </View>
    );
  }

  if (chartView === "Monthly") {
    return (
      <View style={{ flex: 1 }}>
        <MonthlyView colors={colors} transactions={transactions} setChartView={setChartView} onMonthPress={onMonthPress} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Month navigation */}
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={() => setCurrentMonth(Math.max(0, currentMonth - 1))}>
          <Feather name="chevron-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.monthCenter} onPress={() => onMonthPress(year, currentMonth)} activeOpacity={0.7}>
          <Text style={[styles.monthName, { color: colors.foreground }]}>{monthName}</Text>
          <Text style={[styles.monthSub, { color: colors.mutedForeground }]}>Monthly</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setCurrentMonth(Math.min(11, currentMonth + 1))}>
          <Feather name="chevron-right" size={22} color={colors.foreground} />
        </TouchableOpacity>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
      {/* Chart card */}
      <View style={[styles.chartCard, { backgroundColor: colors.card }]}>
        <Toggle />

        {/* Expand icon */}
        <View style={styles.expandRow}>
          <Feather name="maximize-2" size={14} color={colors.mutedForeground} />
        </View>

        {/* Bar chart */}
        <View style={styles.barChart}>
          {visibleMonths.map((m, idx) => {
            const isCurrent = idx === currentMonth;
            const incomeH = maxVal > 0 ? (m.income / maxVal) * BAR_HEIGHT : 0;
            const expenseH = maxVal > 0 ? (m.expense / maxVal) * BAR_HEIGHT : 0;

            return (
              <TouchableOpacity key={m.label} style={styles.barColumn} activeOpacity={0.7} onPress={() => onMonthPress(year, idx)}>
                <Text style={[styles.barValue, { color: colors.mutedForeground }]}>
                  {m.income > 0 ? Math.round(m.income) : "0"}
                </Text>

                <View
                  style={[
                    styles.barWrapper,
                    {
                      height: BAR_HEIGHT,
                      backgroundColor: isCurrent ? "rgba(176, 184, 200, 0.25)" : "transparent",
                      borderRadius: 6,
                    },
                  ]}
                >
                  <View style={{ flex: 1, justifyContent: "flex-end" }}>
                    {m.income > 0 && (
                      <View style={[styles.incomeBar, { height: incomeH, backgroundColor: "#4caf50" }]} />
                    )}
                  </View>
                  <View style={{ flex: 1, justifyContent: "flex-start" }}>
                    {m.expense > 0 && (
                      <View style={[styles.expenseBar, { height: expenseH, backgroundColor: "#f97316" }]} />
                    )}
                  </View>
                </View>

                <Text style={[styles.barValue, { color: colors.mutedForeground }]}>
                  {m.expense > 0 ? `${Math.round(m.expense)}` : "0"}
                </Text>

                <Text style={[styles.barLabel, { color: colors.mutedForeground }]}>{m.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <ProjectedSection
        colors={colors}
        monthLabel={monthName}
        income={thisMonthData.income}
        expense={thisMonthData.expense}
        prevExpense={prevMonthData.expense}
        onPress={() => onMonthPress(year, currentMonth)}
      />
      </ScrollView>
    </View>
  );
}

const CATEGORY_COLORS: Record<string, string> = {
  Food: "#f97316",
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

function DonutRing({ segments, size = 110, stroke = 18 }: {
  segments: { color: string; pct: number }[];
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const gap = 2;
  return (
    <View style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @typescript-eslint/no-var-requires */}
      {(() => {
        try {
          const Svg = require("react-native-svg").Svg;
          const Circle = require("react-native-svg").Circle;
          return (
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
              <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb22" strokeWidth={stroke} />
              {segments.map((seg, i) => {
                const dash = Math.max((seg.pct / 100) * circ - gap, 0);
                const el = (
                  <Circle
                    key={i}
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth={stroke}
                    strokeDasharray={`${dash} ${circ}`}
                    strokeDashoffset={-offset}
                    strokeLinecap="round"
                    rotation={-90}
                    origin={`${size / 2}, ${size / 2}`}
                  />
                );
                offset += (seg.pct / 100) * circ;
                return el;
              })}
            </Svg>
          );
        } catch {
          return null;
        }
      })()}
    </View>
  );
}

const CATEGORY_ICONS: Record<string, string> = {
  Food: "coffee",
  Shopping: "shopping-bag",
  Groceries: "shopping-cart",
  Entertainment: "film",
  Transport: "navigation",
  Housing: "home",
  Utilities: "zap",
  Health: "heart",
  Insurance: "shield",
  Education: "book-open",
  Income: "trending-up",
  Bills: "file-text",
  Other: "more-horizontal",
};

const SPEND_VIEWS = ["Category", "Merchant", "Income"] as const;
type SpendView = (typeof SPEND_VIEWS)[number];

function SpendingTab({
  transactions,
  bills,
  colors,
  currentMonth,
  setCurrentMonth,
}: {
  transactions: Transaction[];
  bills: Bill[];
  colors: any;
  currentMonth: number;
  setCurrentMonth: (m: number) => void;
}) {
  const { categories, accounts } = useApp();
  const year = new Date().getFullYear();
  // Build month prefix directly — toISOString() shifts the date in UTC-offset zones
  const monthStr = `${year}-${String(currentMonth + 1).padStart(2, "0")}`;
  const [spendView, setSpendView] = useState<SpendView>("Category");
  const [includeBills, setIncludeBills] = useState(false);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  // activeSub filters the transaction list inside the category sheet; null = show all
  const [activeSub, setActiveSub] = useState<string | null>(null);
  const [selectedSubCat, setSelectedSubCat] = useState<string | null>(null);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  const expenseTxs = useMemo(() =>
    transactions.filter((t) => t.type === "expense" && t.category !== "Transfer" && t.category?.toLowerCase() !== "transfer" && localYM(t.date) === monthStr),
    [transactions, monthStr]
  );

  const billsTotal = useMemo(() => {
    if (!includeBills) return 0;
    return bills
      .filter((b) => {
        const d = parseLocalDate(b.dueDate);
        return d.getFullYear() === year && d.getMonth() === currentMonth;
      })
      .reduce((s, b) => s + b.amount, 0);
  }, [bills, includeBills, year, currentMonth]);

  // Helper: find category definition by name
  const catByName = useCallback((name: string): Category | undefined => {
    return categories.find((c) => c.name === name);
  }, [categories]);

  // Helper: resolve transaction category to a main category name.
  // Case-insensitive so Plaid/email sources (e.g. "food & grocery") match user-defined
  // categories (e.g. "Food & Grocery") regardless of casing.
  const resolveMainCategory = useCallback((txCat: string | undefined | null): string => {
    if (!txCat) return "Other";
    const lower = txCat.toLowerCase();
    // "Parent - Sub" format
    if (txCat.includes(" - ")) {
      return txCat.split(" - ")[0].trim();
    }
    // Exact match on a top-level category (case-insensitive)
    const topLevel = categories.find((c) => c.name.toLowerCase() === lower && !c.parentId);
    if (topLevel) return topLevel.name;
    // Subcategory — return its parent name
    const sub = categories.find((c) => c.name.toLowerCase() === lower && c.parentId);
    if (sub) {
      const parent = categories.find((c) => c.id === sub.parentId);
      if (parent) return parent.name;
    }
    return txCat; // unknown category — use as-is
  }, [categories]);

  // Helper: resolve transaction category to the subcategory label (or null if top-level).
  // Returns the canonical name from the categories list when available.
  const resolveSubCategory = useCallback((txCat: string | undefined | null): string | null => {
    if (!txCat) return null;
    if (txCat.includes(" - ")) {
      return txCat.split(" - ")[1].trim();
    }
    const lower = txCat.toLowerCase();
    const sub = categories.find((c) => c.name.toLowerCase() === lower && c.parentId);
    if (sub) return sub.name;
    return null;
  }, [categories]);

  // Main category breakdown (group by resolved main category)
  const categoryItems = useMemo(() => {
    const totals: Record<string, number> = {};
    expenseTxs.forEach((t) => {
      const main = resolveMainCategory(t.category);
      totals[main] = (totals[main] || 0) + t.amount;
    });
    if (includeBills && billsTotal > 0) {
      totals["Bills"] = (totals["Bills"] || 0) + billsTotal;
    }
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }, [expenseTxs, includeBills, billsTotal, resolveMainCategory]);

  const merchantItems = useMemo(() => {
    const totals: Record<string, number> = {};
    expenseTxs.forEach((t) => {
      const key = t.title || t.category;
      totals[key] = (totals[key] || 0) + t.amount;
    });
    return Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [expenseTxs]);

  const incomeItems = useMemo(() => {
    const totals: Record<string, number> = {};
    transactions
      .filter((t) => t.type === "income" && t.category !== "Transfer" && t.category?.toLowerCase() !== "transfer" && localYM(t.date) === monthStr)
      .forEach((t) => {
        const main = resolveMainCategory(t.category);
        totals[main] = (totals[main] || 0) + t.amount;
      });
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }, [transactions, monthStr, resolveMainCategory]);

  const activeItems =
    spendView === "Category" ? categoryItems :
    spendView === "Merchant" ? merchantItems :
    incomeItems;

  const total = activeItems.reduce((s, [, v]) => s + v, 0);

  // All transactions for the selected parent category this month.
  // This is the authoritative set — all drill-down views derive from it.
  const categoryTxs = useMemo(() => {
    if (!selectedCat) return [];
    const txType = spendView === "Income" ? "income" : "expense";
    return transactions.filter((t) => {
      if (t.type !== txType || t.category === "Transfer" || t.category?.toLowerCase() === "transfer" || localYM(t.date) !== monthStr) return false;
      return resolveMainCategory(t.category) === selectedCat;
    });
  }, [selectedCat, transactions, monthStr, spendView, resolveMainCategory]);

  // Subcategory breakdown of categoryTxs (for the donut + filter chips).
  const subcategoryItems = useMemo(() => {
    const totals: Record<string, number> = {};
    categoryTxs.forEach((t) => {
      const sub = resolveSubCategory(t.category) || resolveMainCategory(t.category);
      totals[sub] = (totals[sub] || 0) + t.amount;
    });
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }, [categoryTxs, resolveSubCategory, resolveMainCategory]);

  const subcatTotal = categoryTxs.reduce((s, t) => s + t.amount, 0);

  // Transactions shown in the drill-down sheet: all category txs unless a
  // subcategory chip is active, in which case filter to that sub only.
  const sheetTransactions = useMemo(() => {
    if (!activeSub) return categoryTxs;
    return categoryTxs.filter((t) => {
      const sub = resolveSubCategory(t.category) || resolveMainCategory(t.category);
      return sub === activeSub;
    });
  }, [categoryTxs, activeSub, resolveSubCategory, resolveMainCategory]);

  // All transactions for the selected subcategory this month
  const subcatTxs = useMemo(() => {
    if (!selectedSubCat || !selectedCat) return [];
    const txType = spendView === "Income" ? "income" : "expense";
    return transactions.filter((t) => {
      if (t.type !== txType || t.category === "Transfer" || t.category?.toLowerCase() === "transfer" || localYM(t.date) !== monthStr) return false;
      const main = resolveMainCategory(t.category);
      const sub = resolveSubCategory(t.category) || main;
      return main === selectedCat && sub === selectedSubCat;
    });
  }, [selectedSubCat, selectedCat, transactions, monthStr, spendView, resolveMainCategory, resolveSubCategory]);

  const getCatVisual = (name: string) => {
    const cat = catByName(name);
    return {
      color: cat?.color || CATEGORY_COLORS[name] || colors.primary,
      icon: (cat?.icon || CATEGORY_ICONS[name] || "circle") as any,
    };
  };

  const donutSegments = activeItems.map(([key, amt]) => ({
    color: getCatVisual(key).color,
    pct: total > 0 ? (amt / total) * 100 : 0,
  }));

  const subcatDonutSegments = subcategoryItems.map(([key, amt]) => {
    const parentCat = catByName(selectedCat || "");
    const subCat = categories.find((c) => c.name === key && c.parentId);
    const segColor = subCat?.color || parentCat?.color || colors.primary;
    return {
      color: segColor,
      pct: subcatTotal > 0 ? (amt / subcatTotal) * 100 : 0,
    };
  });

  const DONUT_SIZE = 200;
  const DONUT_STROKE = 36;
  const MODAL_DONUT_SIZE = 160;
  const MODAL_DONUT_STROKE = 28;

  const handleCatPress = (key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedCat(key);
    setActiveSub(null);
  };

  const handleSubChipPress = (key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveSub((prev) => (prev === key ? null : key));
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Month navigation */}
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={() => setCurrentMonth(Math.max(0, currentMonth - 1))}>
          <Feather name="chevron-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.monthCenter}>
          <Text style={[styles.monthName, { color: colors.foreground }]}>{FULL_MONTHS[currentMonth]}</Text>
          <Text style={[styles.monthSub, { color: colors.mutedForeground }]}>Monthly</Text>
        </View>
        <TouchableOpacity onPress={() => setCurrentMonth(Math.min(11, currentMonth + 1))}>
          <Feather name="chevron-right" size={22} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120, gap: 14 }}>
        {/* View pills: Category / Merchant / Income */}
        <View style={[styles.spendPillRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {SPEND_VIEWS.map((v) => (
            <TouchableOpacity
              key={v}
              style={[styles.spendPill, spendView === v && { backgroundColor: colors.background, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 }]}
              onPress={() => setSpendView(v)}
            >
              <Text style={[styles.spendPillText, { color: spendView === v ? colors.foreground : colors.mutedForeground, fontFamily: spendView === v ? "Inter_600SemiBold" : "Inter_400Regular" }]}>
                {v}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Donut chart card */}
        <View style={[styles.spendDonutCard, { backgroundColor: colors.card }]}>
          {total === 0 ? (
            <View style={styles.spendEmpty}>
              <Feather name="pie-chart" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {spendView === "Income" ? "No income this month" : "No spending this month"}
              </Text>
            </View>
          ) : (
            <View style={styles.donutCenterWrap}>
              <DonutRing segments={donutSegments} size={DONUT_SIZE} stroke={DONUT_STROKE} />
              <View style={styles.donutCenterAbs}>
                <Text style={[styles.donutCenterLabel, { color: colors.mutedForeground }]}>Total</Text>
                <Text style={[styles.donutCenterAmount, { color: colors.foreground }]}>
                  ${total >= 1000 ? `${(total / 1000).toFixed(1)}k` : total.toFixed(2)}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Include Bills toggle (only in Category view) */}
        {spendView === "Category" && (
          <View style={[styles.includeBillsRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.includeBillsIcon, { backgroundColor: colors.muted }]}>
              <Feather name="info" size={14} color={colors.mutedForeground} />
            </View>
            <Text style={[styles.includeBillsText, { color: colors.foreground }]}>Include Bills</Text>
            <Switch
              value={includeBills}
              onValueChange={setIncludeBills}
              trackColor={{ false: colors.muted, true: colors.primary + "80" }}
              thumbColor={includeBills ? colors.primary : colors.mutedForeground}
            />
          </View>
        )}

        {/* Category / Merchant / Income rows — tappable for drill-in */}
        {activeItems.map(([key, amt]) => {
          const pct = total > 0 ? (amt / total) * 100 : 0;
          const vis = getCatVisual(key);
          return (
            <TouchableOpacity
              key={key}
              style={styles.spendItemRow}
              activeOpacity={0.7}
              onPress={() => (spendView === "Category" || spendView === "Income") ? handleCatPress(key) : undefined}
            >
              <View style={[styles.spendItemIcon, { backgroundColor: vis.color + "20" }]}>
                <Feather name={vis.icon} size={18} color={vis.color} />
              </View>
              <View style={styles.spendItemInfo}>
                <Text style={[styles.spendItemName, { color: colors.foreground }]}>{key}</Text>
                <Text style={[styles.spendItemPct, { color: colors.mutedForeground }]}>{pct.toFixed(1)} %</Text>
              </View>
              <View style={styles.spendItemRight}>
                <Text style={[styles.spendItemAmt, { color: colors.foreground }]}>
                  ${amt.toFixed(2)}
                </Text>
                <View style={[styles.spendItemBar, { backgroundColor: vis.color }]} />
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Category Detail Sheet (subcategory donut + subcategories list) ── */}
      <Modal
        visible={!!selectedCat}
        transparent
        animationType="slide"
        onRequestClose={() => { setSelectedCat(null); setActiveSub(null); }}
      >
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => { setSelectedCat(null); setActiveSub(null); }}
        />
        <View style={[styles.sheetContainer, { backgroundColor: colors.background }]}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <TouchableOpacity
              hitSlop={12}
              onPress={() => { setSelectedCat(null); setActiveSub(null); }}
            >
              <Feather name="arrow-left" size={20} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>{selectedCat}</Text>
            <TouchableOpacity onPress={() => { setSelectedCat(null); setActiveSub(null); }} hitSlop={12}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Donut — only if there are multiple subcategories */}
            {subcatTotal > 0 && (
              <View style={[styles.spendDonutCard, { backgroundColor: colors.card, marginHorizontal: 16, marginTop: 12 }]}>
                <View style={styles.donutCenterWrap}>
                  <DonutRing segments={subcatDonutSegments} size={MODAL_DONUT_SIZE} stroke={MODAL_DONUT_STROKE} />
                  <View style={styles.donutCenterAbs}>
                    <Text style={[styles.donutCenterLabel, { color: colors.mutedForeground }]}>Total</Text>
                    <Text style={[styles.donutCenterAmount, { color: colors.foreground }]}>
                      ${subcatTotal >= 1000 ? `${(subcatTotal / 1000).toFixed(1)}k` : subcatTotal.toFixed(2)}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* List of subcategories inside selectedCat */}
            <View style={{ gap: 12, marginTop: 14, paddingHorizontal: 16 }}>
              {subcategoryItems.map(([key, amt]) => {
                const pct = subcatTotal > 0 ? (amt / subcatTotal) * 100 : 0;
                const parentCat = catByName(selectedCat || "");
                const subCat = categories.find((c) => c.name === key && c.parentId);
                const col = subCat?.color || parentCat?.color || colors.primary;
                const visIcon = (subCat?.icon || parentCat?.icon || "circle") as any;

                return (
                  <TouchableOpacity
                    key={key}
                    style={styles.spendItemRow}
                    activeOpacity={0.7}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedSubCat(key); // Open Modal 2!
                    }}
                  >
                    <View style={[styles.spendItemIcon, { backgroundColor: col + "20" }]}>
                      <Feather name={visIcon} size={18} color={col} />
                    </View>
                    <View style={styles.spendItemInfo}>
                      <Text style={[styles.spendItemName, { color: colors.foreground }]}>{key}</Text>
                      <Text style={[styles.spendItemPct, { color: colors.mutedForeground }]}>{pct.toFixed(1)} %</Text>
                    </View>
                    <View style={styles.spendItemRight}>
                      <Text style={[styles.spendItemAmt, { color: colors.foreground }]}>
                        ${amt.toFixed(2)}
                      </Text>
                      <View style={[styles.spendItemBar, { backgroundColor: col }]} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Subcategory Detail Sheet (lists all transactions for the selected subcategory) ── */}
      <Modal
        visible={!!selectedSubCat}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedSubCat(null)}
      >
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setSelectedSubCat(null)}
        />
        <View style={[styles.sheetContainer, { backgroundColor: colors.background }]}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <TouchableOpacity
              hitSlop={12}
              onPress={() => setSelectedSubCat(null)}
            >
              <Feather name="arrow-left" size={20} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>{selectedSubCat}</Text>
            <TouchableOpacity onPress={() => setSelectedSubCat(null)} hitSlop={12}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Transaction list — only transactions for this subcategory */}
            <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
              <Text style={[styles.sheetSectionLabel, { color: colors.mutedForeground }]}>
                {subcatTxs.length} transaction{subcatTxs.length !== 1 ? "s" : ""}
              </Text>
            </View>
            {subcatTxs.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.mutedForeground, textAlign: "center", paddingVertical: 24 }]}>
                No transactions
              </Text>
            ) : (
              subcatTxs
                .slice()
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((t) => {
                  const acc = accounts.find((acc) => acc.id === t.accountId);
                  const dt = parseLocalDate(t.date);
                  const dateStr = dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                  const subLabel = resolveSubCategory(t.category);
                  const vis = getCatVisual(subLabel || selectedCat || t.category);
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.txnRow, { borderBottomColor: colors.border }]}
                      activeOpacity={0.7}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedTx(t);
                      }}
                    >
                      <View style={[styles.spendItemIcon, { backgroundColor: vis.color + "20" }]}>
                        <Feather name={vis.icon} size={18} color={vis.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.spendItemName, { color: colors.foreground }]}>{t.title}</Text>
                        <Text style={[styles.spendItemPct, { color: colors.mutedForeground }]}>{dateStr}</Text>
                        {acc && (
                          <Text style={[styles.spendItemPct, { color: colors.mutedForeground }]}>
                            {acc.bank ? `${acc.bank} · ` : ""}{acc.name}
                            {t.source === "plaid" ? " · Plaid" : t.source === "email" ? " · Email" : ""}
                          </Text>
                        )}
                      </View>
                      <Text style={[styles.spendItemAmt, { color: colors.foreground }]}>
                        ${t.amount.toFixed(2)}
                      </Text>
                    </TouchableOpacity>
                  );
                })
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* ── Transaction Detail / Edit Modal ─────────────────────────── */}
      <TransactionDetailModal
        visible={!!selectedTx}
        onClose={() => setSelectedTx(null)}
        transaction={selectedTx}
      />
    </View>
  );
}

function TrendsTab({ transactions, colors }: { transactions: Transaction[]; colors: any }) {
  const year = new Date().getFullYear();
  const monthData = useMemo(() => getMonthData(transactions, year), [transactions, year]);

  const maxVal = useMemo(
    () => Math.max(...monthData.map((m) => Math.max(m.income, m.expense)), 1),
    [monthData]
  );

  const totalIncome = monthData.reduce((s, m) => s + m.income, 0);
  const totalExpense = monthData.reduce((s, m) => s + m.expense, 0);
  const netSavings = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0;

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 14 }}>
      {/* Summary cards */}
      <View style={styles.trendSummaryRow}>
        <View style={[styles.trendSummaryCard, { backgroundColor: "#10b98115" }]}>
          <Text style={[styles.trendSummaryLabel, { color: "#10b981" }]}>Income</Text>
          <Text style={[styles.trendSummaryAmt, { color: "#10b981" }]}>${totalIncome >= 1000 ? `${(totalIncome / 1000).toFixed(1)}k` : totalIncome.toFixed(0)}</Text>
        </View>
        <View style={[styles.trendSummaryCard, { backgroundColor: "#f9731615" }]}>
          <Text style={[styles.trendSummaryLabel, { color: "#f97316" }]}>Expense</Text>
          <Text style={[styles.trendSummaryAmt, { color: "#f97316" }]}>${totalExpense >= 1000 ? `${(totalExpense / 1000).toFixed(1)}k` : totalExpense.toFixed(0)}</Text>
        </View>
        <View style={[styles.trendSummaryCard, { backgroundColor: colors.muted }]}>
          <Text style={[styles.trendSummaryLabel, { color: colors.mutedForeground }]}>Saved</Text>
          <Text style={[styles.trendSummaryAmt, { color: netSavings >= 0 ? "#10b981" : "#f97316" }]}>
            {savingsRate.toFixed(0)}%
          </Text>
        </View>
      </View>

      {/* Monthly breakdown */}
      <View style={[styles.trendCard, { backgroundColor: colors.card }]}>
        <Text style={[styles.spendCardTitle, { color: colors.foreground }]}>Monthly Income vs Expense</Text>
        {/* Legend */}
        <View style={styles.trendLegend}>
          <View style={styles.trendLegendItem}>
            <View style={[styles.trendLegendDot, { backgroundColor: "#10b981" }]} />
            <Text style={[styles.trendLegendText, { color: colors.mutedForeground }]}>Income</Text>
          </View>
          <View style={styles.trendLegendItem}>
            <View style={[styles.trendLegendDot, { backgroundColor: "#f97316" }]} />
            <Text style={[styles.trendLegendText, { color: colors.mutedForeground }]}>Expense</Text>
          </View>
        </View>
        {monthData.map((m) => {
          const net = m.income - m.expense;
          const isPositive = net >= 0;
          const incomeW = maxVal > 0 ? (m.income / maxVal) * 100 : 0;
          const expenseW = maxVal > 0 ? (m.expense / maxVal) * 100 : 0;
          return (
            <View key={m.label} style={styles.trendRow}>
              <Text style={[styles.trendMonth, { color: colors.mutedForeground }]}>{m.label}</Text>
              <View style={styles.trendBars}>
                <View style={[styles.trendBarTrack, { backgroundColor: "#10b98118" }]}>
                  <View style={[styles.trendBarFill, { backgroundColor: "#10b981", width: `${incomeW}%` as any }]} />
                </View>
                <View style={[styles.trendBarTrack, { backgroundColor: "#f9731618" }]}>
                  <View style={[styles.trendBarFill, { backgroundColor: "#f97316", width: `${expenseW}%` as any }]} />
                </View>
              </View>
              <Text style={[styles.trendNet, { color: isPositive ? "#10b981" : "#f97316" }]}>
                {isPositive ? "+" : "-"}${Math.abs(net).toFixed(0)}
              </Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const TX_FILTERS = ["All", "Expenses", "Income", "Transfer"] as const;
type TxFilter = (typeof TX_FILTERS)[number];

function TransactionsTab({ transactions, colors, showFilter, setShowFilter, filterSettings, setFilterSettings }: { transactions: Transaction[]; colors: any; showFilter: boolean; setShowFilter: (v: boolean) => void; filterSettings: TxFilterSettings; setFilterSettings: (s: TxFilterSettings) => void }) {
  const [filter, setFilter] = useState<TxFilter>("All");
  const [showAdd, setShowAdd] = useState(false);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  // transactions prop is already deduplicated + reviewed-only (from InsightsScreen visibleTxs)
  const filtered = useMemo(() => {
    let result = transactions;
    // Type filter (chip bar + filterSettings.type both apply)
    const typeFilter = filterSettings.type !== "All" ? filterSettings.type : filter;
    if (typeFilter === "Expenses") result = result.filter((t) => t.type === "expense" && t.category !== "Transfer" && t.category?.toLowerCase() !== "transfer");
    else if (typeFilter === "Income") result = result.filter((t) => t.type === "income" && t.category !== "Transfer" && t.category?.toLowerCase() !== "transfer");
    else if (typeFilter === "Transfer") result = result.filter((t) => t.category === "Transfer" || t.category?.toLowerCase() === "transfer");
    // Categories
    if (filterSettings.categories.length > 0)
      result = result.filter((t) => filterSettings.categories.includes(t.category));
    // Accounts
    if (filterSettings.accountIds.length > 0)
      result = result.filter((t) => filterSettings.accountIds.includes(t.accountId));
    // Date range
    if (filterSettings.dateFrom)
      result = result.filter((t) => t.date >= filterSettings.dateFrom);
    if (filterSettings.dateTo)
      result = result.filter((t) => t.date <= filterSettings.dateTo + "T23:59:59");
    // Amount range
    if (filterSettings.amountMin !== "")
      result = result.filter((t) => t.amount >= parseFloat(filterSettings.amountMin));
    if (filterSettings.amountMax !== "")
      result = result.filter((t) => t.amount <= parseFloat(filterSettings.amountMax));
    // Merchant
    if (filterSettings.merchant && filterSettings.merchant.trim())
      result = result.filter((t) => (t.merchant ?? "").toLowerCase().includes(filterSettings.merchant.toLowerCase()));
    // Title
    if (filterSettings.title && filterSettings.title.trim())
      result = result.filter((t) => (t.title ?? "").toLowerCase().includes(filterSettings.title.toLowerCase()));
    // Notes
    if (filterSettings.notes.trim())
      result = result.filter((t) => (t.note ?? "").toLowerCase().includes(filterSettings.notes.toLowerCase()));
    return result;
  }, [transactions, filter, filterSettings]);

  const grouped = useMemo(() => {
    const groups: { dateKey: string; dateLabel: string; total: number; hasExpense: boolean; items: Transaction[] }[] = [];
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const currentYear = today.getFullYear();

    filtered.forEach((t) => {
      const d = parseLocalDate(t.date);
      const dateKey = d.toDateString();
      const isToday = dateKey === today.toDateString();
      const isYesterday = dateKey === yesterday.toDateString();
      const isCurrentYear = d.getFullYear() === currentYear;
      const dateLabel = isToday
        ? "Today"
        : isYesterday
        ? "Yesterday"
        : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", ...(isCurrentYear ? {} : { year: "numeric" }) });

      let group = groups.find((g) => g.dateKey === dateKey);
      if (!group) {
        group = { dateKey, dateLabel, total: 0, hasExpense: false, items: [] };
        groups.push(group);
      }
      group.items.push(t);
      if (t.type === "expense") {
        group.total += t.amount;
        group.hasExpense = true;
      }
    });
    return groups;
  }, [filtered]);

  type FlatItem =
    | { type: "header"; dateLabel: string; total: number; hasExpense: boolean }
    | { type: "item"; transaction: Transaction };

  const flatData: FlatItem[] = grouped.flatMap((g) => [
    { type: "header" as const, dateLabel: g.dateLabel, total: g.total, hasExpense: g.hasExpense },
    ...g.items.map((t) => ({ type: "item" as const, transaction: t })),
  ]);

  return (
    <View style={{ flex: 1 }}>
      {/* Filter pills */}
      <View style={styles.txFilterTopRow}>
        <View style={styles.txFilterRow}>
          {TX_FILTERS.map((f) => (
            <TouchableOpacity
              key={f}
              style={[
                styles.txFilterChip,
                filter === f
                  ? { backgroundColor: colors.primary, borderColor: colors.primary }
                  : { backgroundColor: colors.card, borderColor: colors.border },
              ]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.txFilterText, { color: filter === f ? "#fff" : colors.mutedForeground }]}>
                {f}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* View Recurring Transactions */}
      <TouchableOpacity style={[styles.recurringRow, { borderBottomColor: colors.border, borderTopColor: colors.border }]}>
        <Text style={[styles.recurringText, { color: colors.foreground }]}>View Recurring Transactions</Text>
        <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
      </TouchableOpacity>

      <FlatList
        data={flatData}
        keyExtractor={(item, i) =>
          item.type === "header"
            ? `h-${item.dateLabel}-${i}`
            : item.type === "item"
            ? `t-${item.transaction.id}`
            : `d-${i}`
        }
        renderItem={({ item }) => {
          if (item.type === "header") {
            return (
              <View style={[styles.txDateHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.txDateLabel, { color: colors.foreground }]}>{item.dateLabel}</Text>
                {item.hasExpense && item.total > 0 && (
                  <Text style={[styles.txDateTotal, { color: colors.foreground }]}>
                    - ${item.total.toFixed(2)}
                  </Text>
                )}
              </View>
            );
          }
          return (
            <View style={[styles.txItemWrap, { borderBottomColor: colors.border }]}>
              <TransactionItem
                transaction={item.transaction}
                onPress={() => setSelectedTx(item.transaction)}
              />
            </View>
          );
        }}
        contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 + 84 : 120 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={[styles.emptyBox, { backgroundColor: colors.card, margin: 16 }]}>
            <Feather name="inbox" size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No transactions found</Text>
          </View>
        }
      />

      <AddEntrySheet visible={showAdd} initialTab="EXPENSE" onClose={() => setShowAdd(false)} />
      <TransactionDetailModal
        visible={!!selectedTx}
        onClose={() => setSelectedTx(null)}
        transaction={selectedTx}
      />
      <TransactionFilterModal
        visible={showFilter}
        current={filterSettings}
        onApply={(s) => {
          setFilterSettings(s);
          setShowFilter(false);
        }}
        onClose={() => setShowFilter(false)}
      />
    </View>
  );
}

function ReviewTab({
  transactions,
  colors,
  onAllReviewed,
}: {
  transactions: Transaction[];
  colors: any;
  onAllReviewed: () => void;
}) {
  const { reviewedTransactionIds, markTransactionReviewed, updateTransaction, deleteTransaction } = useApp();
  const reviewTxs = useMemo(
    () => transactions.filter(
      (t) => (t.fromEmail || t.source === "email") && !reviewedTransactionIds.includes(t.id)
    ),
    [transactions, reviewedTransactionIds]
  );

  // "Add" — keep the existing transaction, just clear the email flags so it
  // appears as a normal confirmed transaction. No second copy is created.
  const handleAdd = (tx: Transaction) => {
    updateTransaction(tx.id, { fromEmail: false });
    markTransactionReviewed(tx.id);
  };

  // "Reject" — remove the transaction from the store entirely.
  const handleReject = (txId: string) => {
    deleteTransaction(txId);
    markTransactionReviewed(txId);
  };

  // Auto-switch away when all done
  React.useEffect(() => {
    if (reviewTxs.length === 0) onAllReviewed();
  }, [reviewTxs.length]);

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={reviewTxs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={[styles.emptyBox, { backgroundColor: colors.card, margin: 16 }]}>
            <Feather name="mail" size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No email transactions to review</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.reviewRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.reviewTitle, { color: colors.foreground }]} numberOfLines={1}>
                {item.merchant || item.title}
              </Text>
              <Text style={[styles.reviewSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                {item.bank || "Email"} · {item.category} · {parseLocalDate(item.date).toLocaleDateString()}
              </Text>
            </View>
            <Text style={[styles.reviewAmount, { color: item.type === "expense" ? colors.expense : colors.success }]}>
              ${item.amount.toFixed(2)}
            </Text>
            <TouchableOpacity style={[styles.reviewAddBtn, { backgroundColor: colors.primary }]} onPress={() => handleAdd(item)}>
              <Text style={styles.reviewAddText}>Add</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.reviewRejectBtn, { borderColor: colors.expense }]} onPress={() => handleReject(item.id)}>
              <Text style={[styles.reviewRejectText, { color: colors.expense }]}>Reject</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

// ── Investment type → icon/label ─────────────────────────────────────────────
function invTypeLabel(type: string, subtype?: string | null): string {
  const t = type.toLowerCase();
  const s = (subtype ?? "").toLowerCase();
  // Check subtype first — Plaid uses type="cash" for dividends, interest, etc.
  if (s === "dividend" || s === "qualified_dividend" || s === "non_qualified_dividend") return "Dividend";
  if (s === "interest" || s === "interest_receivable" || s === "interest_paid") return "Interest";
  if (s === "contribution") return "Contribution";
  if (s === "withdrawal") return "Withdrawal";
  if (t === "buy") return "Buy";
  if (t === "sell") return "Sell";
  if (t === "cash") return "Cash";
  if (t === "fee") return "Fee";
  if (t === "transfer") return "Transfer";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function invTypeColor(type: string, colors: any, subtype?: string | null): string {
  const t = type.toLowerCase();
  const s = (subtype ?? "").toLowerCase();
  if (t === "buy") return "#3b82f6";
  if (t === "sell") return "#ef4444";
  if (s === "dividend" || s === "qualified_dividend" || s === "non_qualified_dividend") return "#22c55e";
  if (s === "interest" || s === "interest_receivable") return "#22c55e";
  if (s === "withdrawal") return "#f97316";
  if (t === "fee") return "#f97316";
  if (t === "cash") return "#22c55e";
  if (t === "transfer") return "#a855f7";
  return colors.mutedForeground;
}

const PERIOD_OPTIONS = ["All", "Month", "3 Months", "Year"] as const;
type PeriodOpt = typeof PERIOD_OPTIONS[number];
const TYPE_OPTIONS = ["All", "Buy", "Sell", "Dividend", "Interest", "Cash", "Fee", "Transfer", "Contribution", "Withdrawal"];

function matchesTypeFilter(t: InvestmentTransaction, f: string): boolean {
  if (f === "All") return true;
  return invTypeLabel(t.type, t.subtype) === f;
}

function periodStart(p: PeriodOpt): string | null {
  const now = new Date();
  if (p === "Month") return toLocalYMD(new Date(now.getFullYear(), now.getMonth(), 1));
  if (p === "3 Months") { now.setMonth(now.getMonth() - 3); return toLocalYMD(now); }
  if (p === "Year") return toLocalYMD(new Date(now.getFullYear(), 0, 1));
  return null;
}

function PortfolioFilterSheet({ visible, onClose, accounts, filterType, setFilterType, filterAccountId, setFilterAccountId, filterPeriod, setFilterPeriod, colors }: {
  visible: boolean; onClose: () => void;
  accounts: Account[];
  filterType: string; setFilterType: (v: string) => void;
  filterAccountId: string | null; setFilterAccountId: (v: string | null) => void;
  filterPeriod: PeriodOpt; setFilterPeriod: (v: PeriodOpt) => void;
  colors: any;
}) {
  const investAccounts = accounts.filter((a) => a.type === "investment");
  const chip = (label: string, active: boolean, onPress: () => void, activeColor?: string) => (
    <TouchableOpacity
      key={label}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
      style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1,
        borderColor: active ? (activeColor ?? colors.primary) : colors.border,
        backgroundColor: active ? (activeColor ?? colors.primary) + "18" : "transparent", marginRight: 8, marginBottom: 8 }}
      activeOpacity={0.7}
    >
      <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: active ? (activeColor ?? colors.primary) : colors.mutedForeground }}>{label}</Text>
    </TouchableOpacity>
  );
  const hasFilters = filterType !== "All" || filterAccountId !== null || filterPeriod !== "All";
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: "#00000055" }} activeOpacity={1} onPress={onClose} />
      <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: colors.foreground }}>Portfolio Filters</Text>
          <TouchableOpacity onPress={onClose}><Feather name="x" size={20} color={colors.mutedForeground} /></TouchableOpacity>
        </View>
        {investAccounts.length > 1 && (
          <>
            <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, marginBottom: 8, letterSpacing: 0.8 }}>ACCOUNT</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 12 }}>
              {chip("All Accounts", filterAccountId === null, () => setFilterAccountId(null))}
              {investAccounts.map((a) => chip(a.name, filterAccountId === a.id, () => setFilterAccountId(filterAccountId === a.id ? null : a.id)))}
            </View>
          </>
        )}
        <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, marginBottom: 8, letterSpacing: 0.8 }}>DATE PERIOD</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 12 }}>
          {PERIOD_OPTIONS.map((p) => chip(p, filterPeriod === p, () => setFilterPeriod(p)))}
        </View>
        <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, marginBottom: 8, letterSpacing: 0.8 }}>TRANSACTION TYPE</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 16 }}>
          {TYPE_OPTIONS.map((tp) => {
            const color = tp === "All" ? colors.primary : invTypeColor(tp.toLowerCase(), colors, tp.toLowerCase());
            return chip(tp, filterType === tp, () => setFilterType(tp), color);
          })}
        </View>
        {hasFilters && (
          <TouchableOpacity
            onPress={() => { setFilterType("All"); setFilterAccountId(null); setFilterPeriod("All"); }}
            style={{ alignItems: "center", paddingVertical: 10 }}
          >
            <Text style={{ color: colors.expense, fontFamily: "Inter_500Medium", fontSize: 14 }}>Clear All Filters</Text>
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
}

function PortfolioTab({ holdings, investmentTransactions, accounts, transactions, filterType, filterAccountId, filterPeriod, colors }: {
  holdings: Holding[];
  investmentTransactions: InvestmentTransaction[];
  accounts: Account[];
  transactions: Transaction[];
  filterType: string;
  filterAccountId: string | null;
  filterPeriod: PeriodOpt;
  colors: any;
}) {
  const totalValue = holdings.reduce((s, h) => s + h.value, 0);
  const totalCost = holdings.reduce((s, h) => s + (h.costBasis ?? 0), 0);
  const totalGain = totalCost > 0 ? totalValue - totalCost : 0;
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

  const { rrspLimit, setRrspLimit } = useApp();
  const [isEditingLimit, setIsEditingLimit] = useState(false);
  const [limitInput, setLimitInput] = useState(String(rrspLimit));
  const [rrspListOpen, setRrspListOpen] = useState(false);

  // 1. Identify RRSP Accounts (including Spousal RRSP, SRRSP, RSP, etc.)
  const rrspAccounts = accounts.filter((a) => {
    const name = a.name.toLowerCase();
    return name.includes("rrsp") || name.includes("rsp") || name.includes("spousal") || name.includes("srrsp");
  });
  const rrspAccountIds = rrspAccounts.map((a) => a.id);
  const rrspPlaidAccountIds = rrspAccounts.filter((a) => a.plaidAccountId).map((a) => a.plaidAccountId);

  // 2. Identify RRSP Cash Transactions for the current contribution period (April 1st to March 31st)
  const now = new Date();
  const currentYear = now.getFullYear();
  // If today is before April 1st, the RRSP year started on April 1st of the previous year.
  // If today is on/after April 1st, the RRSP year started on April 1st of the current year.
  const rrspStartYear = now.getMonth() < 3 ? currentYear - 1 : currentYear;
  const startOfRrspYear = `${rrspStartYear}-04-01`;
  const endOfRrspYear = `${rrspStartYear + 1}-03-31`;

  const rrspTxs = investmentTransactions.filter((t) => {
    const belongs = rrspAccountIds.includes(t.accountId) || (t.plaidAccountId && rrspPlaidAccountIds.includes(t.plaidAccountId));
    if (!belongs) return false;

    const dateStr = t.date.slice(0, 10);
    if (dateStr < startOfRrspYear || dateStr > endOfRrspYear) return false;

    // Match if subtype is "cash", type is "cash", or invTypeLabel resolves to "Cash"
    const isCashSubtype = t.subtype?.toLowerCase() === "cash";
    const isCashType = t.type?.toLowerCase() === "cash";
    const isCashLabel = invTypeLabel(t.type, t.subtype) === "Cash";
    if (!(isCashSubtype || isCashType || isCashLabel)) return false;

    // Only count entries representing actual manual contributions/deposits
    const nameLower = t.name.toLowerCase();
    const isActualDeposit = nameLower.includes("deposit") || 
                            nameLower.includes("electronic transfer") || 
                            nameLower.includes("electronic deposit") ||
                            nameLower.includes("contribution") || 
                            nameLower.includes("eft") || 
                            nameLower.includes("transfer");
    return isActualDeposit;
  });

  const rrspUsed = rrspTxs.reduce((sum, t) => sum + t.amount, 0);
  const rrspRemaining = Math.max(0, rrspLimit - rrspUsed);
  const rrspProgress = rrspLimit > 0 ? rrspUsed / rrspLimit : 0;

  const [holdingsOpen, setHoldingsOpen] = useState(true);
  const [activityOpen, setActivityOpen] = useState(true);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const investAccounts = accounts.filter((a) => a.type === "investment");
  const totalAccountBal = investAccounts.reduce((s, a) => s + computeBalance(a, transactions), 0);
  const totalCash = totalAccountBal - totalValue;

  const targetPlaidId = filterAccountId ? accounts.find((a) => a.id === filterAccountId)?.plaidAccountId : null;
  const filteredHoldings = filterAccountId
    ? holdings.filter((h) => h.accountId === filterAccountId || (targetPlaidId && h.plaidAccountId === targetPlaidId))
    : holdings;

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const sixMonthsAgoStr = toLocalYMD(sixMonthsAgo);

  const pStart = periodStart(filterPeriod);
  // Cap displayed activity to last 6 months for UI rendering performance, or narrower if filtered
  const effectiveStart = pStart && pStart > sixMonthsAgoStr ? pStart : sixMonthsAgoStr;

  const filteredTxs = investmentTransactions
    .filter((t) => filterType === "All" || invTypeLabel(t.type, t.subtype) === filterType)
    .filter((t) => !filterAccountId || t.accountId === filterAccountId)
    .filter((t) => t.date.slice(0, 10) >= effectiveStart)
    .sort((a, b) => b.date.localeCompare(a.date));

  const grouped: [string, InvestmentTransaction[]][] = [];
  for (const t of filteredTxs) {
    const key = t.date.slice(0, 10);
    const last = grouped[grouped.length - 1];
    if (last && last[0] === key) last[1].push(t);
    else grouped.push([key, [t]]);
  }

  const fmtCAD = (n: number) =>
    (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const fmtDate = (d: string) => {
    const dt = new Date(d + "T00:00:00");
    return dt.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
      {/* Portfolio summary card */}
      <View style={[ptSt.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[ptSt.summaryLabel, { color: colors.mutedForeground }]}>Total Portfolio Value</Text>
        <Text style={[ptSt.summaryValue, { color: colors.foreground }]}>{fmtCAD(totalAccountBal)}</Text>
        {totalCost > 0 && (
          <View style={ptSt.gainRow}>
            <Text style={[ptSt.gainAmt, { color: totalGain >= 0 ? "#22c55e" : "#ef4444" }]}>
              {totalGain >= 0 ? "+" : ""}{fmtCAD(totalGain)}
            </Text>
            <Text style={[ptSt.gainPct, { color: totalGain >= 0 ? "#22c55e" : "#ef4444" }]}>
              ({totalGainPct >= 0 ? "+" : ""}{totalGainPct.toFixed(2)}%)
            </Text>
          </View>
        )}
        {totalAccountBal > 0 && totalCash > 0.01 && (
          <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={[ptSt.summaryLabel, { color: colors.mutedForeground }]}>Show Breakdown</Text>
              <Switch
                value={showBreakdown}
                onValueChange={setShowBreakdown}
                trackColor={{ false: colors.muted, true: colors.primary + "66" }}
                thumbColor={showBreakdown ? colors.primary : colors.mutedForeground}
              />
            </View>
            {showBreakdown && (
              <View style={{ flexDirection: "row", gap: 20, marginTop: 10 }}>
                <View>
                  <Text style={[ptSt.summaryLabel, { color: colors.mutedForeground }]}>PLAID HOLDINGS</Text>
                  <Text style={[ptSt.holdingValue, { color: colors.foreground }]}>{fmtCAD(totalValue)}</Text>
                </View>
                <View>
                  <Text style={[ptSt.summaryLabel, { color: colors.mutedForeground }]}>CASH / OTHER</Text>
                  <Text style={[ptSt.holdingValue, { color: "#f59e0b" }]}>{fmtCAD(totalCash)}</Text>
                </View>
              </View>
            )}
          </View>
        )}
      </View>

      {/* RRSP Contribution Limits Tracker */}
      {rrspAccounts.length > 0 && (
        <View style={[ptSt.summaryCard, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 0 }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground }}>🇨🇦 RRSP Limit Tracker</Text>
            </View>
            <TouchableOpacity 
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setLimitInput(String(rrspLimit));
                setIsEditingLimit(true);
              }}
              style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.border + "aa", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}
            >
              <Feather name="edit-2" size={12} color={colors.primary} />
              <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.primary }}>Edit Limit</Text>
            </TouchableOpacity>
          </View>

          {isEditingLimit ? (
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 12 }}>
              <TextInput
                style={{ flex: 1, height: 40, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, color: colors.foreground, fontSize: 15, fontFamily: "Inter_500Medium" }}
                keyboardType="numeric"
                value={limitInput}
                onChangeText={setLimitInput}
                placeholder="Enter limit"
                autoFocus
              />
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  const parsed = parseFloat(limitInput.replace(/[^0-9.]/g, ""));
                  if (!isNaN(parsed) && parsed >= 0) {
                    setRrspLimit(parsed);
                  }
                  setIsEditingLimit(false);
                }}
                style={{ backgroundColor: colors.primary, paddingHorizontal: 12, height: 40, borderRadius: 8, justifyContent: "center", alignItems: "center" }}
              >
                <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold" }}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setIsEditingLimit(false);
                }}
                style={{ backgroundColor: colors.border, paddingHorizontal: 12, height: 40, borderRadius: 8, justifyContent: "center", alignItems: "center" }}
              >
                <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <View>
                <Text style={[ptSt.summaryLabel, { color: colors.mutedForeground }]}>CONTRIBUTIONS USED (YTD)</Text>
                <Text style={{ fontSize: 24, fontFamily: "Inter_700Bold", color: colors.foreground }}>{fmtCAD(rrspUsed)}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[ptSt.summaryLabel, { color: colors.mutedForeground }]}>YTD LIMIT</Text>
                <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>{fmtCAD(rrspLimit)}</Text>
              </View>
            </View>
          )}

          {/* Progress Bar */}
          <View style={{ height: 10, backgroundColor: colors.border + "88", borderRadius: 5, overflow: "hidden", marginBottom: 12 }}>
            <View 
              style={{ 
                height: "100%", 
                width: `${Math.min(100, rrspProgress * 100)}%`, 
                backgroundColor: rrspProgress > 1 ? "#ef4444" : rrspProgress > 0.85 ? "#f59e0b" : "#22c55e",
                borderRadius: 5
              }} 
            />
          </View>

          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ flex: 1, marginRight: 12, fontSize: 13, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>
              {rrspProgress > 1 
                ? `⚠️ Exceeded by ${fmtCAD(rrspUsed - rrspLimit)}` 
                : `${(rrspProgress * 100).toFixed(1)}% used • ${fmtCAD(rrspRemaining)} remaining`
              }
            </Text>
            {rrspTxs.length > 0 && (
              <TouchableOpacity 
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setRrspListOpen((o) => !o);
                }}
                style={{ flexDirection: "row", alignItems: "center", gap: 2, flexShrink: 0 }}
              >
                <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.primary }}>
                  {rrspListOpen ? "Hide" : `Show ${rrspTxs.length} Deposits`}
                </Text>
                <Feather name={rrspListOpen ? "chevron-up" : "chevron-down"} size={14} color={colors.primary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Collapsible list of transactions */}
          {rrspListOpen && rrspTxs.length > 0 && (
            <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
              <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: colors.mutedForeground, letterSpacing: 0.5, marginBottom: 8 }}>
                RRSP CASH DEPOSITS (APR 1, {rrspStartYear} - MAR 31, {rrspStartYear + 1})
              </Text>
              {rrspTxs.map((t) => (
                <View key={t.id || t.plaidTxId} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 }}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.foreground }} numberOfLines={1}>
                      {t.name}
                    </Text>
                    <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                      {fmtDate(t.date)} • {accounts.find((a) => a.id === t.accountId || a.plaidAccountId === t.plaidAccountId)?.name || "RRSP"}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#22c55e" }}>
                    +{fmtCAD(t.amount)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Per-account reconciliation */}
      {investAccounts.length > 0 && (
        <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
          <TouchableOpacity
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4, marginBottom: 4 }}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setBreakdownOpen((o) => !o); }}
            activeOpacity={0.7}
          >
            <Text style={[ptSt.sectionTitle, { color: colors.mutedForeground }]}>ACCOUNT BREAKDOWN</Text>
            <Feather name={breakdownOpen ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
          {breakdownOpen && investAccounts.map((acc) => {
            const accHoldings = holdings.filter((h) => h.accountId === acc.id || h.plaidAccountId === acc.plaidAccountId);
            const holdingsVal = accHoldings.reduce((s, h) => s + h.value, 0);
            const liveBalance = computeBalance(acc, transactions);
            const cash = liveBalance - holdingsVal;
            const hasCash = cash > 0.01;
            return (
              <View key={acc.id} style={[ptSt.holdingRow, { backgroundColor: colors.card, borderColor: colors.border, flexDirection: "column", gap: 6 }]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={[ptSt.holdingName, { color: colors.foreground }]} numberOfLines={1}>{acc.name}</Text>
                  <Text style={[ptSt.holdingValue, { color: colors.foreground }]}>{fmtCAD(liveBalance)}</Text>
                </View>
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <Text style={[ptSt.holdingSub, { color: colors.mutedForeground }]}>Holdings: {fmtCAD(holdingsVal)}</Text>
                  {hasCash && <Text style={[ptSt.holdingSub, { color: "#f59e0b" }]}>Cash/Other: {fmtCAD(cash)}</Text>}
                  {!hasCash && holdingsVal > 0 && <Text style={[ptSt.holdingSub, { color: "#22c55e" }]}>✓ Fully invested</Text>}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Holdings list */}
      {holdings.length > 0 && (
        <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
          <TouchableOpacity
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4, marginBottom: 4 }}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setHoldingsOpen((o) => !o); }}
            activeOpacity={0.7}
          >
            <Text style={[ptSt.sectionTitle, { color: colors.mutedForeground }]}>HOLDINGS ({filteredHoldings.length})</Text>
            <Feather name={holdingsOpen ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
          {holdingsOpen && filteredHoldings.map((h) => {
            const gain = h.costBasis != null ? h.value - h.costBasis : null;
            const gainPct = h.costBasis != null && h.costBasis > 0 ? ((h.value - h.costBasis) / h.costBasis) * 100 : null;
            return (
              <View key={h.id} style={[ptSt.holdingRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[ptSt.tickerBadge, { backgroundColor: colors.muted }]}>
                  <Text style={[ptSt.tickerText, { color: colors.foreground }]} numberOfLines={1}>
                    {h.ticker ?? h.name.slice(0, 4).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[ptSt.holdingName, { color: colors.foreground }]} numberOfLines={1}>{h.name}</Text>
                  <Text style={[ptSt.holdingSub, { color: colors.mutedForeground }]}>
                    {h.quantity.toLocaleString("en-CA", { maximumFractionDigits: 4 })} units · {h.currency}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[ptSt.holdingValue, { color: colors.foreground }]}>{fmtCAD(h.value)}</Text>
                  {gain != null && gainPct != null && (
                    <Text style={[ptSt.holdingGain, { color: gain >= 0 ? "#22c55e" : "#ef4444" }]}>
                      {gain >= 0 ? "+" : ""}{gainPct.toFixed(1)}%
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Investment activity */}
      {investmentTransactions.length > 0 && (
        <View style={{ marginTop: 20 }}>
          <TouchableOpacity
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4, marginBottom: 8, paddingHorizontal: 16 }}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActivityOpen((o) => !o); }}
            activeOpacity={0.7}
          >
            <Text style={[ptSt.sectionTitle, { color: colors.mutedForeground }]}>ACTIVITY (LAST 6 MONTHS)</Text>
            <Feather name={activityOpen ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
          </TouchableOpacity>

          {activityOpen && (
            <>
              <View style={{ paddingHorizontal: 16 }}>
                {grouped.length === 0 && (
                  <Text style={{ color: colors.mutedForeground, textAlign: "center", paddingVertical: 20, fontSize: 13, fontFamily: "Inter_400Regular" }}>
                    No transactions match the selected filters.
                  </Text>
                )}
                {grouped.map(([date, txs]) => (
                  <View key={date}>
                    <Text style={[ptSt.dateHeader, { color: colors.mutedForeground }]}>{fmtDate(date)}</Text>
                    {txs.map((t) => (
                      <View key={t.id} style={[ptSt.invTxRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <View style={[ptSt.typeBadge, { backgroundColor: invTypeColor(t.type, colors, t.subtype) + "22" }]}>
                          <Text style={[ptSt.typeText, { color: invTypeColor(t.type, colors, t.subtype) }]}>{invTypeLabel(t.type, t.subtype)}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[ptSt.invTxName, { color: colors.foreground }]} numberOfLines={1}>{t.name}</Text>
                          {t.ticker && (
                            <Text style={[ptSt.invTxSub, { color: colors.mutedForeground }]}>
                              {t.ticker}{t.quantity != null ? ` · ${t.quantity.toLocaleString("en-CA", { maximumFractionDigits: 4 })} units` : ""}
                            </Text>
                          )}
                        </View>
                        <Text style={[ptSt.invTxAmt, { color: colors.foreground }]}>{fmtCAD(t.amount)}</Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
      )}

      {holdings.length === 0 && investmentTransactions.length === 0 && (
        <View style={{ alignItems: "center", paddingTop: 80 }}>
          <Text style={{ fontSize: 40 }}>📈</Text>
          <Text style={[{ fontSize: 16, fontFamily: "Inter_600SemiBold", marginTop: 16, color: colors.foreground }]}>No portfolio data yet</Text>
          <Text style={[{ fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 8, color: colors.mutedForeground, textAlign: "center", paddingHorizontal: 40 }]}>
            Sync your Wealthsimple account to see holdings and investment activity here.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const ptSt = StyleSheet.create({
  summaryCard:   { margin: 16, borderRadius: 16, padding: 20, borderWidth: StyleSheet.hairlineWidth },
  summaryLabel:  { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 4 },
  summaryValue:  { fontSize: 28, fontFamily: "Inter_700Bold" },
  gainRow:       { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  gainAmt:       { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  gainPct:       { fontSize: 13, fontFamily: "Inter_400Regular" },
  sectionTitle:  { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 1, marginBottom: 8 },
  holdingRow:    { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: StyleSheet.hairlineWidth },
  tickerBadge:   { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  tickerText:    { fontSize: 11, fontFamily: "Inter_700Bold" },
  holdingName:   { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  holdingSub:    { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  holdingValue:  { fontSize: 15, fontFamily: "Inter_700Bold" },
  holdingGain:   { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 2 },
  dateHeader:    { fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 8, marginTop: 4 },
  invTxRow:      { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: StyleSheet.hairlineWidth },
  typeBadge:     { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  typeText:      { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  invTxName:     { fontSize: 14, fontFamily: "Inter_500Medium" },
  invTxSub:      { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  invTxAmt:      { fontSize: 14, fontFamily: "Inter_700Bold" },
});

// Dedup key identical to TransactionsTab so both views work on the same set
function txDedupKey(t: Transaction): string {
  return `${(t.source ?? "").toLowerCase()}|${(t.bank ?? "").toLowerCase()}|${(t.accountId ?? "").toLowerCase()}|${t.amount}|${(t.title ?? "").toLowerCase().trim()}|${(t.date ?? "").slice(0, 10)}`;
}

export default function InsightsScreen() {
  const colors = useColors();
  const { openDrawer } = useDrawer();
  const { transactions, bills, accounts, addTransaction, reviewedTransactionIds, investmentTransactions, holdings, currentMonth, setCurrentMonth } = useApp();
  const [activeTab, setActiveTab] = useState<Subtab>("CASH FLOW");

  const pendingReviewCount = useMemo(
    () => transactions.filter((t) => (t.fromEmail || t.source === "email") && !reviewedTransactionIds.includes(t.id)).length,
    [transactions, reviewedTransactionIds]
  );
  const hasPortfolio = investmentTransactions.length > 0 || holdings.length > 0;
  const visibleTabs = useMemo(
    () => SUBTABS.filter((tab) => {
      if (tab === "REVIEW") return pendingReviewCount > 0;
      if (tab === "PORTFOLIO") return hasPortfolio;
      return true;
    }),
    [pendingReviewCount, hasPortfolio]
  );
  // If the active tab is no longer visible (e.g. REVIEW emptied), switch to CASH FLOW
  useEffect(() => {
    if (!visibleTabs.includes(activeTab)) {
      setActiveTab("CASH FLOW");
    }
  }, [visibleTabs, activeTab]);

  // Reviewed + deduplicated transaction list — same logic as TransactionsTab so all
  // insight views are consistent with what the user can actually see.
  const visibleTxs = useMemo(() => {
    const reviewed = transactions.filter((t) => {
      const isUnreviewedEmail = (t.fromEmail || t.source === "email") && !reviewedTransactionIds.includes(t.id);
      return !isUnreviewedEmail;
    });
    const seenIds = new Set<string>();
    const seenContent = new Set<string>();
    return reviewed.filter((t) => {
      if (seenIds.has(t.id)) return false;
      const key = txDedupKey(t);
      if (seenContent.has(key)) return false;
      seenIds.add(t.id);
      seenContent.add(key);
      return true;
    });
  }, [transactions, reviewedTransactionIds]);

  const [chartView, setChartView] = useState<ChartView>("Chart");
  const [showAdd, setShowAdd] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [txFilterSettings, setTxFilterSettings] = useState<TxFilterSettings>(DEFAULT_TX_FILTER);
  const txFilterCount = useMemo(() => {
    const f = txFilterSettings;
    return (
      (f.type !== "All" ? 1 : 0) +
      (f.categories.length > 0 ? 1 : 0) +
      (f.accountIds.length > 0 ? 1 : 0) +
      (f.dateFrom || f.dateTo ? 1 : 0) +
      (f.amountMin !== "" || f.amountMax !== "" ? 1 : 0) +
      (f.notes.trim() ? 1 : 0)
    );
  }, [txFilterSettings]);
  const [showPortfolioFilter, setShowPortfolioFilter] = useState(false);
  const [pfType, setPfType] = useState("All");
  const [pfAccountId, setPfAccountId] = useState<string | null>(null);
  const [pfPeriod, setPfPeriod] = useState<PeriodOpt>("All");
  const pfFilterCount = (pfType !== "All" ? 1 : 0) + (pfAccountId !== null ? 1 : 0) + (pfPeriod !== "All" ? 1 : 0);
  const [showPeriodSettings, setShowPeriodSettings] = useState(false);
  const [periodSettings, setPeriodSettings] = useState<PeriodSettings>(DEFAULT_PERIOD_SETTINGS);
  const [selectedMonth, setSelectedMonth] = useState<{ year: number; month: number } | null>(null);

  const handleMonthPress = (y: number, m: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedMonth({ year: y, month: m });
  };

  return (
    <SafeAreaView edges={["top"]} style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Platform.OS === "web" ? 60 : 8, backgroundColor: colors.background }]}>
        <TouchableOpacity style={styles.headerIcon} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openDrawer(); }}>
          <Feather name="menu" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Insights</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerIcon}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (activeTab === "TRANSACTIONS") setShowFilter(true);
              else if (activeTab === "PORTFOLIO") setShowPortfolioFilter(true);
              else setShowPeriodSettings(true);
            }}
          >
            <View>
              <Feather name="sliders" size={20} color={colors.primary} />
              {activeTab === "TRANSACTIONS" && txFilterCount > 0 && (
                <View style={[styles.filterBadge, { backgroundColor: colors.expense }]}>
                  <Text style={styles.filterBadgeText}>{txFilterCount}</Text>
                </View>
              )}
              {activeTab === "PORTFOLIO" && pfFilterCount > 0 && (
                <View style={[styles.filterBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.filterBadgeText}>{pfFilterCount}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIcon}>
            <Feather name="download" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Subtabs */}
      <View style={[styles.subtabRow, { borderBottomColor: colors.border }]}>
        {visibleTabs.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.subtab, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab(tab)}
          >
            <Text
              style={[
                styles.subtabText,
                { color: activeTab === tab ? colors.primary : colors.mutedForeground },
              ]}
              numberOfLines={1}
            >
              {tab}
              {tab === "REVIEW" && pendingReviewCount > 0 && (
                <Text style={{ color: colors.primary }}> ({pendingReviewCount})</Text>
              )}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab content */}
      <View style={{ flex: 1 }}>
        {activeTab === "CASH FLOW" && (
          <CashFlowTab
            transactions={transactions}
            colors={colors}
            currentMonth={currentMonth}
            setCurrentMonth={setCurrentMonth}
            chartView={chartView}
            setChartView={setChartView}
            onMonthPress={handleMonthPress}
          />
        )}
        {activeTab === "SPENDING" && (
          <SpendingTab transactions={visibleTxs} bills={bills} colors={colors} currentMonth={currentMonth} setCurrentMonth={setCurrentMonth} />
        )}
        {activeTab === "TRENDS" && (
          <TrendsTab transactions={visibleTxs} colors={colors} />
        )}
        {activeTab === "TRANSACTIONS" && (
          <TransactionsTab transactions={visibleTxs} colors={colors} showFilter={showFilter} setShowFilter={setShowFilter} filterSettings={txFilterSettings} setFilterSettings={setTxFilterSettings} />
        )}
        {activeTab === "REVIEW" && (
          <ReviewTab
            transactions={transactions}
            colors={colors}
            onAllReviewed={() => setActiveTab("CASH FLOW")}
          />
        )}
        {activeTab === "PORTFOLIO" && (
          <PortfolioTab
            holdings={holdings}
            investmentTransactions={investmentTransactions}
            accounts={accounts}
            transactions={transactions}
            filterType={pfType}
            filterAccountId={pfAccountId}
            filterPeriod={pfPeriod}
            colors={colors}
          />
        )}
      </View>

      <PortfolioFilterSheet
        visible={showPortfolioFilter}
        onClose={() => setShowPortfolioFilter(false)}
        accounts={accounts}
        filterType={pfType} setFilterType={setPfType}
        filterAccountId={pfAccountId} setFilterAccountId={setPfAccountId}
        filterPeriod={pfPeriod} setFilterPeriod={setPfPeriod}
        colors={colors}
      />

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { borderColor: colors.primary }]}
        onPress={() => setShowAdd(true)}
      >
        <Feather name="plus" size={24} color={colors.primary} />
      </TouchableOpacity>

      <AddEntrySheet visible={showAdd} initialTab="EXPENSE" onClose={() => setShowAdd(false)} />
      <PeriodSettingsSheet
        visible={showPeriodSettings}
        onClose={() => setShowPeriodSettings(false)}
        onApply={(s) => setPeriodSettings(s)}
        initial={periodSettings}
      />
      <MonthDetailModal
        visible={!!selectedMonth}
        onClose={() => setSelectedMonth(null)}
        year={selectedMonth?.year ?? new Date().getFullYear()}
        month={selectedMonth?.month ?? new Date().getMonth()}
        transactions={transactions}
        bills={bills}
        accounts={accounts}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 10,
  },
  headerIcon: {
    padding: 4,
  },
  filterBadge: {
    position: "absolute",
    top: -5,
    right: -5,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  filterBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  gearBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  subtabRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  subtab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  subtabText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
    textAlign: "center",
  },
  reviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  reviewTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  reviewSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  reviewAmount: { fontSize: 14, fontFamily: "Inter_700Bold" },
  reviewAddBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  reviewAddText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  reviewRejectBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  reviewRejectText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  monthCenter: {
    alignItems: "center",
  },
  monthName: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  monthSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },

  chartCard: {
    marginHorizontal: 12,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  toggleRow: {
    flexDirection: "row",
    borderRadius: 10,
    padding: 3,
    marginBottom: 10,
    alignSelf: "center",
  },
  toggleBtn: {
    paddingHorizontal: 20,
    paddingVertical: 6,
    borderRadius: 8,
  },
  toggleText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  expandRow: {
    alignItems: "flex-end",
    marginBottom: 6,
  },

  barChart: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
    height: 180,
    paddingBottom: 20,
  },
  barColumn: {
    alignItems: "center",
    flex: 1,
    gap: 2,
  },
  barValue: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  barWrapper: {
    width: "70%",
    overflow: "hidden",
    flexDirection: "column",
  },
  incomeBar: {
    width: "100%",
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  expenseBar: {
    width: "100%",
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  barLabel: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },

  projectedCard: {
    marginHorizontal: 12,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  projectedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  projectedTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  moreBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  moreText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  projectedRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  projectedMonth: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  projectedRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  projectedPct: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  projectedAmount: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  balanceLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  balanceLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  balanceAmount: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  balanceRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  balancePctBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  balancePct: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  balanceFinal: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },

  spendCard: {
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  spendCardTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  catRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  catLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    width: 90,
  },
  catDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  catName: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  catBarContainer: { flex: 1 },
  catBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  catBarFill: {
    height: 6,
    borderRadius: 3,
  },
  catAmount: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    width: 44,
    textAlign: "right",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  totalAmount: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },

  donutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  donutWrap: {
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  donutCenter: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  donutTotal: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  donutLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  donutLegend: {
    flex: 1,
    gap: 7,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  legendCat: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  legendPct: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    width: 32,
    textAlign: "right",
  },

  trendSummaryRow: {
    flexDirection: "row",
    gap: 10,
  },
  trendSummaryCard: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
    alignItems: "center",
  },
  trendSummaryLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  trendSummaryAmt: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  trendLegend: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 4,
  },
  trendLegendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  trendLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  trendLegendText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },

  trendCard: {
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  trendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  trendMonth: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    width: 28,
  },
  trendBars: {
    flex: 1,
    gap: 3,
  },
  trendBarTrack: {
    height: 7,
    borderRadius: 4,
    overflow: "hidden",
  },
  trendBarFill: {
    height: 7,
    borderRadius: 4,
  },
  trendNet: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    width: 52,
    textAlign: "right",
  },

  txFilterRow: {
    flex: 1,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexWrap: "wrap",
  },
  txFilterTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  txFilterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  txFilterText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  txFilterButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  recurringRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  recurringText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  txDateHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
    borderBottomWidth: 1,
  },
  txDateLabel: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  txDateTotal: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  txItemWrap: {
    borderBottomWidth: 0,
  },
  dateHeader: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 6,
  },

  emptyBox: {
    padding: 40,
    borderRadius: 14,
    alignItems: "center",
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },

  spendPillRow: {
    flexDirection: "row",
    borderRadius: 24,
    padding: 4,
    borderWidth: 1,
    alignSelf: "center",
  },
  spendPill: {
    paddingHorizontal: 22,
    paddingVertical: 8,
    borderRadius: 20,
  },
  spendPillText: {
    fontSize: 14,
  },

  spendDonutCard: {
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 240,
  },
  spendEmpty: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 20,
  },
  donutCenterWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  donutCenterAbs: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  donutCenterLabel: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginBottom: 2,
  },
  donutCenterAmount: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },

  includeBillsRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    gap: 10,
  },
  includeBillsIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  includeBillsText: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },

  spendItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 4,
  },
  spendItemIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  spendItemInfo: {
    flex: 1,
    gap: 3,
  },
  spendItemName: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  spendItemPct: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  spendItemRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  spendItemAmt: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  spendItemBar: {
    width: 44,
    height: 3,
    borderRadius: 2,
  },

  fab: {
    position: "absolute",
    bottom: Platform.OS === "web" ? 34 + 84 + 16 : 80 + 16,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },

  calDayHeaders: {
    flexDirection: "row",
    marginBottom: 6,
    marginTop: 8,
  },
  calDayHeader: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  calRow: {
    flexDirection: "row",
    marginBottom: 2,
  },
  calCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 4,
  },
  calDayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  calDayText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  calDot: {
    position: "absolute",
    bottom: 2,
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },

  monthlyCard: {
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  monthlyTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  monthlyLabel: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  monthlyRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  monthlyPctBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  monthlyPct: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  monthlyIncome: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  monthlyProgressTrack: {
    height: 5,
    borderRadius: 3,
    overflow: "hidden",
  },
  monthlyProgressFill: {
    height: 5,
    borderRadius: 3,
    backgroundColor: "#f97316",
  },
  monthlyBalanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  monthlyBalanceLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  monthlyBalanceLabel: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  monthlyBalanceAmt: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  monthlyBalanceRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  monthlyBalanceFinal: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheetContainer: {
    maxHeight: "70%",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 8,
    paddingBottom: 20,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  sheetTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  txnRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  subFilterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  subFilterChipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  subFilterChipAmt: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  sheetSectionLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    paddingBottom: 6,
  },
});
