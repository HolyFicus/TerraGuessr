import {
  calculateDistanceKm,
  calculateGeoScore,
  getRegionMapSizeMeters,
  PLAYER_COLORS,
} from './geoMath';
import { getRegionById } from './regions';
import { sanitizePanoramaUrl } from './sanitize';
import type {
  DuelRoundDamage,
  LatLng,
  MovementMode,
  MultiplayerPlayer,
  MultiplayerRoomPublicState,
  OnlineFormat,
  PanoramaProvider,
  PlayerGuess,
  RoundLocation,
  RoundOutcome,
} from './types';

export const DUEL_STARTING_HP = 6000;
export const DUEL_LOCKOUT_SECONDS = 15;
export const DUEL_MAX_ROUNDS = 30;

/**
 * Escalating GeoGuessr-style Duel damage multiplier:
 * Rounds 1-4 => x1.0, Round 5 => x1.5, Round 6 => x2.0, Round 7 => x2.5, etc.
 * Formula: round <= 4 ? 1 : 1 + (round - 4) * 0.5
 */
export function getDuelMultiplier(roundIndex: number): number {
  const round = roundIndex + 1;
  if (round <= 4) return 1;
  return 1 + (round - 4) * 0.5;
}

/**
 * Pure shared resolver for a 1v1 Duel round (used by both Hotseat Duels and PeerJS Online Duels).
 */
export function resolveDuelRoundDamage(
  guesses: PlayerGuess[],
  currentHp: Record<string, number>,
  roundIndex: number,
): { duelDamage: DuelRoundDamage; knockoutWinnerId: string | null } {
  const multiplier = getDuelMultiplier(roundIndex);
  const hpBefore: Record<string, number> = {};
  const hpAfter: Record<string, number> = {};

  for (const g of guesses) {
    const startHp =
      typeof currentHp[g.playerId] === 'number' && Number.isFinite(currentHp[g.playerId])
        ? Math.max(0, Math.round(currentHp[g.playerId]))
        : DUEL_STARTING_HP;
    hpBefore[g.playerId] = startHp;
    hpAfter[g.playerId] = startHp;
  }

  if (guesses.length < 2) {
    return {
      duelDamage: {
        multiplier,
        damage: 0,
        winnerPlayerId: null,
        loserPlayerId: null,
        hpBefore,
        hpAfter,
      },
      knockoutWinnerId: null,
    };
  }

  const [first, second] = [...guesses].sort((a, b) => b.score - a.score);
  const diff = Math.max(0, first.score - second.score);
  const damage = Math.round(diff * multiplier);
  let knockoutWinnerId: string | null = null;

  if (damage > 0) {
    const nextLoserHp = Math.max(0, (hpAfter[second.playerId] ?? DUEL_STARTING_HP) - damage);
    hpAfter[second.playerId] = nextLoserHp;
    if (nextLoserHp <= 0) {
      knockoutWinnerId = first.playerId;
    }
  }

  return {
    duelDamage: {
      multiplier,
      damage,
      winnerPlayerId: damage > 0 ? first.playerId : null,
      loserPlayerId: damage > 0 ? second.playerId : null,
      hpBefore,
      hpAfter,
    },
    knockoutWinnerId,
  };
}

export interface InternalRoomPlayer extends MultiplayerPlayer {
  currentGuess: LatLng | null;
  currentTimeSpentSec: number;
}

