import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import {
  buildLocationWebSocketUrl,
  createMemoryPoint,
  deleteMemoryPoint,
  fetchLocationState,
  listMemoryPoints,
} from "../api/client";
import { AppHeader, Card, EmptyState, IconBubble, PillButton, ScreenTitle } from "../components/HeartlineUI";
import { SafeScreen } from "../components/SafeScreen";
import { colors, radius, spacing } from "../theme";
import type { LocationSnapshot, MemoryPoint, RealtimeEvent } from "../types";

type Props = {
  token: string;
};

export function MemoriesScreen({ token }: Props) {
  const [points, setPoints] = useState<MemoryPoint[]>([]);
  const [myLocation, setMyLocation] = useState<LocationSnapshot | null>(null);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("正在加载记忆点");

  const reload = async () => {
    try {
      const [items, state] = await Promise.all([listMemoryPoints(), fetchLocationState()]);
      setPoints(items);
      setMyLocation(state.my_latest);
      setStatus("已同步");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "记忆点加载失败");
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
        if (payload.type === "memory.point_changed") {
          reload();
        }
        if (payload.type === "battery.low") {
          setStatus("对方电量偏低");
        }
      } catch {
        setStatus("收到无法识别的实时消息");
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

  const addCurrentPlace = async () => {
    if (!title.trim()) {
      setStatus("请输入标题");
      return;
    }
    if (!myLocation) {
      setStatus("还没有可保存的当前位置");
      return;
    }
    try {
      const created = await createMemoryPoint({
        title: title.trim(),
        note: note.trim() || null,
        latitude: myLocation.latitude,
        longitude: myLocation.longitude
      });
      setPoints((items) => [created, ...items]);
      setTitle("");
      setNote("");
      setStatus("记忆点已保存");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "保存失败");
    }
  };

  const removePoint = async (pointId: string) => {
    try {
      await deleteMemoryPoint(pointId);
      setPoints((items) => items.filter((item) => item.id !== pointId));
      setStatus("记忆点已删除");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "删除失败");
    }
  };

  return (
    <SafeScreen style={styles.screen}>
      <AppHeader title="记忆点" subtitle={status} />
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenTitle title="地图记忆" subtitle="把当前位置保存为你们共同的地图标记。" />

        <Card style={styles.form}>
          <TextInput
            onChangeText={setTitle}
            placeholder="记忆标题"
            placeholderTextColor={colors.tertiaryText}
            style={styles.input}
            value={title}
          />
          <TextInput
            multiline
            onChangeText={setNote}
            placeholder="备注"
            placeholderTextColor={colors.tertiaryText}
            style={[styles.input, styles.notesInput]}
            value={note}
          />
          <PillButton label="保存当前位置" onPress={addCurrentPlace} />
        </Card>

        <View style={styles.list}>
          {points.length ? (
            points.map((point) => (
              <Card key={point.id} style={styles.item}>
                <IconBubble icon="⌖" />
                <View style={styles.itemText}>
                  <Text style={styles.itemTitle}>{point.title}</Text>
                  <Text style={styles.itemMeta}>
                    {point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}
                  </Text>
                  {point.note ? <Text style={styles.itemNotes}>{point.note}</Text> : null}
                </View>
                <Pressable onPress={() => removePoint(point.id)} style={styles.deleteButton}>
                  <Text style={styles.deleteButtonText}>删除</Text>
                </Pressable>
              </Card>
            ))
          ) : (
            <EmptyState title="暂无记忆点" body="保存当前位置后，它会显示在你们的地图上。" />
          )}
        </View>
      </ScrollView>
    </SafeScreen>
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
  form: {
    gap: spacing.md
  },
  input: {
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.fill,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: spacing.md
  },
  notesInput: {
    minHeight: 84,
    paddingTop: spacing.md
  },
  list: {
    gap: spacing.md
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  itemText: {
    flex: 1,
    gap: 3
  },
  itemTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700"
  },
  itemMeta: {
    color: colors.tertiaryText,
    fontSize: 12
  },
  itemNotes: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 19
  },
  deleteButton: {
    minHeight: 34,
    justifyContent: "center",
    borderRadius: radius.full,
    backgroundColor: colors.dangerSoft,
    paddingHorizontal: spacing.sm
  },
  deleteButtonText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: "700"
  }
});
