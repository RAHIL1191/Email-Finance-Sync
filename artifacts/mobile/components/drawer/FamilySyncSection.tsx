import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { useApp, generateHouseholdCode } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

export default function FamilySyncSection() {
  const colors = useColors();
  const { householdId, changeHouseholdId } = useApp();

  const [joinModalVisible, setJoinModalVisible] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");

  // Format: "X7K 4NP" for readability
  const formattedCode = householdId
    ? `${householdId.slice(0, 3)} ${householdId.slice(3)}`
    : "------";

  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Share.share({
        message: `Join my FinTrack family! Use code: ${householdId}\n\nOpen FinTrack → Menu → Family Sync → Join a Family, then enter this code to see all our shared finances.`,
        title: "Join my FinTrack Family",
      });
    } catch {}
  };

  const handleJoin = async () => {
    const code = joinCode.trim().toUpperCase().replace(/\s/g, "");
    if (code.length < 4) {
      setJoinError("Please enter a valid code (at least 4 characters).");
      return;
    }
    setJoining(true);
    setJoinError("");
    try {
      await changeHouseholdId(code);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setJoinModalVisible(false);
      setJoinCode("");
    } catch {
      setJoinError("Something went wrong. Please try again.");
    } finally {
      setJoining(false);
    }
  };

  const handleCreateNew = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      "Create New Code",
      "This will generate a new family code and clear your local data. Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Create New",
          style: "destructive",
          onPress: async () => {
            const newCode = generateHouseholdCode();
            await changeHouseholdId(newCode);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ]
    );
  };

  return (
    <View style={styles.section}>
      {/* ── Section title ── */}
      <View style={styles.titleRow}>
        <View style={[styles.iconWrap, { backgroundColor: colors.primary + "18" }]}>
          <Feather name="users" size={15} color={colors.primary} />
        </View>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Family Sync</Text>
      </View>

      {/* ── Description ── */}
      <Text style={[styles.desc, { color: colors.mutedForeground }]}>
        Share this code with family members. Anyone using the same code sees the same accounts, transactions, and bills in real time.
      </Text>

      {/* ── Code display ── */}
      <View style={[styles.codeCard, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }]}>
        <Text style={[styles.codeLabel, { color: colors.mutedForeground }]}>YOUR FAMILY CODE</Text>
        <Text style={[styles.code, { color: colors.primary }]} selectable>
          {formattedCode}
        </Text>
        <Text style={[styles.codeHint, { color: colors.mutedForeground }]}>
          Tap and hold to copy · or tap Share below
        </Text>
      </View>

      {/* ── Actions ── */}
      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
        onPress={handleShare}
        activeOpacity={0.85}
      >
        <Feather name="share-2" size={15} color="#fff" />
        <Text style={styles.primaryBtnText}>Share Code with Family</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.secondaryBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
        onPress={() => { setJoinModalVisible(true); setJoinError(""); setJoinCode(""); }}
        activeOpacity={0.8}
      >
        <Feather name="log-in" size={15} color={colors.foreground} />
        <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>Join a Family</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.ghostBtn}
        onPress={handleCreateNew}
        activeOpacity={0.7}
      >
        <Feather name="refresh-cw" size={12} color={colors.mutedForeground} />
        <Text style={[styles.ghostBtnText, { color: colors.mutedForeground }]}>Create New Code</Text>
      </TouchableOpacity>

      {/* ── Join Modal ── */}
      <Modal
        visible={joinModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setJoinModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, shadowColor: colors.foreground }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Join a Family</Text>
            <Text style={[styles.modalDesc, { color: colors.mutedForeground }]}>
              Enter the 6-character code shared by a family member.
            </Text>

            <TextInput
              style={[
                styles.codeInput,
                {
                  backgroundColor: colors.background,
                  borderColor: joinError ? "#ef4444" : colors.border,
                  color: colors.foreground,
                },
              ]}
              placeholder="e.g.  X7K4NP"
              placeholderTextColor={colors.mutedForeground}
              value={joinCode}
              onChangeText={(t) => { setJoinCode(t.toUpperCase()); setJoinError(""); }}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={8}
              keyboardType="default"
              returnKeyType="done"
              onSubmitEditing={handleJoin}
            />

            {joinError ? (
              <Text style={styles.errorText}>{joinError}</Text>
            ) : null}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: colors.border }]}
                onPress={() => setJoinModalVisible(false)}
              >
                <Text style={[styles.modalCancelText, { color: colors.foreground }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, { backgroundColor: colors.primary }]}
                onPress={handleJoin}
                disabled={joining}
              >
                {joining
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.modalConfirmText}>Join</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 20, paddingVertical: 16 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  iconWrap: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  desc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17, marginBottom: 14 },

  codeCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    marginBottom: 14,
    gap: 4,
  },
  codeLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1.2 },
  code: { fontSize: 32, fontFamily: "Inter_700Bold", letterSpacing: 6, marginVertical: 4 },
  codeHint: { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center" },

  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  primaryBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },

  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  secondaryBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },

  ghostBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
  },
  ghostBtnText: { fontSize: 12, fontFamily: "Inter_400Regular" },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 20,
    padding: 24,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 6 },
  modalDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18, marginBottom: 18 },
  codeInput: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: 4,
    textAlign: "center",
    marginBottom: 6,
  },
  errorText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#ef4444",
    textAlign: "center",
    marginBottom: 8,
  },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  modalCancelText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  modalConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  modalConfirmText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