export interface InternalRoom {
  code: string;
  hostId: string;
  onlineFormat: OnlineFormat;
  status: 'lobby' | 'locating' | 'playing' | 'round_result' | 'gameover';
  regionId: string;
  totalRounds: number;
  timerSeconds: number;
  movementMode: MovementMode;
  currentRoundIndex: number;
  roundStartedAt: number | null;
  duelCountdownEndsAt: number | null;
  duelWinnerId: string | null;
  currentLocation: RoundLocation | null;
  players: InternalRoomPlayer[];
  roundHistory: RoundOutcome[];
  createdAt: number;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const VALID_STATUSES = new Set([
  'lobby',
  'locating',
  'playing',
  'round_result',
  'gameover',
]);
const VALID_ONLINE_FORMATS = new Set<OnlineFormat>(['duel', 'classic']);
const VALID_PROVIDERS = new Set<PanoramaProvider>([
  'google',
  'panoramax',
  'mapillary',
  'offline',
]);

function secureRandomIndex(max: number, rng?: () => number): number {
  if (rng) {
    return Math.floor(rng() * max) % max;
  }
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buf);
    return buf[0] % max;
  }
  return Math.floor(Math.random() * max) % max;
}

/**
 * Generates a cryptographically strong 6-character invite code (GEO-XXXXXX,
 * >1 billion combinations) to prevent random room brute-forcing on PeerJS.
 */
export function generateInviteCode(
  existingCodes: Set<string> = new Set(),
  rng?: () => number,
): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    let suffix = '';
    for (let i = 0; i < 6; i++) {
      suffix += CODE_ALPHABET[secureRandomIndex(CODE_ALPHABET.length, rng)];
    }
    const code = `GEO-${suffix}`;
    if (!existingCodes.has(code)) return code;
  }
  return `GEO-${Date.now().toString(36).slice(-6).toUpperCase()}`;
}

export function normalizeInviteCode(input: string): string {
  const cleaned = input.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('GEO-')) return cleaned;
  if (cleaned.length >= 4 && cleaned.length <= 6) return `GEO-${cleaned}`;
  return cleaned;
}

export function inviteCodeToPeerId(code: string): string {
  const clean = normalizeInviteCode(code).replace(/[^A-Z0-9]/g, '').toLowerCase();
  return `terraspotter-room-${clean}`;
}

/**
 * Builds a clean shareable invite URL that preserves GitHub Pages subpaths
 * (e.g. https://user.github.io/terraspotter/?join=GEO-7K4M9P) and strips
 * stale query parameters or hash fragments.
 */
export function buildInviteLink(currentHref: string, roomCode: string): string {
  const safeCode = encodeURIComponent(normalizeInviteCode(roomCode));
  try {
    const url = new URL(currentHref);
    url.hash = '';
    url.search = `?join=${safeCode}`;
    return url.toString();
  } catch {
    return `?join=${safeCode}`;
  }
}

export function sanitizePlayerName(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 24);
  return cleaned || fallback;
}

export function sanitizeLatLng(raw: unknown): LatLng | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as { lat?: unknown; lng?: unknown };
  if (
    typeof candidate.lat !== 'number' ||
    typeof candidate.lng !== 'number' ||
    !Number.isFinite(candidate.lat) ||
    !Number.isFinite(candidate.lng)
  ) {
    return null;
  }
  if (candidate.lat < -90 || candidate.lat > 90) return null;
  const normalizedLng =
    candidate.lng >= -180 && candidate.lng <= 180
      ? candidate.lng
      : ((((candidate.lng + 180) % 360) + 360) % 360) - 180;
  return { lat: candidate.lat, lng: normalizedLng };
}

function sanitizeSafeColor(raw: unknown, fallbackIndex = 0): string {
  if (typeof raw === 'string' && HEX_COLOR_RE.test(raw.trim())) {
    return raw.trim();
  }
  return PLAYER_COLORS[fallbackIndex % PLAYER_COLORS.length];
}

