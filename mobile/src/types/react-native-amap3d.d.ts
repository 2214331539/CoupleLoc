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

  export type AMapLocation = {
    timestamp?: number;
    coords: {
      latitude: number;
      longitude: number;
      accuracy?: number | null;
      speed?: number | null;
      heading?: number | null;
    };
  };

  export type MapViewRef = {
    moveCamera: (cameraPosition: CameraPosition, duration?: number) => void;
  };

  export type MapViewProps = ViewProps & {
    initialCameraPosition?: CameraPosition;
    myLocationEnabled?: boolean;
    myLocationButtonEnabled?: boolean;
    onCameraIdle?: () => void;
    onCameraMove?: () => void;
    onLocation?: (event: { nativeEvent: AMapLocation }) => void;
    onLoad?: () => void;
    onPress?: () => void;
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
