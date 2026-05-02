import { useEffect, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import {
  buildLocationWebSocketUrl,
  createMemoryPoint,
  deleteMemoryPoint,
  fetchLocationState,
  listMemoryPoints,
} from "../api/client";
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
    <SafeAreaView style={styles.screen}>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f7f7f2"
  },
  content: {
    padding: 16,
    gap: 16
  },
  header: {
    gap: 4
  },
  title: {
    color: "#1f211d",
    fontSize: 28,
    fontWeight: "800"
  },
  subtitle: {
    color: "#62645d"
  },
  form: {
    gap: 10
  },
  input: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d5d7ca",
    backgroundColor: "#ffffff",
    color: "#1f211d",
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
    borderRadius: 8,
    backgroundColor: "#2f6f64"
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "800"
  },
  status: {
    color: "#62645d"
  },
  list: {
    gap: 10
  },
  item: {
    flexDirection: "row",
    gap: 12,
    borderRadius: 8,
    backgroundColor: "#ffffff",
    padding: 12
  },
  itemText: {
    flex: 1,
    gap: 4
  },
  itemTitle: {
    color: "#1f211d",
    fontSize: 16,
    fontWeight: "800"
  },
  itemMeta: {
    color: "#62645d"
  },
  itemNotes: {
    color: "#1f211d"
  },
  deleteButton: {
    alignSelf: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#b42318",
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  deleteButtonText: {
    color: "#b42318",
    fontWeight: "800"
  }
});
