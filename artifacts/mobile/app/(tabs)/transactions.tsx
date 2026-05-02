import { Feather } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AddTransactionModal from "@/components/AddTransactionModal";
import TransactionItem from "@/components/TransactionItem";
import { Transaction, useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

const SUBTABS = ["CASH FLOW", "SPENDING", "TRENDS", "TRANSACTIONS"] as const;
type Subtab = (typeof SUBTABS)[number];

const CHART_VIEWS = ["Chart", "Calendar", "Monthly"] as const;
type ChartView = (typeof CHART_VIEWS)[number];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FULL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getMonthData(transactions: Transaction[], year: number) {
  return MONTHS.map((label, idx) => {
    const monthStart = new Date(year, idx, 1).toISOString().slice(0, 7);
    const income = transactions
      .filter((t) => t.type === "income" && t.date.startsWith(monthStart))
      .reduce((s, t) => s + t.amount, 0);
    const expense = transactions
      .filter((t) => t.type === "expense" && t.date.startsWith(monthStart))
      .reduce((s, t) => s + t.amount, 0);
    return { label, income, expense };
  });
}

function getMonthDataForYearMonth(transactions: Transaction[], year: number, month: number) {
  const monthStart = new Date(year, month, 1).toISOString().slice(0, 7);
  const income = transactions
    .filter((t) => t.type === "income" && t.date.startsWith(monthStart))
    .reduce((s, t) => s + t.amount, 0);
  const expense = transactions
    .filter((t) => t.type === "expense" && t.date.startsWith(monthStart))
    .reduce((s, t) => s + t.amount, 0);
  return { income, expense };
}

function ProjectedSection({
  colors,
  monthLabel,
  income,
  expense,
  prevExpense,
}: {
  colors: any;
  monthLabel: string;
  income: number;
  expense: number;
  prevExpense: number;
}) {
  const projected = income - expense;
  const expensePct = income > 0 ? Math.min((expense / income) * 100, 100) : expense > 0 ? 100 : 0;
  const balancePctChange = prevExpense > 0 ? Math.abs(((expense - prevExpense) / prevExpense) * 100) : 0;
  const balanceUp = expense >= prevExpense;

  return (
    <View style={[styles.projectedCard, { backgroundColor: colors.card }]}>
      <View style={styles.projectedHeader}>
        <Text style={[styles.projectedTitle, { color: colors.foreground }]}>Projected</Text>
        <TouchableOpacity style={styles.moreBtn}>
          <Text style={[styles.moreText, { color: colors.primary }]}>More</Text>
          <Feather name="chevron-right" size={14} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.projectedRow}>
        <Text style={[styles.projectedMonth, { color: colors.foreground }]}>{monthLabel}</Text>
        <View style={styles.projectedRight}>
          <Text style={[styles.projectedPct, { color: colors.mutedForeground }]}>0.0%</Text>
          <Text style={[styles.projectedAmount, { color: "#4caf50" }]}>
            + ${projected >= 0 ? projected.toFixed(0) : "0"}
          </Text>
        </View>
      </View>

      <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
        <View
          style={[
            styles.progressFill,
            { backgroundColor: "#f97316", width: `${expensePct}%` as any },
          ]}
        />
      </View>

      <View style={styles.balanceRow}>
        <View style={styles.balanceLeft}>
          <Text style={[styles.balanceLabel, { color: colors.foreground }]}>Balance</Text>
          <Text style={[styles.balanceAmount, { color: "#f97316" }]}>
            - ${expense.toFixed(0)}
          </Text>
        </View>
        <View style={styles.balanceRight}>
          <View style={styles.balancePctBadge}>
            <Feather name={balanceUp ? "arrow-up" : "arrow-down"} size={10} color="#f97316" />
            <Text style={[styles.balancePct, { color: "#f97316" }]}>
              {balancePctChange.toFixed(1)}%
            </Text>
          </View>
          <Text style={[styles.balanceFinal, { color: colors.foreground }]}>
            - ${expense.toFixed(0)}
          </Text>
        </View>
      </View>
    </View>
  );
}

