import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDrawer } from "@/context/DrawerContext";
import { useColors } from "@/hooks/useColors";
import FamilySyncSection from "./drawer/FamilySyncSection";

const DRAWER_WIDTH = 300;
const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function Drawer() {
  const { isOpen, closeDrawer } = useDrawer();
  const colors = useColors();
  const insets = useSafeAreaInsets();

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
        <View style={styles.sections}>
          {/* Family Sync */}
          <FamilySyncSection />

          {/* Divider — more sections will go here */}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Placeholder for future sections */}
          <View style={styles.comingSoon}>
            <Feather name="settings" size={15} color={colors.mutedForeground} />
            <Text style={[styles.comingSoonText, { color: colors.mutedForeground }]}>
              More settings coming soon
            </Text>
          </View>
        </View>

        {/* ── Footer ── */}
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
            FinTrack · Family Edition
          </Text>
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
  comingSoon: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    opacity: 0.6,
  },
  comingSoonText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  footer: {
    borderTopWidth: 1,
    paddingTop: 12,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  footerText: { fontSize: 11, fontFamily: "Inter_400Regular" },
});
