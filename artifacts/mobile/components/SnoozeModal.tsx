import React, { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";

export default function SnoozeModal() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { snoozeEntity, setSnoozeEntity, updateTask } = useApp();

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [tempDate, setTempDate] = useState<Date | null>(null);

  if (!snoozeEntity) return null;

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSnoozeEntity(null);
  };

  const handleSnoozeOption = async (option: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const now = new Date();
    let snoozeDate = new Date();

    switch (option) {
      case "15m":
        snoozeDate = new Date(now.getTime() + 15 * 60 * 1000);
        break;
      case "30m":
        snoozeDate = new Date(now.getTime() + 30 * 60 * 1000);
        break;
      case "1h":
        snoozeDate = new Date(now.getTime() + 60 * 60 * 1000);
        break;
      case "3h":
        snoozeDate = new Date(now.getTime() + 3 * 60 * 60 * 1000);
        break;
      case "tomorrow":
        snoozeDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        break;
      case "tomorrow_morning":
        snoozeDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        snoozeDate.setHours(9, 0, 0, 0); // 9:00 AM tomorrow
        break;
      case "next_hour":
        snoozeDate = new Date(now.getTime() + 60 * 60 * 1000);
        snoozeDate.setMinutes(0, 0, 0); // top of next hour
        break;
      case "custom":
        setTempDate(new Date());
        setShowDatePicker(true);
        return;
      default:
        return;
    }

    await applySnooze(snoozeDate);
  };

  const applySnooze = async (snoozeDate: Date) => {
    try {
      if (snoozeEntity.type === "task") {
        updateTask(snoozeEntity.id, {
          reminderDate: snoozeDate.toISOString(),
          reminderEnabled: true,
        });
      } else if (snoozeEntity.type === "bill") {
        // Bills are one-off triggers; we schedule it in Notifee directly
        const { scheduleNotifeeReminder } = await import("@/services/notifeeService");
        await scheduleNotifeeReminder(
          snoozeEntity.id,
          snoozeEntity.title || "Bill Due Soon",
          snoozeEntity.body || "A bill reminder is snoozed.",
          snoozeDate,
          "bill",
          "upcoming"
        );
      }
      console.log(`[SnoozeModal] Rescheduled ${snoozeEntity.type} ${snoozeEntity.id} for ${snoozeDate.toISOString()}`);
    } catch (err) {
      console.error("[SnoozeModal] Error applying snooze:", err);
    } finally {
      setSnoozeEntity(null);
    }
  };

  const onDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (event.type === "dismissed") {
      setTempDate(null);
      return;
    }
    if (selectedDate) {
      setTempDate(selectedDate);
      setShowTimePicker(true);
    }
  };

  const onTimeChange = async (event: DateTimePickerEvent, selectedTime?: Date) => {
    setShowTimePicker(false);
    if (event.type === "dismissed" || !tempDate) {
      setTempDate(null);
      return;
    }
    if (selectedTime) {
      const finalDate = new Date(tempDate);
      finalDate.setHours(selectedTime.getHours());
      finalDate.setMinutes(selectedTime.getMinutes());
      finalDate.setSeconds(0, 0);

      if (finalDate.getTime() > Date.now()) {
        await applySnooze(finalDate);
      } else {
        console.warn("[SnoozeModal] Custom date must be in the future.");
      }
    }
    setTempDate(null);
  };

  const SNOOZE_OPTIONS = [
    { id: "15m", label: "15 mins", icon: "clock" as const, subtitle: "15 mins" },
    { id: "30m", label: "30 mins", icon: "clock" as const, subtitle: "30 mins" },
    { id: "1h", label: "1 hour", icon: "clock" as const, subtitle: "1 hour" },
    { id: "3h", label: "3 hours", icon: "clock" as const, subtitle: "3 hours" },
    { id: "tomorrow", label: "Tomorrow", icon: "sunrise" as const, subtitle: "Tomorrow" },
    { id: "tomorrow_morning", label: "Tomorrow Morning", icon: "sun" as const, subtitle: "Tomorrow Morning" },
    { id: "next_hour", label: "Next Hour", icon: "arrow-right-circle" as const, subtitle: "Next Hour" },
    { id: "custom", label: "Custom", icon: "edit" as const, subtitle: "Custom" },
  ];

  return (
    <Modal
      visible={true}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: "#181b20", // Custom sleek dark background matching the mock
              paddingBottom: Platform.OS === "web" ? 32 : insets.bottom + 20,
            },
          ]}
          onPress={() => {}}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.closeBtn} onPress={handleClose} hitSlop={12}>
              <Feather name="x" size={22} color="#ffffff90" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Snooze</Text>
            <View style={{ width: 22 }} /> {/* spacer */}
          </View>

          {/* Grid Layout */}
          <View style={styles.grid}>
            {SNOOZE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={styles.gridItem}
                activeOpacity={0.7}
                onPress={() => handleSnoozeOption(opt.id)}
              >
                <View style={[styles.iconWrap, { backgroundColor: "#3b82f61a" }]}>
                  {opt.id === "15m" && (
                    <View style={styles.badgeWrap}>
                      <Feather name="clock" size={24} color="#3b82f6" />
                      <Text style={styles.badgeText}>15m</Text>
                    </View>
                  )}
                  {opt.id === "30m" && (
                    <View style={styles.badgeWrap}>
                      <Feather name="clock" size={24} color="#3b82f6" />
                      <Text style={styles.badgeText}>30m</Text>
                    </View>
                  )}
                  {opt.id === "1h" && (
                    <View style={styles.badgeWrap}>
                      <Feather name="clock" size={24} color="#3b82f6" />
                      <Text style={styles.badgeText}>1h</Text>
                    </View>
                  )}
                  {opt.id === "3h" && (
                    <View style={styles.badgeWrap}>
                      <Feather name="clock" size={24} color="#3b82f6" />
                      <Text style={styles.badgeText}>3h</Text>
                    </View>
                  )}
                  {opt.id !== "15m" && opt.id !== "30m" && opt.id !== "1h" && opt.id !== "3h" && (
                    <Feather name={opt.icon} size={24} color="#3b82f6" />
                  )}
                </View>
                <Text style={styles.itemLabel}>{opt.subtitle}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Bottom link buttons */}
          <TouchableOpacity
            style={styles.changeDateBtn}
            onPress={() => handleSnoozeOption("custom")}
            activeOpacity={0.7}
          >
            <Text style={[styles.changeDateText, { color: colors.primary }]}>Change Date</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>

      {/* Date and Time pickers for custom triggers */}
      {showDatePicker && (
        <DateTimePicker
          value={new Date()}
          mode="date"
          display="default"
          onChange={onDateChange}
          minimumDate={new Date()}
        />
      )}
      {showTimePicker && (
        <DateTimePicker
          value={new Date()}
          mode="time"
          display="default"
          onChange={onTimeChange}
        />
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
  },
  closeBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: "#ffffff",
    textAlign: "center",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 28,
  },
  gridItem: {
    width: "22%", // 4 columns with gap
    alignItems: "center",
    marginBottom: 8,
  },
  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  badgeWrap: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  badgeText: {
    position: "absolute",
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "#3b82f6",
    top: 19,
  },
  itemLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#a1a1a6",
    textAlign: "center",
    lineHeight: 16,
  },
  changeDateBtn: {
    marginTop: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  changeDateText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
