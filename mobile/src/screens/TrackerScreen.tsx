import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, Switch, Text, View } from "react-native";
import { MapView, Marker } from "react-native-amap3d";

import {
  buildLocationWebSocketUrl,
  fetchLocationState,
  listMemoryPoints,
  sendChatMessage,
  updateSharingSettings,
} from "../api/client";
import {
  AppHeader,
  Card,
  IconBubble,
  PillButton,
  StatTile,
  StatusPill,
} from "../components/HeartlineUI";
import { SafeScreen } from "../components/SafeScreen";
import {
  getPermissionSnapshot,
  requestBackgroundLocationPermission,
  requestForegroundLocationPermission,
  startBackgroundLocation,
  stopBackgroundLocation,
  uploadDeviceLocation,
  type DeviceLocation,
  type PermissionSnapshot,
} from "../services/location";
import { initializeAmap } from "../services/amap";
import { colors, radius, spacing } from "../theme";
import type {
  LocationSnapshot,
  MemoryPoint,
  PairingStatus,
  RealtimeEvent,
  SharingSettings,
  User,
} from "../types";
import { gcj02ToWgs84, wgs84ToGcj02, type LatLng } from "../utils/coordinates";

type Props = {
  user: User;
  token: string;
  pairing: PairingStatus;
  sharing: SharingSettings;
  suspended?: boolean;
  onLogout: () => void;
  onSharingChanged: (settings: SharingSettings) => void;
};

type CameraPosition = {
  target: LatLng;
  zoom: number;
};

