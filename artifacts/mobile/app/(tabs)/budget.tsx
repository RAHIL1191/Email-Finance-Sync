import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useMemo, useRef, useState } from "react";
import {
  Alert,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { Budget, Goal, useApp } from "@/context/AppContext";
import { useDrawer } from "@/context/DrawerContext";
import { useColors } from "@/hooks/useColors";
import { parseLocalDate } from "@/hooks/useLocalDate";
import CategoryPickerModal from "@/components/CategoryPickerModal";

// ─── Constants ────────────────────────────────────────────────────────────────
const PERIOD_OPTIONS = ["weekly", "monthly", "yearly"] as const;
const PERIOD_LABELS: Record<string, string> = { weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" };
const BUDGET_COLORS = ["#6366f1", "#f97316", "#10b981", "#ef4444", "#3b82f6", "#8b5cf6", "#f59e0b", "#14b8a6", "#ec4899", "#64748b"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getMonthRange(year: number, month: number) {
  const start = new Date(year, month, 1).toISOString().slice(0, 10);
  const end = new Date(year, month + 1, 0).toISOString().slice(0, 10) + "T23:59:59";
  return { start, end };
}

function spentForBudget(budget: Budget, transactions: ReturnType<typeof useApp>["transactions"], year: number, month: number): number {
  const { start, end } = getMonthRange(year, month);
  return transactions
    .filter((t) => {
      if (t.type !== budget.type) return false;
      if (t.date < start || t.date > end) return false;
      if (budget.category) return t.category.toLowerCase().includes(budget.category.toLowerCase()) || budget.category.toLowerCase().includes(t.category.toLowerCase());
      return true;
    })
    .reduce((s, t) => s + t.amount, 0);
}

// ─── Percent Slider (no external lib needed) ─────────────────────────────────
function PercentSlider({ value, onChange, color }: { value: number; onChange: (v: number) => void; color: string }) {
  const widthRef = useRef(0);
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const pct = Math.round(Math.max(0, Math.min(100, (e.nativeEvent.locationX / widthRef.current) * 100)));
        onChange(pct);
      },
      onPanResponderMove: (e) => {
        const pct = Math.round(Math.max(0, Math.min(100, (e.nativeEvent.locationX / widthRef.current) * 100)));
        onChange(pct);
      },
    })
  ).current;

  return (
    <View
      style={fs.sliderTrack}
      onLayout={(e) => { widthRef.current = e.nativeEvent.layout.width; }}
      {...panResponder.panHandlers}
    >
      <View style={[fs.sliderFill, { width: `${value}%` as any, backgroundColor: color }]} />
      <View style={[fs.sliderThumb, { left: `${Math.max(0, value - 1)}%` as any, backgroundColor: color }]} />
    </View>
  );
}

