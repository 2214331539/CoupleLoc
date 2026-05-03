import { useEffect, useMemo, useRef, useState } from "react";
import { Linking, Pressable, SafeAreaView, StyleSheet, Switch, Text, View } from "react-native";
import { MapView, Marker } from "react-native-amap3d";

import {
  buildLocationWebSocketUrl,
  fetchLocationState,
  listMemoryPoints,
  updateSharingSettings,
} from "../api/client";
import {
  getPermissionSnapshot,
  requestLocationPermissions,
  startBackgroundLocation,
  startForegroundLocation,
  stopBackgroundLocation,
  type PermissionSnapshot,
} from "../services/location";
import { initializeAmap } from "../services/amap";
import type {
  LocationSnapshot,
  MemoryPoint,
  PairingStatus,
  RealtimeEvent,
  SharingSettings,
  User,
} from "../types";
import { wgs84ToGcj02, type LatLng } from "../utils/coordinates";

type Props = {
  user: User;
  token: string;
  pairing: PairingStatus;
  sharing: SharingSettings;
  onLogout: () => void;
  onSharingChanged: (settings: SharingSettings) => void;
};

type CameraPosition = {
  target: LatLng;
  zoom: number;
};

function formatTime(value?: string) {
  if (!value) {
    return "No data";
  }
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatBattery(value?: number | null) {
  if (value === null || value === undefined) {
    return "No data";
  }
  return `${Math.round(value * 100)}%`;
}

function toMapPoint(location: LocationSnapshot | MemoryPoint): LatLng {
  return wgs84ToGcj02({
    latitude: location.latitude,
    longitude: location.longitude
  });
}

function buildCameraPosition(
  myLocation: LocationSnapshot | null,
  partnerLocation: LocationSnapshot | null
): CameraPosition {
  const base = partnerLocation || myLocation;
  return {
    target: base ? toMapPoint(base) : { latitude: 31.2304, longitude: 121.4737 },
    zoom: 14
  };
}

function MapPin({ color, label }: { color: string; label: string }) {
  return (
    <View style={[styles.pin, { backgroundColor: color }]}>
      <Text style={styles.pinText}>{label}</Text>
    </View>
  );
}

export function TrackerScreen({
  user,
  token,
  pairing,
  sharing,
  onLogout,
  onSharingChanged,
}: Props) {
  const mapRef = useRef<any>(null);
  const [myLocation, setMyLocation] = useState<LocationSnapshot | null>(null);
  const [partnerLocation, setPartnerLocation] = useState<LocationSnapshot | null>(null);
  const [partnerSharing, setPartnerSharing] = useState<SharingSettings | null>(null);
  const [memoryPoints, setMemoryPoints] = useState<MemoryPoint[]>([]);
  const [permission, setPermission] = useState<PermissionSnapshot | null>(null);
  const [status, setStatus] = useState<string>("Ready to locate");
  const [socketState, setSocketState] = useState<"connecting" | "open" | "closed">("closed");

  const partner = pairing.partner;
  const partnerVisible = partnerSharing?.enabled !== false;
  const visiblePartnerLocation = partnerVisible ? partnerLocation : null;
  const cameraPosition = useMemo(
    () => buildCameraPosition(myLocation, visiblePartnerLocation),
    [myLocation, visiblePartnerLocation]
  );

  useEffect(() => {
    const error = initializeAmap();
    if (error) {
      setStatus(error);
    }
  }, []);

  useEffect(() => {
    mapRef.current?.moveCamera(cameraPosition, 300);
  }, [cameraPosition]);

  useEffect(() => {
    async function loadLocationState() {
      try {
        const [state, points] = await Promise.all([fetchLocationState(), listMemoryPoints()]);
        onSharingChanged(state.my_sharing);
        setPartnerSharing(state.partner_sharing);
        setMyLocation(state.my_latest);
        setPartnerLocation(state.partner_latest);
        setMemoryPoints(points);
      } catch (err) {
        setStatus(err instanceof Error ? err.message : "Failed to load location state");
      }
    }

    loadLocationState();
  }, [onSharingChanged]);

  useEffect(() => {
    const socket = new WebSocket(buildLocationWebSocketUrl(token));
    setSocketState("connecting");

    socket.onopen = () => setSocketState("open");
    socket.onclose = () => setSocketState("closed");
    socket.onerror = () => setSocketState("closed");
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as RealtimeEvent;
        if (payload.type === "location.updated") {
          setPartnerLocation(payload.location);
          return;
        }

        if (payload.type === "sharing.updated" && payload.user_id === partner?.id) {
          setPartnerSharing(payload.settings);
          if (!payload.settings.enabled) {
            setPartnerLocation(null);
            setStatus("Partner paused location sharing");
          } else {
            setStatus("Partner resumed location sharing");
          }
        }
        if (payload.type === "memory.point_changed") {
          listMemoryPoints()
            .then(setMemoryPoints)
            .catch(() => setStatus("Failed to refresh memory points"));
        }
        if (payload.type === "battery.low" && payload.location.user_id === partner?.id) {
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
  }, [partner?.id, token]);

  useEffect(() => {
    let subscription: { remove: () => void } | null = null;
    let cancelled = false;

    async function startTracking() {
      if (!sharing.enabled) {
        await stopBackgroundLocation().catch(() => undefined);
        setStatus("Location sharing is paused");
        setPermission(await getPermissionSnapshot());
        return;
      }

      setStatus("Requesting location permissions");
      const granted = await requestLocationPermissions();
      if (!granted) {
        setStatus("Foreground and background location permissions are required");
        setPermission(await getPermissionSnapshot());
        return;
      }

      await startBackgroundLocation();
      if (cancelled) {
        return;
      }

      subscription = await startForegroundLocation(
        (location) => {
          setMyLocation(location);
          setStatus("Location updated");
        },
        (message) => setStatus(message)
      );
      setPermission(await getPermissionSnapshot());
    }

    startTracking().catch((err) => {
      setStatus(err instanceof Error ? err.message : "Failed to start location tracking");
    });

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [sharing.enabled]);

  const toggleSharing = async (enabled: boolean) => {
    setStatus(enabled ? "Starting sharing" : "Pausing sharing");
    try {
      onSharingChanged(await updateSharingSettings(enabled));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to update sharing setting");
    }
  };

  return (
    <View style={styles.screen}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialCameraPosition={cameraPosition}
        onLoad={() => mapRef.current?.moveCamera(cameraPosition, 100)}
      >
        {myLocation ? (
          <Marker position={toMapPoint(myLocation)}>
            <MapPin color="#2f6f64" label="Me" />
          </Marker>
        ) : null}
        {visiblePartnerLocation && partner ? (
          <Marker position={toMapPoint(visiblePartnerLocation)}>
            <MapPin color="#b9503d" label={partner.display_name.slice(0, 8)} />
          </Marker>
        ) : null}
        {memoryPoints.map((point) => (
          <Marker
            key={point.id}
            onPress={() => setStatus(point.note || point.title)}
            position={toMapPoint(point)}
          >
            <MapPin color="#7d5fb2" label="Mem" />
          </Marker>
        ))}
      </MapView>

      <SafeAreaView style={styles.overlay}>
        <View style={styles.topPanel}>
          <View>
            <Text style={styles.eyebrow}>Sharing with {partner?.display_name}</Text>
            <Text style={styles.title}>{user.display_name}</Text>
          </View>
          <Pressable onPress={onLogout} style={styles.textButton}>
            <Text style={styles.textButtonText}>Logout</Text>
          </Pressable>
        </View>

        <View style={styles.infoPanel}>
          <View style={styles.row}>
            <View>
              <Text style={styles.label}>My sharing</Text>
              <Text style={styles.value}>{sharing.enabled ? "On" : "Paused"}</Text>
            </View>
            <Switch value={sharing.enabled} onValueChange={toggleSharing} />
          </View>

          <View style={styles.grid}>
            <View style={styles.metric}>
              <Text style={styles.label}>My update</Text>
              <Text style={styles.value}>{formatTime(myLocation?.received_at)}</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.label}>Partner update</Text>
              <Text style={styles.value}>{formatTime(visiblePartnerLocation?.received_at)}</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.label}>My battery</Text>
              <Text style={styles.value}>{formatBattery(myLocation?.battery_level)}</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.label}>Partner battery</Text>
              <Text style={styles.value}>{formatBattery(visiblePartnerLocation?.battery_level)}</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.label}>Realtime</Text>
              <Text style={styles.value}>{socketState === "open" ? "Online" : "Reconnecting"}</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.label}>Background</Text>
              <Text style={styles.value}>{permission?.backgroundTaskStarted ? "Running" : "Stopped"}</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.label}>Partner sharing</Text>
              <Text style={styles.value}>{partnerVisible ? "On" : "Paused"}</Text>
            </View>
          </View>

          <Text style={styles.status}>{status}</Text>
          <Pressable onPress={() => Linking.openSettings()} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Open system permission settings</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#dfe8df"
  },
  map: {
    ...StyleSheet.absoluteFillObject
  },
  pin: {
    minWidth: 42,
    minHeight: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#ffffff",
    paddingHorizontal: 8
  },
  pinText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800"
  },
  overlay: {
    flex: 1,
    justifyContent: "space-between",
    pointerEvents: "box-none"
  },
  topPanel: {
    margin: 16,
    padding: 16,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.94)",
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
    fontSize: 24,
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
  infoPanel: {
    margin: 16,
    gap: 14,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    padding: 16
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  metric: {
    width: "48%",
    minHeight: 54,
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#f2f3eb",
    paddingHorizontal: 12
  },
  label: {
    color: "#62645d",
    fontSize: 12
  },
  value: {
    color: "#1f211d",
    fontSize: 16,
    fontWeight: "700"
  },
  status: {
    color: "#62645d"
  },
  secondaryButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2f6f64"
  },
  secondaryButtonText: {
    color: "#2f6f64",
    fontWeight: "700"
  }
});