function sanitizeRoundLocation(raw: unknown): RoundLocation | null {
  if (!raw || typeof raw !== 'object') return null;
  const loc = raw as Record<string, unknown>;
  const coords = sanitizeLatLng({ lat: loc.lat, lng: loc.lng });
  if (!coords) return null;
  const provider: PanoramaProvider | undefined =
    typeof loc.provider === 'string' &&
    VALID_PROVIDERS.has(loc.provider as PanoramaProvider)
      ? (loc.provider as PanoramaProvider)
      : undefined;

  return {
    lat: coords.lat,
    lng: coords.lng,
    panoId:
      typeof loc.panoId === 'string' && loc.panoId.length <= 128
        ? loc.panoId
        : undefined,
    provider,
    imageUrl: sanitizePanoramaUrl(loc.imageUrl),
    isEquirectangular:
      typeof loc.isEquirectangular === 'boolean'
        ? loc.isEquirectangular
        : undefined,
    cameraAzimuth:
      typeof loc.cameraAzimuth === 'number' && Number.isFinite(loc.cameraAzimuth)
        ? ((loc.cameraAzimuth % 360) + 360) % 360
        : undefined,
    nextStepUrl: sanitizePanoramaUrl(loc.nextStepUrl),
    prevStepUrl: sanitizePanoramaUrl(loc.prevStepUrl),
    attribution:
      typeof loc.attribution === 'string'
        ? loc.attribution.replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 80)
        : undefined,
    heading:
      typeof loc.heading === 'number' && Number.isFinite(loc.heading)
        ? ((loc.heading % 360) + 360) % 360
        : 0,
    pitch:
      typeof loc.pitch === 'number' && Number.isFinite(loc.pitch)
        ? Math.max(-90, Math.min(90, loc.pitch))
        : 0,
    hintLabel:
      typeof loc.hintLabel === 'string'
        ? loc.hintLabel.replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 80)
        : '',
    countryCode:
      typeof loc.countryCode === 'string'
        ? loc.countryCode.replace(/[^A-Z]/gi, '').toUpperCase().slice(0, 3)
        : '',
    isLiveStreetView: Boolean(loc.isLiveStreetView),
  };
}

/**
 * Runtime schema validator & sanitizer for untrusted room:state packets
 * received over WebRTC from a remote host.
 */
