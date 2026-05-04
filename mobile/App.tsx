import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StatusBar, StyleSheet, Text, View } from "react-native";

import {
  clearAccessToken,
  fetchMe,
  fetchPairingStatus,
  fetchSharingSettings,
  getAccessToken,
} from "./src/api/client";
import { AuthScreen } from "./src/screens/AuthScreen";
import { SafeScreen } from "./src/components/SafeScreen";
import { MainScreen } from "./src/screens/MainScreen";
import { stopBackgroundLocation } from "./src/services/location";
import { colors, spacing } from "./src/theme";
import type { PairingStatus, SharingSettings, User } from "./src/types";

type Session = {
  token: string;
  user: User;
};

export default function App() {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [pairing, setPairing] = useState<PairingStatus | null>(null);
  const [sharing, setSharing] = useState<SharingSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [authOverlay, setAuthOverlay] = useState(false);

  const loadProtectedState = useCallback(async (token: string, user?: User) => {
    const [resolvedUser, resolvedPairing, resolvedSharing] = await Promise.all([
      user ? Promise.resolve(user) : fetchMe(),
      fetchPairingStatus(),
      fetchSharingSettings(),
    ]);

    setSession({ token, user: resolvedUser });
    setPairing(resolvedPairing);
    setSharing(resolvedSharing);
  }, []);

  useEffect(() => {
    async function bootstrap() {
      try {
        const token = await getAccessToken();
        if (token) {
          await loadProtectedState(token);
        }
      } catch (err) {
        await clearAccessToken();
        setError(err instanceof Error ? err.message : "Login state expired");
      } finally {
        setBooting(false);
      }
    }

    bootstrap();
  }, [loadProtectedState]);

  const handleAuthenticated = async (token: string, user: User) => {
    setError(null);
    await loadProtectedState(token, user);
    setAuthOverlay(false);
    setLoggingOut(false);
  };

  const handleLogout = async () => {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);
    setAuthOverlay(true);
    try {
      await clearAccessToken();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "退出登录时本地凭据清理失败");
    } finally {
      setTimeout(() => {
        stopBackgroundLocation().catch((err) => {
          console.warn("Stop background location after logout failed", err);
        });
        setLoggingOut(false);
      }, 250);
    }
  };

  if (booting) {
    return (
      <SafeScreen style={styles.centered}>
        <ActivityIndicator />
        <Text style={styles.muted}>Connecting to CoupleLoc</Text>
      </SafeScreen>
    );
  }

  if (!session) {
    return (
      <>
        <StatusBar barStyle="dark-content" />
        <AuthScreen error={error} onAuthenticated={handleAuthenticated} />
      </>
    );
  }

  if (!pairing || !sharing) {
    return (
      <SafeScreen style={styles.centered}>
        <ActivityIndicator />
      </SafeScreen>
    );
  }

  return (
    <View style={styles.app}>
      <StatusBar barStyle="dark-content" />
      <MainScreen
        pairing={pairing}
        sharing={sharing}
        suspended={authOverlay || loggingOut}
        token={session.token}
        user={session.user}
        onLogout={handleLogout}
        onPairingChanged={setPairing}
        onSharingChanged={setSharing}
      />
      {authOverlay ? (
        <View style={styles.authOverlay}>
          <AuthScreen error={error} onAuthenticated={handleAuthenticated} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  app: {
    flex: 1,
    backgroundColor: colors.background
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    backgroundColor: colors.background
  },
  muted: {
    color: colors.muted
  },
  authOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
    elevation: 24,
    zIndex: 24
  }
});
