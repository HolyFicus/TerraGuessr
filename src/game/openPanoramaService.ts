import { generateCandidateCoordinate, isProhibitedTerritory } from './geoMath';
import { sanitizePanoramaUrl } from './sanitize';
import { VERIFIED_SPOTS_BY_REGION } from './verifiedLocations';
import type { RegionDefinition, RoundLocation } from './types';

const PANORAMAX_SEARCH_API = 'https://api.panoramax.xyz/api/search';
const MAPILLARY_IMAGES_API = 'https://graph.mapillary.com/images';

export interface OpenPanoramaFrame {
  id: string;
  lat: number;
  lng: number;
  imageUrl: string;
  isEquirectangular: boolean;
  cameraAzimuth: number;
  nextStepUrl?: string;
  prevStepUrl?: string;
  attribution: string;
}

export function buildFocusedBbox(
  lat: number,
  lng: number,
  halfSpanLat: number,
  halfSpanLng: number,
): [number, number, number, number] {
  const minLng = Math.max(-179.9, lng - halfSpanLng);
  const maxLng = Math.min(179.9, lng + halfSpanLng);
  const minLat = Math.max(-85, lat - halfSpanLat);
  const maxLat = Math.min(85, lat + halfSpanLat);
  return [minLng, minLat, maxLng, maxLat];
}

function normalizeAzimuth(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
  return ((raw % 360) + 360) % 360;
}

/**
 * Pure parser for a single Panoramax STAC GeoJSON feature.
 * Enforces HTTPS host allowlist and Prohibited Territories guard.
 */
export function parsePanoramaxFeature(raw: unknown): OpenPanoramaFrame | null {
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as Record<string, unknown>;
  const id = typeof f.id === 'string' && f.id.length <= 128 ? f.id : '';
  if (!id) return null;

  const geom = f.geometry as { type?: unknown; coordinates?: unknown } | undefined;
  if (
    !geom ||
    geom.type !== 'Point' ||
    !Array.isArray(geom.coordinates) ||
    geom.coordinates.length < 2
  ) {
    return null;
  }
  const lng = Number(geom.coordinates[0]);
  const lat = Number(geom.coordinates[1]);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -85 ||
    lat > 85 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }
  if (isProhibitedTerritory({ lat, lng })) return null;

  const assets = f.assets as Record<string, { href?: unknown }> | undefined;
  const props = (f.properties ?? {}) as Record<string, unknown>;
  const sdUrl = sanitizePanoramaUrl(assets?.sd?.href);
  const hdUrl = sanitizePanoramaUrl(assets?.hd?.href);
  const fallbackImg = sanitizePanoramaUrl(props['geovisio:image']);
  const imageUrl = sdUrl || hdUrl || fallbackImg;
  if (!imageUrl) return null;

  const interior = props['pers:interior_orientation'] as
    | { field_of_view?: unknown; sensor_array_dimensions?: unknown }
    | undefined;
  const fov =
    typeof interior?.field_of_view === 'number' ? interior.field_of_view : 0;
  const dims = Array.isArray(interior?.sensor_array_dimensions)
    ? interior.sensor_array_dimensions
    : null;
  const ratio =
    dims && Number(dims[1]) > 0 ? Number(dims[0]) / Number(dims[1]) : 0;
  const isEquirectangular = fov >= 350 || Math.abs(ratio - 2) < 0.08;

  const links = Array.isArray(f.links)
    ? (f.links as Array<{ rel?: unknown; href?: unknown }>)
    : [];
  const nextRaw = links.find((l) => l?.rel === 'next')?.href;
  const prevRaw = links.find((l) => l?.rel === 'prev')?.href;
  const nextStepUrl = sanitizePanoramaUrl(nextRaw);
  const prevStepUrl = sanitizePanoramaUrl(prevRaw);

  const license =
    typeof props.license === 'string' && props.license.length <= 32
      ? props.license
      : 'CC-BY-SA-4.0';

  return {
    id,
    lat,
    lng,
    imageUrl,
    isEquirectangular,
    cameraAzimuth: normalizeAzimuth(props['view:azimuth']),
    nextStepUrl,
    prevStepUrl,
    attribution: `Panoramax · ${license}`,
  };
}

/**
 * Pure parser for a single Mapillary Graph API v4 image record.
 * Enforces HTTPS host allowlist and Prohibited Territories guard.
 */
