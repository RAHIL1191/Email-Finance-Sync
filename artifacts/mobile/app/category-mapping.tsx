import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

// ── Types ─────────────────────────────────────────────────────────────────────

type PickerTarget = "merchant" | "fromCategory" | "toCategory" | null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeMerchant(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function CategoryMappingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { categories, categoryRules, transactions, addCategoryMappingRule } = useApp();

  // ── Form state ──────────────────────────────────────────────────────────────
  const [merchantEnabled, setMerchantEnabled] = useState(false);
  const [merchant, setMerchant] = useState<string>("");
  const [fromCatEnabled, setFromCatEnabled] = useState(false);
  const [fromCategory, setFromCategory] = useState<string>("");
  const [toCategory, setToCategory] = useState<string>("");
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null);
  const [merchantSearch, setMerchantSearch] = useState("");
  const [catSearch, setCatSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  // ── Derived lists ───────────────────────────────────────────────────────────
  const uniqueMerchants = useMemo(() => {
    const fromRules = categoryRules
      .filter((r) => r.merchantExact || r.merchantPattern)
      .map((r) => r.merchantExact || r.merchantPattern);
    const fromTxs = transactions
      .map((t) => t.merchant || t.title || "")
      .filter(Boolean);
    const all = Array.from(new Set([...fromRules, ...fromTxs]))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    return all;
  }, [categoryRules, transactions]);

  const categoryNames = useMemo(
    () =>
      categories
        .map((c) => c.name)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [categories]
  );

  const filteredMerchants = useMemo(
    () =>
      merchantSearch.trim()
        ? uniqueMerchants.filter((m) =>
            m.toLowerCase().includes(merchantSearch.toLowerCase())
          )
        : uniqueMerchants,
    [uniqueMerchants, merchantSearch]
  );

  const filteredCategories = useMemo(
    () =>
      catSearch.trim()
        ? categoryNames.filter((c) =>
            c.toLowerCase().includes(catSearch.toLowerCase())
          )
        : categoryNames,
    [categoryNames, catSearch]
  );

  // ── Validation ──────────────────────────────────────────────────────────────
  const isValid =
    toCategory.trim().length > 0 &&
    (!merchantEnabled || merchant.trim().length > 0) &&
    (!fromCatEnabled || fromCategory.trim().length > 0);

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = (scope: "future" | "past_and_future") => {
    if (!isValid) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaving(true);
    const pattern = merchantEnabled ? normalizeMerchant(merchant) : "";
    addCategoryMappingRule({
      merchantPattern: pattern || undefined,
      merchantExact: merchantEnabled ? merchant : undefined,
      fromCategory: fromCatEnabled ? fromCategory : null,
      category: toCategory,
      applyScope: scope,
    });
    setSaving(false);
    setSavedMsg(
      scope === "past_and_future"
        ? "Rule saved & applied to all transactions"
        : "Rule saved — applies to future transactions"
    );
    setTimeout(() => {
      router.back();
    }, 1200);
  };

  // ── Picker open/close helpers ────────────────────────────────────────────────
  const openPicker = (target: PickerTarget) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMerchantSearch("");
    setCatSearch("");
    setPickerTarget(target);
  };
  const closePicker = () => setPickerTarget(null);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          s.header,
          {
            paddingTop: Platform.OS === "web" ? 20 : insets.top + 8,
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={s.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>
          Add Category Mapping Rule
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Description */}
        <Text style={[s.description, { color: colors.mutedForeground }]}>
          Do you want to apply this category mapping automatically to all future transactions?
        </Text>

        {/* ── Merchant row ── */}
        <Text style={[s.sectionLabel, { color: colors.foreground }]}>Select Merchant</Text>
        <TouchableOpacity
          style={[
            s.rowCard,
            {
              backgroundColor: colors.card,
              borderColor: merchantEnabled && merchant ? colors.primary + "55" : colors.border,
            },
          ]}
          activeOpacity={0.7}
          onPress={() => {
            if (!merchantEnabled) setMerchantEnabled(true);
            openPicker("merchant");
          }}
        >
          <View style={[s.rowIconWrap, { backgroundColor: "#ec4899" + "18" }]}>
            <Feather name="shopping-bag" size={16} color="#ec4899" />
          </View>
          <Text
            style={[
              s.rowPlaceholder,
              { color: merchantEnabled && merchant ? colors.foreground : colors.mutedForeground },
            ]}
            numberOfLines={1}
          >
            {merchantEnabled && merchant ? merchant : "Select Merchant"}
          </Text>
          <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
          <Switch
            value={merchantEnabled}
            onValueChange={(v) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setMerchantEnabled(v);
              if (!v) setMerchant("");
            }}
            trackColor={{ false: colors.border, true: colors.primary + "aa" }}
            thumbColor={merchantEnabled ? colors.primary : colors.mutedForeground}
            ios_backgroundColor={colors.border}
            style={s.switch}
          />
        </TouchableOpacity>

        {/* ── Plus divider ── */}
        <View style={s.dividerRow}>
          <View style={[s.dividerLine, { backgroundColor: colors.border }]} />
          <View style={[s.dividerBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="plus" size={14} color={colors.mutedForeground} />
          </View>
          <View style={[s.dividerLine, { backgroundColor: colors.border }]} />
        </View>

        {/* ── From-category row ── */}
        <Text style={[s.sectionLabel, { color: colors.foreground }]}>Select from category</Text>
        <TouchableOpacity
          style={[
            s.rowCard,
            {
              backgroundColor: colors.card,
              borderColor: fromCatEnabled && fromCategory ? colors.primary + "55" : colors.border,
            },
          ]}
          activeOpacity={0.7}
          onPress={() => {
            if (!fromCatEnabled) setFromCatEnabled(true);
            openPicker("fromCategory");
          }}
        >
          <View style={[s.rowIconWrap, { backgroundColor: "#8b5cf6" + "18" }]}>
            <Feather name="grid" size={16} color="#8b5cf6" />
          </View>
          <Text
            style={[
              s.rowPlaceholder,
              { color: fromCatEnabled && fromCategory ? colors.foreground : colors.mutedForeground },
            ]}
            numberOfLines={1}
          >
            {fromCatEnabled && fromCategory ? fromCategory : "Select from category"}
          </Text>
          <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
          <Switch
            value={fromCatEnabled}
            onValueChange={(v) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setFromCatEnabled(v);
              if (!v) setFromCategory("");
            }}
            trackColor={{ false: colors.border, true: colors.primary + "aa" }}
            thumbColor={fromCatEnabled ? colors.primary : colors.mutedForeground}
            ios_backgroundColor={colors.border}
            style={s.switch}
          />
        </TouchableOpacity>

        {/* ── Arrow divider ── */}
        <View style={s.arrowRow}>
          <View style={[s.arrowLine, { backgroundColor: colors.border }]} />
          <Feather name="arrow-down" size={18} color={colors.primary} />
          <View style={[s.arrowLine, { backgroundColor: colors.border }]} />
        </View>

        {/* ── To-category row ── */}
        <Text style={[s.sectionLabel, { color: colors.foreground }]}>Select to category</Text>
        <TouchableOpacity
          style={[
            s.rowCard,
            {
              backgroundColor: colors.card,
              borderColor: toCategory ? colors.primary + "55" : colors.border,
            },
          ]}
          activeOpacity={0.7}
          onPress={() => openPicker("toCategory")}
        >
          <View style={[s.rowIconWrap, { backgroundColor: "#3b82f6" + "18" }]}>
            <Feather name="grid" size={16} color="#3b82f6" />
          </View>
          <Text
            style={[
              s.rowPlaceholder,
              { color: toCategory ? colors.foreground : colors.mutedForeground },
            ]}
            numberOfLines={1}
          >
            {toCategory || "Select to category"}
          </Text>
          <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
        </TouchableOpacity>

        {/* ── Validation hint ── */}
        {!isValid && (toCategory || merchantEnabled || fromCatEnabled) && (
          <Text style={[s.validationHint, { color: "#ef4444" }]}>
            {!toCategory
              ? "Select a target category"
              : merchantEnabled && !merchant
              ? "Select a merchant or disable the merchant filter"
              : "Select a from-category or disable the category filter"}
          </Text>
        )}

        {/* ── Action buttons ── */}
        <View style={[s.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity
            style={[s.actionBtn, { opacity: isValid ? 1 : 0.4 }]}
            activeOpacity={0.7}
            disabled={!isValid || saving}
            onPress={() => handleSave("future")}
          >
            <Text style={[s.actionBtnText, { color: colors.primary }]}>All Future</Text>
          </TouchableOpacity>
          <View style={[s.actionDivider, { backgroundColor: colors.border }]} />
          <TouchableOpacity
            style={[s.actionBtn, { opacity: isValid ? 1 : 0.4 }]}
            activeOpacity={0.7}
            disabled={!isValid || saving}
            onPress={() => handleSave("past_and_future")}
          >
            <Text style={[s.actionBtnText, { color: colors.primary }]}>Past & All Future</Text>
          </TouchableOpacity>
        </View>

        {/* ── Success message ── */}
        {savedMsg.length > 0 && (
          <View style={[s.successBox, { backgroundColor: "#10b981" + "18", borderColor: "#10b981" + "40" }]}>
            <Feather name="check-circle" size={14} color="#10b981" />
            <Text style={[s.successText, { color: "#10b981" }]}>{savedMsg}</Text>
          </View>
        )}

        {/* ── Note ── */}
        <View style={[s.noteBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="info" size={13} color={colors.mutedForeground} style={{ marginTop: 1 }} />
          <Text style={[s.noteText, { color: colors.mutedForeground }]}>
            Note: Merchant mapping will take precedence over category mapping
          </Text>
        </View>

        {/* ── Existing rules list ── */}
        <ExistingRules colors={colors} />
      </ScrollView>

      {/* ── In-surface picker overlay ── */}
      {pickerTarget !== null && (
        <Pressable style={[p.backdrop]} onPress={closePicker}>
          <Pressable
            style={[p.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={[p.sheetHeader, { borderBottomColor: colors.border }]}>
              <Text style={[p.sheetTitle, { color: colors.foreground }]}>
                {pickerTarget === "merchant"
                  ? "Select Merchant"
                  : pickerTarget === "fromCategory"
                  ? "Select From Category"
                  : "Select To Category"}
              </Text>
              <TouchableOpacity onPress={closePicker} hitSlop={8}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={[p.searchWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Feather name="search" size={14} color={colors.mutedForeground} />
              <TextInput
                style={[p.searchInput, { color: colors.foreground }]}
                placeholder={pickerTarget === "merchant" ? "Search merchants..." : "Search categories..."}
                placeholderTextColor={colors.mutedForeground}
                value={pickerTarget === "merchant" ? merchantSearch : catSearch}
                onChangeText={pickerTarget === "merchant" ? setMerchantSearch : setCatSearch}
              />
            </View>

            <ScrollView style={p.list} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {pickerTarget === "merchant"
                ? filteredMerchants.map((m, i) => (
                    <TouchableOpacity
                      key={`m-${i}-${m}`}
                      style={[p.item, { borderBottomColor: colors.border }]}
                      activeOpacity={0.7}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setMerchant(m);
                        closePicker();
                      }}
                    >
                      <Text style={[p.itemText, { color: colors.foreground }]}>{m}</Text>
                      {merchant === m && <Feather name="check" size={15} color={colors.primary} />}
                    </TouchableOpacity>
                  ))
                : filteredCategories.map((c, i) => {
                    const current = pickerTarget === "fromCategory" ? fromCategory : toCategory;
                    return (
                      <TouchableOpacity
                        key={`c-${i}-${c}`}
                        style={[p.item, { borderBottomColor: colors.border }]}
                        activeOpacity={0.7}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          if (pickerTarget === "fromCategory") setFromCategory(c);
                          else setToCategory(c);
                          closePicker();
                        }}
                      >
                        <Text style={[p.itemText, { color: colors.foreground }]}>{c}</Text>
                        {current === c && <Feather name="check" size={15} color={colors.primary} />}
                      </TouchableOpacity>
                    );
                  })}
              {pickerTarget === "merchant" && filteredMerchants.length === 0 && merchantSearch.trim() && (
                <TouchableOpacity
                  style={[p.item, { borderBottomColor: colors.border }]}
                  activeOpacity={0.7}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setMerchant(merchantSearch.trim());
                    closePicker();
                  }}
                >
                  <Feather name="plus" size={14} color={colors.primary} />
                  <Text style={[p.itemText, { color: colors.primary }]}>
                    Use "{merchantSearch.trim()}"
                  </Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      )}
    </View>
  );
}

// ── Existing rules sub-component ──────────────────────────────────────────────

function ExistingRules({ colors }: { colors: ReturnType<typeof useColors> }) {
  const { categoryRules, deleteCategoryRule } = useApp();
  const manualRules = categoryRules.filter((r) => r.source === "manual");
  if (manualRules.length === 0) return null;

  return (
    <View style={{ marginTop: 24 }}>
      <Text style={[s.sectionLabel, { color: colors.foreground, marginBottom: 8 }]}>
        Existing Rules
      </Text>
      <View style={[s.rulesCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {manualRules.map((rule, i) => (
          <View key={rule.id}>
            {i > 0 && <View style={[s.ruleDivider, { backgroundColor: colors.border }]} />}
            <View style={s.ruleRow}>
              <View style={s.ruleInfo}>
                {rule.merchantPattern ? (
                  <Text style={[s.ruleText, { color: colors.foreground }]} numberOfLines={1}>
                    <Text style={{ color: colors.primary }}>
                      {rule.merchantExact || rule.merchantPattern}
                    </Text>
                    {rule.fromCategory ? ` in "${rule.fromCategory}"` : ""}
                    {" → "}
                    <Text style={{ color: "#10b981" }}>{rule.category}</Text>
                  </Text>
                ) : (
                  <Text style={[s.ruleText, { color: colors.foreground }]} numberOfLines={1}>
                    <Text style={{ color: "#8b5cf6" }}>{rule.fromCategory}</Text>
                    {" → "}
                    <Text style={{ color: "#10b981" }}>{rule.category}</Text>
                  </Text>
                )}
                <Text style={[s.ruleScope, { color: colors.mutedForeground }]}>
                  {rule.applyScope === "past_and_future" ? "Past & future" : "Future only"}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  deleteCategoryRule(rule.id);
                }}
                hitSlop={8}
                style={s.deleteBtn}
              >
                <Feather name="trash-2" size={15} color="#ef4444" />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: 8,
  },
  backBtn: { width: 36, height: 36, justifyContent: "center" },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 0 },
  description: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 8,
    marginTop: 4,
  },
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
    marginBottom: 4,
  },
  rowIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  rowPlaceholder: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  switch: { marginLeft: 4 },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 10,
    gap: 10,
  },
  dividerLine: { flex: 1, height: 1 },
  dividerBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  arrowRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 10,
    gap: 10,
  },
  arrowLine: { flex: 1, height: 1 },
  validationHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 6,
    marginBottom: 4,
  },
  actionCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    marginTop: 20,
  },
  actionBtn: { paddingVertical: 16, alignItems: "center" },
  actionBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  actionDivider: { height: 1 },
  successBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginTop: 12,
  },
  successText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  noteBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginTop: 12,
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  rulesCard: {
    borderRadius: 14,
    borderWidth: 1,
  },
  ruleDivider: { height: 1, marginHorizontal: 14 },
  ruleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  ruleInfo: { flex: 1, gap: 2 },
  ruleText: { fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 18 },
  ruleScope: { fontSize: 11, fontFamily: "Inter_400Regular" },
  deleteBtn: { padding: 4 },
});

// ── Picker overlay styles ─────────────────────────────────────────────────────

const p = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
    zIndex: 100,
    elevation: 10,
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    maxHeight: "70%",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  sheetTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    margin: 12,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    paddingVertical: 2,
  },
  list: { flex: 1 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  itemText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
});
