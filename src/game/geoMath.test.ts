import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDistanceKm,
  calculateGeoScore,
  formatDistanceRu,
  generateCandidateCoordinate,
  getAccuracyGrade,
  isProhibitedTerritory,
  MAX_ROUND_SCORE,
} from './geoMath';
import { REGIONS, getRegionById } from './regions';
import { VERIFIED_SPOTS_BY_REGION, pickVerifiedSpot } from './verifiedLocations';

test('calculateDistanceKm computes accurate Haversine distances', () => {
  assert.equal(
    calculateDistanceKm({ lat: 48.8566, lng: 2.3522 }, { lat: 48.8566, lng: 2.3522 }),
    0,
  );

  // London to Paris is ~343.5 km
  const londonParis = calculateDistanceKm(
    { lat: 51.5074, lng: -0.1278 },
    { lat: 48.8566, lng: 2.3522 },
  );
  assert.ok(londonParis > 340 && londonParis < 348, `Expected ~343.5km, got ${londonParis}`);

  // Antipodes ~20,015 km
  const antipodes = calculateDistanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 });
  assert.ok(antipodes > 20000 && antipodes < 20030, `Expected ~20015km, got ${antipodes}`);
});

test('calculateGeoScore follows exact 5000 * Math.exp(-distanceKm / 2000) formula with <0.05km = 5000', () => {
  assert.equal(calculateGeoScore(0), MAX_ROUND_SCORE);
  assert.equal(calculateGeoScore(0.049), MAX_ROUND_SCORE);

  // At exactly 2000 km => 5000 * e^-1 ≈ 1839
  assert.equal(calculateGeoScore(2000), Math.round(5000 * Math.exp(-1)));

  // At 100 km => 5000 * e^(-0.05) ≈ 4756
  assert.equal(calculateGeoScore(100), Math.round(5000 * Math.exp(-100 / 2000)));

  // Invalid or negative distance never returns NaN or negative
  assert.equal(calculateGeoScore(-5), 0);
  assert.equal(calculateGeoScore(Number.NaN), 0);
});

test('prohibited territories guard excludes restricted regions and allows valid regions', () => {
  assert.equal(isProhibitedTerritory({ lat: 44.95, lng: 34.1 }), true); // Crimea
  assert.equal(isProhibitedTerritory({ lat: 39.9, lng: 116.4 }), true); // Beijing, China
  assert.equal(isProhibitedTerritory({ lat: 23.1, lng: -82.3 }), true); // Havana, Cuba
  assert.equal(isProhibitedTerritory({ lat: 35.7, lng: 51.4 }), true); // Tehran, Iran
  assert.equal(isProhibitedTerritory({ lat: 39.0, lng: 125.7 }), true); // Pyongyang, North Korea
  assert.equal(isProhibitedTerritory({ lat: 21.0, lng: 105.8 }), true); // Hanoi, Vietnam

  assert.equal(isProhibitedTerritory({ lat: 48.8566, lng: 2.3522 }), false); // Paris
  assert.equal(isProhibitedTerritory({ lat: 55.7558, lng: 37.6173 }), false); // Moscow
  assert.equal(isProhibitedTerritory({ lat: 35.6762, lng: 139.6503 }), false); // Tokyo
  assert.equal(isProhibitedTerritory({ lat: 25.033, lng: 121.5654 }), false); // Taipei
  assert.equal(isProhibitedTerritory({ lat: 37.5665, lng: 126.978 }), false); // Seoul
  assert.equal(isProhibitedTerritory({ lat: 18.7883, lng: 98.9853 }), false); // Chiang Mai, Thailand
});

test('every bounding box and generated coordinate across all 21 regions/countries avoids prohibited territories', () => {
  assert.ok(REGIONS.length >= 20, `Expected at least 20 regions/countries, got ${REGIONS.length}`);

  let seed = 42;
  const deterministicRng = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  for (const region of REGIONS) {
    assert.ok(region.bounds.length > 0, `Region ${region.id} must have bounding boxes`);
    for (let i = 0; i < 12; i++) {
      const candidate = generateCandidateCoordinate(region, deterministicRng);
      assert.equal(
        isProhibitedTerritory({ lat: candidate.lat, lng: candidate.lng }),
        false,
        `Generated point in ${region.id} (${candidate.lat}, ${candidate.lng}) fell into prohibited territory`,
      );
      assert.ok(
        candidate.lat >= candidate.bounds.minLat && candidate.lat <= candidate.bounds.maxLat,
      );
      assert.ok(
        candidate.lng >= candidate.bounds.minLng && candidate.lng <= candidate.bounds.maxLng,
      );
    }
  }
});

test('formatDistanceRu and getAccuracyGrade produce readable Russian output', () => {
  assert.equal(formatDistanceRu(null), 'Нет ответа');
  assert.equal(formatDistanceRu(0.45), '450 м');
  assert.equal(formatDistanceRu(12.34), '12,3 км');
  assert.equal(getAccuracyGrade(23500, 25000).grade, 'S');
  assert.equal(getAccuracyGrade(19500, 25000).grade, 'A');
  assert.equal(getRegionById('nonexistent').id, 'world');
});

test('verified Street View fallback list covers all regions and avoids prohibited territories', () => {
  for (const region of REGIONS) {
    const spots = VERIFIED_SPOTS_BY_REGION[region.id];
    assert.ok(
      Array.isArray(spots) && spots.length >= 3,
      `Region ${region.id} must have at least 3 verified fallback spots`,
    );

    for (const spot of spots) {
      assert.ok(
        spot.lat >= -85 && spot.lat <= 85 && spot.lng >= -180 && spot.lng <= 180,
        `Invalid coordinates in ${region.id}: ${spot.label}`,
      );
      assert.equal(
        isProhibitedTerritory({ lat: spot.lat, lng: spot.lng }),
        false,
        `Verified spot "${spot.label}" in ${region.id} fell into prohibited territory`,
      );
    }

    const picked = pickVerifiedSpot(region.id, [spots[0].label]);
    assert.ok(picked.label.length > 0);
    assert.notEqual(picked.label, spots[0].label);
  }
});
