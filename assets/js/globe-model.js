export const GLOBE_VIEW = Object.freeze({
  phi: 82 * Math.PI / 180,
  theta: 22 * Math.PI / 180
});

export const GLOBE_STYLE = Object.freeze({
  radiusRatio: 0.46,
  sphere: ['rgba(5, 104, 112, 0.93)', 'rgba(3, 70, 80, 0.98)', 'rgba(2, 35, 48, 0.995)'],
  dot: [27, 226, 244],
  outline: 'rgba(42, 225, 241, 0.105)',
  glow: ['rgba(0, 116, 127, 0)', 'rgba(0, 148, 161, 0.018)', 'rgba(0, 193, 207, 0.07)', 'rgba(0, 193, 207, 0)']
});

const DEG = Math.PI / 180;

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const wrapPi = (value) => {
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
};

export function decodeLandPoints(encoded) {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const view = new DataView(bytes.buffer);
  const points = [];

  for (let offset = 0; offset + 3 < bytes.length; offset += 4) {
    points.push({
      lat: view.getInt16(offset, true) / 100 * DEG,
      lon: view.getInt16(offset + 2, true) / 100 * DEG
    });
  }

  return points;
}

export function prepareLandPoints(encoded) {
  const decodedPoints = decodeLandPoints(encoded);
  const points = decodedPoints.filter((point) => (
    Number.isFinite(point.lat)
    && Number.isFinite(point.lon)
    && Math.abs(point.lat) <= Math.PI / 2
    && Math.abs(point.lon) <= Math.PI
  ));

  return {
    sourceCount: decodedPoints.length,
    invalidCount: decodedPoints.length - points.length,
    points
  };
}

export function projectPoint(point, phi, theta) {
  const deltaLon = wrapPi(point.lon - phi);
  const sinLat = Math.sin(point.lat);
  const cosLat = Math.cos(point.lat);
  const sinDelta = Math.sin(deltaLon);
  const cosDelta = Math.cos(deltaLon);
  const sinCenter = Math.sin(theta);
  const cosCenter = Math.cos(theta);

  return {
    x: cosLat * sinDelta,
    y: cosCenter * sinLat - sinCenter * cosLat * cosDelta,
    z: sinCenter * sinLat + cosCenter * cosLat * cosDelta
  };
}

export function pointAppearance(z, size) {
  const edge = clamp((z - 0.006) / 0.2, 0, 1);
  const baseDot = Math.max(0.72, size / 760);

  return {
    alpha: (0.62 + 0.38 * z) * (0.62 + 0.38 * edge),
    radius: baseDot * (0.86 + 0.34 * z)
  };
}
