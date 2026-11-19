import { useCallback, useRef } from 'react';
import { generateCandidateCoordinate, isProhibitedTerritory } from '../game/geoMath';
import { getRegionById } from '../game/regions';
import { pickVerifiedSpot } from '../game/verifiedLocations';
import type { RoundLocation } from '../game/types';

const MAX_STREETVIEW_ATTEMPTS = 10;

/**
 * Generates an outdoor Google Street View panorama coordinate inside the chosen
 * region/country bounding boxes using StreetViewService.getPanorama() with
 * source: OUTDOOR. Capped strictly at 10 attempts to conserve quota — if no
 * panorama is found, immediately returns a curated verified coordinate for the
 * selected region without spending additional API calls.
 */
export function useStreetViewGenerator(
  streetViewLib: google.maps.StreetViewLibrary | null,
) {
  const serviceRef = useRef<google.maps.StreetViewService | null>(null);

  const generateLocation = useCallback(
    async (
      regionId: string,
      usedLabels: string[] = [],
      quotaExceeded = false,
    ): Promise<RoundLocation> => {
      const region = getRegionById(regionId);
      const randomHeading = Math.floor(Math.random() * 360);

      let hitQuota = quotaExceeded;

      if (streetViewLib && !quotaExceeded) {
        if (!serviceRef.current) {
          serviceRef.current = new streetViewLib.StreetViewService();
        }
        const sv = serviceRef.current;
        const deadlineMs = Date.now() + 9_500;

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
            // ZERO_RESULTS -> try next coordinate (up to MAX_STREETVIEW_ATTEMPTS)
          }
        }
      }

      // Quota-saving fallback: immediately pick a verified real-world coordinate for this region
      const verified = pickVerifiedSpot(region.id, usedLabels, Math.random);
      return {
        lat: verified.lat,
        lng: verified.lng,
        heading: randomHeading,
        pitch: 0,
        hintLabel: verified.label,
        countryCode: verified.countryCode,
        isLiveStreetView: Boolean(streetViewLib && !hitQuota),
      };
    },
    [streetViewLib],
  );

  return {
    generateLocation,
    isStreetViewReady: Boolean(streetViewLib),
  };
}
