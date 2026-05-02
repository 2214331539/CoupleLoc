import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { login, register } from "../api/client";
import type { User } from "../types";

type Props = {
  error: string | null;
  onAuthenticated: (token: string, user: User) => void;
};

export function AuthScreen({ error, onAuthenticated }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setLocalError(null);
    try {
      const auth =
        mode === "login"
          ? await login(username, password)
          : await register(username, password, displayName || username);
      onAuthenticated(auth.access_token, auth.user);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.content}
      >
        <View style={styles.header}>
          <Text style={styles.title}>CoupleLoc</Text>
          <Text style={styles.subtitle}>Private location sharing for two people</Text>
        </View>

        <View style={styles.switcher}>
          <Pressable
            onPress={() => setMode("login")}
            style={[styles.switchButton, mode === "login" && styles.switchButtonActive]}
          >
            <Text style={[styles.switchText, mode === "login" && styles.switchTextActive]}>
              Login
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setMode("register")}
            style={[styles.switchButton, mode === "register" && styles.switchButtonActive]}
          >
            <Text style={[styles.switchText, mode === "register" && styles.switchTextActive]}>
              Register
            </Text>
          </Pressable>
        </View>

        <View style={styles.form}>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setUsername}
            placeholder="Username"
            style={styles.input}
            value={username}
          />
          {mode === "register" ? (
            <TextInput
              onChangeText={setDisplayName}
              placeholder="Display name"
              style={styles.input}
              value={displayName}
            />
          ) : null}
          <TextInput
            onChangeText={setPassword}
            placeholder="Password, at least 8 characters"
            secureTextEntry
            style={styles.input}
            value={password}
          />

          {error || localError ? <Text style={styles.error}>{localError || error}</Text> : null}

          <Pressable disabled={submitting} onPress={submit} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>{submitting ? "Working..." : "Continue"}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f7f7f2"
  },
  content: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    gap: 28
  },
  header: {
    gap: 8
  },
  title: {
    color: "#1f211d",
    fontSize: 38,
    fontWeight: "700"
  },
  subtitle: {
    color: "#62645d",
    fontSize: 16
  },
  switcher: {
    flexDirection: "row",
    backgroundColor: "#e7e8dc",
    borderRadius: 8,
    padding: 4
  },
  switchButton: {
    flex: 1,
    alignItems: "center",
    borderRadius: 6,
    paddingVertical: 11
  },
  switchButtonActive: {
    backgroundColor: "#ffffff"
  },
  switchText: {
    color: "#62645d",
    fontWeight: "600"
  },
  switchTextActive: {
    color: "#1f211d"
  },
  form: {
    gap: 14
  },
  input: {
    minHeight: 52,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d5d7ca",
    backgroundColor: "#ffffff",
    color: "#1f211d",
    fontSize: 16,
    paddingHorizontal: 14
  },
  error: {
    color: "#b42318"
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
    fontSize: 16,
    fontWeight: "700"
  }
});

