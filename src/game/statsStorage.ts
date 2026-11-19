import { getMedalForScore, pickBestMedal } from './geoMath';
import type {
  GameMode,
  MatchRecord,
  MedalTier,
  MovementMode,
  PlayerStatsSummary,
  RegionMedalRecord,
} from './types';

const STORAGE_KEY = 'terraspotter_match_history_v1';
const VALID_MODES = new Set<GameMode>(['solo', 'hotseat', 'multiplayer']);
const VALID_MOVEMENTS = new Set<MovementMode>(['moving', 'no_move', 'nmpz']);
const VALID_MEDALS = new Set<MedalTier>([
  'platinum',
  'gold',
  'silver',
  'bronze',
  'none',
]);

export function sanitizeMatchRecord(raw: unknown): MatchRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  if (
    typeof r.id !== 'string' ||
    r.id.length === 0 ||
    r.id.length > 80 ||
    typeof r.timestamp !== 'number' ||
    !Number.isFinite(r.timestamp) ||
    typeof r.mode !== 'string' ||
    !VALID_MODES.has(r.mode as GameMode) ||
    typeof r.regionId !== 'string' ||
    r.regionId.length === 0 ||
    r.regionId.length > 48 ||
    typeof r.regionName !== 'string' ||
    typeof r.playerName !== 'string' ||
    typeof r.totalScore !== 'number' ||
    !Number.isFinite(r.totalScore) ||
    typeof r.maxPossibleScore !== 'number' ||
    !Number.isFinite(r.maxPossibleScore)
  ) {
    return null;
  }

  const totalScore = Math.max(0, Math.min(200_000, Math.round(r.totalScore)));
  const maxPossibleScore = Math.max(
    1,
    Math.min(200_000, Math.round(r.maxPossibleScore)),
  );
  const isDuel = typeof r.isDuel === 'boolean' ? r.isDuel : undefined;
  const medal: MedalTier =
    typeof r.medal === 'string' && VALID_MEDALS.has(r.medal as MedalTier)
      ? (r.medal as MedalTier)
      : isDuel
        ? 'none'
        : getMedalForScore(totalScore, maxPossibleScore);

  return {
    id: r.id,
    timestamp: r.timestamp,
    mode: r.mode as GameMode,
    isDuel,
    regionId: r.regionId,
    regionName: r.regionName.slice(0, 64),
    totalRounds:
      typeof r.totalRounds === 'number' && Number.isFinite(r.totalRounds)
        ? Math.max(1, Math.min(50, Math.round(r.totalRounds)))
        : 5,
    playerName: r.playerName.slice(0, 32) || 'Игрок',
    totalScore,
    maxPossibleScore,
    avgDistanceKm:
      typeof r.avgDistanceKm === 'number' && Number.isFinite(r.avgDistanceKm)
        ? Math.max(0, Math.min(25_000, r.avgDistanceKm))
        : 0,
    bestRoundScore:
      typeof r.bestRoundScore === 'number' && Number.isFinite(r.bestRoundScore)
        ? Math.max(0, Math.min(5000, Math.round(r.bestRoundScore)))
        : 0,
    perfectRounds:
      typeof r.perfectRounds === 'number' && Number.isFinite(r.perfectRounds)
        ? Math.max(0, Math.min(50, Math.round(r.perfectRounds)))
        : 0,
    medal,
    maxDamageDealt:
      typeof r.maxDamageDealt === 'number' && Number.isFinite(r.maxDamageDealt)
        ? Math.max(0, Math.min(50_000, Math.round(r.maxDamageDealt)))
        : undefined,
    movementMode:
      typeof r.movementMode === 'string' &&
      VALID_MOVEMENTS.has(r.movementMode as MovementMode)
        ? (r.movementMode as MovementMode)
        : 'moving',
    timerSeconds:
      typeof r.timerSeconds === 'number' && Number.isFinite(r.timerSeconds)
        ? Math.max(0, Math.min(3600, Math.round(r.timerSeconds)))
        : 0,
    won: typeof r.won === 'boolean' ? r.won : undefined,
  };
}

export function loadMatchHistory(): MatchRecord[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid: MatchRecord[] = [];
    for (const item of parsed) {
      const sanitized = sanitizeMatchRecord(item);
      if (sanitized) valid.push(sanitized);
    }
    return valid.slice(0, 200);
  } catch {
    return [];
  }
}