function CalendarView({
  colors,
  currentMonth,
  setCurrentMonth,
  transactions,
  setChartView,
}: {
  colors: any;
  currentMonth: number;
  setCurrentMonth: (m: number) => void;
  transactions: Transaction[];
  setChartView: (v: ChartView) => void;
}) {
  const today = new Date();
  const year = today.getFullYear();
  const todayDay = today.getDate();
  const todayMonth = today.getMonth();
  const todayYear = today.getFullYear();

  const firstDayOfMonth = new Date(year, currentMonth, 1).getDay();
  const daysInMonth = new Date(year, currentMonth + 1, 0).getDate();

  const { income, expense } = useMemo(
    () => getMonthDataForYearMonth(transactions, year, currentMonth),
    [transactions, year, currentMonth]
  );
  const prevData = useMemo(
    () => getMonthDataForYearMonth(transactions, currentMonth - 1 < 0 ? year - 1 : year, currentMonth - 1 < 0 ? 11 : currentMonth - 1),
    [transactions, year, currentMonth]
  );

  const txDays = useMemo(() => {
    const monthStr = new Date(year, currentMonth, 1).toISOString().slice(0, 7);
    const days = new Set<number>();
    transactions
      .filter((t) => t.date.startsWith(monthStr))
      .forEach((t) => {
        const d = new Date(t.date).getDate();
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
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={() => setCurrentMonth(Math.max(0, currentMonth - 1))}>
          <Feather name="chevron-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.monthCenter}>
          <Text style={[styles.monthName, { color: colors.foreground }]}>{monthLabel}</Text>
          <Text style={[styles.monthSub, { color: colors.mutedForeground }]}>Monthly</Text>
        </View>
        <TouchableOpacity onPress={() => setCurrentMonth(Math.min(11, currentMonth + 1))}>
          <Feather name="chevron-right" size={22} color={colors.foreground} />
        </TouchableOpacity>
      </View>

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
                <View key={di} style={styles.calCell}>
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
                </View>
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
      />
    </ScrollView>
  );
}

function MonthlyView({
  colors,
  transactions,
  setChartView,
}: {
  colors: any;
  transactions: Transaction[];
  setChartView: (v: ChartView) => void;
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

  const monthDataList = useMemo(() => {
    return monthList.map(({ year, month, label }, idx) => {
      const cur = getMonthDataForYearMonth(transactions, year, month);
      const prevIdx = idx + 1 < monthList.length ? idx + 1 : null;
      const prev = prevIdx !== null
        ? getMonthDataForYearMonth(transactions, monthList[prevIdx].year, monthList[prevIdx].month)
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
  }, [transactions, monthList]);

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
        <View key={idx} style={[styles.monthlyCard, { backgroundColor: colors.card }]}>
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
                + ${m.netIncome >= 0 ? m.netIncome.toFixed(0) : "0"}
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
              <Text style={[styles.monthlyBalanceAmt, { color: "#f97316" }]}>
                - ${m.expense.toFixed(0)}
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
                - ${m.expense.toFixed(0)}
              </Text>
            </View>
          </View>
        </View>
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
}: {
  transactions: Transaction[];
  colors: any;
  currentMonth: number;
  setCurrentMonth: (m: number) => void;
  chartView: ChartView;
  setChartView: (v: ChartView) => void;
}) {
  const year = new Date().getFullYear();
  const monthData = useMemo(() => getMonthData(transactions, year), [transactions, year]);

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
        />
      </View>
    );
  }

  if (chartView === "Monthly") {
    return (
      <View style={{ flex: 1 }}>
        <MonthlyView colors={colors} transactions={transactions} setChartView={setChartView} />
      </View>
    );
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
      {/* Month navigation */}
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={() => setCurrentMonth(Math.max(0, currentMonth - 1))}>
          <Feather name="chevron-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.monthCenter}>
          <Text style={[styles.monthName, { color: colors.foreground }]}>{monthName}</Text>
          <Text style={[styles.monthSub, { color: colors.mutedForeground }]}>Monthly</Text>
        </View>
        <TouchableOpacity onPress={() => setCurrentMonth(Math.min(11, currentMonth + 1))}>
          <Feather name="chevron-right" size={22} color={colors.foreground} />
        </TouchableOpacity>
      </View>

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
              <View key={m.label} style={styles.barColumn}>
                <Text style={[styles.barValue, { color: colors.mutedForeground }]}>
                  {m.income > 0 ? Math.round(m.income) : "0"}
                </Text>
                <Text style={[styles.barValue, { color: colors.mutedForeground }]}>
                  {m.expense > 0 ? `-${Math.round(m.expense)}` : "0"}
                </Text>

                <View
                  style={[
                    styles.barWrapper,
                    {
                      height: BAR_HEIGHT,
                      backgroundColor: isCurrent ? "#b0b8c8" : "transparent",
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

                <Text style={[styles.barLabel, { color: colors.mutedForeground }]}>{m.label}</Text>
              </View>
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
      />
    </ScrollView>
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

function SpendingTab({ transactions, colors, currentMonth }: { transactions: Transaction[]; colors: any; currentMonth: number }) {
  const year = new Date().getFullYear();
  const monthStr = new Date(year, currentMonth, 1).toISOString().slice(0, 7);

  const categorySpend = useMemo(() => {
    const totals: Record<string, number> = {};
    transactions
      .filter((t) => t.type === "expense" && t.date.startsWith(monthStr))
      .forEach((t) => {
        totals[t.category] = (totals[t.category] || 0) + t.amount;
      });
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }, [transactions, monthStr]);

  const total = categorySpend.reduce((s, [, v]) => s + v, 0);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 12 }}>
      {categorySpend.length === 0 ? (
        <View style={[styles.emptyBox, { backgroundColor: colors.card }]}>
          <Feather name="pie-chart" size={36} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No spending this month</Text>
        </View>
      ) : (
        <View style={[styles.spendCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.spendCardTitle, { color: colors.foreground }]}>
            {MONTHS[currentMonth]} Spending Breakdown
          </Text>
          {categorySpend.map(([cat, amt]) => {
            const pct = total > 0 ? (amt / total) * 100 : 0;
            const color = CATEGORY_COLORS[cat] || colors.primary;
            return (
              <View key={cat} style={styles.catRow}>
                <View style={styles.catLabel}>
                  <View style={[styles.catDot, { backgroundColor: color }]} />
                  <Text style={[styles.catName, { color: colors.foreground }]}>{cat}</Text>
                </View>
                <View style={styles.catBarContainer}>
                  <View style={[styles.catBarBg, { backgroundColor: color + "25" }]}>
                    <View style={[styles.catBarFill, { backgroundColor: color, width: `${Math.min(pct, 100)}%` as any }]} />
                  </View>
                </View>
                <Text style={[styles.catAmount, { color: colors.foreground }]}>${amt.toFixed(0)}</Text>
              </View>
            );
          })}
          <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
            <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>Total</Text>
            <Text style={[styles.totalAmount, { color: colors.foreground }]}>${total.toFixed(2)}</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function TrendsTab({ transactions, colors }: { transactions: Transaction[]; colors: any }) {
  const year = new Date().getFullYear();
  const monthData = useMemo(() => getMonthData(transactions, year), [transactions, year]);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 14 }}>
      <View style={[styles.trendCard, { backgroundColor: colors.card }]}>
        <Text style={[styles.spendCardTitle, { color: colors.foreground }]}>Monthly Income vs Expense</Text>
        {monthData.map((m, idx) => {
          const net = m.income - m.expense;
          const isPositive = net >= 0;
          return (
            <View key={m.label} style={styles.trendRow}>
              <Text style={[styles.trendMonth, { color: colors.mutedForeground }]}>{m.label}</Text>
              <View style={styles.trendBars}>
                <View style={[styles.trendBar, { backgroundColor: "#4caf5040", flex: 1 }]}>
                  {m.income > 0 && (
                    <View style={[styles.trendBarFill, { backgroundColor: "#4caf50", width: "100%" }]} />
                  )}
                </View>
                <View style={[styles.trendBar, { backgroundColor: "#f9731640", flex: 1 }]}>
                  {m.expense > 0 && (
                    <View style={[styles.trendBarFill, { backgroundColor: "#f97316", width: "100%" }]} />
                  )}
                </View>
              </View>
              <Text style={[styles.trendNet, { color: isPositive ? "#4caf50" : "#f97316" }]}>
                {isPositive ? "+" : "-"}${Math.abs(net).toFixed(0)}
              </Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const TX_FILTERS = ["All", "Income", "Expense"];

function TransactionsTab({ transactions, colors }: { transactions: Transaction[]; colors: any }) {
  const [filter, setFilter] = useState("All");
  const [showAdd, setShowAdd] = useState(false);

  const filtered = useMemo(() => {
    if (filter === "Income") return transactions.filter((t) => t.type === "income");
    if (filter === "Expense") return transactions.filter((t) => t.type === "expense");
    return transactions;
  }, [transactions, filter]);

  const grouped = useMemo(() => {
    const groups: { date: string; items: Transaction[] }[] = [];
    filtered.forEach((t) => {
      const date = new Date(t.date).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      const existing = groups.find((g) => g.date === date);
      if (existing) existing.items.push(t);
      else groups.push({ date, items: [t] });
    });
    return groups;
  }, [filtered]);

  type FlatItem = { type: "header"; date: string } | { type: "item"; transaction: Transaction };
  const flatData: FlatItem[] = grouped.flatMap((g) => [
    { type: "header" as const, date: g.date },
    ...g.items.map((t) => ({ type: "item" as const, transaction: t })),
  ]);

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.txFilterRow}>
        {TX_FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[
              styles.txFilterChip,
              { backgroundColor: filter === f ? colors.primary : colors.card, borderColor: filter === f ? colors.primary : colors.border },
            ]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.txFilterText, { color: filter === f ? "#fff" : colors.mutedForeground }]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={flatData}
        keyExtractor={(item, i) =>
          item.type === "header" ? `h-${item.date}` : `t-${item.transaction.id}`
        }
        renderItem={({ item }) => {
          if (item.type === "header") {
            return <Text style={[styles.dateHeader, { color: colors.mutedForeground }]}>{item.date}</Text>;
          }
          return <TransactionItem transaction={item.transaction} onPress={() => {}} />;
        }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: Platform.OS === "web" ? 34 + 84 : 120 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={[styles.emptyBox, { backgroundColor: colors.card, marginTop: 24 }]}>
            <Feather name="inbox" size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No transactions found</Text>
          </View>
        }
      />

      <AddTransactionModal visible={showAdd} onClose={() => setShowAdd(false)} />
    </View>
  );
}

export default function InsightsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { transactions } = useApp();
  const [activeTab, setActiveTab] = useState<Subtab>("CASH FLOW");
  const [chartView, setChartView] = useState<ChartView>("Chart");
  const [showAdd, setShowAdd] = useState(false);
  const currentMonthIdx = new Date().getMonth();
  const [currentMonth, setCurrentMonth] = useState(currentMonthIdx);

  const topPaddingWeb = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPaddingWeb + 8, backgroundColor: colors.background }]}>
        <TouchableOpacity style={styles.headerIcon}>
          <Feather name="menu" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Insights</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={[styles.gearBtn, { backgroundColor: colors.muted }]}>
            <Feather name="settings" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIcon}>
            <Feather name="sliders" size={20} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIcon}>
            <Feather name="download" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Subtabs */}
      <View style={[styles.subtabRow, { borderBottomColor: colors.border }]}>
        {SUBTABS.map((tab) => (
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
            >
              {tab}
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
          />
        )}
        {activeTab === "SPENDING" && (
          <SpendingTab transactions={transactions} colors={colors} currentMonth={currentMonth} />
        )}
        {activeTab === "TRENDS" && (
          <TrendsTab transactions={transactions} colors={colors} />
        )}
        {activeTab === "TRANSACTIONS" && (
          <TransactionsTab transactions={transactions} colors={colors} />
        )}
      </View>

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { borderColor: colors.primary }]}
        onPress={() => setShowAdd(true)}
      >
        <Feather name="plus" size={24} color={colors.primary} />
      </TouchableOpacity>

      <AddTransactionModal visible={showAdd} onClose={() => setShowAdd(false)} />
    </View>
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
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
  },

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

  trendCard: {
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  trendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  trendMonth: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    width: 28,
  },
  trendBars: {
    flex: 1,
    flexDirection: "row",
    gap: 4,
    height: 12,
  },
  trendBar: {
    borderRadius: 3,
    overflow: "hidden",
    height: 12,
  },
  trendBarFill: {
    height: 12,
    borderRadius: 3,
  },
  trendNet: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    width: 56,
    textAlign: "right",
  },

  txFilterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
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
});