export function sanitizePublicRoomState(
  raw: unknown,
): MultiplayerRoomPublicState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  if (typeof r.code !== 'string' || typeof r.hostId !== 'string') return null;
  if (typeof r.status !== 'string' || !VALID_STATUSES.has(r.status)) return null;
  if (!Array.isArray(r.players) || r.players.length > 12) return null;
  if (!Array.isArray(r.roundHistory) || r.roundHistory.length > DUEL_MAX_ROUNDS) return null;

  const onlineFormat: OnlineFormat =
    typeof r.onlineFormat === 'string' &&
    VALID_ONLINE_FORMATS.has(r.onlineFormat as OnlineFormat)
      ? (r.onlineFormat as OnlineFormat)
      : 'classic';

  const movementMode: MovementMode = 'moving';

  const maxAllowedScore = onlineFormat === 'duel' ? 200_000 : 100_000;
  const players: MultiplayerPlayer[] = [];
  for (let i = 0; i < r.players.length; i++) {
    const p = r.players[i];
    if (!p || typeof p !== 'object') continue;
    const po = p as Record<string, unknown>;
    if (typeof po.id !== 'string' || po.id.length === 0 || po.id.length > 64) {
      continue;
    }
    players.push({
      id: po.id,
      name: sanitizePlayerName(po.name, `Игрок ${i + 1}`),
      color: sanitizeSafeColor(po.color, i),
      isHost: Boolean(po.isHost),
      connected: Boolean(po.connected),
      totalScore:
        typeof po.totalScore === 'number' && Number.isFinite(po.totalScore)
          ? Math.max(0, Math.min(maxAllowedScore, Math.round(po.totalScore)))
          : 0,
      hp:
        typeof po.hp === 'number' && Number.isFinite(po.hp)
          ? Math.max(0, Math.min(DUEL_STARTING_HP, Math.round(po.hp)))
          : DUEL_STARTING_HP,
      hasGuessedCurrentRound: Boolean(po.hasGuessedCurrentRound),
      readyForNext: Boolean(po.readyForNext),
    });
  }

  if (players.length === 0) return null;

  const roundHistory: RoundOutcome[] = [];
  for (const item of r.roundHistory) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const actual = sanitizeRoundLocation(o.actual);
    if (!actual || !Array.isArray(o.guesses)) continue;

    const guesses: PlayerGuess[] = [];
    for (let i = 0; i < o.guesses.length && i < 12; i++) {
      const g = o.guesses[i];
      if (!g || typeof g !== 'object') continue;
      const go = g as Record<string, unknown>;
      if (typeof go.playerId !== 'string' || go.playerId.length > 64) continue;
      const guessCoords = go.guess === null ? null : sanitizeLatLng(go.guess);
      const distanceKm =
        typeof go.distanceKm === 'number' &&
        Number.isFinite(go.distanceKm) &&
        go.distanceKm >= 0
          ? Math.min(25_000, go.distanceKm)
          : null;
      const score =
        typeof go.score === 'number' && Number.isFinite(go.score)
          ? Math.max(0, Math.min(5000, Math.round(go.score)))
          : 0;
      const timeSpentSec =
        typeof go.timeSpentSec === 'number' && Number.isFinite(go.timeSpentSec)
          ? Math.max(0, Math.min(3600, Math.round(go.timeSpentSec)))
          : 0;

      guesses.push({
        playerId: go.playerId,
        playerName: sanitizePlayerName(go.playerName, `Игрок ${i + 1}`),
        color: sanitizeSafeColor(go.color, i),
        guess: guessCoords,
        distanceKm,
        score,
        timeSpentSec,
      });
    }

    let duelDamage: DuelRoundDamage | undefined;
    if (o.duelDamage && typeof o.duelDamage === 'object') {
      const dd = o.duelDamage as Record<string, unknown>;
      const sanitizeHpMap = (rawMap: unknown): Record<string, number> => {
        const out: Record<string, number> = {};
        if (rawMap && typeof rawMap === 'object') {
          for (const [k, v] of Object.entries(rawMap as Record<string, unknown>)) {
            if (
              k.length <= 64 &&
              k !== '__proto__' &&
              k !== 'constructor' &&
              k !== 'prototype' &&
              typeof v === 'number' &&
              Number.isFinite(v)
            ) {
              out[k] = Math.max(0, Math.min(DUEL_STARTING_HP, Math.round(v)));
            }
          }
        }
        return out;
      };

      const hpBefore = dd.hpBefore ? sanitizeHpMap(dd.hpBefore) : undefined;
      const hpAfter = sanitizeHpMap(dd.hpAfter);
      duelDamage = {
        multiplier:
          typeof dd.multiplier === 'number' && Number.isFinite(dd.multiplier)
            ? Math.max(1, Math.min(15, dd.multiplier))
            : 1,
        damage:
          typeof dd.damage === 'number' && Number.isFinite(dd.damage)
            ? Math.max(0, Math.min(75_000, Math.round(dd.damage)))
            : 0,
        winnerPlayerId:
          typeof dd.winnerPlayerId === 'string' && dd.winnerPlayerId.length <= 64
            ? dd.winnerPlayerId
            : null,
        loserPlayerId:
          typeof dd.loserPlayerId === 'string' && dd.loserPlayerId.length <= 64
            ? dd.loserPlayerId
            : null,
        hpBefore,
        hpAfter,
      };
    }

    roundHistory.push({
      roundIndex:
        typeof o.roundIndex === 'number' && Number.isFinite(o.roundIndex)
          ? Math.max(0, Math.min(DUEL_MAX_ROUNDS, Math.round(o.roundIndex)))
          : roundHistory.length,
      actual,
      guesses,
      duelDamage,
    });
  }

  const maxAllowedRounds = onlineFormat === 'duel' ? DUEL_MAX_ROUNDS : 10;

  return {
    code: normalizeInviteCode(r.code).slice(0, 14),
    hostId: r.hostId.slice(0, 64),
    onlineFormat,
    status: r.status as MultiplayerRoomPublicState['status'],
    regionId: getRegionById(typeof r.regionId === 'string' ? r.regionId : 'world').id,
    totalRounds:
      typeof r.totalRounds === 'number' && Number.isFinite(r.totalRounds)
        ? Math.max(1, Math.min(maxAllowedRounds, Math.round(r.totalRounds)))
        : 5,
    timerSeconds:
      typeof r.timerSeconds === 'number' && Number.isFinite(r.timerSeconds)
        ? Math.max(0, Math.min(300, Math.round(r.timerSeconds)))
        : 0,
    movementMode,
    currentRoundIndex:
      typeof r.currentRoundIndex === 'number' &&
      Number.isFinite(r.currentRoundIndex)
        ? Math.max(0, Math.min(DUEL_MAX_ROUNDS, Math.round(r.currentRoundIndex)))
        : 0,
    roundStartedAt:
      typeof r.roundStartedAt === 'number' && Number.isFinite(r.roundStartedAt)
        ? r.roundStartedAt
        : null,
    duelCountdownEndsAt:
      typeof r.duelCountdownEndsAt === 'number' &&
      Number.isFinite(r.duelCountdownEndsAt)
        ? r.duelCountdownEndsAt
        : null,
    duelWinnerId:
      typeof r.duelWinnerId === 'string' && r.duelWinnerId.length <= 64
        ? r.duelWinnerId
        : null,
    currentLocation:
      r.currentLocation === null
        ? null
        : sanitizeRoundLocation(r.currentLocation),
    players,
    roundHistory,
  };
}

