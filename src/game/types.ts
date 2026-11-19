export interface LatLng {
  lat: number;
  lng: number;
}

export type GameMode = 'solo' | 'hotseat' | 'multiplayer';

export type OnlineFormat = 'duel' | 'classic';

export type MedalTier = 'platinum' | 'gold' | 'silver' | 'bronze' | 'none';

export type MovementMode = 'moving' | 'no_move' | 'nmpz';

export type MapLayerType = 'roadmap' | 'satellite';

export type AppScreenState =
  | 'title'
  | 'lobby'
  | 'handoff'
  | 'playing'
  | 'paused'
  | 'round_result'
  | 'gameover'
  | 'stats';

export interface GeoBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  label: string;
  countryCode: string;
}

export interface RegionDefinition {
  id: string;
  name: string;
  subtitle: string;
  category: 'region' | 'country';
  center: LatLng;
  defaultZoom: number;
  bounds: GeoBounds[];
}

export interface GameSettings {
  mode: GameMode;
  hotseatFormat: OnlineFormat;
  onlineFormat: OnlineFormat;
  regionId: string;
  totalRounds: number;
  timerSeconds: number; // 0 = unlimited
  movementMode: MovementMode;
  playerNames: string[];
}

export interface RoundLocation {
  lat: number;
  lng: number;
  panoId?: string;
  heading: number;
  pitch: number;
  hintLabel: string;
  countryCode: string;
  isLiveStreetView: boolean;
}

export interface PlayerGuess {
  playerId: string;
  playerName: string;
  color: string;
  guess: LatLng | null;
  distanceKm: number | null;
  score: number;
  timeSpentSec: number;
}

export interface DuelRoundDamage {
  multiplier: number;
  damage: number;
  winnerPlayerId: string | null;
  loserPlayerId: string | null;
  hpBefore?: Record<string, number>;
  hpAfter: Record<string, number>;
}

export interface RoundOutcome {
  roundIndex: number;
  actual: RoundLocation;
  guesses: PlayerGuess[];
  duelDamage?: DuelRoundDamage;
}

export interface MatchRecord {
  id: string;
  timestamp: number;
  mode: GameMode;
  isDuel?: boolean;
  regionId: string;
  regionName: string;
  totalRounds: number;
  playerName: string;
  totalScore: number;
  maxPossibleScore: number;
  avgDistanceKm: number;
  bestRoundScore: number;
  perfectRounds: number;
  medal?: MedalTier;
  maxDamageDealt?: number;
  movementMode: MovementMode;
  timerSeconds: number;
  won?: boolean;
}

export interface RegionMedalRecord {
  regionId: string;
  regionName: string;
  games: number;
  bestScore: number;
  bestMaxPossible: number;
  avgScore: number;
  bestMedal: MedalTier;
}

export interface PlayerStatsSummary {
  playerName: string;
  gamesPlayed: number;
  bestScore: number;
  avgScore: number;
  avgDistanceKm: number;
  perfectRounds: number;
  totalPoints: number;
  wins: number;
  duelWins: number;
  duelLosses: number;
  regionBreakdown: RegionMedalRecord[];
}

export interface MultiplayerPlayer {
  id: string;
  name: string;
  color: string;
  isHost: boolean;
  connected: boolean;
  totalScore: number;
  hp: number;
  hasGuessedCurrentRound: boolean;
  readyForNext: boolean;
}

export interface MultiplayerRoomPublicState {
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
  players: MultiplayerPlayer[];
  roundHistory: RoundOutcome[];
}