const quickStatuses = [
  { key: "on_the_way", label: "在路上" },
  { key: "miss_you", label: "想你了" },
  { key: "arrived_safe", label: "平安到达" },
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
  return `${Math.round(value * 100)}%${isCharging ? " · 充电中" : ""}`;
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

function distanceBetweenCoordinatesKm(a: LatLng | null, b: LatLng | null) {
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

function distanceKm(a: LocationSnapshot | null, b: LocationSnapshot | null) {
  return distanceBetweenCoordinatesKm(a, b);
}

function formatDistance(value: number) {
  if (value < 1) {
    return "< 1 km";
  }
  return `${Math.round(value)} km`;
}

function getDistanceLabel({
  canShowDistance,
  isPaired,
  myLocation,
  partnerLocation,
  partnerSharing,
}: {
  canShowDistance: boolean;
  isPaired: boolean;
  myLocation: LocationSnapshot | null;
  partnerLocation: LocationSnapshot | null;
  partnerSharing: SharingSettings | null;
}) {
  if (!canShowDistance) {
    return "已隐藏";
  }
  if (!isPaired) {
    return "--";
  }
  if (!myLocation) {
    return "定位中";
  }
  if (partnerSharing?.enabled === false) {
    return "对方暂停";
  }
  if (!partnerLocation) {
    return "待更新";
  }
  const distance = distanceKm(myLocation, partnerLocation);
  return distance === null ? "待更新" : formatDistance(distance);
}

export function TrackerScreen({
  user,
  token,
  pairing,
  sharing,
  suspended = false,
  onSharingChanged,
}: Props) {
  const mapRef = useRef<any>(null);
  const chromeRestoreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignoreCameraMoveUntil = useRef(0);
  const lastAmapUploadRef = useRef<{ latitude: number; longitude: number; uploadedAt: number } | null>(null);
  const amapUploadInFlightRef = useRef(false);
  const chromeProgress = useRef(new Animated.Value(1)).current;
  const [myLocation, setMyLocation] = useState<LocationSnapshot | null>(null);
  const [partnerLocation, setPartnerLocation] = useState<LocationSnapshot | null>(null);
  const [partnerSharing, setPartnerSharing] = useState<SharingSettings | null>(null);
  const [memoryPoints, setMemoryPoints] = useState<MemoryPoint[]>([]);
  const [permission, setPermission] = useState<PermissionSnapshot | null>(null);
  const [amapReady, setAmapReady] = useState(false);
  const [backgroundTrackingActive, setBackgroundTrackingActive] = useState(false);
  const [chromeCollapsed, setChromeCollapsed] = useState(false);
  const [status, setStatus] = useState<string>("准备同步位置");
  const [socketState, setSocketState] = useState<"connecting" | "open" | "closed">("closed");

  const partner = pairing.partner;
  const partnerVisible = partnerSharing?.enabled !== false;
  const visiblePartnerLocation = partnerVisible ? partnerLocation : null;
  const cameraPosition = useMemo(
    () => buildCameraPosition(myLocation, visiblePartnerLocation),
    [myLocation, visiblePartnerLocation]
  );
  const distanceLabel = getDistanceLabel({
    canShowDistance: sharing.share_distance,
    isPaired: pairing.paired,
    myLocation,
    partnerLocation: visiblePartnerLocation,
    partnerSharing
  });
  const topChromeTranslateY = chromeProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-190, 0]
  });
  const bottomChromeTranslateY = chromeProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [260, 0]
  });

  const clearChromeRestoreTimer = () => {
    if (chromeRestoreTimer.current) {
      clearTimeout(chromeRestoreTimer.current);
      chromeRestoreTimer.current = null;
    }
  };

  const restoreMapChrome = () => {
    clearChromeRestoreTimer();
    setChromeCollapsed(false);
  };

  const collapseMapChrome = (autoRestore = true) => {
    setChromeCollapsed(true);
    clearChromeRestoreTimer();
    if (autoRestore) {
      chromeRestoreTimer.current = setTimeout(() => {
        setChromeCollapsed(false);
        chromeRestoreTimer.current = null;
      }, 5_000);
    }
  };

  const markProgrammaticCameraMove = () => {
    ignoreCameraMoveUntil.current = Date.now() + 700;
  };

  const handleMapGesture = () => {
    if (Date.now() < ignoreCameraMoveUntil.current) {
      return;
    }
    collapseMapChrome(true);
  };

  const handleMapPress = () => {
    if (Date.now() < ignoreCameraMoveUntil.current) {
      return;
    }
    if (chromeCollapsed) {
      restoreMapChrome();
      return;
    }
    collapseMapChrome(false);
  };

  const handleAmapLocation = async (event: { nativeEvent: DeviceLocation }) => {
    if (
      suspended ||
      !sharing.enabled ||
      sharing.mode === "paused" ||
      backgroundTrackingActive ||
      amapUploadInFlightRef.current
    ) {
      return;
    }

    const { coords } = event.nativeEvent;
    if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) {
      return;
    }

    const previous = lastAmapUploadRef.current;
    const now = Date.now();
    const movedKm = previous
      ? distanceBetweenCoordinatesKm(previous, coords)
      : null;

    if (previous && now - previous.uploadedAt < 7_000 && (movedKm ?? 0) < 0.01) {
      return;
    }

    const wgs84Coords = gcj02ToWgs84({
      latitude: coords.latitude,
      longitude: coords.longitude
    });
    const location: DeviceLocation = {
      ...event.nativeEvent,
      timestamp: event.nativeEvent.timestamp ?? now,
      coords: {
        ...coords,
        ...wgs84Coords
      }
    };

    try {
      amapUploadInFlightRef.current = true;
      const uploaded = await uploadDeviceLocation(location, "foreground");
      lastAmapUploadRef.current = {
        latitude: coords.latitude,
        longitude: coords.longitude,
        uploadedAt: now
      };
      setMyLocation(uploaded);
      setStatus("高德定位已同步");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "高德定位上传失败");
    } finally {
      amapUploadInFlightRef.current = false;
    }
  };

  useEffect(() => {
    Animated.timing(chromeProgress, {
      toValue: chromeCollapsed ? 0 : 1,
      duration: chromeCollapsed ? 180 : 240,
      useNativeDriver: true
    }).start();
  }, [chromeCollapsed, chromeProgress]);

  useEffect(
    () => () => {
      clearChromeRestoreTimer();
    },
    []
  );

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
      markProgrammaticCameraMove();
      mapRef.current?.moveCamera(cameraPosition, 300);
    }
  }, [amapReady, cameraPosition]);

  const loadLocationState = useCallback(
    async (quiet = false) => {
      try {
        const state = await fetchLocationState();
        const points = pairing.paired ? await listMemoryPoints() : [];
        onSharingChanged(state.my_sharing);
        setPartnerSharing(state.partner_sharing);
        setMyLocation(state.my_latest);
        setPartnerLocation(state.partner_latest);
        setMemoryPoints(points);
        if (!quiet) {
          setStatus("位置状态已同步");
        }
      } catch (err) {
        setStatus(err instanceof Error ? err.message : "位置状态加载失败");
      }
    },
    [onSharingChanged, pairing.paired]
  );

  useEffect(() => {
    if (suspended) {
      return;
    }

    loadLocationState();
  }, [loadLocationState, suspended]);

  useEffect(() => {
    if (suspended || !pairing.paired) {
      return;
    }

    const timer = setInterval(() => {
      loadLocationState(true);
    }, 30_000);
    return () => clearInterval(timer);
  }, [loadLocationState, pairing.paired, suspended]);

  useEffect(() => {
    if (suspended) {
      setSocketState("closed");
      return undefined;
    }

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    let reconnectDelay = 2_000;

    const scheduleReconnect = () => {
      if (closed || reconnectTimer) {
        return;
      }
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, reconnectDelay);
      reconnectDelay = Math.min(10_000, Math.round(reconnectDelay * 1.5));
    };

    const connect = () => {
      if (closed) {
        return;
      }

      const nextSocket = new WebSocket(buildLocationWebSocketUrl(token));
      socket = nextSocket;
      setSocketState("connecting");

      nextSocket.onopen = () => {
        reconnectDelay = 2_000;
        setSocketState("open");
        loadLocationState(true);
      };
      nextSocket.onclose = () => {
        if (!closed) {
          setSocketState("closed");
          scheduleReconnect();
        }
      };
      nextSocket.onerror = () => {
        setSocketState("closed");
      };
      nextSocket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as RealtimeEvent;
          if (payload.type === "location.updated") {
            if (payload.location.user_id === user.id) {
              setMyLocation(payload.location);
              setStatus("我的位置已同步");
            } else if (payload.location.user_id === partner?.id) {
              setPartnerLocation(payload.location);
              setStatus("对方刚刚更新了位置");
            }
            return;
          }

          if (payload.type === "sharing.updated" && payload.user_id === partner?.id) {
            setPartnerSharing(payload.settings);
            if (!payload.settings.enabled) {
              setPartnerLocation(null);
              setStatus("对方暂停了位置共享");
            } else {
              setStatus("对方恢复了位置共享");
              loadLocationState(true);
            }
          }
          if (payload.type === "memory.point_changed" && pairing.paired) {
            listMemoryPoints()
              .then(setMemoryPoints)
              .catch(() => setStatus("记忆点刷新失败"));
          }
          if (payload.type === "battery.low" && payload.location.user_id === partner?.id) {
            setStatus("对方电量偏低");
          }
        } catch {
          setStatus("收到了一条无法识别的实时消息");
        }
      };
    };

    connect();

    const keepAlive = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send("ping");
      }
    }, 25_000);

    return () => {
      closed = true;
      clearInterval(keepAlive);
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      socket?.close();
    };
  }, [loadLocationState, pairing.paired, partner?.id, suspended, token, user.id]);

  useEffect(() => {
    let cancelled = false;

    async function refreshPermissionSnapshot() {
      const snapshot = await getPermissionSnapshot();
      if (!cancelled) {
        setPermission(snapshot);
      }
    }

    async function startTracking() {
      await stopBackgroundLocation().catch(() => undefined);
      setBackgroundTrackingActive(false);
      if (cancelled) {
        return;
      }

      if (suspended) {
        setStatus("位置共享已暂停");
        await refreshPermissionSnapshot();
        return;
      }

      if (!sharing.enabled || sharing.mode === "paused") {
        setStatus("位置共享已暂停");
        await refreshPermissionSnapshot();
        return;
      }

      setStatus("正在请求定位权限");
      const foregroundGranted = await requestForegroundLocationPermission();
      if (cancelled) {
        return;
      }

      await refreshPermissionSnapshot();
      if (!foregroundGranted) {
        setStatus("需要前台定位权限");
        return;
      }

      if (sharing.mode === "always") {
        setStatus("正在请求后台定位权限");
        const backgroundGranted = await requestBackgroundLocationPermission();
        if (cancelled) {
          return;
        }

        await refreshPermissionSnapshot();
        if (!backgroundGranted) {
          setStatus("需要允许始终定位；当前仅在打开定位页时同步");
          return;
        }

        try {
          await startBackgroundLocation(token);
          if (cancelled) {
            return;
          }
          setBackgroundTrackingActive(true);
          await refreshPermissionSnapshot();
          setStatus("高德后台定位运行中");
          return;
        } catch (err) {
          if (cancelled) {
            return;
          }
          setBackgroundTrackingActive(false);
          await refreshPermissionSnapshot();
          setStatus(err instanceof Error ? `后台定位启动失败：${err.message}` : "后台定位启动失败，前台打开时仍会同步");
          return;
        }
      }

      setStatus("高德地图前台定位中");
    }

    startTracking().catch((err) => {
      setStatus(err instanceof Error ? err.message : "位置共享启动失败");
    });

    return () => {
      cancelled = true;
    };
  }, [sharing.enabled, sharing.mode, suspended, token]);

  const toggleSharing = async (enabled: boolean) => {
    setStatus(enabled ? "正在开启共享" : "正在暂停共享");
    try {
      onSharingChanged(await updateSharingSettings({ enabled, mode: enabled ? "always" : "paused" }));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "共享设置更新失败");
    }
  };

  const sendQuickStatus = async (key: string, body: string) => {
    if (!pairing.paired) {
      setStatus("请先在「我的」页面完成配对");
      return;
    }
    try {
      await sendChatMessage({ message_type: "quick_status", status_key: key, body });
      setStatus(`已发送：${body}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "快捷状态发送失败");
    }
  };

  const socketLabel = socketState === "open" ? "实时在线" : socketState === "connecting" ? "连接中" : "离线";
  const amapLocationEnabled = !suspended && sharing.enabled && sharing.mode !== "paused";
  const backgroundLocationRunning = backgroundTrackingActive || permission?.backgroundServiceRunning;
  let locationSourceLabel = "待授权";
  if (!amapLocationEnabled) {
    locationSourceLabel = "已暂停";
  } else if (backgroundLocationRunning) {
    locationSourceLabel = "高德后台";
  } else if (sharing.mode === "always" && permission?.background !== "granted") {
    locationSourceLabel = "需后台权限";
  } else if (permission?.foreground === "granted" && permission.servicesEnabled) {
    locationSourceLabel = "高德前台";
  }

  return (
    <View style={styles.screen}>
      {amapReady ? (
        <MapView
          ref={mapRef}
          style={styles.map}
          initialCameraPosition={cameraPosition}
          myLocationButtonEnabled={amapLocationEnabled}
          myLocationEnabled={amapLocationEnabled}
          onCameraIdle={handleMapGesture}
          onCameraMove={handleMapGesture}
          onLocation={handleAmapLocation}
          onLoad={() => {
            markProgrammaticCameraMove();
            mapRef.current?.moveCamera(cameraPosition, 100);
          }}
          onPress={handleMapPress}
        >
          {myLocation ? (
            <Marker onPress={() => setStatus("这是你的最新位置")} position={toMapPoint(myLocation)} />
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
        <Animated.View
          pointerEvents={chromeCollapsed ? "none" : "auto"}
          style={[
            styles.topChrome,
            {
              opacity: chromeProgress,
              transform: [{ translateY: topChromeTranslateY }]
            }
          ]}
        >
          <AppHeader
            left={<IconBubble icon={user.display_name.slice(0, 1).toUpperCase()} size={38} />}
            right={<StatusPill label={socketLabel} tone={socketState === "open" ? "mint" : "plain"} />}
            subtitle={status}
            title="实时位置"
          />

          <Card style={styles.summaryCard}>
            <View style={styles.summaryTop}>
              <View>
                <Text style={styles.summaryLabel}>相距</Text>
                <Text style={styles.distanceText}>{distanceLabel}</Text>
              </View>
              <View style={styles.summaryRight}>
                <Text style={styles.partnerName}>{partner?.display_name ?? "未配对"}</Text>
                <Text style={styles.summaryMeta}>
                  {visiblePartnerLocation ? `${formatTime(visiblePartnerLocation.received_at)} 更新` : "暂无位置"}
                </Text>
              </View>
            </View>
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
          </Card>
        </Animated.View>

        <Animated.View
          pointerEvents={chromeCollapsed ? "none" : "auto"}
          style={[
            styles.bottomPanel,
            {
              opacity: chromeProgress,
              transform: [{ translateY: bottomChromeTranslateY }]
            }
          ]}
        >
          <Card style={styles.infoPanel}>
            <View style={styles.sharingRow}>
              <View>
                <Text style={styles.panelTitle}>我的共享</Text>
                <Text style={styles.panelSubtitle}>{sharing.enabled ? "正在共享位置" : "已暂停共享"}</Text>
              </View>
              <Switch
                onValueChange={toggleSharing}
                thumbColor={colors.surface}
                trackColor={{ false: colors.fillStrong, true: colors.tertiary }}
                value={sharing.enabled}
              />
            </View>

            <View style={styles.statGrid}>
              <StatTile label="我的更新时间" value={formatTime(myLocation?.received_at)} />
              <StatTile label="对方更新时间" value={formatTime(visiblePartnerLocation?.received_at)} />
              <StatTile
                label="我的电量"
                tone="primary"
                value={formatBattery(myLocation?.battery_level, myLocation?.is_charging)}
              />
              <StatTile
                label="对方电量"
                tone="mint"
                value={formatBattery(
                  visiblePartnerLocation?.battery_level,
                  visiblePartnerLocation?.is_charging
                )}
              />
              <StatTile
                label="定位来源"
                tone={locationSourceLabel.startsWith("高德") ? "mint" : "plain"}
                value={locationSourceLabel}
              />
              <StatTile label="记忆点" value={`${memoryPoints.length} 个`} />
            </View>
          </Card>
        </Animated.View>
      </SafeScreen>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background
  },
  map: {
    ...StyleSheet.absoluteFillObject
  },
  mapFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.fill
  },
  mapFallbackText: {
    color: colors.muted,
    fontWeight: "700"
  },
  overlay: {
    flex: 1,
    pointerEvents: "box-none"
  },
  topChrome: {},
  summaryCard: {
    margin: spacing.md,
    gap: spacing.md
  },
  summaryTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700"
  },
  distanceText: {
    color: colors.text,
    fontSize: 34,
    fontWeight: "800",
    marginTop: 2
  },
  summaryRight: {
    alignItems: "flex-end",
    justifyContent: "center"
  },
  partnerName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700"
  },
  summaryMeta: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2
  },
  quickRow: {
    flexDirection: "row",
    gap: spacing.sm
  },
  quickButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm
  },
  bottomPanel: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md
  },
  infoPanel: {
    gap: spacing.md
  },
  sharingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  panelTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700"
  },
  panelSubtitle: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  }
});
