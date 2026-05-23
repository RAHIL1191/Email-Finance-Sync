import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState, useMemo, useCallback } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Pressable,
  GestureResponderEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import CategoryPickerModal from "@/components/CategoryPickerModal";
import MerchantPickerModal from "@/components/MerchantPickerModal";

// ── Screen Views ─────────────────────────────────────────────────────────────
type ActiveView =
  | "list"
  | "editor"
  | "cond_statement"
  | "cond_merchant"
  | "cond_amount"
  | "cond_categories"
  | "cond_accounts"
  | "act_rename"
  | "act_category"
  | "act_tags"
  | "act_review"
  | "act_split";

export default function CategoryMappingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    categoryRules,
    addCategoryMappingRule,
    deleteCategoryRule,
    transactions,
    accounts,
    categories,
  } = useApp();

  // ── Navigation State ────────────────────────────────────────────────────────
  const [currentView, setCurrentView] = useState<ActiveView>("list");

  // ── Search State ────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");

  // ── Form State ──────────────────────────────────────────────────────────────
  const [ruleId, setRuleId] = useState<string | null>(null);

  // Conditions
  const [originalStatementEnabled, setOriginalStatementEnabled] = useState(false);
  const [originalStatementOperator, setOriginalStatementOperator] = useState<"exactly" | "contains">("contains");
  const [originalStatementValue, setOriginalStatementValue] = useState("");

  const [merchantEnabled, setMerchantEnabled] = useState(false);
  const [merchantOperator, setMerchantOperator] = useState<"exactly" | "contains">("contains");
  const [merchantValue, setMerchantValue] = useState("");

  const [amountEnabled, setAmountEnabled] = useState(false);
  const [amountType, setAmountType] = useState<"debit" | "credit" | "any">("debit");
  const [amountOperator, setAmountOperator] = useState<"equals" | "greater_than" | "less_than" | "between">("greater_than");
  const [amountValue, setAmountValue] = useState("");
  const [amountValueTo, setAmountValueTo] = useState("");

  const [categoriesEnabled, setCategoriesEnabled] = useState(false);
  const [categoriesList, setCategoriesList] = useState<string[]>([]);

  const [accountsEnabled, setAccountsEnabled] = useState(false);
  const [accountsList, setAccountsList] = useState<string[]>([]);

  // Actions
  const [renameMerchantEnabled, setRenameMerchantEnabled] = useState(false);
  const [renameMerchantValue, setRenameMerchantValue] = useState("");

  const [updateCategoryEnabled, setUpdateCategoryEnabled] = useState(false);
  const [updateCategoryValue, setUpdateCategoryValue] = useState("");

  const [addTagsEnabled, setAddTagsEnabled] = useState(false);
  const [addTagsValue, setAddTagsValue] = useState("");

  const [reviewStatusEnabled, setReviewStatusEnabled] = useState(false);
  const [reviewStatusValue, setReviewStatusValue] = useState<"reviewed" | "needs_review">("needs_review");

  const [hideTransaction, setHideTransaction] = useState(false);

  // Exclusive OR option: Splits
  const [splitTransactionEnabled, setSplitTransactionEnabled] = useState(false);
  const [splits, setSplits] = useState<Array<{ category: string; percentage: string }>>([
    { category: "", percentage: "" },
  ]);

  // Apply to X existing transactions
  const [applyRetroactively, setApplyRetroactively] = useState(false);

  // Modals / Pickers inside sub-views
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showMerchantPicker, setShowMerchantPicker] = useState(false);
  const [splitPickerIndex, setSplitPickerIndex] = useState<number | null>(null);

  // ── Picker Sheets (bottom sheet selection overlays) ────────────────────────
  const [pickerConfig, setPickerConfig] = useState<{
    visible: boolean;
    title: string;
    options: Array<{ label: string; value: any }>;
    onSelect: (val: any) => void;
  } | null>(null);

  // Helper to open a custom bottom picker
  const openBottomPicker = (title: string, options: Array<{ label: string; value: any }>, onSelect: (val: any) => void) => {
    setPickerConfig({ visible: true, title, options, onSelect });
  };

  // ── Rule Summary Builder (renders rule summary cards nicely) ───────────────
  const getRuleSummary = useCallback((rule: any) => {
    if (rule.merchantPattern !== "__rich_rule__") {
      const matches: string[] = [];
      if (rule.merchantPattern) {
        matches.push(`If name contains "${rule.merchantExact || rule.merchantPattern}"`);
      }
      if (rule.fromCategory) {
        matches.push(`If category is "${rule.fromCategory}"`);
      }
      const updates: string[] = [];
      updates.push(`Recategorize to 🗂️ ${rule.category}`);
      return { matches: matches.length > 0 ? matches : ["Matches all transactions"], updates };
    }

    try {
      const payload = JSON.parse(rule.merchantExact || "{}");
      const conds = payload.conditions;
      const acts = payload.actions;
      const matches: string[] = [];
      const updates: string[] = [];

      if (conds) {
        if (conds.originalStatementEnabled && conds.originalStatementValue) {
          const op = conds.originalStatementOperator === "exactly" ? "exactly matches" : "contains";
          matches.push(`If statement ${op} "${conds.originalStatementValue}"`);
        }
        if (conds.merchantEnabled && conds.merchantValue) {
          const op = conds.merchantOperator === "exactly" ? "exactly matches" : "contains";
          matches.push(`If name ${op} "${conds.merchantValue}"`);
        }
        if (conds.amountEnabled && conds.amountValue !== undefined && conds.amountValue !== "") {
          const type = conds.amountType === "credit" ? "credit" : "debit";
          let op = "equals";
          if (conds.amountOperator === "greater_than") op = "greater than";
          else if (conds.amountOperator === "less_than") op = "less than";
          else if (conds.amountOperator === "between") op = "between";

          if (conds.amountOperator === "between") {
            matches.push(`If ${type} ${op} $${conds.amountValue} and $${conds.amountValueTo}`);
          } else {
            matches.push(`If ${type} ${op} $${conds.amountValue}`);
          }
        }
        if (conds.categoriesEnabled && Array.isArray(conds.categoriesList) && conds.categoriesList.length > 0) {
          matches.push(`If category is any of [${conds.categoriesList.join(", ")}]`);
        }
        if (conds.accountsEnabled && Array.isArray(conds.accountsList) && conds.accountsList.length > 0) {
          const names = conds.accountsList.map((id: string) => accounts.find((a) => a.id === id)?.name || id);
          matches.push(`If account is any of [${names.join(", ")}]`);
        }
      }

      if (acts) {
        if (acts.splitTransactionEnabled && Array.isArray(acts.splitTransactionList) && acts.splitTransactionList.length > 0) {
          const splitsStr = acts.splitTransactionList.map((s: any) => `${s.percentage}% ${s.category}`).join(", ");
          updates.push(`✂️ Split transaction: ${splitsStr}`);
        } else {
          if (acts.renameMerchantEnabled && acts.renameMerchantValue) {
            updates.push(`📝 Rename merchant to "${acts.renameMerchantValue}"`);
          }
          if (acts.updateCategoryEnabled && acts.updateCategoryValue) {
            updates.push(`🗂️ Recategorize to ${acts.updateCategoryValue}`);
          }
          if (acts.addTagsEnabled && acts.addTagsValue) {
            updates.push(`🏷️ Add tags ${acts.addTagsValue}`);
          }
          if (acts.reviewStatusEnabled) {
            const status = acts.reviewStatusValue === "needs_review" ? "Needs review" : "Reviewed";
            updates.push(`🔍 Mark review status as ${status}`);
          }
          if (acts.hideTransaction) {
            updates.push(`👻 Hide transaction (mark as transfer)`);
          }
        }
      }

      return { matches: matches.length > 0 ? matches : ["Matches all transactions"], updates };
    } catch (e) {
      return {
        matches: [`If name contains "${rule.merchantExact || rule.merchantPattern}"`],
        updates: [`Recategorize to 🗂️ ${rule.category}`],
      };
    }
  }, [accounts]);

  // ── Search & Filter Logic ──────────────────────────────────────────────────
  const filteredRules = useMemo(() => {
    const manual = categoryRules.filter((r) => r.source === "manual");
    if (!searchQuery) return manual;
    const q = searchQuery.toLowerCase();
    return manual.filter((rule) => {
      const summary = getRuleSummary(rule);
      const condMatch = summary.matches.some((m: string) => m.toLowerCase().includes(q));
      const actMatch = summary.updates.some((a: string) => a.toLowerCase().includes(q));
      const patternMatch = rule.merchantPattern.toLowerCase().includes(q);
      const categoryMatch = rule.category.toLowerCase().includes(q);
      return condMatch || actMatch || patternMatch || categoryMatch;
    });
  }, [categoryRules, searchQuery, getRuleSummary]);

  // ── Real-time Matching Calculator ──────────────────────────────────────────
  const getMatchingCount = () => {
    if (!originalStatementEnabled && !merchantEnabled && !amountEnabled && !categoriesEnabled && !accountsEnabled) {
      return 0;
    }
    return transactions.filter((tx) => {
      if (originalStatementEnabled && originalStatementValue.trim()) {
        const val = originalStatementValue.trim().toLowerCase();
        const title = (tx.title || "").toLowerCase();
        if (originalStatementOperator === "exactly" ? title !== val : !title.includes(val)) return false;
      }
      if (merchantEnabled && merchantValue.trim()) {
        const val = merchantValue.trim().toLowerCase();
        const merchant = (tx.merchant || "").toLowerCase();
        if (merchantOperator === "exactly" ? merchant !== val : !merchant.includes(val)) return false;
      }
      if (amountEnabled && amountValue.trim()) {
        const amt = tx.amount;
        if (amountType === "debit" && tx.type !== "expense") return false;
        if (amountType === "credit" && tx.type !== "income") return false;

        const val = Number(amountValue) || 0;
        if (amountOperator === "equals") {
          if (Math.abs(amt - val) >= 0.01) return false;
        } else if (amountOperator === "greater_than") {
          if (amt <= val) return false;
        } else if (amountOperator === "less_than") {
          if (amt >= val) return false;
        } else if (amountOperator === "between") {
          const valTo = Number(amountValueTo) || 0;
          if (amt < val || amt > valTo) return false;
        }
      }
      if (categoriesEnabled && categoriesList.length > 0) {
        if (!tx.category || !categoriesList.includes(tx.category)) return false;
      }
      if (accountsEnabled && accountsList.length > 0) {
        if (!tx.accountId || !accountsList.includes(tx.accountId)) return false;
      }
      return true;
    }).length;
  };

  const matchingCount = useMemo(() => getMatchingCount(), [
    originalStatementEnabled,
    originalStatementOperator,
    originalStatementValue,
    merchantEnabled,
    merchantOperator,
    merchantValue,
    amountEnabled,
    amountType,
    amountOperator,
    amountValue,
    amountValueTo,
    categoriesEnabled,
    categoriesList,
    accountsEnabled,
    accountsList,
    transactions,
  ]);

  // ── Populate Editor with existing rule ─────────────────────────────────────
  const openEditMode = (rule: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRuleId(rule.id);
    setApplyRetroactively(false);

    if (rule.merchantPattern !== "__rich_rule__") {
      // Convert standard rule to rich rule parameters in the editor
      setOriginalStatementEnabled(false);
      setOriginalStatementValue("");
      setOriginalStatementOperator("contains");

      if (rule.merchantPattern) {
        setMerchantEnabled(true);
        setMerchantValue(rule.merchantExact || rule.merchantPattern);
        setMerchantOperator("contains");
      } else {
        setMerchantEnabled(false);
        setMerchantValue("");
        setMerchantOperator("contains");
      }

      setAmountEnabled(false);
      setAmountValue("");
      setAmountValueTo("");
      setAmountOperator("greater_than");
      setAmountType("debit");

      if (rule.fromCategory) {
        setCategoriesEnabled(true);
        setCategoriesList([rule.fromCategory]);
      } else {
        setCategoriesEnabled(false);
        setCategoriesList([]);
      }

      setAccountsEnabled(false);
      setAccountsList([]);

      setRenameMerchantEnabled(false);
      setRenameMerchantValue("");

      setUpdateCategoryEnabled(true);
      setUpdateCategoryValue(rule.category);

      setAddTagsEnabled(false);
      setAddTagsValue("");

      setReviewStatusEnabled(false);
      setReviewStatusValue("needs_review");

      setHideTransaction(false);
      setSplitTransactionEnabled(false);
      setSplits([{ category: "", percentage: "" }]);
    } else {
      // Load rich rule configuration
      try {
        const payload = JSON.parse(rule.merchantExact || "{}");
        const conds = payload.conditions || {};
        const acts = payload.actions || {};

        setOriginalStatementEnabled(!!conds.originalStatementEnabled);
        setOriginalStatementValue(conds.originalStatementValue || "");
        setOriginalStatementOperator(conds.originalStatementOperator || "contains");

        setMerchantEnabled(!!conds.merchantEnabled);
        setMerchantValue(conds.merchantValue || "");
        setMerchantOperator(conds.merchantOperator || "contains");

        setAmountEnabled(!!conds.amountEnabled);
        setAmountValue(conds.amountValue !== undefined ? String(conds.amountValue) : "");
        setAmountValueTo(conds.amountValueTo !== undefined ? String(conds.amountValueTo) : "");
        setAmountOperator(conds.amountOperator || "greater_than");
        setAmountType(conds.amountType || "debit");

        setCategoriesEnabled(!!conds.categoriesEnabled);
        setCategoriesList(conds.categoriesList || []);

        setAccountsEnabled(!!conds.accountsEnabled);
        setAccountsList(conds.accountsList || []);

        setRenameMerchantEnabled(!!acts.renameMerchantEnabled);
        setRenameMerchantValue(acts.renameMerchantValue || "");

        setUpdateCategoryEnabled(!!acts.updateCategoryEnabled);
        setUpdateCategoryValue(acts.updateCategoryValue || "");

        setAddTagsEnabled(!!acts.addTagsEnabled);
        setAddTagsValue(acts.addTagsValue || "");

        setReviewStatusEnabled(!!acts.reviewStatusEnabled);
        setReviewStatusValue(acts.reviewStatusValue || "needs_review");

        setHideTransaction(!!acts.hideTransaction);

        setSplitTransactionEnabled(!!acts.splitTransactionEnabled);
        if (acts.splitTransactionEnabled && acts.splitTransactionList) {
          setSplits(acts.splitTransactionList.map((s: any) => ({ category: s.category, percentage: String(s.percentage) })));
        } else {
          setSplits([{ category: "", percentage: "" }]);
        }
      } catch (e) {
        console.error(e);
      }
    }

    setCurrentView("editor");
  };

  // ── Open Create Mode ────────────────────────────────────────────────────────
  const openCreateMode = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRuleId(null);
    setApplyRetroactively(false);

    setOriginalStatementEnabled(false);
    setOriginalStatementValue("");
    setOriginalStatementOperator("contains");

    setMerchantEnabled(false);
    setMerchantValue("");
    setMerchantOperator("contains");

    setAmountEnabled(false);
    setAmountValue("");
    setAmountValueTo("");
    setAmountOperator("greater_than");
    setAmountType("debit");

    setCategoriesEnabled(false);
    setCategoriesList([]);

    setAccountsEnabled(false);
    setAccountsList([]);

    setRenameMerchantEnabled(false);
    setRenameMerchantValue("");

    setUpdateCategoryEnabled(false);
    setUpdateCategoryValue("");

    setAddTagsEnabled(false);
    setAddTagsValue("");

    setReviewStatusEnabled(false);
    setReviewStatusValue("needs_review");

    setHideTransaction(false);
    setSplitTransactionEnabled(false);
    setSplits([{ category: "", percentage: "" }]);

    setCurrentView("editor");
  };

  // ── Save Rule ───────────────────────────────────────────────────────────────
  const handleSaveRule = () => {
    // Validate that we have at least one condition and action or split configured
    const hasCondition =
      originalStatementEnabled || merchantEnabled || amountEnabled || categoriesEnabled || accountsEnabled;

    if (!hasCondition) {
      alert("Please configure at least one active condition.");
      return;
    }

    const hasAction =
      renameMerchantEnabled ||
      updateCategoryEnabled ||
      addTagsEnabled ||
      reviewStatusEnabled ||
      hideTransaction ||
      splitTransactionEnabled;

    if (!hasAction) {
      alert("Please configure at least one action update or split.");
      return;
    }

    if (splitTransactionEnabled) {
      // Validate splits
      const invalid = splits.some((s) => !s.category || !s.percentage);
      if (invalid) {
        alert("Please select a category and fill the percentage for all split sections.");
        return;
      }
      const sum = splits.reduce((acc, s) => acc + (parseFloat(s.percentage) || 0), 0);
      if (Math.abs(sum - 100) > 0.01) {
        alert(`Split percentages must total exactly 100%. (Current: ${sum}%)`);
        return;
      }
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Build the RichRule Payload JSON
    const payload = {
      conditions: {
        originalStatementEnabled,
        originalStatementOperator,
        originalStatementValue,
        merchantEnabled,
        merchantOperator,
        merchantValue,
        amountEnabled,
        amountType,
        amountOperator,
        amountValue: Number(amountValue) || 0,
        amountValueTo: Number(amountValueTo) || 0,
        categoriesEnabled,
        categoriesList,
        accountsEnabled,
        accountsList,
      },
      actions: {
        renameMerchantEnabled,
        renameMerchantValue,
        updateCategoryEnabled,
        updateCategoryValue,
        addTagsEnabled,
        addTagsValue,
        reviewStatusEnabled,
        reviewStatusValue,
        hideTransaction,
        splitTransactionEnabled,
        splitTransactionList: splitTransactionEnabled
          ? splits.map((s) => ({ category: s.category, percentage: parseFloat(s.percentage) || 0 }))
          : undefined,
      },
    };

    addCategoryMappingRule({
      id: ruleId ?? undefined,
      merchantPattern: "__rich_rule__",
      merchantExact: JSON.stringify(payload),
      category: updateCategoryEnabled ? updateCategoryValue : "Others",
      applyScope: applyRetroactively ? "past_and_future" : "future",
    });

    setCurrentView("list");
  };

  // ── Delete Rule ─────────────────────────────────────────────────────────────
  const handleDeleteRule = () => {
    if (!ruleId) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    deleteCategoryRule(ruleId);
    setCurrentView("list");
  };

  // ── Rendering helper rows ──────────────────────────────────────────────────
  const renderRow = (
    label: string,
    valueSummary: string,
    onPress: () => void,
    hasSwitch?: boolean,
    switchVal?: boolean,
    onSwitchChange?: (v: boolean) => void
  ) => {
    return (
      <View style={[s.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]} key={label}>
        <TouchableOpacity style={s.rowClickable} activeOpacity={0.7} onPress={onPress}>
          <View style={s.rowLeft}>
            <Text style={[s.rowLabel, { color: colors.foreground }]}>{label}</Text>
            <Text style={[s.rowValueSummary, { color: colors.mutedForeground }]} numberOfLines={1}>
              {valueSummary}
            </Text>
          </View>
          {!hasSwitch && <Feather name="chevron-right" size={16} color={colors.mutedForeground} />}
        </TouchableOpacity>
        {hasSwitch && (
          <Switch
            value={switchVal}
            onValueChange={onSwitchChange}
            trackColor={{ false: colors.border, true: "#f97316" }}
            thumbColor="#ffffff"
            ios_backgroundColor={colors.border}
          />
        )}
      </View>
    );
  };

  // ── RENDER ──
  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* ── 1. MAIN RULES LIST VIEW ── */}
      {currentView === "list" && (
        <View style={s.root}>
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
            <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={s.headerBtn}>
              <Feather name="arrow-left" size={20} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[s.headerTitle, { color: colors.foreground }]}>Rules</Text>
            <TouchableOpacity onPress={openCreateMode} hitSlop={10} style={s.headerBtn}>
              <Feather name="plus" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {/* Search bar */}
          <View style={s.searchContainer}>
            <View style={[s.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="search" size={16} color={colors.mutedForeground} style={s.searchIcon} />
              <TextInput
                placeholder="Search"
                placeholderTextColor={colors.mutedForeground}
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={[s.searchInput, { color: colors.foreground }]}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={10}>
                  <Feather name="x" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <ScrollView style={s.scroll} contentContainerStyle={[s.listContent, { paddingBottom: insets.bottom + 32 }]}>
            {/* Rule Count label */}
            <Text style={[s.ruleCountLabel, { color: colors.mutedForeground }]}>
              {filteredRules.length} transaction {filteredRules.length === 1 ? "rule" : "rules"}
            </Text>

            {/* List items */}
            {filteredRules.map((rule) => {
              const summary = getRuleSummary(rule);
              return (
                <TouchableOpacity
                  key={rule.id}
                  style={[s.ruleCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  activeOpacity={0.7}
                  onPress={() => openEditMode(rule)}
                >
                  <View style={s.ruleCardLeft}>
                    {summary.matches.map((match: string, i: number) => (
                      <Text key={i} style={[s.summaryMatchText, { color: colors.foreground }]}>
                        {match}
                      </Text>
                    ))}
                    {summary.updates.map((update: string, i: number) => (
                      <Text key={i} style={[s.summaryUpdateText, { color: colors.mutedForeground }]}>
                        {update}
                      </Text>
                    ))}
                  </View>
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              );
            })}

            {filteredRules.length === 0 && (
              <View style={s.emptyContainer}>
                <Feather name="zap" size={32} color={colors.mutedForeground} style={{ marginBottom: 12 }} />
                <Text style={[s.emptyText, { color: colors.mutedForeground }]}>No rules found</Text>
              </View>
            )}
          </ScrollView>
        </View>
      )}

      {/* ── 2. MAIN RULE EDITOR VIEW ── */}
      {currentView === "editor" && (
        <View style={s.root}>
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
            <TouchableOpacity onPress={() => setCurrentView("list")} hitSlop={10} style={s.headerBtn}>
              <Feather name="arrow-left" size={20} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[s.headerTitle, { color: colors.foreground }]}>
              {ruleId ? "Edit Rule" : "Create Rule"}
            </Text>
            {ruleId ? (
              <TouchableOpacity onPress={handleDeleteRule} hitSlop={10} style={s.headerBtn}>
                <Feather name="trash-2" size={18} color="#ef4444" />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 36 }} />
            )}
          </View>

          <ScrollView style={s.scroll} contentContainerStyle={[s.editorContent, { paddingBottom: insets.bottom + 32 }]}>
            {/* Condition Section */}
            <Text style={[s.sectionHeader, { color: colors.mutedForeground }]}>If the transaction matches...</Text>
            <View style={s.sectionGroup}>
              {renderRow(
                "Original statement",
                originalStatementEnabled && originalStatementValue ? `If name ${originalStatementOperator === "exactly" ? "exactly matches" : "contains"} "${originalStatementValue}"` : "Disabled",
                () => setCurrentView("cond_statement")
              )}
              {renderRow(
                "Merchant name",
                merchantEnabled && merchantValue ? `If merchant ${merchantOperator === "exactly" ? "exactly matches" : "contains"} "${merchantValue}"` : "Disabled",
                () => setCurrentView("cond_merchant")
              )}
              {renderRow(
                "Amount",
                amountEnabled && amountValue
                  ? `If amount is ${amountType} ${amountOperator.replace("_", " ")} $${amountValue}${amountOperator === "between" ? ` and $${amountValueTo}` : ""}`
                  : "Disabled",
                () => setCurrentView("cond_amount")
              )}
              {renderRow(
                "Categories",
                categoriesEnabled && categoriesList.length > 0
                  ? `If category is in [${categoriesList.join(", ")}]`
                  : "Disabled",
                () => setCurrentView("cond_categories")
              )}
              {renderRow(
                "Accounts",
                accountsEnabled && accountsList.length > 0
                  ? `If account is in [${accountsList.map((id) => accounts.find((a) => a.id === id)?.name || id).join(", ")}]`
                  : "Disabled",
                () => setCurrentView("cond_accounts")
              )}
            </View>

            {/* Action Updates Section */}
            {!splitTransactionEnabled && (
              <>
                <Text style={[s.sectionHeader, { color: colors.mutedForeground, marginTop: 24 }]}>Then apply these updates</Text>
                <View style={s.sectionGroup}>
                  {renderRow(
                    "Rename merchant",
                    renameMerchantEnabled && renameMerchantValue ? `Rename to "${renameMerchantValue}"` : "Disabled",
                    () => setCurrentView("act_rename")
                  )}
                  {renderRow(
                    "Update category",
                    updateCategoryEnabled && updateCategoryValue ? `Update to ${updateCategoryValue}` : "Disabled",
                    () => setCurrentView("act_category")
                  )}
                  {renderRow(
                    "Add tags",
                    addTagsEnabled && addTagsValue ? `Add tag: ${addTagsValue}` : "Disabled",
                    () => setCurrentView("act_tags")
                  )}
                  {renderRow(
                    "Review status",
                    reviewStatusEnabled ? `Mark review status as ${reviewStatusValue === "needs_review" ? "Needs review" : "Reviewed"}` : "Disabled",
                    () => setCurrentView("act_review")
                  )}
                  {renderRow(
                    "Hide transaction",
                    hideTransaction ? "Yes" : "No",
                    () => {},
                    true,
                    hideTransaction,
                    setHideTransaction
                  )}
                </View>
              </>
            )}

            {/* OR Split Section */}
            {!renameMerchantEnabled &&
              !updateCategoryEnabled &&
              !addTagsEnabled &&
              !reviewStatusEnabled &&
              !hideTransaction && (
                <>
                  <View style={s.orDivider}>
                    <View style={[s.orLine, { backgroundColor: colors.border }]} />
                    <Text style={[s.orText, { color: colors.mutedForeground }]}>OR</Text>
                    <View style={[s.orLine, { backgroundColor: colors.border }]} />
                  </View>

                  <View style={s.sectionGroup}>
                    {renderRow(
                      "Split transaction",
                      splitTransactionEnabled
                        ? `${splits.length} split sections configured`
                        : "Disabled",
                      () => setCurrentView("act_split")
                    )}
                  </View>
                </>
              )}

            {/* Retroactive Toggle */}
            <View style={[s.retroactiveContainer, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <View style={s.retroactiveLeft}>
                <Text style={[s.retroactiveLabel, { color: colors.foreground }]}>
                  {matchingCount > 0 ? `Apply to ${matchingCount} existing transactions` : "Apply to 0 existing transactions"}
                </Text>
                <Text style={[s.retroactiveDesc, { color: colors.mutedForeground }]}>
                  Apply updates retroactively to matched past transactions
                </Text>
              </View>
              <Switch
                value={applyRetroactively}
                onValueChange={setApplyRetroactively}
                trackColor={{ false: colors.border, true: "#f97316" }}
                thumbColor="#ffffff"
                ios_backgroundColor={colors.border}
              />
            </View>

            {/* Primary Action Button */}
            <TouchableOpacity style={s.createBtn} activeOpacity={0.8} onPress={handleSaveRule}>
              <Text style={s.createBtnText}>{ruleId ? "Save rule" : "Create rule"}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {/* ── 3. MATCH CONDITION SUB-VIEWS (Screenshots Layout) ── */}

      {/* A. Original Statement Screen */}
      {currentView === "cond_statement" && (
        <View style={s.root}>
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
            <TouchableOpacity onPress={() => setCurrentView("editor")} hitSlop={10} style={s.headerBtn}>
              <Feather name="arrow-left" size={20} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[s.headerTitle, { color: colors.foreground }]}>Matches original statement</Text>
            <Feather name="settings" size={20} color={colors.mutedForeground} style={s.headerRightIcon} />
          </View>

          <ScrollView style={s.scroll} contentContainerStyle={s.subContent}>
            <View style={s.toggleRow}>
              <Text style={[s.toggleLabel, { color: colors.foreground }]}>Matches original statement</Text>
              <Switch
                value={originalStatementEnabled}
                onValueChange={setOriginalStatementEnabled}
                trackColor={{ false: colors.border, true: "#f97316" }}
                thumbColor="#ffffff"
                ios_backgroundColor={colors.border}
              />
            </View>

            {originalStatementEnabled && (
              <View style={[s.formGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {/* Dropdown Row */}
                <TouchableOpacity
                  style={[s.formRow, { borderBottomWidth: 1, borderBottomColor: colors.border }]}
                  activeOpacity={0.7}
                  onPress={() =>
                    openBottomPicker(
                      "Original Statement Match Type",
                      [
                        { label: "Contains", value: "contains" },
                        { label: "Exactly matches", value: "exactly" },
                      ],
                      (val) => setOriginalStatementOperator(val)
                    )
                  }
                >
                  <Text style={[s.formLabel, { color: colors.mutedForeground }]}>If</Text>
                  <View style={s.pickerRowRight}>
                    <Text style={[s.formValueText, { color: colors.foreground }]}>
                      {originalStatementOperator === "exactly" ? "Exactly matches" : "Contains"}
                    </Text>
                    <Feather name="chevron-down" size={14} color={colors.mutedForeground} style={{ marginLeft: 6 }} />
                  </View>
                </TouchableOpacity>

                {/* Name Input Row */}
                <View style={s.formRow}>
                  <Text style={[s.formLabel, { color: colors.mutedForeground }]}>Name</Text>
                  <TextInput
                    style={[s.formInput, { color: colors.foreground }]}
                    placeholder="Enter statement name"
                    placeholderTextColor={colors.mutedForeground}
                    value={originalStatementValue}
                    onChangeText={setOriginalStatementValue}
                    autoCapitalize="none"
                  />
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      )}

      {/* B. Merchant Name Screen */}
      {currentView === "cond_merchant" && (
        <View style={s.root}>
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
            <TouchableOpacity onPress={() => setCurrentView("editor")} hitSlop={10} style={s.headerBtn}>
              <Feather name="arrow-left" size={20} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[s.headerTitle, { color: colors.foreground }]}>Matches merchant name</Text>
            <Feather name="settings" size={20} color={colors.mutedForeground} style={s.headerRightIcon} />
          </View>

          <ScrollView style={s.scroll} contentContainerStyle={s.subContent}>
            <View style={s.toggleRow}>
              <Text style={[s.toggleLabel, { color: colors.foreground }]}>Matches merchant name</Text>
              <Switch
                value={merchantEnabled}
                onValueChange={setMerchantEnabled}
                trackColor={{ false: colors.border, true: "#f97316" }}
                thumbColor="#ffffff"
                ios_backgroundColor={colors.border}
              />
            </View>

            {merchantEnabled && (
              <View style={[s.formGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {/* Dropdown Row */}
                <TouchableOpacity
                  style={[s.formRow, { borderBottomWidth: 1, borderBottomColor: colors.border }]}
                  activeOpacity={0.7}
                  onPress={() =>
                    openBottomPicker(
                      "Merchant Match Type",
                      [
                        { label: "Contains", value: "contains" },
                        { label: "Exactly matches", value: "exactly" },
                      ],
                      (val) => setMerchantOperator(val)
                    )
                  }
                >
                  <Text style={[s.formLabel, { color: colors.mutedForeground }]}>If</Text>
                  <View style={s.pickerRowRight}>
                    <Text style={[s.formValueText, { color: colors.foreground }]}>
                      {merchantOperator === "exactly" ? "Exactly matches" : "Contains"}
                    </Text>
                    <Feather name="chevron-down" size={14} color={colors.mutedForeground} style={{ marginLeft: 6 }} />
                  </View>
                </TouchableOpacity>

                {/* Name Input Row */}
                <View style={s.formRow}>
                  <Text style={[s.formLabel, { color: colors.mutedForeground }]}>Name</Text>
                  <TextInput
                    style={[s.formInput, { color: colors.foreground }]}
                    placeholder="Enter merchant name"
                    placeholderTextColor={colors.mutedForeground}
                    value={merchantValue}
                    onChangeText={setMerchantValue}
                  />
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      )}

      {/* C. Amount Screen */}
      {currentView === "cond_amount" && (
        <View style={s.root}>
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
            <TouchableOpacity onPress={() => setCurrentView("editor")} hitSlop={10} style={s.headerBtn}>
              <Feather name="arrow-left" size={20} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[s.headerTitle, { color: colors.foreground }]}>Matches amount</Text>
            <Feather name="settings" size={20} color={colors.mutedForeground} style={s.headerRightIcon} />
          </View>

          <ScrollView style={s.scroll} contentContainerStyle={s.subContent}>
            <View style={s.toggleRow}>
              <Text style={[s.toggleLabel, { color: colors.foreground }]}>Matches amount</Text>
              <Switch
                value={amountEnabled}
                onValueChange={setAmountEnabled}
                trackColor={{ false: colors.border, true: "#f97316" }}
                thumbColor="#ffffff"
                ios_backgroundColor={colors.border}
              />
            </View>

            {amountEnabled && (
              <View style={[s.formGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {/* Transaction Type Row */}
                <TouchableOpacity
                  style={[s.formRow, { borderBottomWidth: 1, borderBottomColor: colors.border }]}
                  activeOpacity={0.7}
                  onPress={() =>
                    openBottomPicker(
                      "Transaction Type",
                      [
                        { label: "Debit", value: "debit" },
                        { label: "Credit", value: "credit" },
                        { label: "Any", value: "any" },
                      ],
                      (val) => setAmountType(val)
                    )
                  }
                >
                  <Text style={[s.formLabel, { color: colors.mutedForeground }]}>If a transaction is</Text>
                  <View style={s.pickerRowRight}>
                    <Text style={[s.formValueText, { color: colors.foreground }]}>
                      {amountType === "debit" ? "Debit" : amountType === "credit" ? "Credit" : "Any"}
                    </Text>
                    <Feather name="chevron-down" size={14} color={colors.mutedForeground} style={{ marginLeft: 6 }} />
                  </View>
                </TouchableOpacity>

                {/* Operator Row */}
                <TouchableOpacity
                  style={[s.formRow, { borderBottomWidth: 1, borderBottomColor: colors.border }]}
                  activeOpacity={0.7}
                  onPress={() =>
                    openBottomPicker(
                      "Amount Criteria",
                      [
                        { label: "Equals", value: "equals" },
                        { label: "Greater than", value: "greater_than" },
                        { label: "Less than", value: "less_than" },
                        { label: "Between", value: "between" },
                      ],
                      (val) => setAmountOperator(val)
                    )
                  }
                >
                  <Text style={[s.formLabel, { color: colors.mutedForeground }]}>And</Text>
                  <View style={s.pickerRowRight}>
                    <Text style={[s.formValueText, { color: colors.foreground }]}>
                      {amountOperator === "equals"
                        ? "Equals"
                        : amountOperator === "greater_than"
                        ? "Greater than"
                        : amountOperator === "less_than"
                        ? "Less than"
                        : "Between"}
                    </Text>
                    <Feather name="chevron-down" size={14} color={colors.mutedForeground} style={{ marginLeft: 6 }} />
                  </View>
                </TouchableOpacity>

                {/* Amount Numeric Row */}
                <View style={s.formRow}>
                  <Text style={[s.formLabel, { color: colors.mutedForeground }]}>Amount ($)</Text>
                  <TextInput
                    style={[s.formInput, { color: colors.foreground }]}
                    placeholder="$0.00"
                    placeholderTextColor={colors.mutedForeground}
                    value={amountValue}
                    onChangeText={setAmountValue}
                    keyboardType="numeric"
                  />
                </View>

                {/* Amount To Row (for between) */}
                {amountOperator === "between" && (
                  <View style={[s.formRow, { borderTopWidth: 1, borderTopColor: colors.border }]}>
                    <Text style={[s.formLabel, { color: colors.mutedForeground }]}>To ($)</Text>
                    <TextInput
                      style={[s.formInput, { color: colors.foreground }]}
                      placeholder="$100.00"
                      placeholderTextColor={colors.mutedForeground}
                      value={amountValueTo}
                      onChangeText={setAmountValueTo}
                      keyboardType="numeric"
                    />
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        </View>
      )}

      {/* D. Categories Screen */}
      {currentView === "cond_categories" && (
        <View style={s.root}>
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
            <TouchableOpacity onPress={() => setCurrentView("editor")} hitSlop={10} style={s.headerBtn}>
              <Feather name="arrow-left" size={20} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[s.headerTitle, { color: colors.foreground }]}>Matches categories</Text>
            <Feather name="settings" size={20} color={colors.mutedForeground} style={s.headerRightIcon} />
          </View>

          <ScrollView style={s.scroll} contentContainerStyle={s.subContent}>
            <View style={s.toggleRow}>
              <Text style={[s.toggleLabel, { color: colors.foreground }]}>Matches categories</Text>
              <Switch
                value={categoriesEnabled}
                onValueChange={setCategoriesEnabled}
                trackColor={{ false: colors.border, true: "#f97316" }}
                thumbColor="#ffffff"
                ios_backgroundColor={colors.border}
              />
            </View>

            {categoriesEnabled && (
              <>
                <Text style={[s.sectionHeader, { color: colors.mutedForeground, marginTop: 16 }]}>If categories are</Text>
                <View style={[s.formGroup, { backgroundColor: colors.card, borderColor: colors.border, paddingVertical: 4 }]}>
                  {categories.map((cat, i) => {
                    const catName = cat.parentId ? `${cat.parentId} - ${cat.name}` : cat.name;
                    const isSelected = categoriesList.includes(catName);
                    return (
                      <TouchableOpacity
                        key={cat.id}
                        style={[
                          s.multiselectRow,
                          {
                            borderBottomWidth: i < categories.length - 1 ? 1 : 0,
                            borderBottomColor: colors.border,
                          },
                        ]}
                        activeOpacity={0.7}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setCategoriesList((prev) =>
                            isSelected ? prev.filter((c) => c !== catName) : [...prev, catName]
                          );
                        }}
                      >
                        <Text style={[s.multiselectText, { color: colors.foreground }]}>{catName}</Text>
                        {isSelected && <Feather name="check" size={16} color="#f97316" />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
          </ScrollView>
        </View>
      )}

      {/* E. Accounts Screen */}
      {currentView === "cond_accounts" && (
        <View style={s.root}>
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
            <TouchableOpacity onPress={() => setCurrentView("editor")} hitSlop={10} style={s.headerBtn}>
              <Feather name="arrow-left" size={20} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[s.headerTitle, { color: colors.foreground }]}>Matches accounts</Text>
            <Feather name="settings" size={20} color={colors.mutedForeground} style={s.headerRightIcon} />
          </View>

          <ScrollView style={s.scroll} contentContainerStyle={s.subContent}>
            <View style={s.toggleRow}>
              <Text style={[s.toggleLabel, { color: colors.foreground }]}>Matches accounts</Text>
              <Switch
                value={accountsEnabled}
                onValueChange={setAccountsEnabled}
                trackColor={{ false: colors.border, true: "#f97316" }}
                thumbColor="#ffffff"
                ios_backgroundColor={colors.border}
              />
            </View>

            {accountsEnabled && (
              <>
                <Text style={[s.sectionHeader, { color: colors.mutedForeground, marginTop: 16 }]}>If accounts are</Text>
                <View style={[s.formGroup, { backgroundColor: colors.card, borderColor: colors.border, paddingVertical: 4 }]}>
                  {accounts.map((acct, i) => {
                    const isSelected = accountsList.includes(acct.id);
                    return (
                      <TouchableOpacity
                        key={acct.id}
                        style={[
                          s.multiselectRow,
                          {
                            borderBottomWidth: i < accounts.length - 1 ? 1 : 0,
                            borderBottomColor: colors.border,
                          },
                        ]}
                        activeOpacity={0.7}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setAccountsList((prev) =>
                            isSelected ? prev.filter((id) => id !== acct.id) : [...prev, acct.id]
                          );
                        }}
                      >
                        <Text style={[s.multiselectText, { color: colors.foreground }]}>{acct.name}</Text>
                        {isSelected && <Feather name="check" size={16} color="#f97316" />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
          </ScrollView>
        </View>
      )}

      {/* ── 4. ACTION UPDATES SUB-VIEWS (Screenshots Layout) ── */}

      {/* A. Rename Merchant Screen */}
      {currentView === "act_rename" && (
        <View style={s.root}>
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
            <TouchableOpacity onPress={() => setCurrentView("editor")} hitSlop={10} style={s.headerBtn}>
              <Feather name="arrow-left" size={20} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[s.headerTitle, { color: colors.foreground }]}>Rename merchant</Text>
            <Feather name="settings" size={20} color={colors.mutedForeground} style={s.headerRightIcon} />
          </View>

          <ScrollView style={s.scroll} contentContainerStyle={s.subContent}>
            <View style={s.toggleRow}>
              <Text style={[s.toggleLabel, { color: colors.foreground }]}>Rename merchant</Text>
              <Switch
                value={renameMerchantEnabled}
                onValueChange={setRenameMerchantEnabled}
                trackColor={{ false: colors.border, true: "#f97316" }}
                thumbColor="#ffffff"
                ios_backgroundColor={colors.border}
              />
            </View>

            {renameMerchantEnabled && (
              <View style={[s.formGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={s.formRow}>
                  <Text style={[s.formLabel, { color: colors.mutedForeground }]}>Rename to</Text>
                  <TextInput
                    style={[s.formInput, { color: colors.foreground }]}
                    placeholder="Enter new merchant name"
                    placeholderTextColor={colors.mutedForeground}
                    value={renameMerchantValue}
                    onChangeText={setRenameMerchantValue}
                  />
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      )}

      {/* B. Update Category Screen */}
      {currentView === "act_category" && (
        <View style={s.root}>
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
            <TouchableOpacity onPress={() => setCurrentView("editor")} hitSlop={10} style={s.headerBtn}>
              <Feather name="arrow-left" size={20} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[s.headerTitle, { color: colors.foreground }]}>Update category</Text>
            <Feather name="settings" size={20} color={colors.mutedForeground} style={s.headerRightIcon} />
          </View>

          <ScrollView style={s.scroll} contentContainerStyle={s.subContent}>
            <View style={s.toggleRow}>
              <Text style={[s.toggleLabel, { color: colors.foreground }]}>Update category</Text>
              <Switch
                value={updateCategoryEnabled}
                onValueChange={setUpdateCategoryEnabled}
                trackColor={{ false: colors.border, true: "#f97316" }}
                thumbColor="#ffffff"
                ios_backgroundColor={colors.border}
              />
            </View>

            {updateCategoryEnabled && (
              <View style={[s.formGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <TouchableOpacity style={s.formRow} activeOpacity={0.7} onPress={() => setShowCategoryPicker(true)}>
                  <Text style={[s.formLabel, { color: colors.mutedForeground }]}>Update category to</Text>
                  <View style={s.pickerRowRight}>
                    <Text style={[s.formValueText, { color: updateCategoryValue ? colors.foreground : colors.mutedForeground }]}>
                      {updateCategoryValue || "Select category..."}
                    </Text>
                    <Feather name="chevron-down" size={14} color={colors.mutedForeground} style={{ marginLeft: 6 }} />
                  </View>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>

          <CategoryPickerModal
            visible={showCategoryPicker}
            onClose={() => setShowCategoryPicker(false)}
            onSelect={(cat, sub) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setUpdateCategoryValue(sub ? `${cat} - ${sub}` : cat);
            }}
            type="both"
          />
        </View>
      )}

      {/* C. Add Tags Screen */}
      {currentView === "act_tags" && (
        <View style={s.root}>
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
            <TouchableOpacity onPress={() => setCurrentView("editor")} hitSlop={10} style={s.headerBtn}>
              <Feather name="arrow-left" size={20} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[s.headerTitle, { color: colors.foreground }]}>Add tags</Text>
            <Feather name="settings" size={20} color={colors.mutedForeground} style={s.headerRightIcon} />
          </View>

          <ScrollView style={s.scroll} contentContainerStyle={s.subContent}>
            <View style={s.toggleRow}>
              <Text style={[s.toggleLabel, { color: colors.foreground }]}>Add tags</Text>
              <Switch
                value={addTagsEnabled}
                onValueChange={setAddTagsEnabled}
                trackColor={{ false: colors.border, true: "#f97316" }}
                thumbColor="#ffffff"
                ios_backgroundColor={colors.border}
              />
            </View>

            {addTagsEnabled && (
              <View style={[s.formGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={s.formRow}>
                  <Text style={[s.formLabel, { color: colors.mutedForeground }]}>Tags added</Text>
                  <TextInput
                    style={[s.formInput, { color: colors.foreground }]}
                    placeholder="Enter tags (e.g. Subscription)"
                    placeholderTextColor={colors.mutedForeground}
                    value={addTagsValue}
                    onChangeText={setAddTagsValue}
                  />
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      )}

      {/* D. Review Status Screen */}
      {currentView === "act_review" && (
        <View style={s.root}>
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
            <TouchableOpacity onPress={() => setCurrentView("editor")} hitSlop={10} style={s.headerBtn}>
              <Feather name="arrow-left" size={20} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[s.headerTitle, { color: colors.foreground }]}>Review status</Text>
            <Feather name="settings" size={20} color={colors.mutedForeground} style={s.headerRightIcon} />
          </View>

          <ScrollView style={s.scroll} contentContainerStyle={s.subContent}>
            <View style={s.toggleRow}>
              <Text style={[s.toggleLabel, { color: colors.foreground }]}>Review status</Text>
              <Switch
                value={reviewStatusEnabled}
                onValueChange={setReviewStatusEnabled}
                trackColor={{ false: colors.border, true: "#f97316" }}
                thumbColor="#ffffff"
                ios_backgroundColor={colors.border}
              />
            </View>

            {reviewStatusEnabled && (
              <View style={[s.formGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {/* Status Selection Row */}
                <TouchableOpacity
                  style={s.formRow}
                  activeOpacity={0.7}
                  onPress={() =>
                    openBottomPicker(
                      "Review Status Flag",
                      [
                        { label: "Needs review", value: "needs_review" },
                        { label: "Reviewed", value: "reviewed" },
                      ],
                      (val) => setReviewStatusValue(val)
                    )
                  }
                >
                  <Text style={[s.formLabel, { color: colors.mutedForeground }]}>Mark as</Text>
                  <View style={s.pickerRowRight}>
                    <Text style={[s.formValueText, { color: colors.foreground }]}>
                      {reviewStatusValue === "needs_review" ? "Needs review" : "Reviewed"}
                    </Text>
                    <Feather name="chevron-down" size={14} color={colors.mutedForeground} style={{ marginLeft: 6 }} />
                  </View>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      )}

      {/* E. Split Transaction Screen */}
      {currentView === "act_split" && (
        <View style={s.root}>
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
            <TouchableOpacity onPress={() => setCurrentView("editor")} hitSlop={10} style={s.headerBtn}>
              <Feather name="arrow-left" size={20} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[s.headerTitle, { color: colors.foreground }]}>Split transaction</Text>
            <Feather name="settings" size={20} color={colors.mutedForeground} style={s.headerRightIcon} />
          </View>

          <ScrollView style={s.scroll} contentContainerStyle={s.subContent}>
            <View style={s.toggleRow}>
              <Text style={[s.toggleLabel, { color: colors.foreground }]}>Split transaction</Text>
              <Switch
                value={splitTransactionEnabled}
                onValueChange={setSplitTransactionEnabled}
                trackColor={{ false: colors.border, true: "#f97316" }}
                thumbColor="#ffffff"
                ios_backgroundColor={colors.border}
              />
            </View>

            {splitTransactionEnabled && (
              <>
                <Text style={[s.sectionHeader, { color: colors.mutedForeground, marginTop: 16 }]}>Split distribution (Total must be 100%)</Text>

                {splits.map((split, i) => (
                  <View
                    key={i}
                    style={[
                      s.formGroup,
                      { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 12 },
                    ]}
                  >
                    <View style={s.splitItemHeader}>
                      <Text style={[s.splitItemNumber, { color: colors.foreground }]}>Section #{i + 1}</Text>
                      {splits.length > 1 && (
                        <TouchableOpacity
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setSplits((prev) => prev.filter((_, idx) => idx !== i));
                          }}
                          hitSlop={10}
                        >
                          <Feather name="minus-circle" size={16} color="#ef4444" />
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Split Category Row */}
                    <TouchableOpacity
                      style={[s.formRow, { borderBottomWidth: 1, borderBottomColor: colors.border }]}
                      activeOpacity={0.7}
                      onPress={() => {
                        setSplitPickerIndex(i);
                        setShowCategoryPicker(true);
                      }}
                    >
                      <Text style={[s.formLabel, { color: colors.mutedForeground }]}>Category</Text>
                      <View style={s.pickerRowRight}>
                        <Text style={[s.formValueText, { color: split.category ? colors.foreground : colors.mutedForeground }]}>
                          {split.category || "Select category..."}
                        </Text>
                        <Feather name="chevron-down" size={14} color={colors.mutedForeground} style={{ marginLeft: 6 }} />
                      </View>
                    </TouchableOpacity>

                    {/* Split Percentage Row */}
                    <View style={s.formRow}>
                      <Text style={[s.formLabel, { color: colors.mutedForeground }]}>Percentage (%)</Text>
                      <TextInput
                        style={[s.formInput, { color: colors.foreground }]}
                        placeholder="e.g. 50"
                        placeholderTextColor={colors.mutedForeground}
                        value={split.percentage}
                        onChangeText={(text) => {
                          setSplits((prev) =>
                            prev.map((s, idx) => (idx === i ? { ...s, percentage: text } : s))
                          );
                        }}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                ))}

                <TouchableOpacity
                  style={[s.addSplitRowBtn, { borderColor: colors.primary }]}
                  activeOpacity={0.7}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSplits((prev) => [...prev, { category: "", percentage: "" }]);
                  }}
                >
                  <Feather name="plus-circle" size={16} color={colors.primary} style={{ marginRight: 6 }} />
                  <Text style={[s.addSplitRowBtnText, { color: colors.primary }]}>Add split section</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>

          <CategoryPickerModal
            visible={showCategoryPicker}
            onClose={() => {
              setShowCategoryPicker(false);
              setSplitPickerIndex(null);
            }}
            onSelect={(cat, sub) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              const selectedCat = sub ? `${cat} - ${sub}` : cat;
              if (splitPickerIndex !== null) {
                setSplits((prev) =>
                  prev.map((s, idx) => (idx === splitPickerIndex ? { ...s, category: selectedCat } : s))
                );
              } else {
                setUpdateCategoryValue(selectedCat);
              }
            }}
            type="both"
          />
        </View>
      )}

      {/* ── 5. NATIVE CUSTOM BOTTOM PICKER MODAL (Universal Dropdown Overlay) ── */}
      {pickerConfig?.visible && (
        <Pressable style={s.modalBackdrop} onPress={() => setPickerConfig(null)}>
          <Pressable
            style={[s.pickerModalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={(e: GestureResponderEvent) => e.stopPropagation()}
          >
            <View style={[s.pickerModalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[s.pickerModalTitle, { color: colors.foreground }]}>{pickerConfig.title}</Text>
              <TouchableOpacity onPress={() => setPickerConfig(null)} hitSlop={10}>
                <Feather name="x" size={18} color={colors.foreground} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 250 }}>
              {pickerConfig.options.map((opt, i) => (
                <TouchableOpacity
                  key={i}
                  style={[s.pickerModalItem, { borderBottomWidth: i < pickerConfig.options.length - 1 ? 1 : 0, borderBottomColor: colors.border }]}
                  activeOpacity={0.7}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    pickerConfig.onSelect(opt.value);
                    setPickerConfig(null);
                  }}
                >
                  <Text style={[s.pickerModalItemText, { color: colors.foreground }]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, overflow: "hidden" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  headerRightIcon: {
    marginRight: 8,
  },
  scroll: { flex: 1 },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    height: "100%",
  },
  listContent: {
    padding: 16,
  },
  ruleCountLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginBottom: 12,
    paddingLeft: 4,
  },
  ruleCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    marginBottom: 10,
  },
  ruleCardLeft: {
    flex: 1,
    gap: 4,
  },
  summaryMatchText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 18,
  },
  summaryUpdateText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  editorContent: {
    padding: 16,
  },
  sectionHeader: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    marginBottom: 8,
    paddingHorizontal: 4,
    textTransform: "uppercase",
  },
  sectionGroup: {
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 16,
  },
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowClickable: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowLeft: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  rowValueSummary: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  orDivider: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 16,
    gap: 12,
  },
  orLine: {
    flex: 1,
    height: 1,
  },
  orText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
  },
  retroactiveContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    marginTop: 16,
    marginBottom: 24,
  },
  retroactiveLeft: {
    flex: 1,
    gap: 2,
  },
  retroactiveLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  retroactiveDesc: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  createBtn: {
    backgroundColor: "#a24926", // rust/orange-brown matching screenshot
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  createBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  subContent: {
    padding: 16,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    marginBottom: 20,
  },
  toggleLabel: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  formGroup: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  formRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 48,
  },
  formLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    width: 140,
  },
  formInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    padding: 0,
    height: "100%",
  },
  formValueText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  pickerRowRight: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  multiselectRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  multiselectText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  splitItemHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  splitItemNumber: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  addSplitRowBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    paddingVertical: 14,
    marginTop: 8,
  },
  addSplitRowBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
    zIndex: 9999,
  },
  pickerModalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingBottom: 32,
    paddingHorizontal: 16,
  },
  pickerModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickerModalTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  pickerModalItem: {
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerModalItemText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
});

