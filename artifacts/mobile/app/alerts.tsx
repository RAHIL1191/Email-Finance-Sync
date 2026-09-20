import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useMemo } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

function formatAlertDate(isoString: string) {
  const d = new Date(isoString);
  const now = new Date();

  if (d.toDateString() === now.toDateString()) {
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${hours}:${minutes} ${ampm}`;
  }

  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }

  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

export default function AlertsScreen() {
  const colors = useColors();
  const {
    alerts,
    markAlertRead,
    markAllAlertsRead,
    clearAllAlerts,
    deleteAlert,
  } = useApp();

  // Sort chronologically reverse (newest first)
  const sortedAlerts = useMemo(() => {
    return [...alerts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [alerts]);

  const handleRowPress = (alert: (typeof alerts)[0]) => {
    if (!alert.isRead) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      markAlertRead(alert.id);
    }
    if (alert.type === "refund") {
      router.push("/refunds");
    } else if (alert.type === "bill") {
      router.push("/(tabs)/bills");
    } else if (alert.type === "budget") {
      router.push("/(tabs)/budget");
    } else if (alert.type === "task") {
      router.push("/(tabs)/tasks");
    }
  };

  const handleDeleteAlert = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    deleteAlert(id);
  };

  const handleMarkAllRead = () => {
    const hasUnread = alerts.some((a) => !a.isRead);
    if (hasUnread) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      markAllAlertsRead();
    }
  };

  const handleClearAll = () => {
    if (alerts.length > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      clearAllAlerts();
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case "bill":
        return { name: "file-text" as const, bg: colors.muted, iconColor: colors.expense };
      case "budget":
        return { name: "alert-triangle" as const, bg: colors.muted, iconColor: colors.warning };
      case "sync":
        return { name: "refresh-cw" as const, bg: colors.muted, iconColor: colors.primary };
      case "task":
        return { name: "check-square" as const, bg: colors.muted, iconColor: "#8b5cf6" };
      case "refund":
        return { name: "rotate-ccw" as const, bg: colors.muted, iconColor: "#10b981" };
      default:
        return { name: "bell" as const, bg: colors.muted, iconColor: colors.mutedForeground };
    }
  };

  return (
    <SafeAreaView style={[s.screen, { backgroundColor: colors.background }]} edges={["top", "bottom"]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <View style={s.headerLeft}>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            style={s.backBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: colors.foreground }]}>Alerts</Text>
        </View>

        <View style={s.headerRight}>
          {alerts.some((a) => !a.isRead) && (
            <TouchableOpacity onPress={handleMarkAllRead} style={s.headerActionBtn}>
              <Feather name="check-square" size={20} color={colors.primary} />
            </TouchableOpacity>
          )}
          {alerts.length > 0 && (
            <TouchableOpacity onPress={handleClearAll} style={s.headerActionBtn}>
              <Feather name="trash-2" size={20} color={colors.destructive} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Content */}
      {sortedAlerts.length === 0 ? (
        <View style={s.emptyState}>
          <Text style={s.emptyStateEmoji}>🎉</Text>
          <Text style={[s.emptyStateTitle, { color: colors.foreground }]}>All caught up!</Text>
          <Text style={[s.emptyStateSub, { color: colors.mutedForeground }]}>
            No new notifications at the moment.
          </Text>
        </View>
      ) : (
        <FlatList
          data={sortedAlerts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.listContainer}
          renderItem={({ item }) => {
            const iconMeta = getAlertIcon(item.type);
            return (
              <Pressable
                onPress={() => handleRowPress(item)}
                style={({ pressed }) => [
                  s.row,
                  {
                    borderBottomColor: colors.border,
                    backgroundColor: pressed
                      ? colors.muted
                      : item.isRead
                      ? "transparent"
                      : colors.card,
                  },
                ]}
              >
                {/* Icon Column */}
                <View style={s.iconWrapper}>
                  <View style={[s.iconCircle, { backgroundColor: iconMeta.bg }]}>
                    <Feather name={iconMeta.name} size={20} color={iconMeta.iconColor} />
                  </View>
                  {!item.isRead && (
                    <View
                      style={[
                        s.unreadDot,
                        {
                          backgroundColor: colors.expense,
                          borderColor: colors.card,
                        },
                      ]}
                    />
                  )}
                </View>

                {/* Content Column */}
                <View style={s.textWrapper}>
                  <View style={s.rowTop}>
                    <Text
                      style={[
                        s.rowTitle,
                        {
                          color: colors.foreground,
                          fontFamily: item.isRead ? "Inter_500Medium" : "Inter_600SemiBold",
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                    <Text style={[s.rowTime, { color: colors.mutedForeground }]}>
                      {formatAlertDate(item.date)}
                    </Text>
                  </View>

                  <Text
                    style={[
                      s.rowBody,
                      {
                        color: item.isRead ? colors.mutedForeground : colors.foreground,
                      },
                    ]}
                    numberOfLines={2}
                  >
                    {item.body}
                  </Text>
                </View>

                {/* Individual Delete Button */}
                <TouchableOpacity
                  onPress={() => handleDeleteAlert(item.id)}
                  style={{
                    justifyContent: "center",
                    alignItems: "center",
                    paddingLeft: 8,
                    paddingRight: 4,
                  }}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Feather name="trash-2" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  headerActionBtn: {
    padding: 4,
  },
  listContainer: {
    paddingBottom: 24,
  },
  row: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  iconWrapper: {
    position: "relative",
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  unreadDot: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  textWrapper: {
    flex: 1,
    justifyContent: "center",
  },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
    gap: 8,
  },
  rowTitle: {
    fontSize: 15,
    flex: 1,
  },
  rowTime: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  rowBody: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  emptyState: {
    flex: 0.8,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    gap: 8,
  },
  emptyStateEmoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
  emptyStateSub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