export function parseMapillaryImage(raw: unknown): OpenPanoramaFrame | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const id = typeof item.id === 'string' && item.id.length <= 64 ? item.id : '';
  if (!id) return null;

  const geom = (item.computed_geometry ?? item.geometry) as
    | { coordinates?: unknown }
    | undefined;
  if (!geom || !Array.isArray(geom.coordinates) || geom.coordinates.length < 2) {
    return null;
  }
  const lng = Number(geom.coordinates[0]);
  const lat = Number(geom.coordinates[1]);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -85 ||
    lat > 85 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }
  if (isProhibitedTerritory({ lat, lng })) return null;

  const imageUrl =
    sanitizePanoramaUrl(item.thumb_2048_url) ||
    sanitizePanoramaUrl(item.thumb_1024_url);
  if (!imageUrl) return null;

  return {
    id,
    lat,
    lng,
    imageUrl,
    isEquirectangular: Boolean(item.is_pano),
    cameraAzimuth: normalizeAzimuth(
      item.computed_compass_angle ?? item.compass_angle,
    ),
    attribution: 'Mapillary · CC-BY-SA',
  };
}

async function fetchJsonWithTimeout(
  url: string,
  timeoutMs: number,
  headers?: Record<string, string>,
): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

async function queryPanoramaxBbox(
  bbox: [number, number, number, number],
  only360: boolean,
  timeoutMs: number,
): Promise<OpenPanoramaFrame[]> {
  const params = new URLSearchParams({
    bbox: bbox.map((v) => v.toFixed(4)).join(','),
    limit: '12',
  });
  if (only360) {
    params.set('filter', 'field_of_view=360');
  }
  const data = await fetchJsonWithTimeout(
    `${PANORAMAX_SEARCH_API}?${params.toString()}`,
    timeoutMs,
  );
  if (!data || typeof data !== 'object') return [];
  const features = (data as { features?: unknown }).features;
  if (!Array.isArray(features)) return [];

  const parsed: OpenPanoramaFrame[] = [];
  for (const feat of features) {
    const frame = parsePanoramaxFeature(feat);
    if (frame) parsed.push(frame);
  }
  return parsed;
}

const PANORAMAX_STEP_HOSTS = [
  'panoramax.xyz',
  'panoramax.openstreetmap.fr',
  'panoramax.ign.fr',
  'geovisio.fr',
];

