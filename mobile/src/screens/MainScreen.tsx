import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CalendarScreen } from "./CalendarScreen";
import { ChatScreen } from "./ChatScreen";
import { MemoriesScreen } from "./MemoriesScreen";
import { TrackerScreen } from "./TrackerScreen";
import type { PairingStatus, SharingSettings, User } from "../types";

type TabKey = "map" | "chat" | "calendar" | "memories";

type Props = {
  user: User;
  token: string;
  pairing: PairingStatus;
  sharing: SharingSettings;
  onLogout: () => void;
  onSharingChanged: (settings: SharingSettings) => void;
};

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "map", label: "Map" },
  { key: "chat", label: "Chat" },
  { key: "calendar", label: "Calendar" },
  { key: "memories", label: "Memories" }
];

export function MainScreen(props: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>("map");

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        {activeTab === "map" ? <TrackerScreen {...props} /> : null}
        {activeTab === "chat" ? (
          <ChatScreen token={props.token} user={props.user} partner={props.pairing.partner} />
        ) : null}
        {activeTab === "calendar" ? <CalendarScreen token={props.token} /> : null}
        {activeTab === "memories" ? <MemoriesScreen token={props.token} /> : null}
      </View>

      <View style={styles.tabBar}>
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[styles.tabButton, activeTab === tab.key && styles.tabButtonActive]}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f7f7f2"
  },
  content: {
    flex: 1
  },
  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#d5d7ca",
    backgroundColor: "#ffffff",
    paddingHorizontal: 8,
    paddingVertical: 8
  },
  tabButton: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8
  },
  tabButtonActive: {
    backgroundColor: "#e7e8dc"
  },
  tabText: {
    color: "#62645d",
    fontWeight: "700"
  },
  tabTextActive: {
    color: "#1f211d"
  }
});