export function createRoom(params: {
  code: string;
  hostId: string;
  hostName: string;
  onlineFormat?: OnlineFormat;
  regionId: string;
  totalRounds: number;
  timerSeconds: number;
  movementMode: MovementMode;
  now?: number;
}): InternalRoom {
  const cleanName = sanitizePlayerName(params.hostName, 'Игрок 1');
  const onlineFormat: OnlineFormat = params.onlineFormat === 'duel' ? 'duel' : 'classic';
  return {
    code: params.code,
    hostId: params.hostId,
    onlineFormat,
    status: 'lobby',
    regionId: getRegionById(params.regionId).id,
    totalRounds:
      onlineFormat === 'duel'
        ? DUEL_MAX_ROUNDS
        : Math.max(1, Math.min(10, Math.round(params.totalRounds || 5))),
    timerSeconds: Math.max(0, Math.min(300, Math.round(params.timerSeconds || 0))),
    movementMode: 'moving',
    currentRoundIndex: 0,
    roundStartedAt: null,
    duelCountdownEndsAt: null,
    duelWinnerId: null,
    currentLocation: null,
    players: [
      {
        id: params.hostId,
        name: cleanName,
        color: PLAYER_COLORS[0],
        isHost: true,
        connected: true,
        totalScore: 0,
        hp: DUEL_STARTING_HP,
        hasGuessedCurrentRound: false,
        readyForNext: false,
        currentGuess: null,
        currentTimeSpentSec: 0,
      },
    ],
    roundHistory: [],
    createdAt: params.now ?? Date.now(),
  };
}

export function joinRoom(
  room: InternalRoom,
  playerId: string,
  playerName: string,
): { ok: boolean; error?: string; player?: InternalRoomPlayer } {
  const existing = room.players.find((p) => p.id === playerId);
  if (existing) {
    existing.connected = true;
    const trimmed = sanitizePlayerName(playerName, '');
    if (trimmed) existing.name = trimmed;
    return { ok: true, player: existing };
  }

  const maxPlayers = room.onlineFormat === 'duel' ? 2 : 6;
  if (room.players.length >= maxPlayers) {
    return {
      ok: false,
      error:
        room.onlineFormat === 'duel'
          ? 'В дуэли участвуют только 2 игрока (1 на 1).'
          : 'Комната заполнена (максимум 6 игроков).',
    };
  }

  if (room.status !== 'lobby') {
    return { ok: false, error: 'Матч уже начался. Присоединиться можно только в лобби.' };
  }

  const cleanName = sanitizePlayerName(
    playerName,
    `Игрок ${room.players.length + 1}`,
  );
  const color = PLAYER_COLORS[room.players.length % PLAYER_COLORS.length];

  const player: InternalRoomPlayer = {
    id: playerId,
    name: cleanName,
    color,
    isHost: false,
    connected: true,
    totalScore: 0,
    hp: DUEL_STARTING_HP,
    hasGuessedCurrentRound: false,
    readyForNext: false,
    currentGuess: null,
    currentTimeSpentSec: 0,
  };
  room.players.push(player);
  return { ok: true, player };
}