export function saveMatchRecords(records: MatchRecord[]): MatchRecord[] {
  const existing = loadMatchHistory();
  const existingIds = new Set(existing.map((r) => r.id));
  const safeNew = records
    .map((r) => sanitizeMatchRecord(r))
    .filter((r): r is MatchRecord => r !== null && !existingIds.has(r.id));

  const merged = [...safeNew, ...existing].slice(0, 200);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // Ignore quota errors in private browsing
  }
  return merged;
}

export function clearMatchHistory(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export function getDistinctPlayers(records: MatchRecord[]): string[] {
  const seen = new Set<string>();
  for (const r of records) {
    if (r.playerName) seen.add(r.playerName);
  }
  return Array.from(seen);
}

/**
 * Returns best earned medal & best score per regionId for Explorer Mode badges.
 */
export function getRegionBestMap(
  records: MatchRecord[],
  playerFilter?: string,
): Map<string, RegionMedalRecord> {
  const summary = computeStatsSummary(records, playerFilter);
  const map = new Map<string, RegionMedalRecord>();
  for (const item of summary.regionBreakdown) {
    map.set(item.regionId, item);
  }
  return map;
}

export function computeStatsSummary(
  records: MatchRecord[],
  playerFilter?: string,
): PlayerStatsSummary {
  const filtered = playerFilter
    ? records.filter((r) => r.playerName === playerFilter)
    : records;

  if (filtered.length === 0) {
    return {
      playerName: playerFilter || 'Все игроки',
      gamesPlayed: 0,
      bestScore: 0,
      avgScore: 0,
      avgDistanceKm: 0,
      perfectRounds: 0,
      totalPoints: 0,
      wins: 0,
      duelWins: 0,
      duelLosses: 0,
      regionBreakdown: [],
    };
  }

  let bestScore = 0;
  let totalPoints = 0;
  let totalAvgDist = 0;
  let perfectRounds = 0;
  let wins = 0;
  let duelWins = 0;
  let duelLosses = 0;

  // Use Map instead of plain Object to prevent prototype-key collisions (__proto__, constructor, etc.)
  const regionMap = new Map<
    string,
    {
      regionName: string;
      games: number;
      bestScore: number;
      bestMaxPossible: number;
      sumScore: number;
      bestMedal: MedalTier;
    }
  >();

  for (const rec of filtered) {
    if (rec.totalScore > bestScore) bestScore = rec.totalScore;
    totalPoints += rec.totalScore;
    totalAvgDist += rec.avgDistanceKm;
    perfectRounds += rec.perfectRounds;
    if (rec.won) wins += 1;
    if (rec.isDuel) {
      if (rec.won === true) duelWins += 1;
      else if (rec.won === false) duelLosses += 1;
    }

    const recMedal: MedalTier = rec.isDuel
      ? 'none'
      : rec.medal ?? getMedalForScore(rec.totalScore, rec.maxPossibleScore);

    const bucket = regionMap.get(rec.regionId) ?? {
      regionName: rec.regionName,
      games: 0,
      bestScore: 0,
      bestMaxPossible: rec.maxPossibleScore,
      sumScore: 0,
      bestMedal: 'none' as MedalTier,
    };
    bucket.games += 1;
    bucket.sumScore += rec.totalScore;
    if (rec.totalScore > bucket.bestScore) {
      bucket.bestScore = rec.totalScore;
      bucket.bestMaxPossible = rec.maxPossibleScore;
    }
    bucket.bestMedal = pickBestMedal(bucket.bestMedal, recMedal);
    regionMap.set(rec.regionId, bucket);
  }

  const regionBreakdown: RegionMedalRecord[] = Array.from(regionMap.entries())
    .map(([regionId, b]) => ({
      regionId,
      regionName: b.regionName,
      games: b.games,
      bestScore: b.bestScore,
      bestMaxPossible: b.bestMaxPossible,
      avgScore: Math.round(b.sumScore / b.games),
      bestMedal: b.bestMedal,
    }))
    .sort((a, b) => b.games - a.games || b.bestScore - a.bestScore);

  return {
    playerName: playerFilter || 'Все игроки',
    gamesPlayed: filtered.length,
    bestScore,
    avgScore: Math.round(totalPoints / filtered.length),
    avgDistanceKm: Math.round((totalAvgDist / filtered.length) * 10) / 10,
    perfectRounds,
    totalPoints,
    wins,
    duelWins,
    duelLosses,
    regionBreakdown,
  };
}
