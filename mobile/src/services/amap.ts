import { Platform } from "react-native";
import { AMapSdk } from "react-native-amap3d";

import { env } from "../config/env";

let initialized = false;

export function initializeAmap() {
  if (initialized) {
    return null;
  }

  if (!env.amapAndroidApiKey) {
    return "Missing EXPO_PUBLIC_AMAP_ANDROID_API_KEY";
  }

  AMapSdk.init(
    Platform.select({
      android: env.amapAndroidApiKey,
      default: env.amapAndroidApiKey
    })
  );
  initialized = true;
  return null;
}

