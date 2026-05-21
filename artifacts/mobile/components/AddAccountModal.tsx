import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ConfirmModal from "@/components/ConfirmModal";
import { PLAID_BANKS, useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

type Step = "choose" | "type" | "form";
export type AccountBaseType = "checking" | "savings" | "credit" | "investment";

export interface SubType {
  label: string;
  icon: string;
  type: AccountBaseType;
}

export const ACCOUNT_CATEGORIES: { label: string; items: SubType[] }[] = [
  {
    label: "Cash",
    items: [
      { label: "Bank Account", icon: "home", type: "checking" },
      { label: "Cash", icon: "dollar-sign", type: "savings" },
      { label: "Wallet", icon: "inbox", type: "savings" },
      { label: "Checking", icon: "credit-card", type: "checking" },
      { label: "Savings", icon: "bookmark", type: "savings" },
      { label: "Lending", icon: "arrow-up-right", type: "savings" },
    ],
  },
  {
    label: "Credit",
    items: [
      { label: "Credit Card", icon: "credit-card", type: "credit" },
      { label: "Line of Credit", icon: "sliders", type: "credit" },
    ],
  },
  {
    label: "Investment",
    items: [
      { label: "Retirement", icon: "umbrella", type: "investment" },
      { label: "Brokerage", icon: "bar-chart-2", type: "investment" },
      { label: "Investment", icon: "trending-up", type: "investment" },
      { label: "Insurance", icon: "shield", type: "investment" },
      { label: "Crypto", icon: "zap", type: "investment" },
    ],
  },
  {
    label: "Loans",
    items: [
      { label: "Loan", icon: "arrow-down-right", type: "credit" },
      { label: "Mortgage", icon: "layers", type: "credit" },
      { label: "Borrowing", icon: "corner-down-right", type: "credit" },
    ],
  },
  {
    label: "Assets",
    items: [
      { label: "Real Estate", icon: "map-pin", type: "investment" },
      { label: "Vehicle", icon: "truck", type: "investment" },
      { label: "Other", icon: "box", type: "savings" },
    ],
  },
];

const PALETTE = [
  "#1a56db", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onConnectBank?: () => void;
}

export default function AddAccountModal({ visible, onClose, onConnectBank }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addAccount, remapEmailTransactions, accounts } = useApp();

  const [step, setStep] = useState<Step>("choose");
  const [selectedSubType, setSelectedSubType] = useState<SubType | null>(null);

  // Form fields
  const [name, setName] = useState("");
  const [bank, setBank] = useState("");
  const [balance, setBalance] = useState("");
  const [lastFour, setLastFour] = useState("");
  const [includeInNetworth, setIncludeInNetworth] = useState(true);
  const [isJoint, setIsJoint] = useState(false);
  const [accountHolder, setAccountHolder] = useState("");
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [bankSearch, setBankSearch] = useState("");
  const [duplicateAccount, setDuplicateAccount] = useState<typeof accounts[0] | null>(null);

  const reset = () => {
    setStep("choose");
    setSelectedSubType(null);
    setName("");
    setBank("");
    setBalance("");
    setLastFour("");
    setIncludeInNetworth(true);
    setIsJoint(false);
    setAccountHolder("");
    setShowBankPicker(false);
    setBankSearch("");
    setDuplicateAccount(null);
  };

  const filteredBanks = PLAID_BANKS.filter((b) =>
    b.name.toLowerCase().includes(bankSearch.toLowerCase())
  );

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleConnectBank = () => {
    reset();
    onClose();
    onConnectBank?.();
  };

  const handleSelectType = (sub: SubType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedSubType(sub);
  };

  const handleNext = () => {
    if (!selectedSubType) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStep("form");
  };

  const doSave = (force = false) => {
    if (!selectedSubType) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const newId = addAccount({
      name: name.trim(),
      bank: bank.trim(),
      balance: parseFloat(balance || "0"),
      type: selectedSubType.type,
      color: PALETTE[0],
      currency: "CAD",
      lastFour: lastFour.trim() || undefined,
      includeInNetworth,
      isJoint,
      accountHolder: accountHolder.trim() || undefined,
      forceCreate: force,
    });
    if (bank.trim()) remapEmailTransactions(bank.trim(), newId);
    handleClose();
  };

  const handleSave = () => {
    if (!name.trim() || !selectedSubType) return;

    // Check for duplicate by lastFour+bank OR by name
    const nameLower = name.trim().toLowerCase();
    const bankLower = bank.trim().toLowerCase();
    const lastFourTrimmed = lastFour.trim();

    const duplicate = accounts.find((a) => {
      if (lastFourTrimmed && bank.trim()) {
        return (
          a.lastFour === lastFourTrimmed &&
          (a.bank.toLowerCase().includes(bankLower) || bankLower.includes(a.bank.toLowerCase()))
        );
      }
      return a.name.toLowerCase() === nameLower;
    });

    if (duplicate) {
      setDuplicateAccount(duplicate);
      return;
    }

    doSave();
  };

  const topPad = (Platform.OS === "web" ? 20 : insets.top) + 16;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* ── Header ── */}
        <View
          style={[
            styles.header,
            { paddingTop: topPad, borderBottomColor: colors.border },
          ]}
        >
          <TouchableOpacity
            onPress={step === "choose" ? handleClose : () => setStep(step === "form" ? "type" : "choose")}
            hitSlop={8}
          >
            <Feather name="arrow-left" size={22} color={colors.primary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            Add Account
          </Text>
          <View style={{ width: 22 }} />
        </View>

        {/* ── Step 1: Choose ── */}
        {step === "choose" && (
          <View style={styles.chooseContent}>
            {/* Connect bank */}
            <TouchableOpacity
              style={[styles.chooseCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={handleConnectBank}
              activeOpacity={0.8}
            >
              <View style={[styles.chooseIconWrap, { backgroundColor: colors.primary + "18" }]}>
                <Feather name="home" size={36} color={colors.primary} />
                <View style={styles.choosePlusBadge}>
                  <Feather name="plus" size={13} color={colors.primary} />
                </View>
              </View>
              <Text style={[styles.chooseTitle, { color: colors.primary }]}>
                Connect your bank A/c
              </Text>
              <Text style={[styles.chooseSub, { color: colors.mutedForeground }]}>
                Connect your bank to automatically fetch account and its transactions.
              </Text>
            </TouchableOpacity>

            <View style={styles.orRow}>
              <View style={[styles.orLine, { backgroundColor: colors.border }]} />
              <Text style={[styles.orText, { color: colors.mutedForeground }]}>OR</Text>
              <View style={[styles.orLine, { backgroundColor: colors.border }]} />
            </View>

            {/* Manual account */}
            <TouchableOpacity
              style={[styles.chooseCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setStep("type");
              }}
              activeOpacity={0.8}
            >
              <View style={[styles.chooseIconWrap, { backgroundColor: colors.primary + "18" }]}>
                <Feather name="settings" size={30} color={colors.primary} />
                <Feather
                  name="edit-3"
                  size={16}
                  color={colors.primary}
                  style={{ position: "absolute", right: 6, bottom: 6 }}
                />
              </View>
              <Text style={[styles.chooseTitle, { color: colors.primary }]}>
                Add Manual Account
              </Text>
              <Text style={[styles.chooseSub, { color: colors.mutedForeground }]}>
                You will manually add transactions to this type of account.
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Step 2: Type picker ── */}
        {step === "type" && (
          <>
            <ScrollView
              contentContainerStyle={{ padding: 16, gap: 4, paddingBottom: 100 }}
              showsVerticalScrollIndicator={false}
            >
              {ACCOUNT_CATEGORIES.map((cat) => (
                <View key={cat.label}>
                  <Text style={[styles.catLabel, { color: colors.mutedForeground }]}>
                    {cat.label}
                  </Text>
                  <View style={styles.typeGrid}>
                    {cat.items.map((sub) => {
                      const selected =
                        selectedSubType?.label === sub.label &&
                        selectedSubType?.type === sub.type;
                      return (
                        <TouchableOpacity
                          key={`${cat.label}-${sub.label}`}
                          style={[
                            styles.typeCell,
                            {
                              backgroundColor: selected
                                ? colors.primary + "18"
                                : colors.card,
                              borderColor: selected
                                ? colors.primary
                                : colors.border,
                            },
                          ]}
                          onPress={() => handleSelectType(sub)}
                          activeOpacity={0.75}
                        >
                          <Feather
                            name={sub.icon as any}
                            size={28}
                            color={selected ? colors.primary : colors.primary}
                          />
                          <Text
                            style={[
                              styles.typeCellLabel,
                              { color: selected ? colors.primary : colors.foreground },
                            ]}
                            numberOfLines={1}
                          >
                            {sub.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}
            </ScrollView>

            {/* Bottom bar */}
            <View
              style={[
                styles.typeBottomBar,
                {
                  borderTopColor: colors.border,
                  paddingBottom: Platform.OS === "web" ? 20 : insets.bottom + 12,
                  backgroundColor: colors.background,
                },
              ]}
            >
              <TouchableOpacity
                style={[styles.backBtn, { borderColor: colors.border }]}
                onPress={() => setStep("choose")}
              >
                <Text style={[styles.backBtnText, { color: colors.foreground }]}>
                  BACK
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.nextBtn,
                  {
                    backgroundColor: selectedSubType ? colors.primary : colors.muted,
                  },
                ]}
                onPress={handleNext}
                disabled={!selectedSubType}
              >
                <Text
                  style={[
                    styles.nextBtnText,
                    { color: selectedSubType ? "#fff" : colors.mutedForeground },
                  ]}
                >
                  NEXT ›
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ── Step 3: Form ── */}
        {step === "form" && (
          <>
            <KeyboardAwareScrollView
              contentContainerStyle={{ paddingBottom: (Platform.OS === "web" ? 20 : insets.bottom) + 100 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>

                {/* Row 1 — Account type (from step 2) */}
                <TouchableOpacity style={styles.fRow} onPress={() => setStep("type")} activeOpacity={0.7}>
                  <View style={[styles.fIcon, { backgroundColor: colors.primary + "18" }]}>
                    <Feather name={selectedSubType?.icon as any ?? "credit-card"} size={18} color={colors.primary} />
                  </View>
                  <Text style={[styles.fLabel, { color: colors.foreground }]} numberOfLines={1}>
                    {selectedSubType?.label ?? "Account"}
                  </Text>
                  <View style={[styles.fIconRight, { backgroundColor: colors.muted }]}>
                    <Feather name="settings" size={16} color={colors.mutedForeground} />
                  </View>
                </TouchableOpacity>

                <View style={[styles.fDivider, { backgroundColor: colors.border }]} />

                {/* Row 2 — Bank / Institution (tappable picker) */}
                <TouchableOpacity
                  style={styles.fRow}
                  activeOpacity={0.7}
                  onPress={() => { setBankSearch(""); setShowBankPicker(true); }}
                >
                  {bank ? (
                    <>
                      <View style={[styles.fIcon, { backgroundColor: (PLAID_BANKS.find(b => b.name === bank)?.color ?? "#4a6fa5") + "22" }]}>
                        <Text style={{ fontSize: 17 }}>
                          {PLAID_BANKS.find(b => b.name === bank)?.icon ?? "🏦"}
                        </Text>
                      </View>
                      <Text style={[styles.fLabel, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>{bank}</Text>
                    </>
                  ) : (
                    <>
                      <View style={[styles.fIcon, { backgroundColor: "#e8f0fe" }]}>
                        <Feather name="briefcase" size={18} color="#4a6fa5" />
                      </View>
                      <Text style={[styles.fInput, { color: colors.mutedForeground }]}>Select Bank/Institution</Text>
                    </>
                  )}
                  <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                </TouchableOpacity>

                <View style={[styles.fDivider, { backgroundColor: colors.border }]} />

                {/* Row 3 — Account Name */}
                <View style={styles.fRow}>
                  <View style={[styles.fIcon, { backgroundColor: "#e8f0fe" }]}>
                    <Feather name="credit-card" size={18} color="#4a6fa5" />
                  </View>
                  <TextInput
                    style={[styles.fInput, { color: colors.foreground }]}
                    placeholder="Account Name"
                    placeholderTextColor={colors.mutedForeground}
                    value={name}
                    onChangeText={setName}
                    returnKeyType="next"
                  />
                </View>

                <View style={[styles.fDivider, { backgroundColor: colors.border }]} />

                {/* Row 4 — Account Number */}
                <View style={[styles.fRow, { alignItems: "flex-start", paddingVertical: 14 }]}>
                  <View style={[styles.fIcon, { backgroundColor: "#e8f0fe", marginTop: 2 }]}>
                    <Feather name="hash" size={18} color="#4a6fa5" />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <TextInput
                      style={[styles.fInput, { color: colors.foreground, paddingVertical: 0 }]}
                      placeholder="Account Number"
                      placeholderTextColor={colors.mutedForeground}
                      keyboardType="number-pad"
                      maxLength={4}
                      value={lastFour}
                      onChangeText={setLastFour}
                      returnKeyType="next"
                    />
                    <Text style={[styles.fSublabel, { color: colors.mutedForeground }]}>
                      Entering last 4 digit is recommended.
                    </Text>
                  </View>
                </View>

                <View style={[styles.fDivider, { backgroundColor: colors.border }]} />

                {/* Row 5 — Currency (static CAD) */}
                <View style={styles.fRow}>
                  <View style={[styles.fIcon, { backgroundColor: "#e8f4f0" }]}>
                    <Feather name="repeat" size={18} color="#2e8b6e" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fSubtitle, { color: colors.mutedForeground }]}>Currency</Text>
                    <Text style={[styles.fLabel, { color: colors.foreground }]}>CAD</Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                </View>

                <View style={[styles.fDivider, { backgroundColor: colors.border }]} />

                {/* Row 6 — Starting balance */}
                <View style={styles.fRow}>
                  <View style={[styles.fIcon, { backgroundColor: "#e8f0fe" }]}>
                    <Feather name="dollar-sign" size={18} color="#4a6fa5" />
                  </View>
                  <TextInput
                    style={[styles.fInput, { color: colors.foreground }]}
                    placeholder="Starting balance"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                    value={balance}
                    onChangeText={setBalance}
                  />
                </View>

                <View style={[styles.fDivider, { backgroundColor: colors.border }]} />

                {/* Row 7 — Include in net worth */}
                <View style={[styles.fRow, { minHeight: 60 }]}>
                  <View style={[styles.fIcon, { backgroundColor: "#e8f4f0" }]}>
                    <Feather name="archive" size={18} color="#2e8b6e" />
                  </View>
                  <Text style={[styles.fLabel, { color: colors.foreground, flex: 1, flexWrap: "wrap", paddingRight: 8 }]}>
                    Include balance of this account into overall balance or net worth.
                  </Text>
                  <Switch
                    value={includeInNetworth}
                    onValueChange={setIncludeInNetworth}
                    trackColor={{ false: colors.muted, true: colors.primary }}
                    thumbColor="#fff"
                  />
                </View>

                <View style={[styles.fDivider, { backgroundColor: colors.border }]} />

                {/* Row 8 — Joint account */}
                <View style={styles.fRow}>
                  <View style={[styles.fIcon, { backgroundColor: "#e8f0fe" }]}>
                    <Feather name="users" size={18} color="#4a6fa5" />
                  </View>
                  <Text style={[styles.fLabel, { color: colors.foreground, flex: 1 }]}>
                    Joint account
                  </Text>
                  <Switch
                    value={isJoint}
                    onValueChange={setIsJoint}
                    trackColor={{ false: colors.muted, true: colors.primary }}
                    thumbColor="#fff"
                  />
                </View>

                <View style={[styles.fDivider, { backgroundColor: colors.border }]} />

                {/* Row 9 — Account holder */}
                <View style={styles.fRow}>
                  <View style={[styles.fIcon, { backgroundColor: "#e8f0fe" }]}>
                    <Feather name="user" size={18} color="#4a6fa5" />
                  </View>
                  <TextInput
                    style={[styles.fInput, { color: colors.foreground }]}
                    placeholder="Account holder name (optional)"
                    placeholderTextColor={colors.mutedForeground}
                    value={accountHolder}
                    onChangeText={setAccountHolder}
                    autoCapitalize="words"
                  />
                </View>

              </View>
            </KeyboardAwareScrollView>

            {/* Bottom bar */}
            <View
              style={[
                styles.typeBottomBar,
                {
                  borderTopColor: colors.border,
                  paddingBottom: Platform.OS === "web" ? 20 : insets.bottom + 12,
                  backgroundColor: colors.background,
                },
              ]}
            >
              <TouchableOpacity
                style={[styles.backBtn, { borderColor: colors.border }]}
                onPress={() => setStep("type")}
              >
                <Text style={[styles.backBtnText, { color: colors.foreground }]}>BACK</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.nextBtn,
                  { backgroundColor: name.trim() ? colors.primary : colors.muted },
                ]}
                onPress={handleSave}
                disabled={!name.trim()}
              >
                <Text
                  style={[
                    styles.nextBtnText,
                    { color: name.trim() ? "#fff" : colors.mutedForeground },
                  ]}
                >
                  CREATE
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* ── Bank Picker Modal ── */}
      <Modal
        visible={showBankPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowBankPicker(false)}
      >
        <View style={[styles.pickerRoot, { backgroundColor: colors.background, paddingTop: Platform.OS === "web" ? 20 : insets.top + 12 }]}>
          {/* Header */}
          <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowBankPicker(false)} hitSlop={8}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.pickerTitle, { color: colors.foreground }]}>Select Bank</Text>
            <View style={{ width: 22 }} />
          </View>

          {/* Search */}
          <View style={[styles.pickerSearchRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="search" size={16} color={colors.mutedForeground} />
            <TextInput
              style={[styles.pickerSearchInput, { color: colors.foreground }]}
              placeholder="Search banks…"
              placeholderTextColor={colors.mutedForeground}
              value={bankSearch}
              onChangeText={setBankSearch}
              autoFocus
              clearButtonMode="while-editing"
            />
          </View>

          {/* Bank list */}
          <ScrollView
            contentContainerStyle={{ paddingBottom: (Platform.OS === "web" ? 20 : insets.bottom) + 20 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.pickerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {filteredBanks.length === 0 && (
                <View style={{ padding: 24, alignItems: "center" }}>
                  <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>No banks found</Text>
                </View>
              )}
              {filteredBanks.map((b, idx) => (
                <View key={b.id}>
                  <TouchableOpacity
                    style={styles.bankRow}
                    activeOpacity={0.7}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setBank(b.name);
                      setShowBankPicker(false);
                    }}
                  >
                    <View style={[styles.bankIconCircle, { backgroundColor: b.color + "22" }]}>
                      <Text style={{ fontSize: 20 }}>{b.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.bankName, { color: colors.foreground }]}>{b.name}</Text>
                      <Text style={[styles.bankSub, { color: colors.mutedForeground }]}>
                        {b.accountTypes.map((t) =>
                          t === "checking" ? "Chequing"
                          : t === "savings" ? "Savings"
                          : t === "credit" ? "Credit"
                          : "Investment"
                        ).join(" · ")}
                      </Text>
                    </View>
                    {bank === b.name && (
                      <Feather name="check-circle" size={20} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                  {idx < filteredBanks.length - 1 && (
                    <View style={[styles.fDivider, { backgroundColor: colors.border, marginLeft: 68 }]} />
                  )}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Duplicate account confirm */}
      <ConfirmModal
        visible={!!duplicateAccount}
        title="Account Already Exists"
        message={
          duplicateAccount
            ? duplicateAccount.lastFour && duplicateAccount.bank
              ? `"${duplicateAccount.name}" at ${duplicateAccount.bank} ending in ••••${duplicateAccount.lastFour} already exists. Creating a duplicate may cause incorrect transaction matching.`
              : `An account named "${duplicateAccount.name}" already exists. Do you want to create another one?`
            : ""
        }
        confirmLabel="Create Anyway"
        cancelLabel="Cancel"
        onCancel={() => setDuplicateAccount(null)}
        onConfirm={() => {
          setDuplicateAccount(null);
          doSave(true);
        }}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },

  // Step 1 — choose
  chooseContent: { flex: 1, padding: 20, gap: 0, justifyContent: "center" },
  chooseCard: {
    borderRadius: 16, borderWidth: 1,
    padding: 28, alignItems: "center", gap: 12,
  },
  chooseIconWrap: {
    width: 80, height: 80, borderRadius: 24,
    alignItems: "center", justifyContent: "center",
    position: "relative",
  },
  choosePlusBadge: {
    position: "absolute", right: 6, bottom: 6,
  },
  chooseTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  chooseSub: {
    fontSize: 13, fontFamily: "Inter_400Regular",
    lineHeight: 19, textAlign: "center",
  },
  orRow: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 18 },
  orLine: { flex: 1, height: 1 },
  orText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  // Step 2 — type grid
  catLabel: {
    fontSize: 12, fontFamily: "Inter_700Bold",
    letterSpacing: 0.6, marginTop: 16, marginBottom: 10,
    textTransform: "uppercase",
  },
  typeGrid: {
    flexDirection: "row", flexWrap: "wrap", gap: 10,
  },
  typeCell: {
    width: "30%",
    flexGrow: 1,
    aspectRatio: 1,
    borderRadius: 14, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
    gap: 8, padding: 10,
    minWidth: 90, maxWidth: 120,
  },
  typeCellLabel: {
    fontSize: 12, fontFamily: "Inter_500Medium", textAlign: "center",
  },

  // Bottom bar (shared by steps 2 & 3)
  typeBottomBar: {
    flexDirection: "row", gap: 12,
    paddingHorizontal: 20, paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    flex: 1, borderRadius: 50, borderWidth: 1.5,
    paddingVertical: 15, alignItems: "center", justifyContent: "center",
  },
  backBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  nextBtn: {
    flex: 2, borderRadius: 50,
    paddingVertical: 15, alignItems: "center", justifyContent: "center",
  },
  nextBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },

  // Step 3 — flat-row form
  formCard: {
    marginHorizontal: 16, marginTop: 16,
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  fRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12, gap: 12, minHeight: 54,
  },
  fDivider: { height: StyleSheet.hairlineWidth, marginLeft: 60 },
  fIcon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  fIconRight: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
  },
  fLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  fSubtitle: { fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 2 },
  fSublabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  fInput: {
    flex: 1, fontSize: 15, fontFamily: "Inter_400Regular",
    paddingVertical: 4,
  },

  // Bank picker modal
  pickerRoot: { flex: 1 },
  pickerHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  pickerSearchRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: 16, marginVertical: 12,
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  pickerSearchInput: {
    flex: 1, fontSize: 15, fontFamily: "Inter_400Regular",
  },
  pickerCard: {
    marginHorizontal: 16, borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth, overflow: "hidden",
  },
  bankRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14, gap: 14,
  },
  bankIconCircle: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  bankName: { fontSize: 15, fontFamily: "Inter_500Medium" },
  bankSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
});
