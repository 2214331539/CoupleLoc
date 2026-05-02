import { useState } from "react";
import { Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";

import { acceptPairingInvite, createPairingInvite } from "../api/client";
import type { PairingInvite, PairingStatus, User } from "../types";

type Props = {
  user: User;
  onLogout: () => void;
  onPairingChanged: (status: PairingStatus) => void;
};

export function PairingScreen({ user, onLogout, onPairingChanged }: Props) {
  const [invite, setInvite] = useState<PairingInvite | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const createInvite = async () => {
    setBusy(true);
    setMessage(null);
    try {
      setInvite(await createPairingInvite());
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to create invite");
    } finally {
      setBusy(false);
    }
  };

  const acceptInvite = async () => {
    setBusy(true);
    setMessage(null);
    try {
      onPairingChanged(await acceptPairingInvite(code));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to accept invite");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Current account</Text>
          <Text style={styles.title}>{user.display_name}</Text>
        </View>
        <Pressable onPress={onLogout} style={styles.textButton}>
          <Text style={styles.textButtonText}>Logout</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Create pairing invite</Text>
        <Pressable disabled={busy} onPress={createInvite} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>{busy ? "Working..." : "Create invite"}</Text>
        </Pressable>
        {invite ? (
          <View style={styles.inviteBox}>
            <Text style={styles.inviteCode}>{invite.code}</Text>
            <Text style={styles.muted}>
              This code is valid for 24 hours. Let your partner enter it after login.
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Enter partner invite code</Text>
        <TextInput
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={16}
          onChangeText={(value) => setCode(value.toUpperCase())}
          placeholder="Example: A1B2C3"
          style={styles.input}
          value={code}
        />
        <Pressable disabled={busy || code.length < 4} onPress={acceptInvite} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Pair accounts</Text>
        </Pressable>
      </View>

      {message ? <Text style={styles.error}>{message}</Text> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f7f7f2",
    padding: 24,
    gap: 24
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  eyebrow: {
    color: "#62645d",
    fontSize: 12
  },
  title: {
    color: "#1f211d",
    fontSize: 28,
    fontWeight: "700"
  },
  section: {
    gap: 12
  },
  sectionTitle: {
    color: "#1f211d",
    fontSize: 18,
    fontWeight: "700"
  },
  input: {
    minHeight: 52,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d5d7ca",
    backgroundColor: "#ffffff",
    color: "#1f211d",
    fontSize: 18,
    paddingHorizontal: 14
  },
  primaryButton: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#2f6f64"
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "700"
  },
  secondaryButton: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2f6f64"
  },
  secondaryButtonText: {
    color: "#2f6f64",
    fontWeight: "700"
  },
  textButton: {
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  textButtonText: {
    color: "#2f6f64",
    fontWeight: "700"
  },
  inviteBox: {
    borderRadius: 8,
    backgroundColor: "#ffffff",
    padding: 18,
    gap: 8
  },
  inviteCode: {
    color: "#1f211d",
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: 0
  },
  muted: {
    color: "#62645d"
  },
  error: {
    color: "#b42318"
  }
});

