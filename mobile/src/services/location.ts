import * as Battery from "expo-battery";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

import { postLocation } from "../api/client";
import type { LocationPayload, LocationSnapshot } from "../types";

export const BACKGROUND_LOCATION_TASK = "coupleloc-background-location";

export type PermissionSnapshot = {
  foreground: Location.PermissionStatus | "unknown";
  background: Location.PermissionStatus | "unknown";
  servicesEnabled: boolean;
  backgroundTaskStarted: boolean;
};

async function readBattery() {
  try {
    const [batteryLevel, batteryState] = await Promise.all([
      Battery.getBatteryLevelAsync(),
      Battery.getBatteryStateAsync()
    ]);
    return {
      battery_level: batteryLevel >= 0 ? batteryLevel : null,
      is_charging:
        batteryState === Battery.BatteryState.CHARGING ||
        batteryState === Battery.BatteryState.FULL
    };
  } catch {
    return {
      battery_level: null,
      is_charging: null
    };
  }
}

async function toPayload(
  location: Location.LocationObject,
  source: LocationPayload["source"]
): Promise<LocationPayload> {
  const battery = await readBattery();
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy: location.coords.accuracy,
    speed: location.coords.speed,
    heading: location.coords.heading,
    source,
    recorded_at: new Date(location.timestamp).toISOString(),
    ...battery
  };
}

export async function uploadLocation(
  location: Location.LocationObject,
  source: LocationPayload["source"]
) {
  const payload = await toPayload(location, source);
  return postLocation(payload);
}

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.warn("Background location task failed", error.message);
    return;
  }

  const taskData = data as { locations?: Location.LocationObject[] } | undefined;
  const latestLocation = taskData?.locations?.[0];
  if (!latestLocation) {
    return;
  }

  try {
    await uploadLocation(latestLocation, "background");
  } catch (err) {
    console.warn("Background location upload failed", err);
  }
});

export async function requestLocationPermissions() {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== Location.PermissionStatus.GRANTED) {
    return false;
  }

  const background = await Location.requestBackgroundPermissionsAsync();
  return background.status === Location.PermissionStatus.GRANTED;
}

export async function getPermissionSnapshot(): Promise<PermissionSnapshot> {
  const [foreground, background, servicesEnabled, backgroundTaskStarted] = await Promise.all([
    Location.getForegroundPermissionsAsync().catch(() => null),
    Location.getBackgroundPermissionsAsync().catch(() => null),
    Location.hasServicesEnabledAsync().catch(() => false),
    Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false)
  ]);

  return {
    foreground: foreground?.status ?? "unknown",
    background: background?.status ?? "unknown",
    servicesEnabled,
    backgroundTaskStarted
  };
}

export async function startBackgroundLocation() {
  const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  if (alreadyStarted) {
    return;
  }

  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 60_000,
    distanceInterval: 50,
    deferredUpdatesInterval: 60_000,
    deferredUpdatesDistance: 50,
    foregroundService: {
      notificationTitle: "CoupleLoc location sharing",
      notificationBody: "Sharing your location with your partner in the background",
      killServiceOnDestroy: false
    },
    pausesUpdatesAutomatically: false
  });
}

export async function stopBackgroundLocation() {
  const started = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  if (started) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }
}

export async function startForegroundLocation(
  onUploaded: (location: LocationSnapshot) => void,
  onError: (message: string) => void
) {
  return Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      timeInterval: 7_000,
      distanceInterval: 10
    },
    async (location) => {
      try {
        const uploaded = await uploadLocation(location, "foreground");
        onUploaded(uploaded);
      } catch (err) {
        onError(err instanceof Error ? err.message : "Location upload failed");
      }
    }
  );
}
