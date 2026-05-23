import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useApp } from "@/context/AppContext";
import {
  getReminderTime,
  rescheduleAllBillNotifications,
  rescheduleAllTaskNotifications,
  saveReminderTime,
  getTaskReminderTime,
  saveTaskReminderTime,
} from "@/services/notificationService";
import { useColors } from "@/hooks/useColors";

// ─── Types ────────────────────────────────────────────────────────────────────

interface NotifItem {
  key: string;
  title: string;
  sub: string;
  type: "toggle" | "time" | "task_time";
}

interface NotifSection {
  title: string;
  color: string;
  items: NotifItem[];
}

// ─── Sections config ──────────────────────────────────────────────────────────

const SECTIONS: NotifSection[] = [
  {
    title: "Bill Reminders",
    color: "#3b82f6",
    items: [
      { key: "bill_upcoming", title: "Upcoming Bill Notifications", sub: "Get timely reminders for bills due soon.", type: "toggle" },
      { key: "bill_overdue",  title: "Overdue Bill Notifications",  sub: "Get alerts when a bill is overdue.",         type: "toggle" },
      { key: "bill_time",     title: "Reminder time",               sub: "08:11 AM",                                   type: "time"   },
    ],
  },
  {
    title: "Budget & Spending",
    color: "#3b82f6",
    items: [
      { key: "budget_over",    title: "Budget Overspending Alert", sub: "Get notified when your spending exceeds your budget.",              type: "toggle" },
      { key: "budget_pct",     title: "Budget Spending Alert",     sub: "Get alerts when your spending crosses your chosen percentage.",     type: "toggle" },
      { key: "spending_insight",title: "Spending Insights",        sub: "Receive insight to about your spending patterns.",                 type: "toggle" },
    ],
  },
  {
    title: "Task Reminders",
    color: "#3b82f6",
    items: [
      { key: "task_reminders", title: "Task Reminder Notifications", sub: "Get notified when a task reminder date arrives.",         type: "toggle"    },
      { key: "task_due",       title: "Task Due Date Alerts",         sub: "Get an alert on the day a task is due.",                 type: "toggle"    },
      { key: "task_due_time",  title: "Due Alert Time",               sub: "08:00 AM",                                              type: "task_time" },
    ],
  },
  {
    title: "Projects",
    color: "#3b82f6",
    items: [
      { key: "project_activity", title: "Project Activity Notifications", sub: "Get updates about project changes and activity. (Coming soon)", type: "toggle" },
    ],
  },
  {
    title: "Projections & Planning",
    color: "#3b82f6",
    items: [
      { key: "projections", title: "Projections & Planning", sub: "Receive automated spending and cash-flow projections to plan ahead.", type: "toggle" },
    ],
  },
  {
    title: "Bank Sync Notifications",
    color: "#3b82f6",
    items: [
      { key: "sync_unusual",    title: "Unusual Activity Notifications",    sub: "Get alerts for transactions that appear unusual or suspicious.",  type: "toggle" },
      { key: "sync_tx",         title: "Transaction Sync Notifications",    sub: "Receive notifications when new bank transactions are synced.",    type: "toggle" },
      { key: "sync_bill_gen",   title: "Bill Generation Notifications",     sub: "Get notified when new bills are generated for your Credit Card accounts.", type: "toggle" },
    ],
  },
  {
    title: "Group Notifications",
    color: "#3b82f6",
    items: [
      { key: "group_notifs", title: "Group Notifications", sub: "Get updates about group activity like transactions, budgets, and spending.", type: "toggle" },
    ],
  },
  {
    title: "Report & Statement",
    color: "#3b82f6",
    items: [
      { key: "report_stmt", title: "Report & Statement Notifications", sub: "Receive monthly statements and financial reports when they are ready.", type: "toggle" },
    ],
  },
  {
    title: "App Setup & Activity",
    color: "#3b82f6",
    items: [
      { key: "app_setup",  title: "App Setup Notifications", sub: "Receive alerts related to app setup, login activity, and important app events.", type: "toggle" },
      { key: "app_update", title: "App update alerts",       sub: "Alert me to install pending app updates.",                                        type: "toggle" },
    ],
  },
  {
    title: "Security Alerts",
    color: "#3b82f6",
    items: [
      { key: "security_signin", title: "Sign in alert email", sub: "Send email notification for sign-in alert for my account.", type: "toggle" },
    ],
  },
  {
    title: "Promotions & News Letter",
    color: "#3b82f6",
    items: [
      { key: "promo_tips",       title: "Daily Tips Notifications",             sub: "Get daily budgeting tips, financial advice, and feature highlights.",       type: "toggle" },
      { key: "promo_newsletter", title: "Marketing & News Letter Notification", sub: "Receive updates about new features, offers, and important announcements.", type: "toggle" },
    ],
  },
];