export function disconnectPlayer(
  room: InternalRoom,
  playerId: string,
  distanceFn: (a: LatLng, b: LatLng) => number = calculateDistanceKm,
): { roundCompleted: boolean } {
  const player = room.players.find((p) => p.id === playerId);
  if (!player) return { roundCompleted: false };
  player.connected = false;

  if (player.isHost) {
    const nextHost = room.players.find((p) => p.connected && p.id !== playerId);
    if (nextHost) {
      player.isHost = false;
      nextHost.isHost = true;
      room.hostId = nextHost.id;
    }
  }

  // Prevent soft-lock if the disconnected player was the last remaining unguessed player
  if (room.status === 'playing' && room.currentLocation) {
    const activePlayers = room.players.filter(
      (p) => p.connected || p.hasGuessedCurrentRound,
    );
    if (
      activePlayers.length > 0 &&
      activePlayers.every((p) => p.hasGuessedCurrentRound)
    ) {
      room.duelCountdownEndsAt = null;
      finalizeCurrentRound(room, distanceFn);
      return { roundCompleted: true };
    }
  }

  return { roundCompleted: false };
}

export function startLocatingRound(
  room: InternalRoom,
  requesterId: string,
): { ok: boolean; error?: string } {
  if (room.hostId !== requesterId) {
    return { ok: false, error: 'Только хост может запустить раунд.' };
  }
  if (room.status !== 'lobby' && room.status !== 'round_result') {
    return { ok: false, error: 'Невозможно начать раунд в текущем состоянии.' };
  }
  if (room.status === 'lobby') {
    if (room.onlineFormat === 'duel' && room.players.length < 2) {
      return { ok: false, error: 'Для начала дуэли нужен второй игрок.' };
    }
    room.currentRoundIndex = 0;
    room.roundHistory = [];
    room.duelWinnerId = null;
    for (const p of room.players) {
      p.totalScore = 0;
      p.hp = DUEL_STARTING_HP;
    }
  } else if (room.status === 'round_result') {
    const duelEnded =
      room.onlineFormat === 'duel' &&
      (room.duelWinnerId !== null ||
        room.players.some((p) => p.hp <= 0) ||
        room.currentRoundIndex + 1 >= DUEL_MAX_ROUNDS);

    if (
      duelEnded ||
      (room.onlineFormat === 'classic' &&
        room.currentRoundIndex + 1 >= room.totalRounds)
    ) {
      room.status = 'gameover';
      return { ok: true };
    }
    room.currentRoundIndex += 1;
  }

  room.status = 'locating';
  room.currentLocation = null;
  room.roundStartedAt = null;
  room.duelCountdownEndsAt = null;
  for (const p of room.players) {
    p.hasGuessedCurrentRound = false;
    p.readyForNext = false;
    p.currentGuess = null;
    p.currentTimeSpentSec = 0;
  }
  return { ok: true };
}

export function setRoundLocation(
  room: InternalRoom,
  requesterId: string,
  location: RoundLocation,
  now: number = Date.now(),
): { ok: boolean; error?: string } {
  if (room.hostId !== requesterId) {
    return { ok: false, error: 'Только хост может задать локацию раунда.' };
  }
  if (room.status !== 'locating') {
    return { ok: false, error: 'Комната не ожидает локацию.' };
  }
  room.currentLocation = location;
  room.status = 'playing';
  room.roundStartedAt = now;
  room.duelCountdownEndsAt = null;
  return { ok: true };
}

