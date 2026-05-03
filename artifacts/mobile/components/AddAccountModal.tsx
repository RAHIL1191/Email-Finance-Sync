import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

type Step = "choose" | "type" | "form";
type AccountBaseType = "checking" | "savings" | "credit" | "investment";

interface SubType {
  label: string;
  icon: string;
  type: AccountBaseType;
}

const ACCOUNT_CATEGORIES: { label: string; items: SubType[] }[] = [
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
  const { addAccount } = useApp();

  const [step, setStep] = useState<Step>("choose");
  const [selectedSubType, setSelectedSubType] = useState<SubType | null>(null);

  // Form fields
  const [name, setName] = useState("");
  const [bank, setBank] = useState("");
  const [balance, setBalance] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [lastFour, setLastFour] = useState("");

  const reset = () => {
    setStep("choose");
    setSelectedSubType(null);
    setName("");
    setBank("");
    setBalance("");
    setColor(PALETTE[0]);
    setLastFour("");
  };

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

  const handleSave = () => {
    if (!name.trim() || !bank.trim() || !selectedSubType) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addAccount({
      name: name.trim(),
      bank: bank.trim(),
      balance: parseFloat(balance || "0"),
      type: selectedSubType.type,
      color,
      lastFour: lastFour.trim() || undefined,
    });
    handleClose();
  };

  const topPad = (Platform.OS === "web" ? 20 : insets.top) + 16;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
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
            <ScrollView
              contentContainerStyle={[
                styles.formContent,
                { paddingBottom: insets.bottom + 100 },
              ]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Selected type chip */}
              {selectedSubType && (
                <View
                  style={[
                    styles.selectedTypeChip,
                    { backgroundColor: colors.primary + "15", borderColor: colors.primary + "40" },
                  ]}
                >
                  <Feather name={selectedSubType.icon as any} size={16} color={colors.primary} />
                  <Text style={[styles.selectedTypeText, { color: colors.primary }]}>
                    {selectedSubType.label}
                  </Text>
                  <TouchableOpacity onPress={() => setStep("type")} hitSlop={8}>
                    <Feather name="edit-2" size={13} color={colors.primary} />
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.formSection}>
                <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>
                  Account Name
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
                  placeholder={selectedSubType?.label || "e.g. Main Checking"}
                  placeholderTextColor={colors.mutedForeground}
                  value={name}
                  onChangeText={setName}
                />
              </View>

              <View style={styles.formSection}>
                <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>
                  Bank / Institution
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
                  placeholder="e.g. Chase Bank"
                  placeholderTextColor={colors.mutedForeground}
                  value={bank}
                  onChangeText={setBank}
                />
              </View>

              <View style={styles.formSection}>
                <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>
                  Current Balance
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
                  placeholder="0.00"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                  value={balance}
                  onChangeText={setBalance}
                />
              </View>

              <View style={styles.formSection}>
                <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>
                  Last 4 Digits (optional)
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
                  placeholder="1234"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="number-pad"
                  maxLength={4}
                  value={lastFour}
                  onChangeText={setLastFour}
                />
              </View>

              <View style={styles.formSection}>
                <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>
                  Color
                </Text>
                <View style={styles.paletteRow}>
                  {PALETTE.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[styles.colorDot, { backgroundColor: c }, color === c && styles.selectedDot]}
                      onPress={() => setColor(c)}
                    >
                      {color === c && <Feather name="check" size={14} color="#fff" />}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
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
                onPress={() => setStep("type")}
              >
                <Text style={[styles.backBtnText, { color: colors.foreground }]}>
                  BACK
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.nextBtn,
                  { backgroundColor: name.trim() && bank.trim() ? colors.primary : colors.muted },
                ]}
                onPress={handleSave}
                disabled={!name.trim() || !bank.trim()}
              >
                <Text
                  style={[
                    styles.nextBtnText,
                    { color: name.trim() && bank.trim() ? "#fff" : colors.mutedForeground },
                  ]}
                >
                  SAVE
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
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

  // Step 3 — form
  formContent: { padding: 20, gap: 22 },
  selectedTypeChip: {
    flexDirection: "row", alignItems: "center", gap: 8,
    alignSelf: "flex-start", borderRadius: 50,
    paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1,
  },
  selectedTypeText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  formSection: { gap: 8 },
  formLabel: {
    fontSize: 12, fontFamily: "Inter_500Medium",
    textTransform: "uppercase", letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, fontFamily: "Inter_400Regular",
  },
  paletteRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  colorDot: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
  },
  selectedDot: { borderWidth: 3, borderColor: "rgba(255,255,255,0.7)" },
});
