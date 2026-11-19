import type { GeoBounds, LatLng, RegionDefinition } from './types';

const EARTH_RADIUS_KM = 6371.0088;

export const MAX_ROUND_SCORE = 5000;
export const PERFECT_DISTANCE_KM = 0.05; // < 50 meters = exact 5000 points
export const SCORE_DECAY_KM = 2000; // 5000 * Math.exp(-distanceKm / 2000)

/**
 * Bounding boxes for Google Maps Platform Prohibited Territories
 * (China mainland, Crimea, Cuba, Donetsk/Luhansk, Iran, North Korea, Syria, Vietnam).
 */
const PROHIBITED_BOXES: Array<{
  name: string;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}> = [
  { name: 'Crimea', minLat: 44.3, maxLat: 46.25, minLng: 32.4, maxLng: 36.7 },
  { name: 'DonetskLuhansk', minLat: 46.8, maxLat: 50.1, minLng: 36.5, maxLng: 40.3 },
  { name: 'Cuba', minLat: 19.7, maxLat: 23.4, minLng: -85.1, maxLng: -74.0 },
  { name: 'Iran', minLat: 25.0, maxLat: 39.8, minLng: 44.0, maxLng: 63.4 },
  { name: 'NorthKorea', minLat: 37.6, maxLat: 43.1, minLng: 124.2, maxLng: 130.7 },
  { name: 'Syria', minLat: 32.3, maxLat: 37.4, minLng: 35.6, maxLng: 42.4 },
  { name: 'Vietnam', minLat: 8.4, maxLat: 23.4, minLng: 102.1, maxLng: 109.5 },
  { name: 'MainlandChinaNorth', minLat: 21.2, maxLat: 53.6, minLng: 73.5, maxLng: 123.5 },
  { name: 'MainlandChinaSouth', minLat: 18.0, maxLat: 21.5, minLng: 108.0, maxLng: 117.5 },
];

export function isProhibitedTerritory(point: LatLng): boolean {
  const inTaiwan =
    point.lat >= 21.8 && point.lat <= 25.4 && point.lng >= 119.9 && point.lng <= 122.15;
  if (inTaiwan) return false;

  const inSouthKorea =
    point.lat >= 33.0 && point.lat <= 37.9 && point.lng >= 125.0 && point.lng <= 130.0;
  if (inSouthKorea) return false;

  return PROHIBITED_BOXES.some(
    (box) =>
      point.lat >= box.minLat &&
      point.lat <= box.maxLat &&
      point.lng >= box.minLng &&
      point.lng <= box.maxLng,
  );
}

/**
 * Pure Haversine spherical distance in kilometers (used in Node tests & offline mode).
 */
export function calculateDistanceKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const clampedH = Math.min(1, Math.max(0, h));
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(clampedH));
}

/**
 * GeoGuessr exponential scoring formula:
 * - distance < 0.05 km (50 m) => 5000 points
 * - otherwise => Math.round(5000 * Math.exp(-distanceKm / 2000))
 */
export function calculateGeoScore(distanceKm: number): number {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return 0;
  if (distanceKm < PERFECT_DISTANCE_KM) return MAX_ROUND_SCORE;
  const raw = MAX_ROUND_SCORE * Math.exp(-distanceKm / SCORE_DECAY_KM);
  return Math.max(0, Math.min(MAX_ROUND_SCORE, Math.round(raw)));
}

/**
 * Generates a uniform random coordinate inside one of the region's geographic
 * bounding boxes while guaranteeing it avoids prohibited territories.
 */
export function generateCandidateCoordinate(
  region: RegionDefinition,
  rng: () => number = Math.random,
  excludeLabels: string[] = [],
): { lat: number; lng: number; bounds: GeoBounds } {
  const pool =
    region.bounds.length > excludeLabels.length
      ? region.bounds.filter((b) => !excludeLabels.includes(b.label))
      : region.bounds;
  const effectivePool = pool.length > 0 ? pool : region.bounds;

  for (let attempt = 0; attempt < 30; attempt++) {
    const idx = Math.floor(rng() * effectivePool.length) % effectivePool.length;
    const box = effectivePool[idx];
    const lat = box.minLat + rng() * (box.maxLat - box.minLat);
    const lng = box.minLng + rng() * (box.maxLng - box.minLng);
    const candidate = { lat, lng };
    if (!isProhibitedTerritory(candidate)) {
      return { lat, lng, bounds: box };
    }
  }

  const fallback = effectivePool[0];
  return {
    lat: (fallback.minLat + fallback.maxLat) / 2,
    lng: (fallback.minLng + fallback.maxLng) / 2,
    bounds: fallback,
  };
}

export function formatDistanceRu(distanceKm: number | null): string {
  if (distanceKm === null || !Number.isFinite(distanceKm)) return 'Нет ответа';
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} м`;
  }
  if (distanceKm < 100) {
    return `${distanceKm.toFixed(1).replace('.', ',')} км`;
  }
  return `${Math.round(distanceKm).toLocaleString('ru-RU')} км`;
}

export function formatScore(score: number): string {
  return Math.round(score).toLocaleString('ru-RU');
}

export function formatCoords(point: LatLng): string {
  const latDir = point.lat >= 0 ? 'с.ш.' : 'ю.ш.';
  const lngDir = point.lng >= 0 ? 'в.д.' : 'з.д.';
  return `${Math.abs(point.lat).toFixed(4)}° ${latDir}, ${Math.abs(point.lng).toFixed(4)}° ${lngDir}`;
}

export function getAccuracyGrade(
  totalScore: number,
  maxPossibleScore: number,
): { grade: 'S' | 'A' | 'B' | 'C' | 'D'; label: string } {
  const ratio = maxPossibleScore > 0 ? totalScore / maxPossibleScore : 0;
  if (ratio >= 0.9) return { grade: 'S', label: 'Мастер картографии' };
  if (ratio >= 0.75) return { grade: 'A', label: 'Опытный штурман' };
  if (ratio >= 0.55) return { grade: 'B', label: 'Уверенный путешественник' };
  if (ratio >= 0.35) return { grade: 'C', label: 'Исследователь' };
  return { grade: 'D', label: 'Новичок' };
}

export const PLAYER_COLORS = [
  '#F59E0B', // Amber
  '#38BDF8', // Sky
  '#A78BFA', // Violet
  '#FB7185', // Rose
  '#34D399', // Emerald
  '#FB923C', // Orange
];
