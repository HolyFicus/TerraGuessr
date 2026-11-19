import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDistanceKm,
  calculateDistanceMeters,
  calculateGeoScore,
  formatDistanceRu,
  generateCandidateCoordinate,
  getAccuracyGrade,
  getMedalForScore,
  getMedalThresholds,
  getPerfectThresholdMeters,
  getRegionMapSizeMeters,
  isProhibitedTerritory,
  MAX_ROUND_SCORE,
  pickBestMedal,
  WORLD_MAP_SIZE_METERS,
} from './geoMath';
import { REGIONS, getRegionById } from './regions';
import { VERIFIED_SPOTS_BY_REGION, pickVerifiedSpot } from './verifiedLocations';

test('calculateDistanceMeters and calculateDistanceKm compute accurate Haversine distances', () => {
  assert.equal(
    calculateDistanceKm({ lat: 48.8566, lng: 2.3522 }, { lat: 48.8566, lng: 2.3522 }),
    0,
  );

  // London to Paris is ~343.5 km
  const londonParisKm = calculateDistanceKm(
    { lat: 51.5074, lng: -0.1278 },
    { lat: 48.8566, lng: 2.3522 },
  );
  assert.ok(londonParisKm > 340 && londonParisKm < 348, `Expected ~343.5km, got ${londonParisKm}`);
  assert.equal(
    Math.round(
      calculateDistanceMeters({ lat: 51.5074, lng: -0.1278 }, { lat: 48.8566, lng: 2.3522 }),
    ),
    Math.round(londonParisKm * 1000),
  );

  // Antipodes ~20,015 km
  const antipodes = calculateDistanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 });
  assert.ok(antipodes > 20000 && antipodes < 20030, `Expected ~20015km, got ${antipodes}`);
});

test('getRegionMapSizeMeters uses exact world constant and Haversine SW-NE diagonal for countries/regions', () => {
  const world = getRegionById('world');
  assert.equal(getRegionMapSizeMeters(world), WORLD_MAP_SIZE_METERS);
  assert.equal(WORLD_MAP_SIZE_METERS, 14_916_862);

  const europe = getRegionById('europe');
  const france = getRegionById('france');
  const japan = getRegionById('japan');

  const europeSize = getRegionMapSizeMeters(europe);
  const franceSize = getRegionMapSizeMeters(france);
  const japanSize = getRegionMapSizeMeters(japan);

  assert.ok(europeSize > franceSize, `Expected Europe (${europeSize}) > France (${franceSize})`);
  assert.ok(
    WORLD_MAP_SIZE_METERS > europeSize,
    `Expected World (${WORLD_MAP_SIZE_METERS}) > Europe (${europeSize})`,
  );
  assert.ok(franceSize > 500_000 && franceSize < 2_500_000, `Unexpected France mapSize: ${franceSize}`);
  assert.ok(japanSize > 1_000_000 && japanSize < 4_000_000, `Unexpected Japan mapSize: ${japanSize}`);
});

test('calculateGeoScore follows exact GeoGuessr formula with adaptive mapSize and 5K threshold', () => {
  // World mapSize = 14,916,862 m -> perfectThreshold = max(25, 149.16862) ≈ 149.17 m
  const worldThreshold = getPerfectThresholdMeters(WORLD_MAP_SIZE_METERS);
  assert.ok(Math.abs(worldThreshold - 149.16862) < 0.01);

  // Small country (e.g. 500 km mapSize) -> perfectThreshold clamped at 25 m
  assert.equal(getPerfectThresholdMeters(500_000), 25);

  // Within threshold => exact 5000 (5K!)
  assert.equal(calculateGeoScore(0, WORLD_MAP_SIZE_METERS), MAX_ROUND_SCORE);
  assert.equal(calculateGeoScore(0.149, WORLD_MAP_SIZE_METERS), MAX_ROUND_SCORE);
  assert.equal(calculateGeoScore(0.025, 500_000), MAX_ROUND_SCORE);

  // Outside threshold => Math.round(5000 * Math.exp(-10 * distanceMeters / mapSize))
  const expectedAt1000KmWorld = Math.round(
    5000 * Math.exp((-10 * 1_000_000) / WORLD_MAP_SIZE_METERS),
  );
  assert.equal(calculateGeoScore(1000, WORLD_MAP_SIZE_METERS), expectedAt1000KmWorld);

  // Same 100 km error scores much stricter on France than on World
  const franceSize = getRegionMapSizeMeters(getRegionById('france'));
  const score100KmWorld = calculateGeoScore(100, WORLD_MAP_SIZE_METERS);
  const score100KmFrance = calculateGeoScore(100, franceSize);
  assert.ok(
    score100KmFrance < score100KmWorld,
    `Expected 100km on France (${score100KmFrance}) < World (${score100KmWorld})`,
  );
  assert.equal(
    score100KmFrance,
    Math.round(5000 * Math.exp((-10 * 100_000) / franceSize)),
  );

  // Invalid or negative distance never returns NaN or negative
  assert.equal(calculateGeoScore(-5, WORLD_MAP_SIZE_METERS), 0);
  assert.equal(calculateGeoScore(Number.NaN, WORLD_MAP_SIZE_METERS), 0);
});

test('GeoGuessr medal tiers match 5-round official thresholds and scale proportionally for 1-10 rounds', () => {
  // Exact 5-round (25,000 max) thresholds
  assert.equal(getMedalForScore(25000, 25000), 'platinum');
  assert.equal(getMedalForScore(24999, 25000), 'gold');
  assert.equal(getMedalForScore(22500, 25000), 'gold');
  assert.equal(getMedalForScore(22499, 25000), 'silver');
  assert.equal(getMedalForScore(15000, 25000), 'silver');
  assert.equal(getMedalForScore(14999, 25000), 'bronze');
  assert.equal(getMedalForScore(5000, 25000), 'bronze');
  assert.equal(getMedalForScore(4999, 25000), 'none');
  assert.equal(getMedalForScore(0, 25000), 'none');

  // 10-round (50,000 max) proportional thresholds
  assert.equal(getMedalForScore(50000, 50000), 'platinum');
  assert.equal(getMedalForScore(45000, 50000), 'gold');
  assert.equal(getMedalForScore(30000, 50000), 'silver');
  assert.equal(getMedalForScore(10000, 50000), 'bronze');
  assert.equal(getMedalForScore(9999, 50000), 'none');

  assert.equal(pickBestMedal('bronze', 'gold'), 'gold');
  assert.equal(pickBestMedal('platinum', 'silver'), 'platinum');

  const thresholds5 = getMedalThresholds(25000);
  assert.deepEqual(
    thresholds5.map((t) => [t.tier, t.minScore]),
    [
      ['bronze', 5000],
      ['silver', 15000],
      ['gold', 22500],
      ['platinum', 25000],
    ],
  );
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
  assert.equal(formatDistanceRu(0.142), '142 м');
  assert.equal(formatDistanceRu(12.43), '12.4 км');
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