// ─── Account picker for budget (multi-select) ─────────────────────────────────
function AccountPickerForBudget({
  visible, selected, onToggle, onClose,
}: {
  visible: boolean; selected: string[]; onToggle: (id: string) => void; onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { accounts } = useApp();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={fs.overlay} activeOpacity={1} onPress={onClose} />
      <View style={[fs.pickerSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
        <View style={[fs.pickerHeader, { borderBottomColor: colors.border }]}>
          <Text style={[fs.pickerTitle, { color: colors.foreground }]}>Select Accounts</Text>
          <TouchableOpacity onPress={onClose} hitSlop={10}><Feather name="x" size={20} color={colors.foreground} /></TouchableOpacity>
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>
          {accounts.map((a) => {
            const checked = selected.includes(a.id);
            return (
              <TouchableOpacity key={a.id} style={[fs.pickerRow, { borderBottomColor: colors.border }]} onPress={() => onToggle(a.id)}>
                <View style={[fs.accDot, { backgroundColor: a.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[fs.pickerOption, { color: checked ? colors.primary : colors.foreground }]}>{a.name}</Text>
                  <Text style={[fs.pickerSub, { color: colors.mutedForeground }]}>{a.type} · ${a.balance.toFixed(2)}</Text>
                </View>
                <View style={[fs.checkbox, { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : "transparent" }]}>
                  {checked && <Feather name="check" size={12} color="#fff" />}
                </View>
              </TouchableOpacity>
            );
          })}
          {accounts.length === 0 && <Text style={[fs.emptyPicker, { color: colors.mutedForeground }]}>No accounts yet</Text>}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Add / Edit Budget Sheet ──────────────────────────────────────────────────
function BudgetFormSheet({
  visible,
  initial,
  onClose,
  onSave,
  scopeLabel,
}: {
  visible: boolean;
  initial: Budget | null;
  onClose: () => void;
  onSave: (data: Omit<Budget, "id" | "createdAt" | "updatedAt">) => void;
  scopeLabel?: string;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [step, setStep]       = useState<"type" | "form">(initial ? "form" : "type");
  const [type, setType]       = useState<"expense" | "income">(initial?.type ?? "expense");
  const [name, setName]       = useState(initial?.name ?? "");
  const [amount, setAmount]   = useState(initial ? String(initial.amount) : "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [period, setPeriod]   = useState<"weekly" | "monthly" | "yearly">(initial?.period ?? "monthly");
  const [rollover, setRollover] = useState(false);
  const [alertPct, setAlertPct] = useState(70);
  const [includeInOverall, setIncludeInOverall] = useState(initial?.includeInOverall ?? true);
  const [color, setColor]     = useState(initial?.color ?? BUDGET_COLORS[0]);
  const [showCatPicker,    setShowCatPicker]    = useState(false);
  const [showPeriodPicker, setShowPeriodPicker] = useState(false);
  const [showAccPicker,    setShowAccPicker]    = useState(false);

  React.useEffect(() => {
    if (visible) {
      setStep(initial ? "form" : "type");
      setType(initial?.type ?? "expense");
      setName(initial?.name ?? "");
      setAmount(initial ? String(initial.amount) : "");
      setCategory(initial?.category ?? "");
      setSelectedAccountIds([]);
      setPeriod(initial?.period ?? "monthly");
      setRollover(false);
      setAlertPct(initial?.alertPct ?? 70);
      setIncludeInOverall(initial?.includeInOverall ?? true);
      setColor(initial?.color ?? BUDGET_COLORS[0]);
    }
  }, [visible, initial?.id]);

  const handleTypeSelect = (t: "expense" | "income") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setType(t);
    setStep("form");
  };

  const save = () => {
    if (!name.trim()) { Alert.alert("Missing Name", "Please enter a budget name."); return; }
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) { Alert.alert("Invalid Amount", "Please enter a valid amount."); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave({ name: name.trim(), amount: parsed, category: category || undefined, type, period, includeInOverall, color, alertPct });
    onClose();
  };

  const now = new Date();
  const repeatLabel = period === "weekly" ? "Repeats Every Week" : period === "yearly" ? "Repeats Every Year" : "Repeats Every Month";
  const startLabel  = `Starting ${MONTH_NAMES[now.getMonth()]} ${now.getDate()}`;
  const goBack = () => { if (step === "form" && !initial) setStep("type"); else onClose(); };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={goBack}>
      <View style={[fs.container, { backgroundColor: colors.background }]}>

        {/* ── Header ── */}
        <View style={[fs.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity onPress={goBack} hitSlop={12}>
            <Feather name="arrow-left" size={22} color={colors.primary} />
          </TouchableOpacity>
          <Text style={[fs.headerTitle, { color: colors.foreground }]}>
            {initial ? "Edit Budget" : "Create Budget"}
          </Text>
          <View style={{ width: 22 }} />
        </View>

        {step === "type" ? (
          /* ── Step 1: Type selection ── */
          <View style={fs.typeSelBody}>
            <TouchableOpacity
              style={[fs.typeBigCard, { borderColor: colors.border }]}
              onPress={() => handleTypeSelect("expense")}
              activeOpacity={0.75}
            >
              <Text style={[fs.typeBigTitle, { color: colors.foreground }]}>Expense Budget</Text>
              <View style={[fs.typeBigIconWrap, { backgroundColor: "#1c1c1c" }]}>
                <Feather name="arrow-up" size={26} color="#f97316" />
              </View>
              <Text style={[fs.typeBigDesc, { color: colors.mutedForeground }]}>
                Track and control where your money goes.
              </Text>
            </TouchableOpacity>

            <Text style={[fs.orSep, { color: colors.mutedForeground }]}>OR</Text>

            <TouchableOpacity
              style={[fs.typeBigCard, { borderColor: colors.border }]}
              onPress={() => handleTypeSelect("income")}
              activeOpacity={0.75}
            >
              <Text style={[fs.typeBigTitle, { color: colors.foreground }]}>Income Budget</Text>
              <View style={[fs.typeBigIconWrap, { backgroundColor: "#1c1c1c" }]}>
                <Feather name="arrow-down" size={26} color="#10b981" />
              </View>
              <Text style={[fs.typeBigDesc, { color: colors.mutedForeground }]}>
                Plan and manage your income streams.
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* ── Step 2: Form ── */
          <>
            {/* Type label + scope */}
            <Text style={[fs.typeLabel, { color: colors.mutedForeground }]}>
              Type{" "}<Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>
                {type === "expense" ? "Expense" : "Income"}
              </Text>
            </Text>

            {scopeLabel ? (
              <View style={[fs.scopeRow, { backgroundColor: colors.card }]}>
                <Text style={[fs.scopeText, { color: colors.foreground }]}>{scopeLabel}</Text>
              </View>
            ) : null}

            <KeyboardAwareScrollView
              contentContainerStyle={[fs.formBody, { paddingBottom: insets.bottom + 110 }]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Budget Name */}
              <View style={[fs.formRow, { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                <View style={[fs.formIcon, { backgroundColor: colors.primary }]}>
                  <Feather name="shopping-bag" size={18} color="#fff" />
                </View>
                <TextInput
                  style={[fs.formInput, { color: colors.foreground }]}
                  placeholder="Budget Name"
                  placeholderTextColor={colors.mutedForeground}
                  value={name}
                  onChangeText={setName}
                />
                <Feather name="camera" size={18} color={colors.mutedForeground} />
              </View>

              {/* Budget Amount */}
              <View style={[fs.formRow, { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                <View style={[fs.formIcon, { backgroundColor: colors.primary }]}>
                  <Feather name="dollar-sign" size={18} color="#fff" />
                </View>
                <TextInput
                  style={[fs.formInput, { color: colors.foreground }]}
                  placeholder="Budget Amount"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                  value={amount}
                  onChangeText={setAmount}
                />
              </View>

              {/* Repeat / Period */}
              <TouchableOpacity
                style={[fs.formRow, { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
                onPress={() => setShowPeriodPicker(true)}
              >
                <View style={[fs.formIcon, { backgroundColor: colors.primary }]}>
                  <Feather name="refresh-cw" size={18} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[fs.formRowPrimary, { color: colors.foreground }]}>{repeatLabel}</Text>
                  <Text style={[fs.formRowSecondary, { color: colors.mutedForeground }]}>{startLabel}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>

              {/* Select Categories */}
              <TouchableOpacity
                style={[fs.formRow, { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: "flex-start", paddingTop: 14 }]}
                onPress={() => setShowCatPicker(true)}
              >
                <View style={[fs.formIcon, { backgroundColor: colors.primary, marginTop: 2 }]}>
                  <Feather name="grid" size={18} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[fs.formRowPrimary, { color: category ? colors.foreground : colors.mutedForeground }]}>
                    {category || "Select Categories"}
                  </Text>
                  <Text style={[fs.formRowHint, { color: colors.mutedForeground }]}>
                    All categories are included if not selected any.
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} style={{ marginTop: 2 }} />
              </TouchableOpacity>

              {/* Select Accounts */}
              <TouchableOpacity
                style={[fs.formRow, { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: "flex-start", paddingTop: 14 }]}
                onPress={() => setShowAccPicker(true)}
              >
                <View style={[fs.formIcon, { backgroundColor: colors.primary, marginTop: 2 }]}>
                  <Feather name="home" size={18} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[fs.formRowPrimary, { color: selectedAccountIds.length > 0 ? colors.foreground : colors.mutedForeground }]}>
                    {selectedAccountIds.length > 0 ? `${selectedAccountIds.length} account(s) selected` : "Select Accounts"}
                  </Text>
                  <Text style={[fs.formRowHint, { color: colors.mutedForeground }]}>
                    All accounts are included if not selected any.
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} style={{ marginTop: 2 }} />
              </TouchableOpacity>

              {/* Rollover */}
              <View style={[fs.formRow, { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                <View style={[fs.formIcon, { backgroundColor: colors.primary }]}>
                  <Feather name="arrow-right-circle" size={18} color="#fff" />
                </View>
                <Text style={[fs.formRowPrimary, { flex: 1, color: colors.foreground }]}>Rollover budget amount</Text>
                <View style={[fs.infoBtn, { borderColor: colors.border }]}>
                  <Text style={[fs.infoBtnText, { color: colors.mutedForeground }]}>i</Text>
                </View>
                <Switch value={rollover} onValueChange={setRollover}
                  trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#fff" />
              </View>

              {/* Alert slider — expense only */}
              {type === "expense" && (
                <View style={[fs.formRow, { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "column", alignItems: "stretch", gap: 14, paddingVertical: 16 }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View style={[fs.formIcon, { backgroundColor: colors.primary }]}>
                      <Feather name="bell" size={18} color="#fff" />
                    </View>
                    <Text style={[fs.formRowPrimary, { flex: 1, color: colors.foreground }]}>
                      Alert me when expense reaches{" "}
                      <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold" }}>{alertPct}%</Text>
                      {" "}of budget
                    </Text>
                  </View>
                  <PercentSlider value={alertPct} onChange={setAlertPct} color={colors.primary} />
                </View>
              )}
            </KeyboardAwareScrollView>

            {/* ── Bottom bar ── */}
            <View style={[fs.bottomBar, { borderTopColor: colors.border, paddingBottom: insets.bottom + 10, backgroundColor: colors.background }]}>
              <View style={fs.bottomActions}>
                {[
                  { icon: "share-2" },
                  { icon: "edit-2" },
                  { icon: "bell" },
                ].map(({ icon }) => (
                  <TouchableOpacity key={icon} style={[fs.bottomActionBtn, { backgroundColor: colors.card }]}>
                    <Feather name={icon as any} size={18} color={colors.foreground} />
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={[fs.nextBtn, { backgroundColor: colors.primary }]} onPress={save}>
                <Text style={fs.nextBtnText}>NEXT  ›</Text>
              </TouchableOpacity>
            </View>

            {/* Pickers */}
            <CategoryPickerModal
              visible={showCatPicker}
              onClose={() => setShowCatPicker(false)}
              onSelect={(cat, sub) => setCategory(sub ? `${cat} - ${sub}` : cat)}
              type={type}
            />

            <AccountPickerForBudget
              visible={showAccPicker}
              selected={selectedAccountIds}
              onToggle={(id) => setSelectedAccountIds((prev) => prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id])}
              onClose={() => setShowAccPicker(false)}
            />

            <Modal visible={showPeriodPicker} transparent animationType="slide" onRequestClose={() => setShowPeriodPicker(false)}>
              <TouchableOpacity style={fs.overlay} activeOpacity={1} onPress={() => setShowPeriodPicker(false)} />
              <View style={[fs.pickerSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
                <View style={[fs.pickerHeader, { borderBottomColor: colors.border }]}>
                  <Text style={[fs.pickerTitle, { color: colors.foreground }]}>Repeat Period</Text>
                  <TouchableOpacity onPress={() => setShowPeriodPicker(false)} hitSlop={10}>
                    <Feather name="x" size={20} color={colors.foreground} />
                  </TouchableOpacity>
                </View>
                {PERIOD_OPTIONS.map((opt) => (
                  <TouchableOpacity key={opt} style={[fs.pickerRow, { borderBottomColor: colors.border }]}
                    onPress={() => { setPeriod(opt); setShowPeriodPicker(false); }}>
                    <Text style={[fs.pickerOption, { color: period === opt ? colors.primary : colors.foreground }]}>{PERIOD_LABELS[opt]}</Text>
                    {period === opt && <Feather name="check" size={18} color={colors.primary} />}
                  </TouchableOpacity>
                ))}
              </View>
            </Modal>
          </>
        )}
      </View>
    </Modal>
  );
}

const fs = StyleSheet.create({
  container:       { flex: 1 },
  overlay:         { flex: 1 },

  header:          { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 16 },
  headerTitle:     { flex: 1, textAlign: "center", fontSize: 20, fontFamily: "Inter_700Bold" },

  // ── Step 1 ──
  typeSelBody:     { flex: 1, paddingHorizontal: 20, paddingTop: 32, gap: 0, justifyContent: "center" },
  typeBigCard:     { borderWidth: 1, borderRadius: 14, paddingVertical: 28, paddingHorizontal: 24, alignItems: "center", gap: 14 },
  typeBigTitle:    { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  typeBigIconWrap: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  typeBigDesc:     { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  orSep:           { textAlign: "center", fontSize: 15, fontFamily: "Inter_500Medium", marginVertical: 16 },

  // ── Step 2 ──
  typeLabel:       { textAlign: "center", fontSize: 14, fontFamily: "Inter_400Regular", paddingBottom: 12 },
  formBody:        { paddingTop: 4 },
  formRow:         { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18, paddingVertical: 14 },
  formIcon:        { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  formInput:       { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular" },
  formRowPrimary:  { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  formRowSecondary:{ fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  formRowHint:     { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 3, lineHeight: 16 },
  infoBtn:         { width: 22, height: 22, borderRadius: 11, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  infoBtnText:     { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  scopeRow:         { marginHorizontal: 16, marginBottom: 2, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  scopeText:        { fontSize: 14, fontFamily: "Inter_400Regular" },

  // Slider
  sliderTrack:     { height: 6, borderRadius: 3, backgroundColor: "#333", marginHorizontal: 52, marginTop: 2 },
  sliderFill:      { height: "100%", borderRadius: 3 },
  sliderThumb:     { position: "absolute", top: -7, width: 20, height: 20, borderRadius: 10, marginLeft: -10 },

  // Bottom bar
  bottomBar:       { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingTop: 12, gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  bottomActions:   { flexDirection: "row", gap: 8 },
  bottomActionBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  nextBtn:         { flex: 1, height: 48, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  nextBtnText:     { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 0.5 },

  // GoalFormSheet reuses these
  saveText:         { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  body:             { paddingHorizontal: 16, paddingTop: 20, gap: 14 },
  card:             { borderRadius: 16, overflow: "hidden" },
  row:              { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  rowIcon:          { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowLabel:         { fontSize: 15, fontFamily: "Inter_500Medium" },
  amountInput:      { flex: 1, fontSize: 22, fontFamily: "Inter_700Bold" },
  textInput:        { fontSize: 15, fontFamily: "Inter_400Regular" },
  colorRow:         { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  colorDot:         { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  colorDotSelected: { transform: [{ scale: 1.15 }] },

  // Shared picker sheet
  pickerSheet:  { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "55%" },
  pickerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  pickerTitle:  { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  pickerRow:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  pickerOption: { fontSize: 15, fontFamily: "Inter_500Medium" },
  pickerSub:    { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  accDot:       { width: 10, height: 10, borderRadius: 5 },
  emptyPicker:  { textAlign: "center", padding: 24, fontFamily: "Inter_400Regular" },
  checkbox:     { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },
});

// ─── Add / Edit Goal Sheet ────────────────────────────────────────────────────
function GoalFormSheet({
  visible,
  initial,
  onClose,
  onSave,
}: {
  visible: boolean;
  initial: Goal | null;
  onClose: () => void;
  onSave: (data: Omit<Goal, "id" | "createdAt" | "updatedAt">) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState(initial?.name ?? "");
  const [target, setTarget] = useState(initial ? String(initial.targetAmount) : "");
  const [current, setCurrent] = useState(initial ? String(initial.currentAmount) : "0");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [color, setColor] = useState(initial?.color ?? BUDGET_COLORS[2]);
  const [targetDate, setTargetDate] = useState(initial?.targetDate ?? "");

  React.useEffect(() => {
    if (visible) {
      setName(initial?.name ?? "");
      setTarget(initial ? String(initial.targetAmount) : "");
      setCurrent(initial ? String(initial.currentAmount) : "0");
      setNotes(initial?.notes ?? "");
      setColor(initial?.color ?? BUDGET_COLORS[2]);
      setTargetDate(initial?.targetDate ?? "");
    }
  }, [visible, initial?.id]);

  const save = () => {
    if (!name.trim()) { Alert.alert("Missing Name", "Please enter a goal name."); return; }
    const parsedTarget = parseFloat(target);
    if (isNaN(parsedTarget) || parsedTarget <= 0) { Alert.alert("Invalid Amount", "Please enter a valid target amount."); return; }
    const parsedCurrent = parseFloat(current) || 0;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave({ name: name.trim(), targetAmount: parsedTarget, currentAmount: parsedCurrent, notes: notes || undefined, color, targetDate: targetDate || undefined });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[fs.container, { backgroundColor: colors.background }]}>
        <View style={[fs.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} hitSlop={12}><Feather name="x" size={22} color={colors.mutedForeground} /></TouchableOpacity>
          <Text style={[fs.headerTitle, { color: colors.foreground }]}>{initial ? "Edit Goal" : "New Goal"}</Text>
          <TouchableOpacity onPress={save} hitSlop={12}><Text style={[fs.saveText, { color: colors.primary }]}>Save</Text></TouchableOpacity>
        </View>
        <KeyboardAwareScrollView contentContainerStyle={[fs.body, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          <View style={[fs.card, { backgroundColor: colors.card }]}>
            <View style={[fs.row, { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
              <View style={[fs.rowIcon, { backgroundColor: colors.accent }]}><Feather name="target" size={18} color={colors.primary} /></View>
              <TextInput style={[fs.amountInput, { color: colors.foreground }]} placeholder="Target amount" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" value={target} onChangeText={setTarget} />
            </View>
            <View style={[fs.row, { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
              <View style={[fs.rowIcon, { backgroundColor: colors.accent }]}><Feather name="flag" size={18} color={colors.primary} /></View>
              <TextInput style={[fs.textInput, { color: colors.foreground, flex: 1 }]} placeholder="Goal name (required)" placeholderTextColor={colors.mutedForeground} value={name} onChangeText={setName} />
            </View>
            <View style={[fs.row, { borderBottomWidth: 0 }]}>
              <View style={[fs.rowIcon, { backgroundColor: colors.accent }]}><Feather name="dollar-sign" size={18} color={colors.primary} /></View>
              <TextInput style={[fs.textInput, { color: colors.foreground, flex: 1 }]} placeholder="Amount saved so far" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" value={current} onChangeText={setCurrent} />
            </View>
          </View>

          <View style={[fs.card, { backgroundColor: colors.card }]}>
            <View style={[fs.row, { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
              <View style={[fs.rowIcon, { backgroundColor: colors.accent }]}><Feather name="calendar" size={18} color={colors.primary} /></View>
              <TextInput style={[fs.textInput, { color: colors.foreground, flex: 1 }]} placeholder="Target date (YYYY-MM-DD, optional)" placeholderTextColor={colors.mutedForeground} value={targetDate} onChangeText={setTargetDate} />
            </View>
            <View style={[fs.row, { borderBottomWidth: 0, alignItems: "flex-start", paddingTop: 14 }]}>
              <View style={[fs.rowIcon, { backgroundColor: colors.accent, marginTop: 2 }]}><Feather name="file-text" size={18} color={colors.primary} /></View>
              <TextInput style={[fs.textInput, { color: colors.foreground, flex: 1, minHeight: 56 }]} placeholder="Notes (optional)" placeholderTextColor={colors.mutedForeground} value={notes} onChangeText={setNotes} multiline />
            </View>
          </View>

          <View style={[fs.card, { backgroundColor: colors.card }]}>
            <View style={[fs.row, { borderBottomWidth: 0 }]}>
              <View style={[fs.rowIcon, { backgroundColor: colors.accent }]}><Feather name="droplet" size={18} color={colors.primary} /></View>
              <Text style={[fs.rowLabel, { flex: 1, color: colors.foreground }]}>Color</Text>
              <View style={fs.colorRow}>
                {BUDGET_COLORS.map((c) => (
                  <TouchableOpacity key={c} style={[fs.colorDot, { backgroundColor: c }, color === c && fs.colorDotSelected]} onPress={() => setColor(c)}>
                    {color === c && <Feather name="check" size={12} color="#fff" />}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}

// ─── Budget Row ───────────────────────────────────────────────────────────────
function BudgetRow({ budget, spent, onPress }: { budget: Budget; spent: number; onPress: () => void }) {
  const colors = useColors();
  const pct = budget.amount > 0 ? Math.min(spent / budget.amount, 1) : 0;
  const isOver = spent > budget.amount;
  const barColor = isOver ? colors.expense : (budget.color ?? colors.primary);

  return (
    <TouchableOpacity style={[s.budgetRow, { backgroundColor: colors.card }]} onPress={onPress} activeOpacity={0.75}>
      <View style={s.budgetRowTop}>
        <View style={[s.budgetIcon, { backgroundColor: (budget.color ?? colors.primary) + "22" }]}>
          <Feather name="shopping-bag" size={18} color={budget.color ?? colors.primary} />
        </View>
        <Text style={[s.budgetName, { color: colors.foreground }]}>{budget.name}</Text>
        <Text style={[s.budgetAmount, { color: colors.foreground }]}>${budget.amount.toLocaleString()}</Text>
      </View>
      <View style={[s.barTrack, { backgroundColor: colors.border }]}>
        <View style={[s.barFill, { width: `${pct * 100}%` as any, backgroundColor: barColor }]} />
        {pct < 1 && (
          <View style={[s.barMarker, { left: `${pct * 100}%` as any, borderTopColor: colors.primary }]} />
        )}
      </View>
      <View style={s.budgetRowBottom}>
        <Text style={[s.budgetSpent, { color: isOver ? colors.expense : colors.mutedForeground }]}>
          Spent ${spent.toFixed(0)} of ${budget.amount.toLocaleString()}
        </Text>
        <Text style={[s.budgetPct, { color: isOver ? colors.expense : colors.mutedForeground }]}>
          {(pct * 100).toFixed(1)}%
        </Text>
        <Text style={[s.budgetPeriod, { color: colors.mutedForeground }]}>{PERIOD_LABELS[budget.period]}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Goal Card ────────────────────────────────────────────────────────────────
function GoalCard({ goal, onPress }: { goal: Goal; onPress: () => void }) {
  const colors = useColors();
  const pct = goal.targetAmount > 0 ? Math.min(goal.currentAmount / goal.targetAmount, 1) : 0;
  const remaining = Math.max(goal.targetAmount - goal.currentAmount, 0);
  const barColor = goal.color ?? colors.primary;

  return (
    <TouchableOpacity style={[s.goalCard, { backgroundColor: colors.card }]} onPress={onPress} activeOpacity={0.75}>
      <View style={s.goalCardTop}>
        <View style={[s.goalIcon, { backgroundColor: barColor + "22" }]}>
          <Feather name="target" size={20} color={barColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.goalName, { color: colors.foreground }]}>{goal.name}</Text>
          {goal.targetDate && (
            <Text style={[s.goalDate, { color: colors.mutedForeground }]}>Target: {goal.targetDate}</Text>
          )}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={[s.goalTarget, { color: colors.foreground }]}>${goal.targetAmount.toLocaleString()}</Text>
          <Text style={[s.goalPct, { color: barColor }]}>{(pct * 100).toFixed(0)}%</Text>
        </View>
      </View>
      <View style={[s.barTrack, { backgroundColor: colors.border, marginTop: 10 }]}>
        <View style={[s.barFill, { width: `${pct * 100}%` as any, backgroundColor: barColor }]} />
      </View>
      <View style={s.goalCardBottom}>
        <Text style={[s.goalSaved, { color: colors.mutedForeground }]}>Saved ${goal.currentAmount.toLocaleString()}</Text>
        <Text style={[s.goalRemaining, { color: colors.mutedForeground }]}>
          {remaining > 0 ? `$${remaining.toLocaleString()} to go` : "Goal reached! 🎉"}
        </Text>
      </View>
      {goal.notes ? <Text style={[s.goalNotes, { color: colors.mutedForeground }]} numberOfLines={2}>{goal.notes}</Text> : null}
    </TouchableOpacity>
  );
}

// ─── Budget Detail Sheet ──────────────────────────────────────────────────────
function BudgetDetailSheet({
  visible, budget, transactions, initialYear, initialMonth, onClose, onEdit, onOptions,
}: {
  visible: boolean;
  budget: Budget | null;
  transactions: ReturnType<typeof useApp>["transactions"];
  initialYear: number;
  initialMonth: number;
  onClose: () => void;
  onEdit: () => void;
  onOptions: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [year, setYear]   = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);

  React.useEffect(() => {
    if (visible) { setYear(initialYear); setMonth(initialMonth); }
  }, [visible, initialYear, initialMonth]);

  if (!budget) return null;

  const spent     = spentForBudget(budget, transactions, year, month);
  const remaining = Math.max(budget.amount - spent, 0);
  const pct       = budget.amount > 0 ? Math.min(spent / budget.amount, 1) : 0;
  const isOver    = spent > budget.amount;
  const barColor  = isOver ? "#ef4444" : (budget.color ?? colors.primary);

  const now = new Date();
  const isCurrentMonth  = year === now.getFullYear() && month === now.getMonth();
  const daysInMonth     = new Date(year, month + 1, 0).getDate();
  const todayPct        = isCurrentMonth ? now.getDate() / daysInMonth : -1;

  const fmt = (d: Date) =>
    `${d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}, ` +
    `${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

  const prevMon = () => { if (month === 0) { setYear((y) => y - 1); setMonth(11); } else setMonth((m) => m - 1); };
  const nextMon = () => { if (month === 11) { setYear((y) => y + 1); setMonth(0); } else setMonth((m) => m + 1); };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={[ds.root, { backgroundColor: colors.background }]} edges={["top"]}>

        {/* Header */}
        <View style={[ds.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Feather name="arrow-left" size={22} color={colors.primary} />
          </TouchableOpacity>
          <Text style={[ds.headerTitle, { color: colors.foreground }]}>Budget</Text>
          <View style={ds.headerRight}>
            <TouchableOpacity onPress={onEdit} hitSlop={10}>
              <Feather name="edit-2" size={20} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={onOptions} hitSlop={10}>
              <Feather name="more-vertical" size={20} color={colors.foreground} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView contentContainerStyle={[ds.body, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>

          {/* Month Nav */}
          <View style={ds.monthNav}>
            <TouchableOpacity onPress={prevMon} hitSlop={10}><Feather name="chevron-left" size={22} color={colors.foreground} /></TouchableOpacity>
            <Text style={[ds.monthLabel, { color: colors.foreground }]}>
              {MONTH_NAMES[month]}{year !== new Date().getFullYear() ? ` ${year}` : ""}
            </Text>
            <TouchableOpacity onPress={nextMon} hitSlop={10}><Feather name="chevron-right" size={22} color={colors.foreground} /></TouchableOpacity>
          </View>

          {/* Icon */}
          <View style={ds.iconRow}>
            <View style={[ds.bigIcon, { backgroundColor: (budget.color ?? colors.primary) + "22" }]}>
              <Feather name="shopping-bag" size={30} color={budget.color ?? colors.primary} />
            </View>
          </View>

          {/* Name + FAB */}
          <View style={ds.titleRow}>
            <Text style={[ds.budgetTitle, { color: colors.foreground }]}>{budget.name}</Text>
            <TouchableOpacity style={[ds.optsFab, { backgroundColor: "#22c55e" }]} onPress={onOptions}>
              <Feather name="more-horizontal" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
          <Text style={[ds.pctText, { color: colors.mutedForeground }]}>{(pct * 100).toFixed(1)}%</Text>

          {/* Progress Bar */}
          <View style={ds.progressWrap}>
            <View style={[ds.barTrack, { backgroundColor: colors.card }]}>
              <View style={[ds.barFill, { width: `${pct * 100}%` as any, backgroundColor: barColor }]} />
            </View>
            {todayPct > 0 && todayPct < 1 && (
              <View style={[ds.todayPin, { left: `${todayPct * 100}%` as any }]}>
                <Text style={[ds.todayText, { color: colors.mutedForeground }]}>Today</Text>
                <View style={[ds.todayTick, { backgroundColor: colors.mutedForeground }]} />
              </View>
            )}
          </View>
          <Text style={[ds.spentText, { color: colors.mutedForeground }]}>
            Spent ${spent.toFixed(0)} of ${budget.amount.toLocaleString()}
          </Text>

          {/* Remaining Card */}
          <View style={[ds.remainingCard, { backgroundColor: "#14532d" }]}>
            <View>
              <Text style={ds.remainingAmt}>${remaining.toLocaleString()}</Text>
              <Text style={ds.remainingLbl}>Remaining</Text>
            </View>
            <TouchableOpacity style={ds.moveBtn}>
              <Text style={ds.moveBtnTxt}>MOVE AMOUNT ›</Text>
            </TouchableOpacity>
          </View>

          {/* Info rows */}
          <View style={[ds.infoRow, { borderBottomColor: colors.border }]}>
            <Text style={[ds.infoLbl, { color: colors.foreground }]}>Budget</Text>
            <Text style={[ds.infoVal, { color: colors.foreground }]}>${budget.amount.toLocaleString()} ∨</Text>
          </View>
          <View style={[ds.infoRow, { borderBottomColor: colors.border }]}>
            <Text style={[ds.infoLbl, { color: colors.foreground }]}>Expenses</Text>
            <Text style={[ds.infoVal, { color: colors.foreground }]}>${spent.toFixed(0)}</Text>
          </View>

          {/* Timestamps */}
          <View style={ds.timestamps}>
            <Text style={[ds.tsText, { color: colors.mutedForeground }]}>Created On {fmt(parseLocalDate(budget.createdAt))}</Text>
            <Text style={[ds.tsText, { color: colors.mutedForeground }]}>Last updated {fmt(parseLocalDate(budget.updatedAt))}</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Budget Options Modal ─────────────────────────────────────────────────────
function BudgetOptionsModal({
  visible, budget, onClose, onDelete, onStop,
}: {
  visible: boolean;
  budget: Budget | null;
  onClose: () => void;
  onDelete: () => void;
  onStop: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [overspend, setOverspend] = useState(true);
  const [spendAlert, setSpendAlert] = useState(true);

  const now = new Date();
  const nextMon = MONTH_NAMES[(now.getMonth() + 1) % 12];

  if (!budget) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)" }} activeOpacity={1} onPress={onClose} />
      <View style={[om.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }]}>

        <View style={[om.header, { borderBottomColor: colors.border }]}>
          <Text style={[om.title, { color: colors.foreground }]}>Options</Text>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Feather name="x" size={22} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        <View style={om.body}>
          {/* Stop Budget */}
          <TouchableOpacity style={[om.actionBtn, { backgroundColor: colors.primary }]} onPress={onStop}>
            <Text style={om.actionBtnTxt}>Stop Budget</Text>
          </TouchableOpacity>
          <View style={om.hintRow}>
            <View style={[om.hintIcon, { borderColor: colors.mutedForeground }]}>
              <Text style={[om.hintIconTxt, { color: colors.mutedForeground }]}>i</Text>
            </View>
            <Text style={[om.hintTxt, { color: colors.mutedForeground }]}>
              This budget will not be available to track from {nextMon} 1
            </Text>
          </View>

          <View style={[om.divider, { backgroundColor: colors.border }]} />

          {/* Delete Budget */}
          <TouchableOpacity style={[om.actionBtn, { backgroundColor: colors.primary }]} onPress={onDelete}>
            <Text style={om.actionBtnTxt}>Delete Budget</Text>
          </TouchableOpacity>
          <View style={om.hintRow}>
            <View style={[om.hintIcon, { borderColor: colors.mutedForeground }]}>
              <Text style={[om.hintIconTxt, { color: colors.mutedForeground }]}>i</Text>
            </View>
            <Text style={[om.hintTxt, { color: colors.mutedForeground }]}>This budget will be deleted permanently.</Text>
          </View>

          <View style={[om.divider, { backgroundColor: colors.border }]} />

          {/* Alert toggles */}
          <View style={om.toggleRow}>
            <Text style={[om.toggleLbl, { color: colors.foreground }]}>Overspending alert</Text>
            <Switch value={overspend} onValueChange={setOverspend}
              trackColor={{ false: colors.border, true: "#22c55e" }} thumbColor="#fff" />
          </View>
          <View style={om.toggleRow}>
            <Text style={[om.toggleLbl, { color: colors.foreground }]}>Spending alert</Text>
            <Switch value={spendAlert} onValueChange={setSpendAlert}
              trackColor={{ false: colors.border, true: "#22c55e" }} thumbColor="#fff" />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Edit Scope Modal ─────────────────────────────────────────────────────────
function EditScopeModal({
  visible, month, onClose, onSelect,
}: {
  visible: boolean;
  month: number;
  onClose: () => void;
  onSelect: (scope: "this" | "all") => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const mn = MONTH_NAMES[month];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }} activeOpacity={1} onPress={onClose} />
      <View style={[es.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>

        <View style={[es.header, { borderBottomColor: colors.border }]}>
          <Text style={[es.title, { color: colors.foreground }]}>
            Edit all occurrences of this repeat entry, or this occurrence only?
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Feather name="x" size={22} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={[es.optRow, { borderBottomColor: colors.border }]} onPress={() => onSelect("this")}>
          <Text style={[es.optTitle, { color: colors.foreground }]}>This only</Text>
          <Text style={[es.optSub, { color: colors.mutedForeground }]}>Edit {mn} 1 occurrence only</Text>
        </TouchableOpacity>

        <TouchableOpacity style={es.optRow} onPress={() => onSelect("all")}>
          <Text style={[es.optTitle, { color: colors.foreground }]}>This & All future</Text>
          <Text style={[es.optSub, { color: colors.mutedForeground }]}>Edit {mn} 1 and all occurrences after this</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ─── Component Styles ─────────────────────────────────────────────────────────
const ds = StyleSheet.create({
  root:          { flex: 1 },
  header:        { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle:   { flex: 1, fontSize: 20, fontFamily: "Inter_700Bold", marginLeft: 8 },
  headerRight:   { flexDirection: "row", alignItems: "center", gap: 16 },
  body:          { paddingHorizontal: 16, gap: 16, paddingTop: 8 },
  monthNav:      { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 28, paddingVertical: 10 },
  monthLabel:    { fontSize: 20, fontFamily: "Inter_700Bold", minWidth: 80, textAlign: "center" },
  iconRow:       { alignItems: "center", paddingTop: 8 },
  bigIcon:       { width: 72, height: 72, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  titleRow:      { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 12, gap: 12 },
  budgetTitle:   { fontSize: 22, fontFamily: "Inter_700Bold" },
  optsFab:       { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  pctText:       { textAlign: "center", fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 2 },
  progressWrap:  { position: "relative", paddingBottom: 20 },
  barTrack:      { height: 12, borderRadius: 6, overflow: "hidden" },
  barFill:       { height: "100%", borderRadius: 6 },
  todayPin:      { position: "absolute", top: 14, alignItems: "center", transform: [{ translateX: -18 }] },
  todayText:     { fontSize: 11, fontFamily: "Inter_400Regular" },
  todayTick:     { width: 1, height: 6, marginTop: 1 },
  spentText:     { textAlign: "center", fontSize: 13, fontFamily: "Inter_400Regular", marginTop: -8 },
  remainingCard: { borderRadius: 14, padding: 20, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  remainingAmt:  { fontSize: 34, fontFamily: "Inter_700Bold", color: "#4ade80" },
  remainingLbl:  { fontSize: 14, fontFamily: "Inter_400Regular", color: "#86efac", marginTop: 2 },
  moveBtn:       { borderRadius: 20, borderWidth: 1, borderColor: "#4ade8055", paddingVertical: 6, paddingHorizontal: 12 },
  moveBtnTxt:    { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#4ade80" },
  infoRow:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  infoLbl:       { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  infoVal:       { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  timestamps:    { gap: 4, paddingTop: 4 },
  tsText:        { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
});

const om = StyleSheet.create({
  sheet:         { borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  header:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 18, borderBottomWidth: StyleSheet.hairlineWidth },
  title:         { fontSize: 18, fontFamily: "Inter_700Bold" },
  body:          { paddingHorizontal: 20, paddingTop: 18, gap: 12 },
  actionBtn:     { borderRadius: 12, height: 52, alignItems: "center", justifyContent: "center" },
  actionBtnTxt:  { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
  hintRow:       { flexDirection: "row", alignItems: "center", gap: 8 },
  hintIcon:      { width: 20, height: 20, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  hintIconTxt:   { fontSize: 11, fontFamily: "Inter_700Bold" },
  hintTxt:       { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  divider:       { height: StyleSheet.hairlineWidth, marginVertical: 6 },
  toggleRow:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 },
  toggleLbl:     { fontSize: 16, fontFamily: "Inter_500Medium" },
});

const es = StyleSheet.create({
  sheet:         { borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  header:        { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 20, paddingVertical: 18, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  title:         { flex: 1, fontSize: 16, fontFamily: "Inter_600SemiBold", lineHeight: 22 },
  optRow:        { paddingHorizontal: 20, paddingVertical: 18, borderBottomWidth: StyleSheet.hairlineWidth },
  optTitle:      { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  optSub:        { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4 },
});

// ─── Types ───────────────────────────────────────────────────────────────────
type SortKey =
  | "amount_asc"  | "amount_desc"
  | "progress_asc"| "progress_desc"
  | "remaining_asc"| "remaining_desc"
  | "name_asc"    | "name_desc"
  | "duration_asc"| "duration_desc"
  | null;

// ─── Overall Progress Modal ───────────────────────────────────────────────────
function OverallProgressModal({
  visible, budgets, spentMap, month, onToggle, onClose,
}: {
  visible: boolean;
  budgets: Budget[];
  spentMap: Record<string, number>;
  month: number;
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), month + 1, 0).getDate();
  const todayPct    = month === now.getMonth() ? now.getDate() / daysInMonth : -1;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
      <View style={[op.sheet, { backgroundColor: colors.card, maxHeight: "85%", paddingBottom: insets.bottom + 16 }]}>

        <View style={[op.header, { borderBottomColor: colors.border }]}>
          <View style={op.titleRow}>
            <Text style={[op.title, { color: colors.primary }]}>Overall Progress</Text>
            <Feather name="info" size={14} color={colors.mutedForeground} style={{ marginLeft: 5 }} />
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Feather name="x" size={22} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        <Text style={[op.subtitle, { color: colors.mutedForeground }]}>
          Select budgets to include in overall progress.
        </Text>

        <ScrollView showsVerticalScrollIndicator={false}>
          {budgets.map((b) => {
            const spent  = spentMap[b.id] ?? 0;
            const pct    = b.amount > 0 ? Math.min(spent / b.amount, 1) : 0;
            const isOver = spent > b.amount;
            const bar    = isOver ? "#ef4444" : (b.color ?? colors.primary);
            return (
              <TouchableOpacity
                key={b.id}
                style={[op.row, { borderBottomColor: colors.border }]}
                onPress={() => onToggle(b.id)}
                activeOpacity={0.75}
              >
                <View style={op.rowTop}>
                  <View style={[op.rowIcon, { backgroundColor: (b.color ?? colors.primary) + "22" }]}>
                    <Feather name="shopping-bag" size={18} color={b.color ?? colors.primary} />
                  </View>
                  <Text style={[op.rowName, { color: colors.foreground }]}>{b.name}</Text>
                  <Text style={[op.rowAmt, { color: colors.foreground }]}>${b.amount.toLocaleString()}</Text>
                  {b.includeInOverall ? (
                    <View style={[op.checkFab, { backgroundColor: "#22c55e" }]}>
                      <Feather name="more-horizontal" size={16} color="#fff" />
                    </View>
                  ) : (
                    <View style={[op.emptyCheck, { borderColor: colors.border }]} />
                  )}
                </View>

                <View style={[op.barWrap, { backgroundColor: colors.background }]}>
                  <View style={[op.barFill, { width: `${pct * 100}%` as any, backgroundColor: bar }]} />
                  {todayPct > 0 && todayPct < 1 && (
                    <Text style={[op.todayTri, { left: `${todayPct * 100}%` as any }]}>▲</Text>
                  )}
                </View>

                <View style={op.rowBottom}>
                  <Text style={[op.rowSpent, { color: colors.mutedForeground }]}>
                    Spent ${spent.toFixed(0)} of ${b.amount.toLocaleString()}
                  </Text>
                  <Text style={[op.rowPct, { color: isOver ? "#ef4444" : colors.mutedForeground }]}>
                    {(pct * 100).toFixed(1)}%
                  </Text>
                  <Text style={[op.rowPeriod, { color: colors.mutedForeground }]}>{MONTH_NAMES[month]}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
          {budgets.length === 0 && (
            <Text style={[op.empty, { color: colors.mutedForeground }]}>No budgets to show.</Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Sorting Criteria Modal ───────────────────────────────────────────────────
function SortingCriteriaModal({
  visible, initial, showOverall, onApply, onClose,
}: {
  visible: boolean;
  initial: SortKey;
  showOverall: boolean;
  onApply: (sort: SortKey, show: boolean) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [sel, setSel]       = useState<SortKey>(initial);
  const [showOvr, setShowOvr] = useState(showOverall);

  React.useEffect(() => {
    if (visible) { setSel(initial); setShowOvr(showOverall); }
  }, [visible, initial, showOverall]);

  function SortSection({ title, opts }: { title: string; opts: { key: SortKey; label: string }[] }) {
    return (
      <View style={sc.section}>
        <Text style={[sc.sectionTitle, { color: colors.foreground }]}>{title}</Text>
        <View style={sc.optRow}>
          {opts.map(({ key, label }) => {
            const on = sel === key;
            return (
              <TouchableOpacity key={String(key)} style={sc.radioOpt} onPress={() => setSel(on ? null : key)}>
                <View style={[sc.radioOuter, { borderColor: on ? colors.primary : colors.border }]}>
                  {on && <View style={[sc.radioInner, { backgroundColor: colors.primary }]} />}
                </View>
                <Text style={[sc.radioLbl, { color: colors.foreground }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }} activeOpacity={1} onPress={onClose} />
      <View style={[sc.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 12 }]}>

        <View style={[sc.header, { borderBottomColor: colors.border }]}>
          <Text style={[sc.title, { color: colors.foreground }]}>Sorting Criteria</Text>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Feather name="x" size={22} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={sc.body}>
          <SortSection title="Budget Amount"           opts={[{ key: "amount_asc", label: "Low to High" }, { key: "amount_desc",    label: "High to Low" }]} />
          <SortSection title="Budget Progress %"       opts={[{ key: "progress_asc", label: "Asc" },       { key: "progress_desc",   label: "Desc" }]} />
          <SortSection title="Budget Remaining Amount" opts={[{ key: "remaining_asc", label: "Low to High" },{ key: "remaining_desc", label: "High to Low" }]} />
          <SortSection title="Budget Name"             opts={[{ key: "name_asc", label: "A-Z" },            { key: "name_desc",       label: "Z-A" }]} />
          <SortSection title="Budget Duration"         opts={[{ key: "duration_asc", label: "Asc" },        { key: "duration_desc",   label: "Desc" }]} />

          <View style={[sc.toggleSection, { borderTopColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[sc.toggleTitle, { color: colors.foreground }]}>Show Overall Progress</Text>
              <Text style={[sc.toggleSub, { color: colors.mutedForeground }]}>
                This shows the overall or combined progress of selected budgets only.
              </Text>
            </View>
            <Switch value={showOvr} onValueChange={setShowOvr}
              trackColor={{ false: colors.border, true: "#22c55e" }} thumbColor="#fff" />
          </View>
        </ScrollView>

        <TouchableOpacity
          style={[sc.applyBtn, { backgroundColor: colors.primary }]}
          onPress={() => { onApply(sel, showOvr); onClose(); }}
        >
          <Text style={sc.applyBtnTxt}>APPLY</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const op = StyleSheet.create({
  sheet:      { borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  header:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  titleRow:   { flexDirection: "row", alignItems: "center" },
  title:      { fontSize: 18, fontFamily: "Inter_700Bold" },
  subtitle:   { fontSize: 13, fontFamily: "Inter_400Regular", paddingHorizontal: 20, paddingVertical: 10 },
  row:        { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  rowTop:     { flexDirection: "row", alignItems: "center", gap: 10 },
  rowIcon:    { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowName:    { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  rowAmt:     { fontSize: 15, fontFamily: "Inter_600SemiBold", marginRight: 6 },
  checkFab:   { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  emptyCheck: { width: 22, height: 22, borderRadius: 4, borderWidth: 1.5 },
  barWrap:    { height: 8, borderRadius: 4, overflow: "visible", position: "relative" },
  barFill:    { height: "100%", borderRadius: 4 },
  todayTri:   { position: "absolute", top: 8, fontSize: 10, color: "#3b82f6", transform: [{ translateX: -5 }] },
  rowBottom:  { flexDirection: "row", alignItems: "center", gap: 6 },
  rowSpent:   { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular" },
  rowPct:     { fontSize: 12, fontFamily: "Inter_500Medium" },
  rowPeriod:  { fontSize: 11, fontFamily: "Inter_400Regular" },
  empty:      { textAlign: "center", padding: 24, fontFamily: "Inter_400Regular" },
});

const sc = StyleSheet.create({
  sheet:         { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "82%" },
  header:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 18, borderBottomWidth: StyleSheet.hairlineWidth },
  title:         { fontSize: 18, fontFamily: "Inter_700Bold" },
  body:          { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 8 },
  section:       { paddingVertical: 8 },
  sectionTitle:  { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 6 },
  optRow:        { flexDirection: "row" },
  radioOpt:      { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 5 },
  radioOuter:    { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioInner:    { width: 10, height: 10, borderRadius: 5 },
  radioLbl:      { fontSize: 14, fontFamily: "Inter_400Regular" },
  toggleSection: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 8 },
  toggleTitle:   { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  toggleSub:     { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2, lineHeight: 16 },
  applyBtn:      { height: 52, borderRadius: 12, alignItems: "center", justifyContent: "center", marginHorizontal: 20, marginTop: 12, marginBottom: 4 },
  applyBtnTxt:   { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 1 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function BudgetScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { openDrawer } = useDrawer();
  const { budgets, goals, transactions, addBudget, updateBudget, deleteBudget, addGoal, updateGoal, deleteGoal } = useApp();

  const now = new Date();
  const [activeTab, setActiveTab] = useState<"BUDGETS" | "GOALS">("BUDGETS");
  const [budgetType, setBudgetType] = useState<"expense" | "income">("expense");
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());

  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [editBudget, setEditBudget]     = useState<Budget | null>(null);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [editGoal, setEditGoal]         = useState<Goal | null>(null);

  const [detailBudget, setDetailBudget] = useState<Budget | null>(null);
  const [showDetail,   setShowDetail]   = useState(false);
  const [showOptions,  setShowOptions]  = useState(false);
  const [showEditScope, setShowEditScope] = useState(false);
  const [editScopeLabel, setEditScopeLabel] = useState("");

  const [showOverallModal, setShowOverallModal] = useState(false);
  const [showSortModal,    setShowSortModal]    = useState(false);
  const [appliedSort,      setAppliedSort]      = useState<SortKey>(null);
  const [showOverallCard,  setShowOverallCard]  = useState(true);

  const filteredBudgets = useMemo(
    () => budgets.filter((b) => b.type === budgetType),
    [budgets, budgetType]
  );

  const spentMap = useMemo(() => {
    const map: Record<string, number> = {};
    filteredBudgets.forEach((b) => {
      map[b.id] = spentForBudget(b, transactions, selectedYear, selectedMonth);
    });
    return map;
  }, [filteredBudgets, transactions, selectedYear, selectedMonth]);

  const sortedBudgets = useMemo(() => {
    if (!appliedSort) return filteredBudgets;
    const order: Record<string, number> = { weekly: 0, monthly: 1, yearly: 2 };
    return [...filteredBudgets].sort((a, b) => {
      const sA = spentMap[a.id] ?? 0, sB = spentMap[b.id] ?? 0;
      switch (appliedSort) {
        case "amount_asc":    return a.amount - b.amount;
        case "amount_desc":   return b.amount - a.amount;
        case "progress_asc":  return (a.amount > 0 ? sA / a.amount : 0) - (b.amount > 0 ? sB / b.amount : 0);
        case "progress_desc": return (b.amount > 0 ? sB / b.amount : 0) - (a.amount > 0 ? sA / a.amount : 0);
        case "remaining_asc":  return (a.amount - sA) - (b.amount - sB);
        case "remaining_desc": return (b.amount - sB) - (a.amount - sA);
        case "name_asc":  return a.name.localeCompare(b.name);
        case "name_desc": return b.name.localeCompare(a.name);
        case "duration_asc":  return (order[a.period] ?? 1) - (order[b.period] ?? 1);
        case "duration_desc": return (order[b.period] ?? 1) - (order[a.period] ?? 1);
        default: return 0;
      }
    });
  }, [filteredBudgets, appliedSort, spentMap]);

  const overallBudgets = filteredBudgets.filter((b) => b.includeInOverall);
  const overallLimit = overallBudgets.reduce((s, b) => s + b.amount, 0);
  const overallSpent = overallBudgets.reduce((s, b) => s + (spentMap[b.id] ?? 0), 0);
  const overallPct = overallLimit > 0 ? Math.min(overallSpent / overallLimit, 1) : 0;

  const prevMonth = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (selectedMonth === 0) { setSelectedYear((y) => y - 1); setSelectedMonth(11); }
    else setSelectedMonth((m) => m - 1);
  };
  const nextMonth = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (selectedMonth === 11) { setSelectedYear((y) => y + 1); setSelectedMonth(0); }
    else setSelectedMonth((m) => m + 1);
  };

  const handleBudgetPress = (b: Budget) => {
    setDetailBudget(b);
    setShowDetail(true);
  };

  const handleDetailEdit = () => {
    setShowDetail(false);
    setShowEditScope(true);
  };

  const handleDetailOptions = () => {
    setShowOptions(true);
  };

  const handleEditScopeSelect = (scope: "this" | "all") => {
    const mn = MONTH_NAMES[selectedMonth];
    setEditScopeLabel(scope === "this" ? `Editing ${mn} only` : `Editing ${mn} and all future`);
    setEditBudget(detailBudget);
    setShowEditScope(false);
    setShowBudgetForm(true);
  };

  const handleStopBudget = () => {
    setShowOptions(false);
    Alert.alert(
      "Stop Budget",
      `"${detailBudget?.name}" will not be available to track from next month. Continue?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Stop", style: "destructive", onPress: () => { setShowDetail(false); deleteBudget(detailBudget!.id); } },
      ]
    );
  };

  const handleDeleteBudget = () => {
    setShowOptions(false);
    Alert.alert(
      "Delete Budget",
      `Delete "${detailBudget?.name}" permanently?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => { setShowDetail(false); deleteBudget(detailBudget!.id); } },
      ]
    );
  };

  const handleGoalPress = (g: Goal) => {
    Alert.alert(g.name, `$${g.currentAmount.toFixed(2)} of $${g.targetAmount} saved`, [
      { text: "Edit", onPress: () => { setEditGoal(g); setShowGoalForm(true); } },
      {
        text: "Add Funds",
        onPress: () => {
          Alert.prompt?.("Add Funds", "How much to add?", (val) => {
            const amt = parseFloat(val ?? "");
            if (!isNaN(amt) && amt > 0) updateGoal(g.id, { currentAmount: g.currentAmount + amt });
          }, "plain-text", "", "decimal-pad");
        },
      },
      { text: "Delete", style: "destructive", onPress: () => Alert.alert("Delete Goal", `Delete "${g.name}"?`, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => deleteGoal(g.id) }]) },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={["top"]}>

      {/* ── Header ── */}
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openDrawer(); }} hitSlop={8}>
          <Feather name="menu" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>Budget</Text>
        <View style={s.headerRight}>
          <TouchableOpacity hitSlop={8} style={s.headerBtn} onPress={() => setShowSortModal(true)}>
            <View>
              <Feather name="sliders" size={20} color={colors.foreground} />
              {appliedSort !== null && (
                <View style={[s.filterBadge, { backgroundColor: colors.expense }]}>
                  <Text style={s.filterBadgeText}>1</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            hitSlop={8}
            style={[s.headerBtn, s.addBtn, { backgroundColor: colors.primary }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (activeTab === "BUDGETS") { setEditBudget(null); setShowBudgetForm(true); }
              else { setEditGoal(null); setShowGoalForm(true); }
            }}
          >
            <Feather name="plus" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Tabs ── */}
      <View style={[s.tabBar, { borderBottomColor: colors.border }]}>
        {(["BUDGETS", "GOALS"] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[s.tabItem, activeTab === tab && [s.tabItemActive, { borderBottomColor: colors.primary }]]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveTab(tab); }}
          >
            <Text style={[s.tabText, { color: activeTab === tab ? colors.primary : colors.mutedForeground }, activeTab === tab && s.tabTextActive]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>

        {activeTab === "BUDGETS" ? (
          <>
            {/* ── Expenses / Income + Month nav ── */}
            <View style={s.controls}>
              <View style={[s.typeToggle, { backgroundColor: colors.card }]}>
                {(["expense", "income"] as const).map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[s.typeBtn, budgetType === t && [s.typeBtnActive, { backgroundColor: colors.primary + "18" }]]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setBudgetType(t); }}
                  >
                    <Text style={[s.typeBtnText, { color: budgetType === t ? colors.primary : colors.mutedForeground }, budgetType === t && { fontFamily: "Inter_600SemiBold" }]}>
                      {t === "expense" ? "Expenses" : "Income"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={s.monthNav}>
                <TouchableOpacity onPress={prevMonth} hitSlop={10}><Feather name="chevron-left" size={20} color={colors.foreground} /></TouchableOpacity>
                <Text style={[s.monthLabel, { color: colors.foreground }]}>{MONTH_NAMES[selectedMonth]} {selectedYear !== now.getFullYear() ? selectedYear : ""}</Text>
                <TouchableOpacity onPress={nextMonth} hitSlop={10}><Feather name="chevron-right" size={20} color={colors.foreground} /></TouchableOpacity>
              </View>
            </View>

            {/* ── Overall Progress ── */}
            {showOverallCard && <View style={[s.overallCard, { backgroundColor: colors.card }]}>
              <View style={s.overallHeader}>
                <Text style={[s.overallTitle, { color: colors.foreground }]}>Overall Progress</Text>
                <TouchableOpacity style={[s.overallMenu, { backgroundColor: colors.primary }]} onPress={() => setShowOverallModal(true)}>
                  <Feather name="more-horizontal" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
              <View style={[s.overallBarTrack, { backgroundColor: colors.border }]}>
                <View style={[s.overallBarFill, { width: `${overallPct * 100}%` as any, backgroundColor: overallSpent > overallLimit && overallLimit > 0 ? colors.expense : colors.primary }]} />
              </View>
              <Text style={[s.overallSpent, { color: colors.mutedForeground }]}>Spent ${overallSpent.toFixed(0)} of ${overallLimit.toFixed(0)}</Text>
              {overallBudgets.length === 0 && (
                <Text style={[s.overallHint, { color: colors.mutedForeground }]}>Select budgets to include in overall progress.</Text>
              )}
            </View>}

            {/* ── Budget List ── */}
            {filteredBudgets.length === 0 ? (
              <View style={s.emptyState}>
                <Feather name="shopping-bag" size={40} color={colors.mutedForeground} />
                <Text style={[s.emptyTitle, { color: colors.foreground }]}>No budgets yet</Text>
                <Text style={[s.emptySub, { color: colors.mutedForeground }]}>Tap + to create your first budget</Text>
              </View>
            ) : (
              sortedBudgets.map((b) => (
                <BudgetRow key={b.id} budget={b} spent={spentMap[b.id] ?? 0} onPress={() => handleBudgetPress(b)} />
              ))
            )}
          </>
        ) : (
          <>
            {/* ── Goals List ── */}
            {goals.length === 0 ? (
              <View style={s.emptyState}>
                <Feather name="target" size={40} color={colors.mutedForeground} />
                <Text style={[s.emptyTitle, { color: colors.foreground }]}>No goals yet</Text>
                <Text style={[s.emptySub, { color: colors.mutedForeground }]}>Tap + to create your first savings goal</Text>
              </View>
            ) : (
              goals.map((g) => <GoalCard key={g.id} goal={g} onPress={() => handleGoalPress(g)} />)
            )}
          </>
        )}
      </ScrollView>

      {/* ── Modals ── */}
      <BudgetDetailSheet
        visible={showDetail}
        budget={detailBudget}
        transactions={transactions}
        initialYear={selectedYear}
        initialMonth={selectedMonth}
        onClose={() => setShowDetail(false)}
        onEdit={handleDetailEdit}
        onOptions={handleDetailOptions}
      />

      <BudgetOptionsModal
        visible={showOptions}
        budget={detailBudget}
        onClose={() => setShowOptions(false)}
        onStop={handleStopBudget}
        onDelete={handleDeleteBudget}
      />

      <EditScopeModal
        visible={showEditScope}
        month={selectedMonth}
        onClose={() => setShowEditScope(false)}
        onSelect={handleEditScopeSelect}
      />

      <BudgetFormSheet
        visible={showBudgetForm}
        initial={editBudget}
        scopeLabel={editScopeLabel || undefined}
        onClose={() => { setShowBudgetForm(false); setEditBudget(null); setEditScopeLabel(""); }}
        onSave={(data) => {
          if (editBudget) updateBudget(editBudget.id, data);
          else addBudget(data);
        }}
      />
      <GoalFormSheet
        visible={showGoalForm}
        initial={editGoal}
        onClose={() => { setShowGoalForm(false); setEditGoal(null); }}
        onSave={(data) => {
          if (editGoal) updateGoal(editGoal.id, data);
          else addGoal(data);
        }}
      />

      <OverallProgressModal
        visible={showOverallModal}
        budgets={filteredBudgets}
        spentMap={spentMap}
        month={selectedMonth}
        onToggle={(id) => {
          const b = filteredBudgets.find((x) => x.id === id);
          if (b) updateBudget(id, { includeInOverall: !b.includeInOverall });
        }}
        onClose={() => setShowOverallModal(false)}
      />

      <SortingCriteriaModal
        visible={showSortModal}
        initial={appliedSort}
        showOverall={showOverallCard}
        onApply={(sort, show) => { setAppliedSort(sort); setShowOverallCard(show); }}
        onClose={() => setShowSortModal(false)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:         { flex: 1 },

  header:       { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle:  { flex: 1, fontSize: 22, fontFamily: "Inter_700Bold", marginLeft: 12 },
  headerRight:  { flexDirection: "row", alignItems: "center", gap: 8 },
  headerBtn:    { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  filterBadge:  { position: "absolute", top: -5, right: -5, minWidth: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  filterBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff" },
  addBtn:       { borderRadius: 10 },

  tabBar:       { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tabItem:      { flex: 1, alignItems: "center", paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabItemActive:{},
  tabText:      { fontSize: 13, fontFamily: "Inter_500Medium", letterSpacing: 0.5 },
  tabTextActive:{ fontFamily: "Inter_700Bold" },

  scroll:       { padding: 14, gap: 12 },

  controls:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  typeToggle:   { flexDirection: "row", borderRadius: 10, padding: 4, gap: 2 },
  typeBtn:      { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  typeBtnActive:{},
  typeBtnText:  { fontSize: 14, fontFamily: "Inter_400Regular" },
  monthNav:     { flexDirection: "row", alignItems: "center", gap: 8 },
  monthLabel:   { fontSize: 15, fontFamily: "Inter_600SemiBold", minWidth: 52, textAlign: "center" },

  overallCard:  { borderRadius: 14, padding: 16, gap: 8 },
  overallHeader:{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  overallTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  overallMenu:  { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  overallBarTrack: { height: 12, borderRadius: 6, overflow: "hidden" },
  overallBarFill:  { height: "100%", borderRadius: 6 },
  overallSpent: { fontSize: 13, fontFamily: "Inter_400Regular" },
  overallHint:  { fontSize: 12, fontFamily: "Inter_400Regular", fontStyle: "italic" },

  budgetRow:    { borderRadius: 14, padding: 14, gap: 6 },
  budgetRowTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  budgetIcon:   { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  budgetName:   { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  budgetAmount: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  barTrack:     { height: 8, borderRadius: 4, overflow: "visible" },
  barFill:      { height: "100%", borderRadius: 4 },
  barMarker:    { position: "absolute", top: -4, marginLeft: -4, width: 0, height: 0, borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 8, borderLeftColor: "transparent", borderRightColor: "transparent" },
  budgetRowBottom: { flexDirection: "row", alignItems: "center", gap: 6 },
  budgetSpent:  { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular" },
  budgetPct:    { fontSize: 12, fontFamily: "Inter_500Medium" },
  budgetPeriod: { fontSize: 11, fontFamily: "Inter_400Regular" },

  goalCard:     { borderRadius: 14, padding: 16, gap: 4 },
  goalCardTop:  { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  goalIcon:     { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  goalName:     { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  goalDate:     { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  goalTarget:   { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  goalPct:      { fontSize: 13, fontFamily: "Inter_700Bold" },
  goalCardBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  goalSaved:    { fontSize: 12, fontFamily: "Inter_400Regular" },
  goalRemaining:{ fontSize: 12, fontFamily: "Inter_500Medium" },
  goalNotes:    { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4, fontStyle: "italic" },

  emptyState:   { alignItems: "center", paddingVertical: 60, gap: 8 },
  emptyTitle:   { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  emptySub:     { fontSize: 14, fontFamily: "Inter_400Regular" },
});
