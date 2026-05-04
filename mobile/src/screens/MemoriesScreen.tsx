import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import {
  buildLocationWebSocketUrl,
  createMemoryPoint,
  deleteMemoryPoint,
  fetchLocationState,
  listMemoryPoints,
} from "../api/client";
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
  const [status, setStatus] = useState("Loading memories");

  const reload = async () => {
    try {
      const [items, state] = await Promise.all([listMemoryPoints(), fetchLocationState()]);
      setPoints(items);
      setMyLocation(state.my_latest);
      setStatus("Ready");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to load memories");
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
          setStatus("Partner battery is low");
        }
      } catch {
        setStatus("Received an invalid realtime message");
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
      setStatus("Title is required");
      return;
    }
    if (!myLocation) {
      setStatus("No current location yet");
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
      setStatus("Memory saved");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to save memory");
    }
  };

  const removePoint = async (pointId: string) => {
    try {
      await deleteMemoryPoint(pointId);
      setPoints((items) => items.filter((item) => item.id !== pointId));
      setStatus("Memory deleted");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to delete memory");
    }
  };

  return (
    <SafeScreen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Map Memories</Text>
          <Text style={styles.subtitle}>Save the current place as a shared memory point</Text>
        </View>

        <View style={styles.form}>
          <TextInput
            onChangeText={setTitle}
            placeholder="Memory title"
            style={styles.input}
            value={title}
          />
          <TextInput
            multiline
            onChangeText={setNote}
            placeholder="Note"
            style={[styles.input, styles.notesInput]}
            value={note}
          />
          <Pressable onPress={addCurrentPlace} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Save current place</Text>
          </Pressable>
        </View>

        <Text style={styles.status}>{status}</Text>

        <View style={styles.list}>
          {points.map((point) => (
            <View key={point.id} style={styles.item}>
              <View style={styles.itemText}>
                <Text style={styles.itemTitle}>{point.title}</Text>
                <Text style={styles.itemMeta}>
                  {point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}
                </Text>
                {point.note ? <Text style={styles.itemNotes}>{point.note}</Text> : null}
              </View>
              <Pressable onPress={() => removePoint(point.id)} style={styles.deleteButton}>
                <Text style={styles.deleteButtonText}>Delete</Text>
              </Pressable>
            </View>
          ))}
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
    padding: 16,
    gap: spacing.md
  },
  header: {
    gap: 4
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "800"
  },
  subtitle: {
    color: colors.muted
  },
  form: {
    gap: spacing.sm
  },
  input: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: 12
  },
  notesInput: {
    minHeight: 76,
    paddingTop: 12
  },
  primaryButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.primary
  },
  primaryButtonText: {
    color: colors.surface,
    fontWeight: "800"
  },
  status: {
    color: colors.muted
  },
  list: {
    gap: spacing.sm
  },
  item: {
    flexDirection: "row",
    gap: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: 12
  },
  itemText: {
    flex: 1,
    gap: 4
  },
  itemTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800"
  },
  itemMeta: {
    color: colors.muted
  },
  itemNotes: {
    color: colors.text
  },
  deleteButton: {
    alignSelf: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  deleteButtonText: {
    color: colors.danger,
    fontWeight: "800"
  }
});
