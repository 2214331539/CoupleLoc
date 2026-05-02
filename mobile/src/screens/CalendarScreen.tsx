import { useEffect, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import {
  buildLocationWebSocketUrl,
  createCalendarEvent,
  deleteCalendarEvent,
  listCalendarEvents,
} from "../api/client";
import type { CalendarEvent, RealtimeEvent } from "../types";

type Props = {
  token: string;
};

function defaultStartValue() {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

export function CalendarScreen({ token }: Props) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [startsAt, setStartsAt] = useState(defaultStartValue());
  const [status, setStatus] = useState("Loading events");

  const reload = async () => {
    try {
      setEvents(await listCalendarEvents());
      setStatus("Ready");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to load events");
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

  const addEvent = async () => {
    const parsed = Date.parse(startsAt);
    if (!title.trim() || Number.isNaN(parsed)) {
      setStatus("Title and valid ISO time are required");
      return;
    }
    try {
      const created = await createCalendarEvent({
        title: title.trim(),
        notes: notes.trim() || null,
        starts_at: new Date(parsed).toISOString()
      });
      setEvents((items) => [...items, created].sort((a, b) => a.starts_at.localeCompare(b.starts_at)));
      setTitle("");
      setNotes("");
      setStartsAt(defaultStartValue());
      setStatus("Event added");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to add event");
    }
  };

  const removeEvent = async (eventId: string) => {
    try {
      await deleteCalendarEvent(eventId);
      setEvents((items) => items.filter((item) => item.id !== eventId));
      setStatus("Event deleted");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to delete event");
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Shared Calendar</Text>
          <Text style={styles.subtitle}>Plans, visits, anniversaries, and reminders</Text>
        </View>

        <View style={styles.form}>
          <TextInput
            onChangeText={setTitle}
            placeholder="Event title"
            style={styles.input}
            value={title}
          />
          <TextInput
            onChangeText={setStartsAt}
            placeholder="Start time ISO"
            style={styles.input}
            value={startsAt}
          />
          <TextInput
            multiline
            onChangeText={setNotes}
            placeholder="Notes"
            style={[styles.input, styles.notesInput]}
            value={notes}
          />
          <Pressable onPress={addEvent} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Add event</Text>
          </Pressable>
        </View>

        <Text style={styles.status}>{status}</Text>

        <View style={styles.list}>
          {events.map((event) => (
            <View key={event.id} style={styles.item}>
              <View style={styles.itemText}>
                <Text style={styles.itemTitle}>{event.title}</Text>
                <Text style={styles.itemMeta}>{new Date(event.starts_at).toLocaleString()}</Text>
                {event.notes ? <Text style={styles.itemNotes}>{event.notes}</Text> : null}
              </View>
              <Pressable onPress={() => removeEvent(event.id)} style={styles.deleteButton}>
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