const STORAGE_KEY = "notification_prefs";
const DEFAULT_PREFS: Record<string, boolean> = {
  bill_upcoming: true, bill_overdue: true,
  budget_over: true, budget_pct: true, spending_insight: true,
  task_reminders: true, task_due: true,
  project_activity: true,
  projections: true,
  sync_unusual: true, sync_tx: true, sync_bill_gen: true,
  group_notifs: true,
  report_stmt: true,
  app_setup: true, app_update: true,
  security_signin: true,
  promo_tips: true, promo_newsletter: false,
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const colors = useColors();
  const { bills, tasks } = useApp();
  const [prefs, setPrefs] = useState<Record<string, boolean>>(DEFAULT_PREFS);
  const [reminderDate, setReminderDate] = useState(() => {
    const d = new Date(); d.setHours(8, 11, 0, 0); return d;
  });
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [taskReminderDate, setTaskReminderDate] = useState(() => {
    const d = new Date(); d.setHours(8, 0, 0, 0); return d;
  });
  const [showTaskTimePicker, setShowTaskTimePicker] = useState(false);

  // Load persisted prefs + reminder time
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try { setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(raw) }); } catch {}
      }
    });
    getReminderTime().then(({ hour, minute }) => {
      const d = new Date(); d.setHours(hour, minute, 0, 0);
      setReminderDate(d);
    });
    getTaskReminderTime().then(({ hour, minute }) => {
      const d = new Date(); d.setHours(hour, minute, 0, 0);
      setTaskReminderDate(d);
    });
  }, []);

  const TASK_KEYS = new Set(["task_reminders", "task_due"]);

  const toggle = useCallback((key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPrefs((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).then(() => {
        if (TASK_KEYS.has(key)) {
          rescheduleAllTaskNotifications(tasks);
        } else {
          rescheduleAllBillNotifications(bills);
        }
      });
      return next;
    });
  }, [bills, tasks]);

  const handleTimeChange = useCallback((_: any, selected: Date | undefined) => {
    if (!selected) return;
    setReminderDate(selected);
    saveReminderTime(selected.getHours(), selected.getMinutes()).then(() => {
      rescheduleAllBillNotifications(bills);
    });
  }, [bills]);

  const handleTaskTimeChange = useCallback((_: any, selected: Date | undefined) => {
    if (!selected) return;
    setTaskReminderDate(selected);
    saveTaskReminderTime(selected.getHours(), selected.getMinutes()).then(() => {
      rescheduleAllTaskNotifications(tasks);
    });
  }, [tasks]);

  const formatTime = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

  return (
    <SafeAreaView edges={["top"]} style={[s.screen, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: colors.border, backgroundColor: colors.background, paddingTop: Platform.OS === "web" ? 52 : 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>Notifications</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: Platform.OS === "web" ? 100 : 120 }]}
      >
        {SECTIONS.map((section) => (
          <View key={section.title}>
            {/* Section header */}
            <Text style={[s.sectionTitle, { color: section.color }]}>{section.title}</Text>

            {/* Section items */}
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {section.items.map((item, idx) => {
                const isLast = idx === section.items.length - 1;

                if (item.type === "time" || item.type === "task_time") {
                  const isTask = item.type === "task_time";
                  return (
                    <View key={item.key}>
                      {idx > 0 && <View style={[s.divider, { backgroundColor: colors.border }]} />}
                      <TouchableOpacity
                        style={s.row}
                        onPress={() => isTask ? setShowTaskTimePicker(true) : setShowTimePicker(true)}
                        activeOpacity={0.7}
                      >
                        <View style={s.rowText}>
                          <Text style={[s.rowTitle, { color: colors.foreground }]}>{item.title}</Text>
                          <Text style={[s.rowSub, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
                            {formatTime(isTask ? taskReminderDate : reminderDate)}
                          </Text>
                        </View>
                        <Feather name="clock" size={18} color={colors.mutedForeground} />
                      </TouchableOpacity>
                    </View>
                  );
                }

                return (
                  <View key={item.key}>
                    {idx > 0 && <View style={[s.divider, { backgroundColor: colors.border }]} />}
                    <Pressable
                      style={s.row}
                      onPress={() => toggle(item.key)}
                      android_ripple={{ color: colors.muted }}
                    >
                      <View style={s.rowText}>
                        <Text style={[s.rowTitle, { color: colors.foreground }]}>{item.title}</Text>
                        <Text style={[s.rowSub, { color: colors.mutedForeground }]}>{item.sub}</Text>
                      </View>
                      <Switch
                        value={!!prefs[item.key]}
                        onValueChange={() => toggle(item.key)}
                        trackColor={{ false: colors.border, true: colors.primary + "aa" }}
                        thumbColor={prefs[item.key] ? colors.primary : colors.mutedForeground}
                        ios_backgroundColor={colors.border}
                      />
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Bill time picker */}
      {showTimePicker && (
        <View style={[s.timePickerOverlay, { backgroundColor: "rgba(0,0,0,0.4)" }]}>
          <View style={[s.timePickerSheet, { backgroundColor: colors.card }]}>
            <View style={s.timePickerHeader}>
              <Text style={[s.timePickerTitle, { color: colors.foreground }]}>Set Reminder Time</Text>
              <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                <Text style={[s.timePickerDone, { color: colors.primary }]}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={reminderDate}
              mode="time"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={handleTimeChange}
              style={{ alignSelf: "center" }}
            />
          </View>
        </View>
      )}

      {/* Task due alert time picker */}
      {showTaskTimePicker && (
        <View style={[s.timePickerOverlay, { backgroundColor: "rgba(0,0,0,0.4)" }]}>
          <View style={[s.timePickerSheet, { backgroundColor: colors.card }]}>
            <View style={s.timePickerHeader}>
              <Text style={[s.timePickerTitle, { color: colors.foreground }]}>Set Task Due Alert Time</Text>
              <TouchableOpacity onPress={() => setShowTaskTimePicker(false)}>
                <Text style={[s.timePickerDone, { color: colors.primary }]}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={taskReminderDate}
              mode="time"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={handleTaskTimeChange}
              style={{ alignSelf: "center" }}
            />
          </View>
        </View>
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
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },

  scroll: { paddingHorizontal: 16, paddingTop: 16, gap: 6 },

  sectionTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.2,
    paddingHorizontal: 4,
    paddingBottom: 8,
    paddingTop: 14,
  },

  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 16 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    minHeight: 64,
  },
  rowText: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 14, fontFamily: "Inter_500Medium" },
  rowSub: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16 },

  timePickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
  },
  timePickerSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 8,
  },
  timePickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  timePickerTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  timePickerDone: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
