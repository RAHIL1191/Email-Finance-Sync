import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { router } from "expo-router";

import { useApp } from "@/context/AppContext";
import { useDrawer } from "@/context/DrawerContext";
import { useColors } from "@/hooks/useColors";
import FamilySyncSection from "./drawer/FamilySyncSection";

const DRAWER_WIDTH = 300;
const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function Drawer() {
  const { isOpen, closeDrawer } = useDrawer();
  const { projects, userName, setUserName } = useApp();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");

  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const isVisible = useRef(false);

  useEffect(() => {
    if (isOpen) {
      isVisible.current = true;
      Animated.parallel([
        Animated.spring(translateX, {
          toValue: 0,
          damping: 22,
          stiffness: 200,
          mass: 0.8,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: -DRAWER_WIDTH,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start(() => {
        isVisible.current = false;
      });
    }
  }, [isOpen]);

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    closeDrawer();
  };

  const navigateTo = (path: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    closeDrawer();
    setTimeout(() => router.push(path as any), 220);
  };

  if (!isOpen && !isVisible.current) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View
        style={[styles.backdrop, { opacity: backdropOpacity }]}
        pointerEvents={isOpen ? "auto" : "none"}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      </Animated.View>

      {/* Drawer panel */}
      <Animated.View
        style={[
          styles.panel,
          {
            backgroundColor: colors.card,
            transform: [{ translateX }],
            paddingTop: Platform.OS === "web" ? 20 : insets.top,
            paddingBottom: insets.bottom + 16,
            shadowColor: colors.foreground,
            width: Math.min(DRAWER_WIDTH, SCREEN_WIDTH * 0.82),
          },
        ]}
      >
        {/* ── Header ── */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={styles.headerLeft}>
            <View style={[styles.logoWrap, { backgroundColor: colors.primary }]}>
              <Feather name="trending-up" size={16} color="#fff" />
            </View>
            <Text style={[styles.appName, { color: colors.foreground }]}>FinTrack</Text>
          </View>
          <TouchableOpacity onPress={handleClose} hitSlop={10} style={styles.closeBtn}>
            <Feather name="x" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {/* ── Sections ── */}
        <ScrollView style={styles.sections} showsVerticalScrollIndicator={false}>
          {/* Family Sync */}
          <FamilySyncSection />

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* AI Spend Review */}
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigateTo("/ai-review")}
            activeOpacity={0.8}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: "#8b5cf6" + "18" }]}>
              <Feather name="cpu" size={15} color="#8b5cf6" />
            </View>
            <View style={styles.menuTextWrap}>
              <Text style={[styles.menuTitle, { color: colors.foreground }]}>AI Spend Review</Text>
              <Text style={[styles.menuSub, { color: colors.mutedForeground }]}>
                Score your purchases with AI
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Refunds */}
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigateTo("/refunds")}
            activeOpacity={0.8}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: "#10b981" + "18" }]}>
              <Feather name="rotate-ccw" size={15} color="#10b981" />
            </View>
            <View style={styles.menuTextWrap}>
              <Text style={[styles.menuTitle, { color: colors.foreground }]}>Refunds</Text>
              <Text style={[styles.menuSub, { color: colors.mutedForeground }]}>
                Review completed refunds
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Budget */}
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigateTo("/(tabs)/budget")}
            activeOpacity={0.8}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: "#6366f1" + "18" }]}>
              <Feather name="pie-chart" size={15} color="#6366f1" />
            </View>
            <View style={styles.menuTextWrap}>
              <Text style={[styles.menuTitle, { color: colors.foreground }]}>Budget</Text>
              <Text style={[styles.menuSub, { color: colors.mutedForeground }]}>
                Track budgets & savings goals
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Tasks */}
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigateTo("/(tabs)/tasks")}
            activeOpacity={0.8}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: "#f59e0b18" }]}>
              <Feather name="check-square" size={15} color="#f59e0b" />
            </View>
            <View style={styles.menuTextWrap}>
              <Text style={[styles.menuTitle, { color: colors.foreground }]}>Tasks</Text>
              <Text style={[styles.menuSub, { color: colors.mutedForeground }]}>
                Track subscriptions & reminders
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Projects */}
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigateTo("/projects")}
            activeOpacity={0.8}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: "#f97316" + "18" }]}>
              <Feather name="folder" size={15} color="#f97316" />
            </View>
            <View style={styles.menuTextWrap}>
              <Text style={[styles.menuTitle, { color: colors.foreground }]}>Projects</Text>
              <Text style={[styles.menuSub, { color: colors.mutedForeground }]}>
                {projects.length > 0
                  ? `${projects.length} project${projects.length !== 1 ? "s" : ""} · tap to manage`
                  : "Track trips, events & goals"}
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Notifications */}
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigateTo("/notifications")}
            activeOpacity={0.8}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: "#3b82f6" + "18" }]}>
              <Feather name="bell" size={15} color="#3b82f6" />
            </View>
            <View style={styles.menuTextWrap}>
              <Text style={[styles.menuTitle, { color: colors.foreground }]}>Notifications</Text>
              <Text style={[styles.menuSub, { color: colors.mutedForeground }]}>
                Manage alerts & reminders
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        </ScrollView>

        {/* ── Footer ── */}
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          {editingName ? (
            <View style={styles.nameRow}>
              <TextInput
                style={[styles.nameInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                value={nameInput}
                onChangeText={setNameInput}
                placeholder="Your name"
                placeholderTextColor={colors.mutedForeground}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => {
                  if (nameInput.trim()) setUserName(nameInput.trim());
                  setEditingName(false);
                }}
              />
              <TouchableOpacity
                onPress={() => {
                  if (nameInput.trim()) setUserName(nameInput.trim());
                  setEditingName(false);
                }}
                style={[styles.nameSaveBtn, { backgroundColor: colors.primary }]}
              >
                <Feather name="check" size={14} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => { setNameInput(userName); setEditingName(true); }}
              style={styles.nameDisplayRow}
              hitSlop={8}
            >
              <Feather name="user" size={13} color={colors.mutedForeground} />
              <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
                {userName ? userName : "Set your name"}
              </Text>
              <Feather name="edit-2" size={11} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    zIndex: 998,
  },
  panel: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    zIndex: 999,
    elevation: 24,
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    flexDirection: "column",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  logoWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  appName: { fontSize: 17, fontFamily: "Inter_700Bold" },
  closeBtn: { padding: 4 },
  sections: { flex: 1, paddingTop: 8 },
  divider: { height: 1, marginHorizontal: 20, marginVertical: 8 },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  menuIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  menuTextWrap: { flex: 1 },
  menuTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  menuSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.6 },
  addBtn: { width: 24, height: 24, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  emptyProjects: {
    marginHorizontal: 20,
    marginVertical: 6,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    gap: 6,
  },
  emptyProjectsText: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 17 },
  footer: {
    borderTopWidth: 1,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 4,
    alignItems: "center",
  },
  footerText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  nameDisplayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: "100%",
  },
  nameInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  nameSaveBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});

const drawerStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
});