export function isAllowedPanoramaxStepUrl(rawItemUrl: string): boolean {
  const safeUrl = sanitizePanoramaUrl(rawItemUrl);
  if (!safeUrl) return false;
  try {
    const host = new URL(safeUrl).hostname.toLowerCase();
    return PANORAMAX_STEP_HOSTS.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}

/**
 * Fetches an adjacent Panoramax panorama step for Moving mode.
 * Validates the step URL strictly against trusted federated Panoramax STAC hosts.
 */
export async function fetchPanoramaxStep(
  rawItemUrl: string,
): Promise<OpenPanoramaFrame | null> {
  const safeUrl = sanitizePanoramaUrl(rawItemUrl);
  if (!safeUrl || !isAllowedPanoramaxStepUrl(safeUrl)) return null;
  const data = await fetchJsonWithTimeout(safeUrl, 4500);
  return parsePanoramaxFeature(data);
}

/**
 * Finds a real, free, keyless 360° street-level panorama via Panoramax STAC API.
 * Works out of the box on GitHub Pages with ZERO API keys or credit cards.
 */
export async function findPanoramaxLocation(
  region: RegionDefinition,
  usedLabels: string[] = [],
  rng: () => number = Math.random,
): Promise<RoundLocation | null> {
  const randomHeading = Math.floor(rng() * 360);
  const verifiedSpots = VERIFIED_SPOTS_BY_REGION[region.id] ?? [];

  // Build search plan:
  // 1) Focused 360° searches near verified city spots in the region (fast & high hit rate)
  // 2) Random bounding-box 360° searches for geographic variety
  // 3) Fallback without field_of_view=360 for sparse regions so a real street photo still loads
  const shuffledSpots = [...verifiedSpots].sort(() => rng() - 0.5);
  const attempts: Array<{
    bbox: [number, number, number, number];
    only360: boolean;
    label: string;
    countryCode: string;
  }> = [];

  for (let i = 0; i < 2; i++) {
    const cand = generateCandidateCoordinate(region, rng, usedLabels);
    attempts.push({
      bbox: buildFocusedBbox(cand.lat, cand.lng, 0.75, 0.95),
      only360: true,
      label: cand.bounds.label,
      countryCode: cand.bounds.countryCode,
    });
  }

  for (const spot of shuffledSpots.slice(0, 3)) {
    if (usedLabels.includes(spot.label) && shuffledSpots.length > 3) continue;
    attempts.push({
      bbox: buildFocusedBbox(spot.lat, spot.lng, 0.35, 0.45),
      only360: true,
      label: spot.label,
      countryCode: spot.countryCode,
    });
  }

  // Wider non-360 street photo fallback in the selected region if 360° is sparse there
  const fallbackSpot = shuffledSpots[0];
  if (fallbackSpot) {
    attempts.push({
      bbox: buildFocusedBbox(fallbackSpot.lat, fallbackSpot.lng, 0.6, 0.7),
      only360: false,
      label: fallbackSpot.label,
      countryCode: fallbackSpot.countryCode,
    });
  }

  const deadlineMs = Date.now() + 8500;
  for (const step of attempts) {
    if (Date.now() > deadlineMs) break;
    const frames = await queryPanoramaxBbox(step.bbox, step.only360, 3200);
    if (frames.length > 0) {
      const chosen = frames[Math.floor(rng() * frames.length) % frames.length];
      return {
        lat: chosen.lat,
        lng: chosen.lng,
        panoId: `pmx_${chosen.id}`,
        provider: 'panoramax',
        imageUrl: chosen.imageUrl,
        isEquirectangular: chosen.isEquirectangular,
        cameraAzimuth: chosen.cameraAzimuth,
        nextStepUrl: chosen.nextStepUrl,
        prevStepUrl: chosen.prevStepUrl,
        attribution: chosen.attribution,
        heading: chosen.isEquirectangular ? randomHeading : chosen.cameraAzimuth,
        pitch: 0,
        hintLabel: step.label,
        countryCode: step.countryCode,
        isLiveStreetView: true,
      };
    }
  }

  return null;
}

/**
 * Finds a real 360° panorama via Mapillary Graph API v4 using a free
 * Mapillary Client Token (no credit card required). Sends token in the
 * Authorization header rather than URL query parameters.
 */
export async function findMapillaryLocation(
  region: RegionDefinition,
  token: string,
  usedLabels: string[] = [],
  rng: () => number = Math.random,
): Promise<RoundLocation | null> {
  const cleanToken = token.trim();
  if (!cleanToken) return null;

  const randomHeading = Math.floor(rng() * 360);
  const verifiedSpots = VERIFIED_SPOTS_BY_REGION[region.id] ?? [];
  const shuffledSpots = [...verifiedSpots].sort(() => rng() - 0.5);

  const attempts: Array<{
    bbox: [number, number, number, number];
    only360: boolean;
    label: string;
    countryCode: string;
  }> = [];

  for (let i = 0; i < 2; i++) {
    const cand = generateCandidateCoordinate(region, rng, usedLabels);
    attempts.push({
      bbox: buildFocusedBbox(cand.lat, cand.lng, 0.25, 0.35),
      only360: true,
      label: cand.bounds.label,
      countryCode: cand.bounds.countryCode,
    });
  }

  for (const spot of shuffledSpots.slice(0, 3)) {
    attempts.push({
      bbox: buildFocusedBbox(spot.lat, spot.lng, 0.12, 0.16),
      only360: true,
      label: spot.label,
      countryCode: spot.countryCode,
    });
  }

  if (shuffledSpots[0]) {
    attempts.push({
      bbox: buildFocusedBbox(shuffledSpots[0].lat, shuffledSpots[0].lng, 0.15, 0.2),
      only360: false,
      label: shuffledSpots[0].label,
      countryCode: shuffledSpots[0].countryCode,
    });
  }

  const deadlineMs = Date.now() + 8500;
  for (const step of attempts) {
    if (Date.now() > deadlineMs) break;
    const params = new URLSearchParams({
      fields:
        'id,computed_geometry,geometry,computed_compass_angle,compass_angle,thumb_2048_url,thumb_1024_url,is_pano',
      bbox: step.bbox.map((v) => v.toFixed(4)).join(','),
      limit: '12',
    });
    if (step.only360) {
      params.set('is_pano', 'true');
    }

    const data = await fetchJsonWithTimeout(
      `${MAPILLARY_IMAGES_API}?${params.toString()}`,
      3200,
      { Authorization: `OAuth ${cleanToken}` },
    );

    const items =
      data && typeof data === 'object'
        ? (data as { data?: unknown }).data
        : null;
    if (!Array.isArray(items) || items.length === 0) continue;

    const frames: OpenPanoramaFrame[] = [];
    for (const raw of items) {
      const frame = parseMapillaryImage(raw);
      if (frame) frames.push(frame);
    }

    if (frames.length > 0) {
      const chosen = frames[Math.floor(rng() * frames.length) % frames.length];
      return {
        lat: chosen.lat,
        lng: chosen.lng,
        panoId: `mly_${chosen.id}`,
        provider: 'mapillary',
        imageUrl: chosen.imageUrl,
        isEquirectangular: chosen.isEquirectangular,
        cameraAzimuth: chosen.cameraAzimuth,
        attribution: chosen.attribution,
        heading: chosen.isEquirectangular ? randomHeading : chosen.cameraAzimuth,
        pitch: 0,
        hintLabel: step.label,
        countryCode: step.countryCode,
        isLiveStreetView: true,
      };
    }
  }

  return null;
}
