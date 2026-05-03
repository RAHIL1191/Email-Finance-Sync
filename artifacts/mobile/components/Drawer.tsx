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

const PROJECT_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#64748b",
];

function NewProjectModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addProject } = useApp();

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [color, setColor] = useState(PROJECT_COLORS[0]);

  const reset = () => { setName(""); setDesc(""); setColor(PROJECT_COLORS[0]); };

  const handleCreate = () => {
    if (!name.trim()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addProject({ name: name.trim(), color, description: desc.trim() || undefined });
    reset();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { reset(); onClose(); }}>
      <TouchableOpacity style={drawerStyles.overlay} activeOpacity={1} onPress={() => { reset(); onClose(); }} />
      <View style={[drawerStyles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
        <View style={[drawerStyles.sheetHeader, { borderBottomColor: colors.border }]}>
          <Text style={[drawerStyles.sheetTitle, { color: colors.foreground }]}>New Project</Text>
          <TouchableOpacity onPress={() => { reset(); onClose(); }}>
            <Feather name="x" size={20} color={colors.foreground} />
          </TouchableOpacity>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 14 }}>
          <TextInput
            style={[drawerStyles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.accent }]}
            placeholder="Project name (e.g. Europe Trip)"
            placeholderTextColor={colors.mutedForeground}
            value={name}
            onChangeText={setName}
            autoFocus
            returnKeyType="next"
          />
          <TextInput
            style={[drawerStyles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.accent }]}
            placeholder="Description (optional)"
            placeholderTextColor={colors.mutedForeground}
            value={desc}
            onChangeText={setDesc}
            returnKeyType="done"
          />
          <Text style={[drawerStyles.colorLabel, { color: colors.mutedForeground }]}>Color</Text>
          <View style={drawerStyles.colorRow}>
            {PROJECT_COLORS.map((c) => (
              <TouchableOpacity
                key={c}
                style={[drawerStyles.colorSwatch, { backgroundColor: c, borderWidth: color === c ? 3 : 0, borderColor: "#fff" }]}
                onPress={() => setColor(c)}
              />
            ))}
          </View>
          <TouchableOpacity
            style={[drawerStyles.createBtn, { backgroundColor: name.trim() ? colors.primary : colors.border }]}
            onPress={handleCreate}
            activeOpacity={name.trim() ? 0.8 : 1}
          >
            <Text style={drawerStyles.createBtnText}>Create Project</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function Drawer() {
  const { isOpen, closeDrawer } = useDrawer();
  const { projects, transactions } = useApp();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [showNewProject, setShowNewProject] = useState(false);

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

          {/* Projects section */}
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>PROJECTS</Text>
            <TouchableOpacity
              onPress={() => setShowNewProject(true)}
              hitSlop={10}
              style={[styles.addBtn, { backgroundColor: colors.primary + "18" }]}
            >
              <Feather name="plus" size={14} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {projects.length === 0 ? (
            <TouchableOpacity
              style={[styles.emptyProjects, { borderColor: colors.border }]}
              onPress={() => setShowNewProject(true)}
              activeOpacity={0.7}
            >
              <Feather name="folder-plus" size={18} color={colors.mutedForeground} />
              <Text style={[styles.emptyProjectsText, { color: colors.mutedForeground }]}>
                Create a project to track{"\n"}trip, event, or goal spending
              </Text>
            </TouchableOpacity>
          ) : (
            projects.map((p) => {
              const txCount = transactions.filter((t) => t.projectId === p.id).length;
              const total = transactions
                .filter((t) => t.projectId === p.id && t.type === "expense")
                .reduce((s, t) => s + t.amount, 0);
              return (
                <TouchableOpacity
                  key={p.id}
                  style={styles.menuItem}
                  onPress={() => navigateTo(`/project-detail?id=${p.id}`)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.menuIconWrap, { backgroundColor: p.color + "22" }]}>
                    <Feather name="folder" size={15} color={p.color} />
                  </View>
                  <View style={styles.menuTextWrap}>
                    <Text style={[styles.menuTitle, { color: colors.foreground }]} numberOfLines={1}>{p.name}</Text>
                    <Text style={[styles.menuSub, { color: colors.mutedForeground }]}>
                      {txCount} transaction{txCount !== 1 ? "s" : ""}{total > 0 ? ` · $${total.toFixed(2)}` : ""}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>

        {/* ── Footer ── */}
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
            FinTrack · Family Edition
          </Text>
        </View>
      </Animated.View>

      <NewProjectModal visible={showNewProject} onClose={() => setShowNewProject(false)} />
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
    alignItems: "center",
  },
  footerText: { fontSize: 11, fontFamily: "Inter_400Regular" },
});

const drawerStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "75%",
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  colorLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.6 },
  colorRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  colorSwatch: { width: 32, height: 32, borderRadius: 16 },
  createBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  createBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
