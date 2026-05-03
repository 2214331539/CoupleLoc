function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";
const wsBaseUrl =
  process.env.EXPO_PUBLIC_WS_BASE_URL ||
  apiBaseUrl.replace(/^http:\/\//, "ws://").replace(/^https:\/\//, "wss://");
const amapAndroidApiKey =
  process.env.EXPO_PUBLIC_AMAP_ANDROID_API_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY ||
  "";

export const env = {
  apiBaseUrl: stripTrailingSlash(apiBaseUrl),
  wsBaseUrl: stripTrailingSlash(wsBaseUrl),
  amapAndroidApiKey
};
