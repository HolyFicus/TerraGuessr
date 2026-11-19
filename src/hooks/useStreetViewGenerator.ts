import { useCallback, useRef } from 'react';
import { generateCandidateCoordinate, isProhibitedTerritory } from '../game/geoMath';
import {
  findMapillaryLocation,
  findPanoramaxLocation,
} from '../game/openPanoramaService';
import { getRegionById } from '../game/regions';
import { pickVerifiedSpot } from '../game/verifiedLocations';
import type { PanoramaPreference, RoundLocation } from '../game/types';

const MAX_STREETVIEW_ATTEMPTS = 10;

export interface HybridLocatorOptions {
  preference: PanoramaPreference;
  mapillaryToken: string;
  mapsBlocked: boolean;
}

/**
 * Hybrid Panorama Locator:
 * 1. Google Street View (quota-saving: max 10 OUTDOOR attempts, single-instance panorama)
 * 2. Mapillary 360° (free Client Token, no credit card)
 * 3. Panoramax 360° (100% free & keyless — works out of the box on GitHub Pages)
 * 4. Curated verified offline coordinate fallback if network is completely unavailable.
 */
export function useStreetViewGenerator(
  streetViewLib: google.maps.StreetViewLibrary | null,
  options: HybridLocatorOptions,
) {
  const serviceRef = useRef<google.maps.StreetViewService | null>(null);
  const { preference, mapillaryToken, mapsBlocked } = options;

  const generateLocation = useCallback(
    async (
      regionId: string,
      usedLabels: string[] = [],
      quotaExceeded = false,
    ): Promise<RoundLocation> => {
      const region = getRegionById(regionId);
      const randomHeading = Math.floor(Math.random() * 360);

      let hitQuota = quotaExceeded || mapsBlocked;
      const canTryGoogle =
        (preference === 'auto' || preference === 'google') &&
        Boolean(streetViewLib) &&
        !hitQuota;

      // 1) Google Street View (only when active & allowed by preference)
      if (canTryGoogle && streetViewLib) {
        if (!serviceRef.current) {
          serviceRef.current = new streetViewLib.StreetViewService();
        }
        const sv = serviceRef.current;
        const deadlineMs = Date.now() + 9_000;

        for (let attempt = 0; attempt < MAX_STREETVIEW_ATTEMPTS; attempt++) {
          if (Date.now() > deadlineMs) break;
          if (attempt > 0) {
            await new Promise((r) => window.setTimeout(r, 120));
          }

          const candidate = generateCandidateCoordinate(
            region,
            Math.random,
            attempt < 5 ? usedLabels : [],
          );
          const radius = attempt < 4 ? 2500 : 5000;

          try {
            const response = await Promise.race([
              sv.getPanorama({
                location: { lat: candidate.lat, lng: candidate.lng },
                radius,
                preference: streetViewLib.StreetViewPreference.NEAREST,
                source: streetViewLib.StreetViewSource.OUTDOOR,
              }),
              new Promise<null>((resolve) =>
                window.setTimeout(() => resolve(null), 3000),
              ),
            ]);

            if (!response) continue;

            const loc = response?.data?.location;
            const latLng = loc?.latLng;
            if (loc?.pano && latLng) {
              const exactLat = latLng.lat();
              const exactLng = latLng.lng();
              if (!isProhibitedTerritory({ lat: exactLat, lng: exactLng })) {
                return {
                  lat: exactLat,
                  lng: exactLng,
                  panoId: loc.pano,
                  provider: 'google',
                  heading: randomHeading,
                  pitch: 0,
                  hintLabel: loc.shortDescription || candidate.bounds.label,
                  countryCode: candidate.bounds.countryCode,
                  isLiveStreetView: true,
                };
              }
            }
          } catch (err: unknown) {
            const errStr = String(err || '');
            if (
              errStr.includes('OVER_QUERY_LIMIT') ||
              errStr.includes('RESOURCE_EXHAUSTED') ||
              errStr.includes('quota')
            ) {
              hitQuota = true;
              window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
              break;
            }
          }
        }

        // If Google is healthy (didn't hit quota/error), immediately use a verified spot on Google Street View
        if (!hitQuota) {
          const verified = pickVerifiedSpot(region.id, usedLabels, Math.random);
          return {
            lat: verified.lat,
            lng: verified.lng,
            provider: 'google',
            heading: randomHeading,
            pitch: 0,
            hintLabel: verified.label,
            countryCode: verified.countryCode,
            isLiveStreetView: true,
          };
        }
      }

      // 2) Mapillary 360° (free token without credit card)
      const shouldTryMapillary =
        Boolean(mapillaryToken.trim()) &&
        (preference === 'mapillary' || preference === 'auto');
      if (shouldTryMapillary) {
        const mlyLoc = await findMapillaryLocation(
          region,
          mapillaryToken,
          usedLabels,
          Math.random,
        );
        if (mlyLoc) return mlyLoc;
      }

      // 3) Panoramax 360° (100% free, zero API key — works out of the box on GitHub Pages)
      const shouldTryPanoramax =
        preference === 'panoramax' ||
        preference === 'auto' ||
        preference === 'mapillary';
      if (shouldTryPanoramax) {
        const pmxLoc = await findPanoramaxLocation(region, usedLabels, Math.random);
        if (pmxLoc) return pmxLoc;
      }

      // 4) Final offline fallback if all live sources are unreachable
      const verified = pickVerifiedSpot(region.id, usedLabels, Math.random);
      return {
        lat: verified.lat,
        lng: verified.lng,
        provider: preference === 'google' && streetViewLib && !hitQuota ? 'google' : 'offline',
        heading: randomHeading,
        pitch: 0,
        hintLabel: verified.label,
        countryCode: verified.countryCode,
        isLiveStreetView: Boolean(preference === 'google' && streetViewLib && !hitQuota),
      };
    },
    [streetViewLib, preference, mapillaryToken, mapsBlocked],
  );

  return {
    generateLocation,
    isStreetViewReady: Boolean(streetViewLib),
  };
}