export function submitPlayerGuess(
  room: InternalRoom,
  playerId: string,
  guess: LatLng | null,
  timeSpentSec: number,
  distanceFn: (a: LatLng, b: LatLng) => number = calculateDistanceKm,
  now: number = Date.now(),
): { ok: boolean; roundCompleted: boolean; error?: string } {
  if (room.status !== 'playing' || !room.currentLocation) {
    return { ok: false, roundCompleted: false, error: 'Раунд сейчас не активен.' };
  }

  const player = room.players.find((p) => p.id === playerId);
  if (!player) {
    return { ok: false, roundCompleted: false, error: 'Игрок не найден в комнате.' };
  }

  if (player.hasGuessedCurrentRound) {
    return { ok: true, roundCompleted: false };
  }

  const safeGuess = guess === null ? null : sanitizeLatLng(guess);
  if (guess !== null && !safeGuess) {
    return { ok: false, roundCompleted: false, error: 'Некорректные координаты метки.' };
  }

  player.hasGuessedCurrentRound = true;
  player.currentGuess = safeGuess;
  player.currentTimeSpentSec = Number.isFinite(timeSpentSec)
    ? Math.max(0, Math.min(3600, Math.round(timeSpentSec)))
    : 0;

  const activePlayers = room.players.filter((p) => p.connected || p.hasGuessedCurrentRound);
  const allGuessed =
    activePlayers.length > 0 && activePlayers.every((p) => p.hasGuessedCurrentRound);

  if (allGuessed) {
    room.duelCountdownEndsAt = null;
    finalizeCurrentRound(room, distanceFn);
    return { ok: true, roundCompleted: true };
  }

  // Authentic GeoGuessr Duel mechanic: once the first duelist locks in their guess,
  // start a 15-second pressure countdown for the opponent.
  if (room.onlineFormat === 'duel' && room.duelCountdownEndsAt === null) {
    room.duelCountdownEndsAt = now + DUEL_LOCKOUT_SECONDS * 1000;
  }

  return { ok: true, roundCompleted: false };
}

/**
 * Host helper: when the 15-second duel pressure countdown expires, finalize any
 * player who has not locked in a guess yet as a timed-out (0 pt) round.
 */
export function expirePendingDuelGuesses(
  room: InternalRoom,
  requesterId: string,
  distanceFn: (a: LatLng, b: LatLng) => number = calculateDistanceKm,
): { ok: boolean; roundCompleted: boolean } {
  if (room.hostId !== requesterId || room.status !== 'playing') {
    return { ok: false, roundCompleted: false };
  }
  for (const p of room.players) {
    if (!p.hasGuessedCurrentRound) {
      p.hasGuessedCurrentRound = true;
      p.currentGuess = null;
      p.currentTimeSpentSec = DUEL_LOCKOUT_SECONDS;
    }
  }
  room.duelCountdownEndsAt = null;
  finalizeCurrentRound(room, distanceFn);
  return { ok: true, roundCompleted: true };
}

