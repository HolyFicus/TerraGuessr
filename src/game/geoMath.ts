import type { GeoBounds, LatLng, MedalTier, RegionDefinition } from './types';

const EARTH_RADIUS_M = 6371008.8;

export const MAX_ROUND_SCORE = 5000;
export const WORLD_MAP_SIZE_METERS = 14_916_862;
export const MIN_ROUNDS = 1;
export const MAX_ROUNDS = 10;

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
 * Pure Haversine spherical distance in meters.
 */
export function calculateDistanceMeters(a: LatLng, b: LatLng): number {
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
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(clampedH));
}

/**
 * Pure Haversine spherical distance in kilometers.
 */
export function calculateDistanceKm(a: LatLng, b: LatLng): number {
  return calculateDistanceMeters(a, b) / 1000;
}

/**
 * Adaptive GeoGuessr mapSize (in meters) for a region or country:
 * - "world" uses the exact GeoGuessr global diagonal constant (14,916,862 m).
 * - Every other region/country computes the Haversine distance between the
 *   southwest (minLat, minLng) and northeast (maxLat, maxLng) corners of its
 *   combined bounding box.
 */
export function getRegionMapSizeMeters(region: RegionDefinition): number {
  if (region.id === 'world' || region.bounds.length === 0) {
    return WORLD_MAP_SIZE_METERS;
  }

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  for (const b of region.bounds) {
    if (b.minLat < minLat) minLat = b.minLat;
    if (b.maxLat > maxLat) maxLat = b.maxLat;
    if (b.minLng < minLng) minLng = b.minLng;
    if (b.maxLng > maxLng) maxLng = b.maxLng;
  }

  const diagonalMeters = calculateDistanceMeters(
    { lat: minLat, lng: minLng },
    { lat: maxLat, lng: maxLng },
  );
  return Math.max(1000, Math.round(diagonalMeters));
}

/**
 * Exact GeoGuessr 5K perfect hit threshold in meters:
 * Math.max(25, mapSize * 0.00001)
 */
export function getPerfectThresholdMeters(
  mapSizeMeters: number = WORLD_MAP_SIZE_METERS,
): number {
  const safeSize =
    Number.isFinite(mapSizeMeters) && mapSizeMeters > 0
      ? mapSizeMeters
      : WORLD_MAP_SIZE_METERS;
  return Math.max(25, safeSize * 0.00001);
}

/**
 * Exact GeoGuessr exponential scoring formula (0–5000):
 * - distanceMeters <= Math.max(25, mapSize * 0.00001) => exact 5000 points
 * - otherwise => Math.max(0, Math.round(5000 * Math.exp(-10 * distanceMeters / mapSize)))
 */
export function calculateGeoScore(
  distanceKm: number,
  mapSizeMeters: number = WORLD_MAP_SIZE_METERS,
): number {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return 0;
  const safeMapSize =
    Number.isFinite(mapSizeMeters) && mapSizeMeters > 0
      ? mapSizeMeters
      : WORLD_MAP_SIZE_METERS;
  const distanceMeters = distanceKm * 1000;
  const perfectThreshold = getPerfectThresholdMeters(safeMapSize);
  if (distanceMeters <= perfectThreshold) return MAX_ROUND_SCORE;
  const raw = MAX_ROUND_SCORE * Math.exp((-10 * distanceMeters) / safeMapSize);
  return Math.max(0, Math.min(MAX_ROUND_SCORE, Math.round(raw)));
}

export const MEDAL_RANK: Record<MedalTier, number> = {
  none: 0,
  bronze: 1,
  silver: 2,
  gold: 3,
  platinum: 4,
};

/**
 * Official GeoGuessr Explorer Medal thresholds adapted proportionally for 1–10 rounds
 * (exact match for 5 rounds out of 25,000:
 *  25,000 = Platinum, 22,500–24,999 = Gold, 15,000–22,499 = Silver, 5,000–14,999 = Bronze).
 */
export function getMedalForScore(
  totalScore: number,
  maxPossibleScore: number,
): MedalTier {
  if (
    !Number.isFinite(totalScore) ||
    !Number.isFinite(maxPossibleScore) ||
    maxPossibleScore <= 0
  ) {
    return 'none';
  }
  const roundedScore = Math.round(totalScore);
  const roundedMax = Math.round(maxPossibleScore);
  if (roundedScore >= roundedMax) return 'platinum';
  const ratio = roundedScore / roundedMax;
  if (ratio >= 0.9) return 'gold';
  if (ratio >= 0.6) return 'silver';
  if (ratio >= 0.2) return 'bronze';
  return 'none';
}

export function pickBestMedal(a: MedalTier, b: MedalTier): MedalTier {
  return MEDAL_RANK[a] >= MEDAL_RANK[b] ? a : b;
}

export interface MedalMeta {
  tier: MedalTier;
  label: string;
  shortLabel: string;
  color: string;
  textClass: string;
  borderClass: string;
  bgClass: string;
}

export function getMedalMeta(tier: MedalTier): MedalMeta {
  switch (tier) {
    case 'platinum':
      return {
        tier,
        label: 'Платина',
        shortLabel: 'Платина',
        color: '#67E8F9',
        textClass: 'text-cyan-300',
        borderClass: 'border-cyan-400/50',
        bgClass: 'bg-cyan-400/10',
      };
    case 'gold':
      return {
        tier,
        label: 'Золото',
        shortLabel: 'Золото',
        color: '#FBBF24',
        textClass: 'text-amber-300',
        borderClass: 'border-amber-400/50',
        bgClass: 'bg-amber-400/10',
      };
    case 'silver':
      return {
        tier,
        label: 'Серебро',
        shortLabel: 'Серебро',
        color: '#CBD5E1',
        textClass: 'text-slate-200',
        borderClass: 'border-slate-300/45',
        bgClass: 'bg-slate-300/10',
      };
    case 'bronze':
      return {
        tier,
        label: 'Бронза',
        shortLabel: 'Бронза',
        color: '#EA8C4F',
        textClass: 'text-orange-300',
        borderClass: 'border-orange-400/45',
        bgClass: 'bg-orange-500/10',
      };
    default:
      return {
        tier: 'none',
        label: 'Без медали',
        shortLabel: '—',
        color: '#64748B',
        textClass: 'text-slate-400',
        borderClass: 'border-slate-700',
        bgClass: 'bg-slate-800/40',
      };
  }
}

export function getMedalThresholds(maxPossibleScore: number): Array<{
  tier: Exclude<MedalTier, 'none'>;
  label: string;
  minScore: number;
  percent: number;
  color: string;
}> {
  const safeMax = Math.max(MAX_ROUND_SCORE, Math.round(maxPossibleScore));
  return [
    {
      tier: 'bronze',
      label: 'Бронза',
      minScore: Math.round(safeMax * 0.2),
      percent: 20,
      color: '#EA8C4F',
    },
    {
      tier: 'silver',
      label: 'Серебро',
      minScore: Math.round(safeMax * 0.6),
      percent: 60,
      color: '#CBD5E1',
    },
    {
      tier: 'gold',
      label: 'Золото',
      minScore: Math.round(safeMax * 0.9),
      percent: 90,
      color: '#FBBF24',
    },
    {
      tier: 'platinum',
      label: 'Платина',
      minScore: safeMax,
      percent: 100,
      color: '#67E8F9',
    },
  ];
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
  const meters = distanceKm * 1000;
  if (meters < 1000) {
    return `${Math.round(meters)} м`;
  }
  if (distanceKm < 1000) {
    return `${distanceKm.toFixed(1)} км`;
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
