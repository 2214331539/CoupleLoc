export type LatLng = {
  latitude: number;
  longitude: number;
};

const PI = Math.PI;
const AXIS = 6378245.0;
const OFFSET = 0.00669342162296594323;

function outOfChina(latitude: number, longitude: number) {
  return longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271;
}

function transformLatitude(x: number, y: number) {
  let result = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y;
  result += 0.2 * Math.sqrt(Math.abs(x));
  result += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  result += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0;
  result +=
    ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) * 2.0) /
    3.0;
  return result;
}

function transformLongitude(x: number, y: number) {
  let result = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y;
  result += 0.1 * Math.sqrt(Math.abs(x));
  result += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  result += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0;
  result +=
    ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) /
    3.0;
  return result;
}

export function wgs84ToGcj02(point: LatLng): LatLng {
  const { latitude, longitude } = point;
  if (outOfChina(latitude, longitude)) {
    return point;
  }

  let deltaLatitude = transformLatitude(longitude - 105.0, latitude - 35.0);
  let deltaLongitude = transformLongitude(longitude - 105.0, latitude - 35.0);
  const radLatitude = (latitude / 180.0) * PI;
  let magic = Math.sin(radLatitude);
  magic = 1 - OFFSET * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  deltaLatitude = (deltaLatitude * 180.0) / (((AXIS * (1 - OFFSET)) / (magic * sqrtMagic)) * PI);
  deltaLongitude = (deltaLongitude * 180.0) / ((AXIS / sqrtMagic) * Math.cos(radLatitude) * PI);

  return {
    latitude: latitude + deltaLatitude,
    longitude: longitude + deltaLongitude
  };
}

export function gcj02ToWgs84(point: LatLng): LatLng {
  const { latitude, longitude } = point;
  if (outOfChina(latitude, longitude)) {
    return point;
  }

  const converted = wgs84ToGcj02(point);
  return {
    latitude: latitude * 2 - converted.latitude,
    longitude: longitude * 2 - converted.longitude
  };
}
