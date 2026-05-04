import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import {
  buildLocationWebSocketUrl,
  createCalendarEvent,
  deleteCalendarEvent,
  listCalendarEvents,
} from "../api/client";
import { AppHeader, Card, IconBubble, PillButton } from "../components/HeartlineUI";
import { SafeScreen } from "../components/SafeScreen";
import { colors, radius, spacing } from "../theme";
import type { CalendarEvent, RealtimeEvent } from "../types";

type Props = {
  token: string;
};

const timeOptions = ["09:00", "14:00", "19:00", "21:00"];

function monthTitle(date: Date) {
  return `${date.getFullYear()}年 ${date.getMonth() + 1}月`;
}

function sameDate(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function makeStartAt(date: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const value = new Date(date);
  value.setHours(hours ?? 19, minutes ?? 0, 0, 0);
  return value.toISOString();
}

function eventTone(event: CalendarEvent) {
  const text = `${event.title} ${event.notes ?? ""}`;
  if (/飞|航班|机票|车票|travel|flight/i.test(text)) {
    return "secondary" as const;
  }
  if (/纪念|相恋|生日|anniversary/i.test(text)) {
    return "primary" as const;
  }
  return "mint" as const;
}

export function CalendarScreen({ token }: Props) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [selectedTime, setSelectedTime] = useState("19:00");
  const [status, setStatus] = useState("正在加载日历");
  const [showForm, setShowForm] = useState(false);
  const [month, setMonth] = useState(() => new Date());

  const reload = async () => {
    try {
      setEvents(await listCalendarEvents());
      setStatus("日历已同步");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "日历加载失败");
    }
  };

  useEffect(() => {
    reload();
  }, []);

  useEffect(() => {
    const socket = new WebSocket(buildLocationWebSocketUrl(token));
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as RealtimeEvent;
        if (payload.type === "calendar.event_changed") {
          reload();
        }
      } catch {
        setStatus("收到无法识别的日历消息");
      }
    };
    const keepAlive = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send("ping");
      }
    }, 25_000);
    return () => {
      clearInterval(keepAlive);
      socket.close();
    };
  }, [token]);

  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const total = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells: Array<number | null> = [];
    for (let i = 0; i < first.getDay(); i += 1) {
      cells.push(null);
    }
    for (let day = 1; day <= total; day += 1) {
      cells.push(day);
    }
    while (cells.length % 7 !== 0) {
      cells.push(null);
    }
    return cells;
  }, [month]);

  const monthEvents = useMemo(
    () =>
      events.filter((event) => {
        const starts = new Date(event.starts_at);
        return starts.getFullYear() === month.getFullYear() && starts.getMonth() === month.getMonth();
      }),
    [events, month]
  );

  const upcoming = useMemo(
    () =>
      [...events]
        .filter((event) => +new Date(event.starts_at) >= Date.now() - 24 * 60 * 60 * 1000)
        .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at)),
    [events]
  );

  const submit = async () => {
    if (!title.trim()) {
      setStatus("请输入事件标题");
      return;
    }
    try {
      const event = await createCalendarEvent({
        title: title.trim(),
        notes: notes.trim() || null,
        starts_at: makeStartAt(selectedDate, selectedTime)
      });
      setEvents((items) => [...items, event]);
      setTitle("");
      setNotes("");
      setShowForm(false);
      setStatus("事件已添加");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "添加事件失败");
    }
  };

  const remove = async (eventId: string) => {
    try {
      await deleteCalendarEvent(eventId);
      setEvents((items) => items.filter((item) => item.id !== eventId));
      setStatus("事件已删除");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "删除事件失败");
    }
  };

  const moveMonth = (offset: number) => {
    setMonth((value) => new Date(value.getFullYear(), value.getMonth() + offset, 1));
  };

  const pickDay = (day: number) => {
    const next = new Date(month.getFullYear(), month.getMonth(), day);
    setSelectedDate(next);
    setShowForm(true);
  };

  return (
    <SafeScreen style={styles.screen}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.calendarCard}>
          <View style={styles.monthHeader}>
            <Text style={styles.monthTitle}>{monthTitle(month)}</Text>
            <View style={styles.monthButtons}>
              <Pressable onPress={() => moveMonth(-1)} style={styles.monthButton}>
                <Text style={styles.monthButtonText}>‹</Text>
              </Pressable>
              <Pressable onPress={() => moveMonth(1)} style={styles.monthButton}>
                <Text style={styles.monthButtonText}>›</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.weekRow}>
            {["日", "一", "二", "三", "四", "五", "六"].map((day) => (
              <Text key={day} style={styles.weekday}>
                {day}
              </Text>
            ))}
          </View>

          <View style={styles.dayGrid}>
            {days.map((day, index) => {
              const cellDate = day ? new Date(month.getFullYear(), month.getMonth(), day) : null;
              const selected = cellDate ? sameDate(cellDate, selectedDate) : false;
              const dayEvents = day
                ? monthEvents.filter((event) => new Date(event.starts_at).getDate() === day)
                : [];
              return (
                <Pressable
                  disabled={!day}
                  key={`${day ?? "empty"}-${index}`}
                  onPress={() => day && pickDay(day)}
                  style={[styles.dayCell, selected && styles.dayCellSelected]}
                >
                  {day ? <Text style={[styles.dayText, selected && styles.dayTextSelected]}>{day}</Text> : null}
                  {dayEvents.slice(0, 2).map((event) => (
                    <View
                      key={event.id}
                      style={[
                        styles.eventDot,
                        eventTone(event) === "secondary" && styles.eventDotSecondary,
                        eventTone(event) === "mint" && styles.eventDotMint,
                      ]}
                    />
                  ))}
                </Pressable>
              );
            })}
          </View>

          <View style={styles.legendRow}>
            <Legend color={colors.secondary} label="见面日" />
            <Legend color={colors.primaryStrong} label="纪念日" />
            <Legend color={colors.tertiary} label="飞行日" />
          </View>
        </Card>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>近期动态</Text>
          <PillButton
            label={showForm ? "收起" : "+ 添加事件"}
            onPress={() => setShowForm((value) => !value)}
            style={styles.addButton}
          />
        </View>

        {showForm ? (
          <Card style={styles.formCard}>
            <View style={styles.selectedDateBox}>
              <Text style={styles.selectedDateLabel}>已选择</Text>
              <Text style={styles.selectedDateText}>
                {selectedDate.toLocaleDateString()} {selectedTime}
              </Text>
            </View>
            <View style={styles.timeRow}>
              {timeOptions.map((time) => (
                <Pressable
                  key={time}
                  onPress={() => setSelectedTime(time)}
                  style={[styles.timeChip, selectedTime === time && styles.timeChipActive]}
                >
                  <Text style={[styles.timeText, selectedTime === time && styles.timeTextActive]}>
                    {time}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              onChangeText={setTitle}
              placeholder="事件标题，例如 下一次飞行"
              placeholderTextColor={colors.outline}
              style={styles.input}
              value={title}
            />
            <TextInput
              onChangeText={setNotes}
              placeholder="备注，例如 航班号 CA937 | 13:45 起飞"
              placeholderTextColor={colors.outline}
              style={styles.input}
              value={notes}
            />
            <PillButton label="保存事件" onPress={submit} />
          </Card>
        ) : null}

        <Text style={styles.status}>{status}</Text>

        <View style={styles.eventList}>
          {upcoming.length ? (
            upcoming.map((event) => (
              <EventCard key={event.id} event={event} onDelete={() => remove(event.id)} />
            ))
          ) : (
            <Card>
              <Text style={styles.emptyText}>还没有计划，添加一个见面日吧。</Text>
            </Card>
          )}
        </View>
      </ScrollView>
    </SafeScreen>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legend}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function EventCard({ event, onDelete }: { event: CalendarEvent; onDelete: () => void }) {
  const tone = eventTone(event);
  const starts = new Date(event.starts_at);
  const diffDays = Math.ceil((+starts - Date.now()) / (24 * 60 * 60 * 1000));
  return (
    <Card
      style={[
        styles.eventCard,
        tone === "secondary" && styles.eventCardSecondary,
        tone === "mint" && styles.eventCardMint,
      ]}
    >
      <IconBubble
        icon={tone === "secondary" ? "✈" : tone === "primary" ? "▣" : "♨"}
        tone={tone === "secondary" ? "secondary" : tone === "mint" ? "mint" : "primary"}
      />
      <View style={styles.eventText}>
        <View style={styles.eventTitleRow}>
          <Text style={styles.eventTitle}>{event.title}</Text>
          <Text style={styles.eventBadge}>
            {diffDays > 0 ? `${diffDays}天后` : starts.toLocaleDateString()}
          </Text>
        </View>
        {event.notes ? <Text style={styles.eventNotes}>{event.notes}</Text> : null}
        <Text style={styles.eventMeta}>{starts.toLocaleString()}</Text>
      </View>
      <Pressable onPress={onDelete} style={styles.deleteButton}>
        <Text style={styles.deleteText}>×</Text>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xl
  },
  calendarCard: {
    gap: spacing.lg
  },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  monthTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900"
  },
  monthButtons: {
    flexDirection: "row",
    gap: spacing.sm
  },
  monthButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.82)",
    borderWidth: 1,
    borderColor: colors.line
  },
  monthButtonText: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "900"
  },
  weekRow: {
    flexDirection: "row"
  },
  weekday: {
    flex: 1,
    color: colors.muted,
    textAlign: "center",
    fontWeight: "900"
  },
  dayGrid: {
    flexDirection: "row",
    flexWrap: "wrap"
  },
  dayCell: {
    width: `${100 / 7}%`,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    borderRadius: radius.md
  },
  dayCellSelected: {
    backgroundColor: colors.primary
  },
  dayText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700"
  },
  dayTextSelected: {
    color: colors.surface,
    fontWeight: "900"
  },
  eventDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.primaryStrong
  },
  eventDotSecondary: {
    backgroundColor: colors.secondary
  },
  eventDotMint: {
    backgroundColor: colors.tertiary
  },
  legendRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.md
  },
  legend: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5
  },
  legendText: {
    color: colors.muted,
    fontWeight: "800"
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900"
  },
  addButton: {
    minHeight: 48
  },
  formCard: {
    gap: spacing.md
  },
  selectedDateBox: {
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainer,
    padding: spacing.md
  },
  selectedDateLabel: {
    color: colors.muted,
    fontWeight: "800"
  },
  selectedDateText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 3
  },
  timeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  timeChip: {
    borderRadius: radius.full,
    backgroundColor: "rgba(255,255,255,0.82)",
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  timeChipActive: {
    backgroundColor: colors.primary
  },
  timeText: {
    color: colors.muted,
    fontWeight: "900"
  },
  timeTextActive: {
    color: colors.surface
  },
  input: {
    minHeight: 52,
    borderRadius: radius.lg,
    backgroundColor: "rgba(255,255,255,0.88)",
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.lg
  },
  status: {
    color: colors.muted,
    fontWeight: "800"
  },
  eventList: {
    gap: spacing.lg
  },
  eventCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderColor: colors.primarySoft
  },
  eventCardSecondary: {
    borderColor: colors.secondarySoft
  },
  eventCardMint: {
    borderColor: colors.tertiarySoft
  },
  eventText: {
    flex: 1,
    gap: spacing.xs
  },
  eventTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  eventTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 17,
    fontWeight: "900"
  },
  eventBadge: {
    overflow: "hidden",
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainer,
    color: colors.primaryStrong,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    fontSize: 12,
    fontWeight: "900"
  },
  eventNotes: {
    color: colors.muted,
    fontSize: 15
  },
  eventMeta: {
    color: colors.secondary,
    fontWeight: "800"
  },
  deleteButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center"
  },
  deleteText: {
    color: colors.danger,
    fontSize: 26,
    fontWeight: "900"
  },
  emptyText: {
    color: colors.muted,
    textAlign: "center",
    fontWeight: "800"
  }
});
