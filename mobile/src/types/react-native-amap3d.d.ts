declare module "react-native-amap3d" {
  import type { ComponentType, ReactNode, Ref } from "react";
  import type { ViewProps } from "react-native";

  export type LatLng = {
    latitude: number;
    longitude: number;
  };

  export type CameraPosition = {
    target?: LatLng;
    zoom?: number;
    tilt?: number;
    bearing?: number;
  };

  export type MapViewRef = {
    moveCamera: (cameraPosition: CameraPosition, duration?: number) => void;
  };

  export type MapViewProps = ViewProps & {
    initialCameraPosition?: CameraPosition;
    onLoad?: () => void;
    children?: ReactNode;
  };

  export type MarkerProps = {
    position: LatLng;
    onPress?: () => void;
    children?: ReactNode;
  };

  export const AMapSdk: {
    init: (apiKey?: string) => void;
  };

  export const MapView: ComponentType<MapViewProps & { ref?: Ref<MapViewRef> }>;
  export const Marker: ComponentType<MarkerProps>;
}
