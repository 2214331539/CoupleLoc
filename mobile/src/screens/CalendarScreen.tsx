import { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  buildLocationWebSocketUrl,
  createCalendarEvent,
  deleteCalendarEvent,
  listCalendarEvents,
} from "../api/client";
import {
  AppHeader,
  Card,
  EmptyState,
  IconBubble,
  PillButton,
  ScreenTitle,
  StatusPill,
} from "../components/HeartlineUI";
import { SafeScreen } from "../components/SafeScreen";
import { colors, radius, spacing } from "../theme";
import type { CalendarEvent, PairingStatus, RealtimeEvent } from "../types";

type Props = {
  pairing: PairingStatus;
  token: string;
};

const timeOptions = Array.from({ length: 34 }, (_, index) => {
  const totalMinutes = 7 * 60 + index * 30;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
});
const weekDays = ["日", "一", "二", "三", "四", "五", "六"];
const dateWheelItemHeight = 50;
const dateWheelVisibleItems = 5;
const dateWheelPadding = dateWheelItemHeight * 2;

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

function dateOnly(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function dayDiff(date: Date) {
  const today = dateOnly(new Date());
  const target = dateOnly(date);
  return Math.round((+target - +today) / (24 * 60 * 60 * 1000));
}

function relativeDateLabel(date: Date) {
  const diff = dayDiff(date);
  if (diff === 0) {
    return "今天";
  }
  if (diff === 1) {
    return "明天";
  }
  if (diff === -1) {
    return "昨天";
  }
  return weekDays[date.getDay()];
}

function fullDateLabel(date: Date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 周${weekDays[date.getDay()]}`;
}

function eventTone(event: CalendarEvent) {
  const text = `${event.title} ${event.notes ?? ""}`;
  if (/机票|航班|车票|高铁|travel|flight/i.test(text)) {
    return "secondary" as const;
  }
  if (/纪念|生日|相恋|anniversary/i.test(text)) {
    return "rose" as const;
  }
  return "mint" as const;
}

export function CalendarScreen({ pairing, token }: Props) {
  const dateListRef = useRef<FlatList<Date> | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [pendingDate, setPendingDate] = useState(() => new Date());
  const [selectedTime, setSelectedTime] = useState("19:00");
  const [status, setStatus] = useState("正在同步日历");
  const [showForm, setShowForm] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date());
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const reload = async () => {
    if (!pairing.paired) {
      setEvents([]);
      setStatus("请先在「我的」页面完成配对");
      return;
    }
    try {
      setEvents(await listCalendarEvents());
      setStatus("已同步");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "日历加载失败");
    }
  };

  useEffect(() => {
    reload();
  }, [pairing.paired]);

  useEffect(() => {
    if (!pairing.paired) {
      return;
    }
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
  }, [pairing.paired, token]);

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

  const sortedEvents = useMemo(
    () =>
      [...events]
        .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at)),
    [events]
  );

  const dateOptions = useMemo(() => {
    const today = dateOnly(new Date());
    today.setDate(today.getDate() - 30);
    return Array.from({ length: 211 }, (_, index) => {
      const value = new Date(today);
      value.setDate(today.getDate() + index);
      return value;
    });
  }, []);

  const getDateOptionIndex = (date: Date) => {
    const index = dateOptions.findIndex((item) => sameDate(item, date));
    return index >= 0 ? index : 30;
  };

  const updatePendingDateFromOffset = (offsetY: number) => {
    const index = Math.max(
      0,
      Math.min(dateOptions.length - 1, Math.round(offsetY / dateWheelItemHeight))
    );
    const date = dateOptions[index];
    if (date) {
      setPendingDate(date);
    }
  };

  const openDatePicker = () => {
    const index = getDateOptionIndex(selectedDate);
    setPendingDate(dateOptions[index] ?? selectedDate);
    setDatePickerOpen(true);
  };

  const confirmDatePicker = () => {
    setSelectedDate(pendingDate);
    setMonth(new Date(pendingDate.getFullYear(), pendingDate.getMonth(), 1));
    setDatePickerOpen(false);
  };

  const submit = async () => {
    if (!pairing.paired) {
      setStatus("请先在「我的」页面完成配对");
      return;
    }
    if (!title.trim()) {
      setStatus("请输入事件标题");
      return;
    }
    setSaving(true);
    try {
      const event = await createCalendarEvent({
        title: title.trim(),
        notes: notes.trim() || null,
        starts_at: makeStartAt(selectedDate, selectedTime)
      });
      setEvents((items) =>
        [...items.filter((item) => item.id !== event.id), event].sort(
          (a, b) => +new Date(a.starts_at) - +new Date(b.starts_at)
        )
      );
      setTitle("");
      setNotes("");
      setShowForm(false);
      setStatus("事件已添加");
    } catch (err) {
      const message = err instanceof Error ? err.message : "添加事件失败";
      setStatus(message === "No active partner" ? "请先在「我的」页面完成配对" : message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (eventId: string) => {
    setDeletingId(eventId);
    try {
      await deleteCalendarEvent(eventId);
      setEvents((items) => items.filter((item) => item.id !== eventId));
      setStatus("事件已删除");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "删除事件失败");
    } finally {
      setDeletingId(null);
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
      <AppHeader title="日历" subtitle={status} />
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenTitle
          action={<StatusPill label={`${events.length} 个计划`} tone="plain" />}
          subtitle={
            pairing.paired
              ? "把见面日、纪念日和出行安排放在同一个地方。"
              : "完成配对后即可共同编辑日历。"
          }
          title="共享日历"
        />

        <Card style={styles.calendarCard}>
          <View style={styles.monthHeader}>
            <Pressable onPress={() => moveMonth(-1)} style={styles.monthButton}>
              <Text style={styles.monthButtonText}>‹</Text>
            </Pressable>
            <Text style={styles.monthTitle}>{monthTitle(month)}</Text>
            <Pressable onPress={() => moveMonth(1)} style={styles.monthButton}>
              <Text style={styles.monthButtonText}>›</Text>
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {weekDays.map((day) => (
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
                  <View style={styles.dotRow}>
                    {dayEvents.slice(0, 3).map((event) => (
                      <View
                        key={event.id}
                        style={[
                          styles.eventDot,
                          eventTone(event) === "secondary" && styles.eventDotSecondary,
                          eventTone(event) === "rose" && styles.eventDotRose,
                        ]}
                      />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Card>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>近期计划</Text>
          <PillButton
            disabled={!pairing.paired}
            label={showForm ? "收起" : "添加计划"}
            onPress={() => {
              setStatus("选择日期和时间后保存到共享日历");
              setShowForm((value) => !value);
            }}
            style={styles.addButton}
            tone="ghost"
          />
        </View>

        {showForm ? (
          <Card style={styles.formCard}>
            <View style={styles.formBlock}>
              <Text style={styles.formLabel}>选择日期</Text>
              <Pressable onPress={openDatePicker} style={styles.dateInputButton}>
                <View>
                  <Text style={styles.dateInputLabel}>{relativeDateLabel(selectedDate)}</Text>
                  <Text style={styles.dateInputText}>{fullDateLabel(selectedDate)}</Text>
                </View>
                <Text style={styles.dateInputArrow}>⌄</Text>
              </Pressable>
            </View>
            <View style={styles.selectedDateBox}>
              <Text style={styles.selectedDateLabel}>已选择</Text>
              <Text style={styles.selectedDateText}>
                {selectedDate.toLocaleDateString()} {selectedTime}
              </Text>
            </View>
            <View style={styles.formBlock}>
              <Text style={styles.formLabel}>选择时间</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.timeStrip}
              >
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
              </ScrollView>
            </View>
            <TextInput
              onChangeText={setTitle}
              placeholder="事件标题，例如 下一次见面"
              placeholderTextColor={colors.tertiaryText}
              style={styles.input}
              value={title}
            />
            <TextInput
              onChangeText={setNotes}
              placeholder="备注，例如 航班号 / 车次 / 纪念日安排"
              placeholderTextColor={colors.tertiaryText}
              style={styles.input}
              value={notes}
            />
            <PillButton
              disabled={saving}
              label={saving ? "保存中..." : "保存事件"}
              onPress={submit}
            />
          </Card>
        ) : null}

        <Text style={styles.statusText}>{status}</Text>

        <View style={styles.eventList}>
          {sortedEvents.length ? (
            sortedEvents.map((event) => (
              <EventCard
                deleting={deletingId === event.id}
                key={event.id}
                event={event}
                onDelete={() => remove(event.id)}
              />
            ))
          ) : (
            <EmptyState title="暂无计划" body="添加一个见面日，让倒计时有明确目标。" />
          )}
        </View>
      </ScrollView>

      <Modal
        animationType="slide"
        onRequestClose={() => setDatePickerOpen(false)}
        onShow={() => {
          dateListRef.current?.scrollToOffset({
            animated: false,
            offset: getDateOptionIndex(pendingDate) * dateWheelItemHeight
          });
        }}
        transparent
        visible={datePickerOpen}
      >
        <View style={styles.sheetRoot}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setDatePickerOpen(false)} />
          <View style={styles.sheetCard}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>选择日期</Text>
                <Text style={styles.sheetSubtitle}>{fullDateLabel(pendingDate)}</Text>
              </View>
              <Pressable onPress={() => setDatePickerOpen(false)} style={styles.sheetCloseButton}>
                <Text style={styles.sheetCloseText}>取消</Text>
              </Pressable>
            </View>

            <View style={styles.wheelShell}>
              <FlatList
                ref={dateListRef}
                data={dateOptions}
                keyExtractor={(item) => item.toISOString()}
                showsVerticalScrollIndicator={false}
                snapToInterval={dateWheelItemHeight}
                decelerationRate="fast"
                bounces={false}
                initialScrollIndex={getDateOptionIndex(selectedDate)}
                getItemLayout={(_, index) => ({
                  length: dateWheelItemHeight,
                  offset: dateWheelItemHeight * index,
                  index
                })}
                contentContainerStyle={styles.wheelContent}
                onMomentumScrollEnd={(event) => updatePendingDateFromOffset(event.nativeEvent.contentOffset.y)}
                onScrollEndDrag={(event) => updatePendingDateFromOffset(event.nativeEvent.contentOffset.y)}
                renderItem={({ item }) => {
                  const active = sameDate(item, pendingDate);
                  return (
                    <View style={[styles.wheelRow, active && styles.wheelRowActive]}>
                      <Text style={[styles.wheelPrimary, active && styles.wheelPrimaryActive]}>
                        {relativeDateLabel(item)}
                      </Text>
                      <Text style={[styles.wheelSecondary, active && styles.wheelSecondaryActive]}>
                        {fullDateLabel(item)}
                      </Text>
                    </View>
                  );
                }}
              />
              <View pointerEvents="none" style={styles.wheelSelection} />
            </View>

            <PillButton label="确认日期" onPress={confirmDatePicker} />
          </View>
        </View>
      </Modal>
    </SafeScreen>
  );
}

function EventCard({
  event,
  deleting,
  onDelete,
}: {
  event: CalendarEvent;
  deleting: boolean;
  onDelete: () => void;
}) {
  const tone = eventTone(event);
  const starts = new Date(event.starts_at);
  const diffDays = Math.ceil((+starts - Date.now()) / (24 * 60 * 60 * 1000));
  return (
    <Card style={styles.eventCard}>
      <IconBubble
        icon={tone === "secondary" ? "✈" : tone === "rose" ? "♥" : "✓"}
        tone={tone === "secondary" ? "secondary" : tone === "rose" ? "rose" : "mint"}
      />
      <View style={styles.eventText}>
        <View style={styles.eventTitleRow}>
          <Text numberOfLines={1} style={styles.eventTitle}>
            {event.title}
          </Text>
          <Text style={styles.eventBadge}>
            {diffDays > 0 ? `${diffDays} 天后` : starts.toLocaleDateString()}
          </Text>
        </View>
        {event.notes ? (
          <Text numberOfLines={2} style={styles.eventNotes}>
            {event.notes}
          </Text>
        ) : null}
        <Text style={styles.eventMeta}>{starts.toLocaleString()}</Text>
      </View>
      <Pressable disabled={deleting} onPress={onDelete} style={styles.deleteButton}>
        <Text style={styles.deleteText}>{deleting ? "..." : "删除"}</Text>
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
    padding: spacing.md,
    gap: spacing.lg,
    paddingBottom: spacing.xl
  },
  calendarCard: {
    gap: spacing.md
  },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  monthTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800"
  },
  monthButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
    backgroundColor: colors.fill
  },
  monthButtonText: {
    color: colors.primary,
    fontSize: 28,
    fontWeight: "600"
  },
  weekRow: {
    flexDirection: "row"
  },
  weekday: {
    flex: 1,
    color: colors.tertiaryText,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700"
  },
  dayGrid: {
    flexDirection: "row",
    flexWrap: "wrap"
  },
  dayCell: {
    width: `${100 / 7}%`,
    minHeight: 48,
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
    fontWeight: "600"
  },
  dayTextSelected: {
    color: colors.surface
  },
  dotRow: {
    minHeight: 7,
    flexDirection: "row",
    gap: 2
  },
  eventDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.tertiary
  },
  eventDotSecondary: {
    backgroundColor: colors.secondary
  },
  eventDotRose: {
    backgroundColor: colors.rose
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800"
  },
  addButton: {
    minHeight: 36,
    paddingHorizontal: spacing.md
  },
  formCard: {
    gap: spacing.md
  },
  formBlock: {
    gap: spacing.sm
  },
  formLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800"
  },
  dateInputButton: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: radius.md,
    backgroundColor: colors.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  dateInputLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700"
  },
  dateInputText: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
    marginTop: 2
  },
  dateInputArrow: {
    color: colors.primary,
    fontSize: 24,
    fontWeight: "700"
  },
  selectedDateBox: {
    borderRadius: radius.md,
    backgroundColor: colors.fill,
    padding: spacing.md
  },
  selectedDateLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700"
  },
  selectedDateText: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700",
    marginTop: 3
  },
  timeStrip: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingRight: spacing.sm
  },
  timeChip: {
    width: 72,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
    backgroundColor: colors.fill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  timeChipActive: {
    backgroundColor: colors.primary
  },
  timeText: {
    color: colors.textSoft,
    fontWeight: "700"
  },
  timeTextActive: {
    color: colors.surface
  },
  input: {
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.fill,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: 0,
    includeFontPadding: false,
    textAlignVertical: "center"
  },
  statusText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: spacing.sm
  },
  eventList: {
    gap: spacing.md
  },
  eventCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
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
    fontSize: 16,
    fontWeight: "700"
  },
  eventBadge: {
    overflow: "hidden",
    borderRadius: radius.full,
    backgroundColor: colors.fill,
    color: colors.textSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    fontSize: 12,
    fontWeight: "700"
  },
  eventNotes: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 19
  },
  eventMeta: {
    color: colors.tertiaryText,
    fontSize: 13,
    fontWeight: "600"
  },
  sheetRoot: {
    flex: 1,
    justifyContent: "flex-end"
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(17, 24, 39, 0.28)"
  },
  sheetCard: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.lg
  },
  sheetHandle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: radius.full,
    backgroundColor: colors.line
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800"
  },
  sheetSubtitle: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "600",
    marginTop: 3
  },
  sheetCloseButton: {
    minHeight: 36,
    justifyContent: "center",
    borderRadius: radius.full,
    backgroundColor: colors.fill,
    paddingHorizontal: spacing.md
  },
  sheetCloseText: {
    color: colors.textSoft,
    fontSize: 14,
    fontWeight: "700"
  },
  wheelShell: {
    height: dateWheelItemHeight * dateWheelVisibleItems,
    overflow: "hidden",
    justifyContent: "center"
  },
  wheelContent: {
    paddingVertical: dateWheelPadding
  },
  wheelRow: {
    height: dateWheelItemHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: radius.md,
    paddingHorizontal: spacing.md
  },
  wheelRowActive: {
    backgroundColor: "rgba(255, 107, 129, 0.08)"
  },
  wheelPrimary: {
    width: 54,
    color: colors.muted,
    fontSize: 15,
    fontWeight: "700"
  },
  wheelPrimaryActive: {
    color: colors.primary
  },
  wheelSecondary: {
    flex: 1,
    color: colors.textSoft,
    textAlign: "right",
    fontSize: 16,
    fontWeight: "700"
  },
  wheelSecondaryActive: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800"
  },
  wheelSelection: {
    position: "absolute",
    left: 0,
    right: 0,
    top: dateWheelItemHeight * 2,
    height: dateWheelItemHeight,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary
  },
  deleteButton: {
    minHeight: 34,
    justifyContent: "center",
    borderRadius: radius.full,
    backgroundColor: colors.dangerSoft,
    paddingHorizontal: spacing.sm
  },
  deleteText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: "700"
  }
});