export function finalizeCurrentRound(
  room: InternalRoom,
  distanceFn: (a: LatLng, b: LatLng) => number = calculateDistanceKm,
): RoundOutcome | null {
  if (!room.currentLocation) return null;
  const actual = room.currentLocation;
  const mapSizeMeters = getRegionMapSizeMeters(getRegionById(room.regionId));

  const guesses: PlayerGuess[] = room.players.map((p) => {
    const distanceKm = p.currentGuess ? distanceFn(actual, p.currentGuess) : null;
    const score =
      distanceKm !== null ? calculateGeoScore(distanceKm, mapSizeMeters) : 0;
    p.totalScore += score;
    return {
      playerId: p.id,
      playerName: p.name,
      color: p.color,
      guess: p.currentGuess,
      distanceKm,
      score,
      timeSpentSec: p.currentTimeSpentSec,
    };
  });

  let duelDamage: DuelRoundDamage | undefined;
  if (room.onlineFormat === 'duel' && guesses.length >= 2) {
    const currentHp: Record<string, number> = {};
    for (const p of room.players) {
      currentHp[p.id] = p.hp;
    }
    const resolved = resolveDuelRoundDamage(
      guesses,
      currentHp,
      room.currentRoundIndex,
    );
    duelDamage = resolved.duelDamage;
    for (const p of room.players) {
      if (typeof duelDamage.hpAfter[p.id] === 'number') {
        p.hp = duelDamage.hpAfter[p.id];
      }
    }
    if (resolved.knockoutWinnerId) {
      room.duelWinnerId = resolved.knockoutWinnerId;
    }
  }

  const outcome: RoundOutcome = {
    roundIndex: room.currentRoundIndex,
    actual,
    guesses,
    duelDamage,
  };

  room.roundHistory.push(outcome);
  room.status = 'round_result';
  return outcome;
}

export function finishMatch(
  room: InternalRoom,
  requesterId: string,
): { ok: boolean; error?: string } {
  if (room.hostId !== requesterId) {
    return { ok: false, error: 'Только хост может завершить матч.' };
  }
  room.status = 'gameover';
  return { ok: true };
}

export function resetRoomToLobby(
  room: InternalRoom,
  requesterId: string,
): { ok: boolean; error?: string } {
  if (room.hostId !== requesterId) {
    return { ok: false, error: 'Только хост может перезапустить комнату.' };
  }
  room.status = 'lobby';
  room.currentRoundIndex = 0;
  room.currentLocation = null;
  room.roundStartedAt = null;
  room.duelCountdownEndsAt = null;
  room.duelWinnerId = null;
  room.roundHistory = [];
  for (const p of room.players) {
    p.totalScore = 0;
    p.hp = DUEL_STARTING_HP;
    p.hasGuessedCurrentRound = false;
    p.readyForNext = false;
    p.currentGuess = null;
    p.currentTimeSpentSec = 0;
  }
  return { ok: true };
}

export function toPublicRoomState(room: InternalRoom): MultiplayerRoomPublicState {
  let publicLocation: RoundLocation | null = room.currentLocation;

  if (room.status === 'playing' && room.currentLocation) {
    // Anti-cheat: hide hintLabel, countryCode, and (when panoId or direct panorama imageUrl
    // is present) mask lat/lng so guests cannot read the exact answer from WebRTC packets.
    const canHideCoords = Boolean(
      (room.currentLocation.isLiveStreetView && room.currentLocation.panoId) ||
        room.currentLocation.imageUrl,
    );
    publicLocation = {
      ...room.currentLocation,
      lat: canHideCoords ? 0 : room.currentLocation.lat,
      lng: canHideCoords ? 0 : room.currentLocation.lng,
      hintLabel: '',
      countryCode: '',
    };
  }

  return {
    code: room.code,
    hostId: room.hostId,
    onlineFormat: room.onlineFormat,
    status: room.status,
    regionId: room.regionId,
    totalRounds: room.totalRounds,
    timerSeconds: room.timerSeconds,
    movementMode: room.movementMode,
    currentRoundIndex: room.currentRoundIndex,
    roundStartedAt: room.roundStartedAt,
    duelCountdownEndsAt: room.duelCountdownEndsAt,
    duelWinnerId: room.duelWinnerId,
    currentLocation: publicLocation,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      isHost: p.isHost,
      connected: p.connected,
      totalScore: p.totalScore,
      hp: p.hp,
      hasGuessedCurrentRound: p.hasGuessedCurrentRound,
      readyForNext: p.readyForNext,
    })),
    roundHistory: room.roundHistory,
  };
}
