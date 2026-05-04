import { useEffect, useMemo, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { MapView, Marker } from "react-native-amap3d";

import {
  buildLocationWebSocketUrl,
  createMemoryPoint,
  fetchLocationState,
  listMemoryPoints,
  sendChatMessage,
  updateSharingSettings,
} from "../api/client";
import { AppHeader, Card, IconBubble, PillButton } from "../components/HeartlineUI";
import { SafeScreen } from "../components/SafeScreen";
import {
  getPermissionSnapshot,
  requestLocationPermissions,
  startBackgroundLocation,
  startForegroundLocation,
  stopBackgroundLocation,
  type PermissionSnapshot,
} from "../services/location";
import { initializeAmap } from "../services/amap";
import { colors, radius, shadows, spacing } from "../theme";
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

const quickStatuses = [
  { key: "on_the_way", label: "我在路上了" },
  { key: "miss_you", label: "我想你了" },
  { key: "arrived_safe", label: "平安到家" }
];

function formatTime(value?: string) {
  if (!value) {
    return "暂无";
  }
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatBattery(value?: number | null, isCharging?: boolean | null) {
  if (value === null || value === undefined) {
    return "未共享";
  }
  return `${Math.round(value * 100)}%${isCharging ? " 充电中" : ""}`;
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

function distanceKm(a: LocationSnapshot | null, b: LocationSnapshot | null) {
  if (!a || !b) {
    return null;
  }
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
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
  const [amapReady, setAmapReady] = useState(false);
  const [status, setStatus] = useState<string>("准备同步位置");
  const [socketState, setSocketState] = useState<"connecting" | "open" | "closed">("closed");

  const partner = pairing.partner;
  const partnerVisible = partnerSharing?.enabled !== false;
  const visiblePartnerLocation = partnerVisible ? partnerLocation : null;
  const cameraPosition = useMemo(
    () => buildCameraPosition(myLocation, visiblePartnerLocation),
    [myLocation, visiblePartnerLocation]
  );
  const distance = sharing.share_distance
    ? distanceKm(myLocation, visiblePartnerLocation)
    : null;

  useEffect(() => {
    const error = initializeAmap();
    if (error) {
      setStatus(error);
      return;
    }
    setAmapReady(true);
  }, []);

  useEffect(() => {
    if (amapReady) {
      mapRef.current?.moveCamera(cameraPosition, 300);
    }
  }, [amapReady, cameraPosition]);

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
        setStatus(err instanceof Error ? err.message : "位置状态加载失败");
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
          setStatus("另一半刚刚更新了位置");
          return;
        }

        if (payload.type === "sharing.updated" && payload.user_id === partner?.id) {
          setPartnerSharing(payload.settings);
          if (!payload.settings.enabled) {
            setPartnerLocation(null);
            setStatus("另一半暂停了位置共享");
          } else {
            setStatus("另一半恢复了位置共享");
          }
        }
        if (payload.type === "memory.point_changed") {
          listMemoryPoints()
            .then(setMemoryPoints)
            .catch(() => setStatus("记忆点刷新失败"));
        }
        if (payload.type === "battery.low" && payload.location.user_id === partner?.id) {
          setStatus("另一半电量偏低");
        }
      } catch {
        setStatus("收到了一条无法识别的实时消息");
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
      if (!sharing.enabled || sharing.mode === "paused") {
        await stopBackgroundLocation().catch(() => undefined);
        setStatus("位置共享已暂停");
        setPermission(await getPermissionSnapshot());
        return;
      }

      setStatus("正在请求定位权限");
      const granted = await requestLocationPermissions();
      if (!granted) {
        setStatus("需要前台和后台定位权限");
        setPermission(await getPermissionSnapshot());
        return;
      }

      if (sharing.mode === "foreground") {
        await stopBackgroundLocation().catch(() => undefined);
      } else {
        await startBackgroundLocation();
      }
      if (cancelled) {
        return;
      }

      subscription = await startForegroundLocation(
        (location) => {
          setMyLocation(location);
          setStatus("位置已同步");
        },
        (message) => setStatus(message)
      );
      setPermission(await getPermissionSnapshot());
    }

    startTracking().catch((err) => {
      setStatus(err instanceof Error ? err.message : "位置共享启动失败");
    });

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [sharing.enabled, sharing.mode]);

  const toggleSharing = async (enabled: boolean) => {
    setStatus(enabled ? "正在开启共享" : "正在暂停共享");
    try {
      onSharingChanged(await updateSharingSettings({ enabled, mode: enabled ? "always" : "paused" }));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "共享设置更新失败");
    }
  };

  const sendQuickStatus = async (key: string, body: string) => {
    try {
      await sendChatMessage({ message_type: "quick_status", status_key: key, body });
      setStatus(`已发送：${body}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "快捷状态发送失败");
    }
  };

  const saveMemoryHere = async () => {
    if (!myLocation) {
      setStatus("还没有可保存的位置");
      return;
    }
    try {
      const created = await createMemoryPoint({
        title: `我们的记忆 ${new Date().toLocaleDateString()}`,
        note: status,
        latitude: myLocation.latitude,
        longitude: myLocation.longitude
      });
      setMemoryPoints((points) => [created, ...points]);
      setStatus("已添加地图记忆点");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "添加记忆点失败");
    }
  };

  return (
    <View style={styles.screen}>
      {amapReady ? (
        <MapView
          ref={mapRef}
          style={styles.map}
          initialCameraPosition={cameraPosition}
          onLoad={() => mapRef.current?.moveCamera(cameraPosition, 100)}
        >
          {myLocation ? (
            <Marker
              onPress={() => setStatus("这是你的最新位置")}
              position={toMapPoint(myLocation)}
            />
          ) : null}
          {visiblePartnerLocation && partner ? (
            <Marker
              onPress={() => setStatus(`${partner.display_name} 的最新位置`)}
              position={toMapPoint(visiblePartnerLocation)}
            />
          ) : null}
          {memoryPoints.map((point) => (
            <Marker
              key={point.id}
              onPress={() => setStatus(point.note || point.title)}
              position={toMapPoint(point)}
            />
          ))}
        </MapView>
      ) : (
        <View style={styles.mapFallback}>
          <Text style={styles.mapFallbackText}>地图正在启动</Text>
        </View>
      )}

      <SafeScreen style={styles.overlay}>
        <AppHeader
          left={<IconBubble icon={user.display_name.slice(0, 1).toUpperCase()} size={48} />}
          right={<Text style={styles.heart}>♡</Text>}
        />

        <Card style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <View>
              <Text style={styles.metricLabel}>相距距离</Text>
              <Text style={styles.distanceText}>
                {distance === null ? "已隐藏" : `${distance < 1 ? "<1" : Math.round(distance)}km`}
              </Text>
            </View>
            <View style={styles.weatherBlock}>
              <Text style={styles.metricLabel}>实时状态</Text>
              <Text style={styles.weatherText}>
                {socketState === "open" ? "实时同步中" : "重连中"}
              </Text>
            </View>
          </View>
          <View style={styles.summaryLine} />
          <View style={styles.nextRow}>
            <IconBubble icon="▣" size={40} />
            <Text style={styles.nextText}>距离下次见面</Text>
            <View style={styles.daysPill}>
              <Text style={styles.daysText}>待计划</Text>
            </View>
          </View>
        </Card>

        <View style={styles.sideActions}>
          <Pressable onPress={() => Linking.openSettings()} style={styles.roundAction}>
            <Text style={styles.roundActionText}>♙</Text>
          </Pressable>
          <Pressable onPress={saveMemoryHere} style={styles.roundAction}>
            <Text style={styles.roundActionText}>♡</Text>
          </Pressable>
          <Pressable
            onPress={() =>
              sendQuickStatus("sos", "SOS：我需要帮助，请查看我的位置并联系我")
            }
            style={[styles.roundAction, styles.sosAction]}
          >
            <Text style={styles.sosText}>SOS</Text>
          </Pressable>
        </View>

        <View style={styles.bottomPanel}>
          <View style={styles.quickRow}>
            {quickStatuses.map((item, index) => (
              <PillButton
                key={item.key}
                label={item.label}
                onPress={() => sendQuickStatus(item.key, item.label)}
                style={styles.quickButton}
                tone={index === 0 ? "primary" : index === 1 ? "ghost" : "mint"}
              />
            ))}
          </View>

          <Card style={styles.infoPanel}>
            <View style={styles.row}>
              <View>
                <Text style={styles.label}>我的共享</Text>
                <Text style={styles.value}>{sharing.enabled ? "开启" : "暂停"}</Text>
              </View>
              <Switch
                onValueChange={toggleSharing}
                thumbColor={colors.surface}
                trackColor={{ false: colors.surfaceContainerHigh, true: colors.primary }}
                value={sharing.enabled}
              />
            </View>

            <View style={styles.grid}>
              <Metric label="我" value={formatTime(myLocation?.received_at)} />
              <Metric label="另一半" value={formatTime(visiblePartnerLocation?.received_at)} />
              <Metric
                label="我的电量"
                value={formatBattery(myLocation?.battery_level, myLocation?.is_charging)}
              />
              <Metric
                label="对方电量"
                value={formatBattery(
                  visiblePartnerLocation?.battery_level,
                  visiblePartnerLocation?.is_charging
                )}
              />
              <Metric label="后台" value={permission?.backgroundTaskStarted ? "运行中" : "停止"} />
              <Metric label="记忆点" value={`${memoryPoints.length} 个`} />
            </View>
            <Text style={styles.status}>{status}</Text>
          </Card>
        </View>
      </SafeScreen>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surfaceCool
  },
  map: {
    ...StyleSheet.absoluteFillObject
  },
  mapFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceCool
  },
  mapFallbackText: {
    color: colors.muted,
    fontWeight: "900"
  },
  overlay: {
    flex: 1,
    pointerEvents: "box-none"
  },
  heart: {
    color: colors.primary,
    fontSize: 34,
    fontWeight: "900"
  },
  summaryCard: {
    margin: spacing.lg,
    marginTop: spacing.lg,
    gap: spacing.md
  },
  summaryTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "900"
  },
  distanceText: {
    color: colors.primaryStrong,
    fontSize: 32,
    fontWeight: "900",
    marginTop: 4
  },
  weatherBlock: {
    alignItems: "flex-end"
  },
  weatherText: {
    color: colors.secondary,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 8
  },
  summaryLine: {
    height: 1,
    backgroundColor: colors.line
  },
  nextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  nextText: {
    flex: 1,
    color: colors.text,
    fontSize: 18,
    fontWeight: "800"
  },
  daysPill: {
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  daysText: {
    color: colors.primaryStrong,
    fontWeight: "900"
  },
  sideActions: {
    position: "absolute",
    right: spacing.lg,
    bottom: 250,
    gap: spacing.md
  },
  roundAction: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 32,
    backgroundColor: colors.surface,
    ...shadows.card
  },
  roundActionText: {
    color: colors.primaryStrong,
    fontSize: 28,
    fontWeight: "900"
  },
  sosAction: {
    backgroundColor: colors.primarySoft
  },
  sosText: {
    color: colors.danger,
    fontWeight: "900"
  },
  bottomPanel: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    gap: spacing.md
  },
  quickRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  quickButton: {
    minHeight: 44,
    paddingHorizontal: spacing.md
  },
  infoPanel: {
    gap: spacing.md,
    padding: spacing.md
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  metric: {
    width: "48%",
    minHeight: 58,
    justifyContent: "center",
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceWarm,
    paddingHorizontal: spacing.md
  },
  label: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800"
  },
  value: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900"
  },
  status: {
    color: colors.muted,
    fontWeight: "700"
  }
});
