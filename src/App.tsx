import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { APIProvider, useMapsLibrary } from '@vis.gl/react-google-maps';
import { Loader2 } from 'lucide-react';
import {
  calculateDistanceKm,
  calculateGeoScore,
  getMedalForScore,
  getRegionMapSizeMeters,
  MAX_ROUND_SCORE,
  PLAYER_COLORS,
} from './game/geoMath';
import { getRegionById } from './game/regions';
import {
  DUEL_MAX_ROUNDS,
  DUEL_STARTING_HP,
  getDuelMultiplier,
  resolveDuelRoundDamage,
} from './game/roomState';
import { sanitizeApiToken } from './game/sanitize';
import { soundEngine } from './game/sound';
import {
  clearMatchHistory,
  getRegionBestMap,
  loadMatchHistory,
  saveMatchRecords,
} from './game/statsStorage';
import type {
  AppScreenState,
  GameSettings,
  LatLng,
  MapLayerType,
  MatchRecord,
  MovementMode,
  PanoramaPreference,
  PlayerGuess,
  RoundLocation,
  RoundOutcome,
} from './game/types';
import { useMultiplayerRoom } from './hooks/useMultiplayerRoom';
import { useStreetViewGenerator } from './hooks/useStreetViewGenerator';
import { CompassHud } from './components/CompassHud';
import { GameHud } from './components/GameHud';
import { GameSummaryView } from './components/GameSummaryView';
import { GuessMapOverlay } from './components/GuessMapOverlay';
import { HandoffScreen } from './components/HandoffScreen';
import { MultiplayerLobby } from './components/MultiplayerLobby';
import { PauseModal } from './components/PauseModal';
import { RoundResultView } from './components/RoundResultView';
import { StatsModal } from './components/StatsModal';
import { StreetViewStage, type MapsErrorCode } from './components/StreetViewStage';
import { TitleScreen } from './components/TitleScreen';

const CUSTOM_API_KEY_STORAGE = 'terraspotter_gmaps_api_key';
const MAPILLARY_TOKEN_STORAGE = 'terraspotter_mapillary_token';
const PANORAMA_PREF_STORAGE = 'terraspotter_panorama_pref';

function loadSavedToken(storageKey: string): { key: string; sessionOnly: boolean } {
  try {
    const sessionKey = window.sessionStorage.getItem(storageKey);
    if (sessionKey) return { key: sanitizeApiToken(sessionKey), sessionOnly: true };
    const localKey = window.localStorage.getItem(storageKey);
    if (localKey) return { key: sanitizeApiToken(localKey), sessionOnly: false };
    return { key: '', sessionOnly: false };
  } catch {
    return { key: '', sessionOnly: false };
  }
}

function loadPanoramaPreference(): PanoramaPreference {
  try {
    const raw = window.localStorage.getItem(PANORAMA_PREF_STORAGE);
    if (
      raw === 'auto' ||
      raw === 'google' ||
      raw === 'panoramax' ||
      raw === 'mapillary'
    ) {
      return raw;
    }
  } catch {
    // Ignore storage errors
  }
  return 'auto';
}

function buildMatchRecordsFromOutcomes(params: {
  outcomes: RoundOutcome[];
  mode: GameSettings['mode'];
  isDuel?: boolean;
  duelWinnerId?: string | null;
  regionId: string;
  movementMode: MovementMode;
  timerSeconds: number;
  onlyPlayerId?: string;
}): MatchRecord[] {
  const region = getRegionById(params.regionId);
  const maxPossibleScore = params.outcomes.length * MAX_ROUND_SCORE;
  const now = Date.now();

  const perPlayer = new Map<
    string,
    {
      name: string;
      totalScore: number;
      distances: number[];
      bestRoundScore: number;
      perfectRounds: number;
      maxDamageDealt: number;
    }
  >();

  params.outcomes.forEach((o) => {
    o.guesses.forEach((g) => {
      const entry = perPlayer.get(g.playerId) ?? {
        name: g.playerName,
        totalScore: 0,
        distances: [],
        bestRoundScore: 0,
        perfectRounds: 0,
        maxDamageDealt: 0,
      };
      entry.totalScore += g.score;
      if (g.distanceKm !== null) entry.distances.push(g.distanceKm);
      if (g.score > entry.bestRoundScore) entry.bestRoundScore = g.score;
      if (g.score >= MAX_ROUND_SCORE) entry.perfectRounds += 1;
      if (
        o.duelDamage &&
        o.duelDamage.winnerPlayerId === g.playerId &&
        o.duelDamage.damage > entry.maxDamageDealt
      ) {
        entry.maxDamageDealt = o.duelDamage.damage;
      }
      perPlayer.set(g.playerId, entry);
    });
  });

  const entries = Array.from(perPlayer.entries());
  const maxScoreInMatch = entries.reduce(
    (max, [, e]) => Math.max(max, e.totalScore),
    0,
  );
  const isCompetitive = entries.length > 1;

  const filteredEntries = params.onlyPlayerId
    ? entries.filter(([playerId]) => playerId === params.onlyPlayerId)
    : entries;

  return filteredEntries.map(([playerId, entry]) => {
    const avgDistanceKm =
      entry.distances.length > 0
        ? Math.round(
            (entry.distances.reduce((s, d) => s + d, 0) / entry.distances.length) *
              10,
          ) / 10
        : 0;

    let won: boolean | undefined;
    if (params.isDuel) {
      if (params.duelWinnerId) {
        won = playerId === params.duelWinnerId;
      } else {
        won = entry.totalScore === maxScoreInMatch && maxScoreInMatch > 0;
      }
    } else if (isCompetitive) {
      won = entry.totalScore === maxScoreInMatch && maxScoreInMatch > 0;
    }

    return {
      id: `${now}_${playerId}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: now,
      mode: params.mode,
      isDuel: params.isDuel ? true : undefined,
      regionId: region.id,
      regionName: region.name,
      totalRounds: params.outcomes.length,
      playerName: entry.name,
      totalScore: entry.totalScore,
      maxPossibleScore,
      avgDistanceKm,
      bestRoundScore: entry.bestRoundScore,
      perfectRounds: entry.perfectRounds,
      medal: params.isDuel
        ? 'none'
        : getMedalForScore(entry.totalScore, maxPossibleScore),
      maxDamageDealt: params.isDuel ? entry.maxDamageDealt : undefined,
      movementMode: params.movementMode,
      timerSeconds: params.timerSeconds,
      won,
    };
  });
}

interface TerraSpotterCoreProps {
  hasMapsKey: boolean;
  hasEnvMapsKey: boolean;
  savedCustomApiKey: string;
  apiKeySessionOnly: boolean;
  hasEnvMapillaryToken: boolean;
  savedMapillaryToken: string;
  effectiveMapillaryToken: string;
  panoramaPreference: PanoramaPreference;
  quotaExceeded: boolean;
  mapsError: MapsErrorCode;
  streetViewLib: google.maps.StreetViewLibrary | null;
  onSaveCustomApiKey: (key: string, sessionOnly: boolean) => void;
  onSaveMapillaryToken: (token: string, sessionOnly: boolean) => void;
  onChangePanoramaPreference: (pref: PanoramaPreference) => void;
}

const TerraSpotterCore: React.FC<TerraSpotterCoreProps> = ({
  hasMapsKey,
  hasEnvMapsKey,
  savedCustomApiKey,
  apiKeySessionOnly,
  hasEnvMapillaryToken,
  savedMapillaryToken,
  effectiveMapillaryToken,
  panoramaPreference,
  quotaExceeded,
  mapsError,
  streetViewLib,
  onSaveCustomApiKey,
  onSaveMapillaryToken,
  onChangePanoramaPreference,
}) => {
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const initialJoinCode = urlParams.get('join') || '';
  const shouldAutostart = urlParams.get('autostart') === '1';

  const [settings, setSettings] = useState<GameSettings>(() => ({
    mode: initialJoinCode ? 'multiplayer' : 'solo',
    hotseatFormat: 'duel',
    onlineFormat: 'duel',
    regionId: 'world',
    totalRounds: 5,
    timerSeconds: 0,
    movementMode: 'moving',
    playerNames: ['Исследователь', 'Напарник'],
  }));

  const [screen, setScreen] = useState<AppScreenState>('title');
  const [openKeyPanelSignal, setOpenKeyPanelSignal] = useState(0);
  const [duelCountdownSec, setDuelCountdownSec] = useState<number | null>(null);
  const duelTimeoutSentRef = useRef(false);
  const [returnFromStatsScreen, setReturnFromStatsScreen] =
    useState<AppScreenState>('title');
  const [mapLayer, setMapLayer] = useState<MapLayerType>('roadmap');
  const [muted, setMuted] = useState(false);

  const [matchHistory, setMatchHistory] = useState<MatchRecord[]>(() =>
    loadMatchHistory(),
  );

  const regionMedals = useMemo(
    () => getRegionBestMap(matchHistory),
    [matchHistory],
  );

  // Local Solo / Hotseat game state
  const [locating, setLocating] = useState(false);
  const locatingRef = useRef(false);
  const roundRequestIdRef = useRef(0);
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);
  const [currentLocation, setCurrentLocation] = useState<RoundLocation | null>(
    null,
  );
  // Persisted last valid location so StreetViewPanorama stays mounted ONCE across rounds & matches
  const [persistentLocation, setPersistentLocation] =
    useState<RoundLocation | null>(null);
  const [usedHintLabels, setUsedHintLabels] = useState<string[]>([]);
  const [localOutcomes, setLocalOutcomes] = useState<RoundOutcome[]>([]);
  const [hotseatTurnIndex, setHotseatTurnIndex] = useState<0 | 1>(0);
  const [hotseatPendingGuesses, setHotseatPendingGuesses] = useState<
    PlayerGuess[]
  >([]);
  const [hotseatDuelHp, setHotseatDuelHp] = useState<Record<string, number>>({
    local_p1: DUEL_STARTING_HP,
    local_p2: DUEL_STARTING_HP,
  });
  const [hotseatDuelWinnerId, setHotseatDuelWinnerId] = useState<string | null>(
    null,
  );

  // Active playing state
  const [selectedGuess, setSelectedGuess] = useState<LatLng | null>(null);
  const [compassHeading, setCompassHeading] = useState(0);
  const [resetSignal, setResetSignal] = useState(0);
  const [timeLeftSec, setTimeLeftSec] = useState<number | null>(null);
  const roundStartTimestampRef = useRef<number>(Date.now());
  const pausedAtRef = useRef<number | null>(null);
  const timeoutFiredRef = useRef(false);
  const autostartDoneRef = useRef(false);
  const savedMultiplayerMatchRef = useRef<string | null>(null);

  // Hybrid Panorama Locator (Google Street View -> Mapillary 360 -> keyless Panoramax 360)
  const { generateLocation } = useStreetViewGenerator(streetViewLib, {
    preference: panoramaPreference,
    mapillaryToken: effectiveMapillaryToken,
    mapsBlocked: quotaExceeded || Boolean(mapsError),
  });
  const mp = useMultiplayerRoom(calculateDistanceKm);

  const isOnlineSession = Boolean(mp.room);

  const effectiveScreen: AppScreenState = useMemo(() => {
    if (screen === 'stats') return 'stats';
    if (screen === 'paused') return 'paused';
    if (!mp.room) return screen;

    if (mp.room.status === 'lobby' || mp.room.status === 'locating') {
      return 'lobby';
    }
    if (mp.room.status === 'playing') return 'playing';
    if (mp.room.status === 'round_result') return 'round_result';
    return 'gameover';
  }, [mp.room, screen]);

  useEffect(() => {
    document.body.dataset.state = effectiveScreen;
  }, [effectiveScreen]);

  // Adjust roundStartTimestampRef when entering/leaving pause so pause duration is not counted
  useEffect(() => {
    if (effectiveScreen === 'paused') {
      if (pausedAtRef.current === null) {
        pausedAtRef.current = Date.now();
      }
    } else if (pausedAtRef.current !== null) {
      const pauseDelta = Date.now() - pausedAtRef.current;
      roundStartTimestampRef.current += pauseDelta;
      pausedAtRef.current = null;
    }
  }, [effectiveScreen]);

  // Host generates & broadcasts verified Street View location when P2P room enters 'locating'
  const locatingRoundKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!mp.room || mp.room.status !== 'locating' || !mp.isHost) {
      locatingRoundKeyRef.current = null;
      return;
    }

    const roundKey = `${mp.room.code}_${mp.room.currentRoundIndex}`;
    if (locatingRoundKeyRef.current === roundKey) return;
    locatingRoundKeyRef.current = roundKey;

    const alreadyUsed = mp.room.roundHistory
      .map((r) => r.actual.hintLabel)
      .filter(Boolean);

    void generateLocation(mp.room.regionId, alreadyUsed, quotaExceeded).then(
      (loc) => {
        if (locatingRoundKeyRef.current !== roundKey) return;
        mp.publishLocation(loc);
      },
    );
  }, [generateLocation, mp, quotaExceeded]);

  // Reset local selection & timer whenever P2P round begins playing
  useEffect(() => {
    if (mp.room?.status === 'playing' && mp.room.currentLocation) {
      setSelectedGuess(null);
      setCompassHeading(mp.room.currentLocation.heading);
      setResetSignal((s) => s + 1);
      roundStartTimestampRef.current = mp.room.roundStartedAt || Date.now();
      pausedAtRef.current = null;
      timeoutFiredRef.current = false;
      duelTimeoutSentRef.current = false;
      setDuelCountdownSec(null);
      setTimeLeftSec(mp.room.timerSeconds > 0 ? mp.room.timerSeconds : null);
    }
  }, [mp.room?.status, mp.room?.currentRoundIndex, mp.room?.roundStartedAt]);

  // Play reveal sound & save multiplayer stats strictly filtered by clientId (not playerName)
  useEffect(() => {
    if (!mp.room) return;
    if (mp.room.status === 'round_result') {
      const last = mp.room.roundHistory[mp.room.roundHistory.length - 1];
      const myGuess = last?.guesses.find((g) => g.playerId === mp.clientId);
      if (myGuess) soundEngine.playReveal(myGuess.score);
    } else if (mp.room.status === 'gameover') {
      const matchKey = `${mp.room.code}_${mp.room.roundHistory.length}`;
      if (
        savedMultiplayerMatchRef.current !== matchKey &&
        mp.room.roundHistory.length > 0
      ) {
        savedMultiplayerMatchRef.current = matchKey;
        soundEngine.playVictory();
        const myRecs = buildMatchRecordsFromOutcomes({
          outcomes: mp.room.roundHistory,
          mode: 'multiplayer',
          isDuel: mp.room.onlineFormat === 'duel',
          duelWinnerId: mp.room.duelWinnerId,
          regionId: mp.room.regionId,
          movementMode: mp.room.movementMode,
          timerSeconds: mp.room.timerSeconds,
          onlyPlayerId: mp.clientId,
        });
        if (myRecs.length > 0) {
          setMatchHistory(saveMatchRecords(myRecs));
        }
      }
    }
  }, [
    mp.room?.status,
    mp.room?.roundHistory.length,
    mp.clientId,
    mp.room,
  ]);

  const loadLocalRound = useCallback(
    async (
      roundIdx: number,
      regionId: string,
      mode: GameSettings['mode'],
      timerSeconds: number,
      usedLabels: string[],
    ) => {
      // Prevent duplicate concurrent round generation (e.g. rapid double-click / double Space)
      if (locatingRef.current) return;
      locatingRef.current = true;
      const reqId = ++roundRequestIdRef.current;

      setLocating(true);
      setSelectedGuess(null);
      setHotseatTurnIndex(0);
      setHotseatPendingGuesses([]);
      try {
        const loc = await generateLocation(regionId, usedLabels, quotaExceeded);
        // Ignore stale response if user exited to title or started another match mid-flight
        if (roundRequestIdRef.current !== reqId) return;

        setCurrentRoundIndex(roundIdx);
        setCurrentLocation(loc);
        setCompassHeading(loc.heading);
        setResetSignal((s) => s + 1);
        if (loc.hintLabel) {
          setUsedHintLabels((prev) => [...prev, loc.hintLabel]);
        }
        roundStartTimestampRef.current = Date.now();
        pausedAtRef.current = null;
        timeoutFiredRef.current = false;
        setTimeLeftSec(timerSeconds > 0 ? timerSeconds : null);
        setScreen(mode === 'hotseat' ? 'handoff' : 'playing');
      } finally {
        if (roundRequestIdRef.current === reqId) {
          locatingRef.current = false;
          setLocating(false);
        }
      }
    },
    [generateLocation, quotaExceeded],
  );

  const handleStartLocalGame = useCallback(() => {
    if (locatingRef.current) return;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setLocalOutcomes([]);
    setUsedHintLabels([]);
    setHotseatDuelHp({
      local_p1: DUEL_STARTING_HP,
      local_p2: DUEL_STARTING_HP,
    });
    setHotseatDuelWinnerId(null);
    void loadLocalRound(
      0,
      settings.regionId,
      settings.mode,
      settings.timerSeconds,
      [],
    );
  }, [loadLocalRound, settings.mode, settings.regionId, settings.timerSeconds]);

  useEffect(() => {
    if (shouldAutostart && !autostartDoneRef.current && !initialJoinCode) {
      autostartDoneRef.current = true;
      handleStartLocalGame();
    }
  }, [shouldAutostart, initialJoinCode, handleStartLocalGame]);

  const handleConfirmGuess = useCallback(
    (forcedNullTimeout = false) => {
      const guessCoords = forcedNullTimeout ? null : selectedGuess;
      const elapsedSec = Math.max(
        1,
        Math.round((Date.now() - roundStartTimestampRef.current) / 1000),
      );

      if (isOnlineSession && mp.room) {
        if (mp.currentPlayer?.hasGuessedCurrentRound) return;
        soundEngine.playGuessConfirm();
        mp.submitGuess(guessCoords, elapsedSec);
        return;
      }

      if (!currentLocation) return;
      const mapSizeMeters = getRegionMapSizeMeters(
        getRegionById(settings.regionId),
      );
      const distanceKm = guessCoords
        ? calculateDistanceKm(currentLocation, guessCoords)
        : null;
      const score =
        distanceKm !== null
          ? calculateGeoScore(distanceKm, mapSizeMeters)
          : 0;

      soundEngine.playGuessConfirm();

      if (settings.mode === 'solo') {
        const playerName = settings.playerNames[0]?.trim() || 'Исследователь';
        const outcome: RoundOutcome = {
          roundIndex: currentRoundIndex,
          actual: currentLocation,
          guesses: [
            {
              playerId: 'local_p1',
              playerName,
              color: PLAYER_COLORS[0],
              guess: guessCoords,
              distanceKm,
              score,
              timeSpentSec: elapsedSec,
            },
          ],
        };
        setLocalOutcomes((prev) => [...prev, outcome]);
        soundEngine.playReveal(score);
        setScreen('round_result');
        return;
      }

      // Two-Player Pass-and-Play (Hotseat Classic OR Hotseat Duel 1v1)
      const pIdx = hotseatTurnIndex;
      const playerName =
        settings.playerNames[pIdx]?.trim() || `Игрок ${pIdx + 1}`;
      const guessRecord: PlayerGuess = {
        playerId: `local_p${pIdx + 1}`,
        playerName,
        color: PLAYER_COLORS[pIdx],
        guess: guessCoords,
        distanceKm,
        score,
        timeSpentSec: elapsedSec,
      };

      if (pIdx === 0) {
        setHotseatPendingGuesses([guessRecord]);
        setSelectedGuess(null);
        setHotseatTurnIndex(1);
        timeoutFiredRef.current = false;
        setTimeLeftSec(settings.timerSeconds > 0 ? settings.timerSeconds : null);
        setScreen('handoff');
      } else {
        const allGuesses = [...hotseatPendingGuesses, guessRecord];
        let duelDamage: RoundOutcome['duelDamage'];
        if (settings.hotseatFormat === 'duel') {
          const resolved = resolveDuelRoundDamage(
            allGuesses,
            hotseatDuelHp,
            currentRoundIndex,
          );
          duelDamage = resolved.duelDamage;
          setHotseatDuelHp(resolved.duelDamage.hpAfter);
          if (resolved.knockoutWinnerId) {
            setHotseatDuelWinnerId(resolved.knockoutWinnerId);
          }
        }
        const outcome: RoundOutcome = {
          roundIndex: currentRoundIndex,
          actual: currentLocation,
          guesses: allGuesses,
          duelDamage,
        };
        setLocalOutcomes((prev) => [...prev, outcome]);
        setHotseatPendingGuesses([]);
        const topRoundScore = Math.max(...allGuesses.map((g) => g.score));
        soundEngine.playReveal(topRoundScore);
        setScreen('round_result');
      }
    },
    [
      currentLocation,
      currentRoundIndex,
      hotseatDuelHp,
      hotseatPendingGuesses,
      hotseatTurnIndex,
      isOnlineSession,
      mp,
      selectedGuess,
      settings,
    ],
  );

  // Pure countdown tick (zero side-effects inside state updater)
  const hasActiveTimer = timeLeftSec !== null && timeLeftSec > 0;
  useEffect(() => {
    if (effectiveScreen !== 'playing' || !hasActiveTimer) return;
    if (isOnlineSession && mp.currentPlayer?.hasGuessedCurrentRound) return;

    const timer = window.setInterval(() => {
      setTimeLeftSec((prev) => {
        if (prev === null || prev <= 0) return prev;
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [
    effectiveScreen,
    hasActiveTimer,
    isOnlineSession,
    mp.currentPlayer?.hasGuessedCurrentRound,
  ]);

  // Dedicated side-effect hook for countdown audio ticks and single timeout submission
  useEffect(() => {
    if (effectiveScreen !== 'playing' || timeLeftSec === null) return;
    if (isOnlineSession && mp.currentPlayer?.hasGuessedCurrentRound) return;

    if (timeLeftSec > 0 && timeLeftSec <= 5) {
      soundEngine.playTick();
    } else if (timeLeftSec === 0 && !timeoutFiredRef.current) {
      timeoutFiredRef.current = true;
      handleConfirmGuess(true);
    }
  }, [
    effectiveScreen,
    handleConfirmGuess,
    isOnlineSession,
    mp.currentPlayer?.hasGuessedCurrentRound,
    timeLeftSec,
  ]);

  // Authentic GeoGuessr Duel 15-second pressure countdown after the first player guesses
  const duelCountdownEndsAt = mp.room?.duelCountdownEndsAt ?? null;
  useEffect(() => {
    if (
      !isOnlineSession ||
      mp.room?.onlineFormat !== 'duel' ||
      effectiveScreen !== 'playing' ||
      duelCountdownEndsAt === null
    ) {
      setDuelCountdownSec(null);
      duelTimeoutSentRef.current = false;
      return;
    }

    const tick = () => {
      const remainingMs = duelCountdownEndsAt - Date.now();
      const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
      setDuelCountdownSec(remainingSec);

      if (remainingSec > 0 && remainingSec <= 5) {
        soundEngine.playTick();
      }

      if (remainingMs <= 0) {
        if (!mp.currentPlayer?.hasGuessedCurrentRound && !duelTimeoutSentRef.current) {
          duelTimeoutSentRef.current = true;
          handleConfirmGuess(true);
        }
        // Host safety net: finalize round even if opponent dropped connection
        if (mp.isHost && remainingMs <= -1200) {
          mp.expireDuelCountdown();
        }
      }
    };

    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [
    duelCountdownEndsAt,
    effectiveScreen,
    handleConfirmGuess,
    isOnlineSession,
    mp,
    mp.currentPlayer?.hasGuessedCurrentRound,
    mp.isHost,
    mp.room?.onlineFormat,
  ]);

  const handleNextRound = useCallback(() => {
    if (locatingRef.current) return;
    if (isOnlineSession && mp.room) {
      const duelDone =
        mp.room.onlineFormat === 'duel' &&
        (mp.room.duelWinnerId !== null || mp.room.players.some((p) => p.hp <= 0));
      if (
        duelDone ||
        (mp.room.onlineFormat === 'classic' &&
          mp.room.currentRoundIndex + 1 >= mp.room.totalRounds)
      ) {
        mp.finishMatch();
      } else {
        mp.startRound();
      }
      return;
    }

    const nextIdx = currentRoundIndex + 1;
    const isHotseatDuel =
      settings.mode === 'hotseat' && settings.hotseatFormat === 'duel';
    const hotseatDuelEnded =
      isHotseatDuel &&
      (hotseatDuelWinnerId !== null ||
        Object.values(hotseatDuelHp).some((hp) => hp <= 0) ||
        nextIdx >= DUEL_MAX_ROUNDS);

    if (hotseatDuelEnded || (!isHotseatDuel && nextIdx >= settings.totalRounds)) {
      const resolvedWinnerId = isHotseatDuel
        ? hotseatDuelWinnerId ??
          ((hotseatDuelHp.local_p1 ?? 0) >= (hotseatDuelHp.local_p2 ?? 0)
            ? 'local_p1'
            : 'local_p2')
        : null;
      const recs = buildMatchRecordsFromOutcomes({
        outcomes: localOutcomes,
        mode: settings.mode,
        isDuel: isHotseatDuel,
        duelWinnerId: resolvedWinnerId,
        regionId: settings.regionId,
        movementMode: settings.movementMode,
        timerSeconds: settings.timerSeconds,
      });
      setMatchHistory(saveMatchRecords(recs));
      soundEngine.playVictory();
      setScreen('gameover');
      return;
    }

    void loadLocalRound(
      nextIdx,
      settings.regionId,
      settings.mode,
      settings.timerSeconds,
      usedHintLabels,
    );
  }, [
    currentRoundIndex,
    hotseatDuelHp,
    hotseatDuelWinnerId,
    isOnlineSession,
    loadLocalRound,
    localOutcomes,
    mp,
    settings,
    usedHintLabels,
  ]);

  const handleExitToTitle = useCallback(() => {
    // Cancel any in-flight local location lookup so it cannot pull user back into a round
    roundRequestIdRef.current += 1;
    locatingRef.current = false;
    setLocating(false);
    if (mp.room) {
      mp.leaveRoom();
    }
    setCurrentLocation(null);
    setSelectedGuess(null);
    setLocalOutcomes([]);
    setScreen('title');
  }, [mp]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName || '';
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (inInput) return;

      if (e.key === 'Escape') {
        if (effectiveScreen === 'playing') {
          setScreen('paused');
        } else if (effectiveScreen === 'paused') {
          setScreen('playing');
        } else if (effectiveScreen === 'stats') {
          setScreen(returnFromStatsScreen);
        }
        return;
      }

      if (e.key === 'm' || e.key === 'M' || e.key === 'ь' || e.key === 'Ь') {
        if (effectiveScreen === 'playing') {
          setMuted(soundEngine.toggleMute());
        }
        return;
      }

      if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') {
        if (effectiveScreen === 'playing') {
          setResetSignal((s) => s + 1);
        }
        return;
      }

      // Avoid hijacking Enter/Space when focus is already on a button or link
      const onInteractiveControl = tag === 'BUTTON' || tag === 'A';
      if ((e.key === ' ' || e.key === 'Enter') && !onInteractiveControl) {
        if (effectiveScreen === 'title' && settings.mode !== 'multiplayer') {
          e.preventDefault();
          handleStartLocalGame();
        } else if (effectiveScreen === 'playing' && selectedGuess) {
          e.preventDefault();
          handleConfirmGuess(false);
        } else if (effectiveScreen === 'round_result') {
          if (!isOnlineSession || mp.isHost) {
            e.preventDefault();
            handleNextRound();
          }
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    effectiveScreen,
    handleConfirmGuess,
    handleNextRound,
    handleStartLocalGame,
    isOnlineSession,
    mp.isHost,
    returnFromStatsScreen,
    selectedGuess,
    settings.mode,
  ]);

  const activeRegion = getRegionById(
    isOnlineSession && mp.room ? mp.room.regionId : settings.regionId,
  );
  const activeOutcomes =
    isOnlineSession && mp.room ? mp.room.roundHistory : localOutcomes;
  const activeLocation =
    isOnlineSession && mp.room ? mp.room.currentLocation : currentLocation;
  const activeRoundIndex =
    isOnlineSession && mp.room ? mp.room.currentRoundIndex : currentRoundIndex;
  const activeTotalRounds =
    isOnlineSession && mp.room ? mp.room.totalRounds : settings.totalRounds;
  const activeMovementMode: MovementMode =
    isOnlineSession && mp.room ? mp.room.movementMode : settings.movementMode;

  // Keep persistentLocation updated so StreetViewPanorama is created ONCE and reused across rounds
  useEffect(() => {
    if (activeLocation) {
      setPersistentLocation(activeLocation);
    }
  }, [activeLocation]);

  const cumulativeScores: Record<string, number> = useMemo(() => {
    const totals: Record<string, number> = {};
    if (isOnlineSession && mp.room) {
      mp.room.players.forEach((p) => {
        totals[p.id] = p.totalScore;
      });
      return totals;
    }
    localOutcomes.forEach((o) => {
      o.guesses.forEach((g) => {
        totals[g.playerId] = (totals[g.playerId] ?? 0) + g.score;
      });
    });
    return totals;
  }, [isOnlineSession, localOutcomes, mp.room]);

  const activePlayerName = useMemo(() => {
    if (isOnlineSession && mp.currentPlayer) return mp.currentPlayer.name;
    if (settings.mode === 'hotseat') {
      return (
        settings.playerNames[hotseatTurnIndex]?.trim() ||
        `Игрок ${hotseatTurnIndex + 1}`
      );
    }
    return settings.playerNames[0]?.trim() || 'Исследователь';
  }, [
    hotseatTurnIndex,
    isOnlineSession,
    mp.currentPlayer,
    settings.mode,
    settings.playerNames,
  ]);

  const activePlayerColor = useMemo(() => {
    if (isOnlineSession && mp.currentPlayer) return mp.currentPlayer.color;
    if (settings.mode === 'hotseat') return PLAYER_COLORS[hotseatTurnIndex];
    return PLAYER_COLORS[0];
  }, [hotseatTurnIndex, isOnlineSession, mp.currentPlayer, settings.mode]);

  const activePlayerScore = useMemo(() => {
    if (isOnlineSession && mp.currentPlayer) return mp.currentPlayer.totalScore;
    const pid =
      settings.mode === 'hotseat'
        ? `local_p${hotseatTurnIndex + 1}`
        : 'local_p1';
    return cumulativeScores[pid] ?? 0;
  }, [
    cumulativeScores,
    hotseatTurnIndex,
    isOnlineSession,
    mp.currentPlayer,
    settings.mode,
  ]);

  const isHotseatDuelActive =
    !isOnlineSession &&
    settings.mode === 'hotseat' &&
    settings.hotseatFormat === 'duel';
  const isOnlineDuelActive = Boolean(
    isOnlineSession && mp.room?.onlineFormat === 'duel',
  );
  const isDuelActive = isOnlineDuelActive || isHotseatDuelActive;

  const hotseatDuelPlayers = [
    {
      id: 'local_p1',
      name: settings.playerNames[0]?.trim() || 'Игрок 1',
      color: PLAYER_COLORS[0],
      hp: hotseatDuelHp.local_p1 ?? DUEL_STARTING_HP,
    },
    {
      id: 'local_p2',
      name: settings.playerNames[1]?.trim() || 'Игрок 2',
      color: PLAYER_COLORS[1],
      hp: hotseatDuelHp.local_p2 ?? DUEL_STARTING_HP,
    },
  ];

  const activeDuelPlayers = isOnlineDuelActive
    ? mp.room?.players
    : isHotseatDuelActive
      ? hotseatDuelPlayers
      : undefined;

  const hotseatScoresBanner = [
    {
      name: settings.playerNames[0]?.trim() || 'Игрок 1',
      color: PLAYER_COLORS[0],
      score: cumulativeScores['local_p1'] ?? 0,
      hp: isHotseatDuelActive
        ? (hotseatDuelHp.local_p1 ?? DUEL_STARTING_HP)
        : undefined,
    },
    {
      name: settings.playerNames[1]?.trim() || 'Игрок 2',
      color: PLAYER_COLORS[1],
      score: cumulativeScores['local_p2'] ?? 0,
      hp: isHotseatDuelActive
        ? (hotseatDuelHp.local_p2 ?? DUEL_STARTING_HP)
        : undefined,
    },
  ];

  const isGameplayVisible =
    !locating &&
    (effectiveScreen === 'playing' || effectiveScreen === 'paused') &&
    Boolean(activeLocation);

  const waitingPlayersCount =
    isOnlineSession && mp.room
      ? mp.room.players.filter((p) => p.connected && !p.hasGuessedCurrentRound)
          .length
      : 0;
  const alreadySubmittedOnline = Boolean(
    isOnlineSession && mp.currentPlayer?.hasGuessedCurrentRound,
  );

  // Determine active non-gameplay overlay screen
  let overlayScreen: React.ReactNode = null;

  if (locating) {
    overlayScreen = (
      <div className="flex min-h-[100dvh] w-full flex-col items-center justify-center bg-[#0B1220] p-6 text-center text-slate-100">
        <Loader2 className="h-9 w-9 animate-spin text-amber-400" aria-hidden="true" />
        <h2 className="mt-4 font-display text-xl font-bold text-white">
          {activeRegion.name}
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Ищем панораму Street View...
        </p>
      </div>
    );
  } else if (effectiveScreen === 'stats') {
    overlayScreen = (
      <StatsModal
        records={matchHistory}
        onClose={() => setScreen(returnFromStatsScreen)}
        onClearHistory={() => {
          clearMatchHistory();
          setMatchHistory([]);
        }}
      />
    );
  } else if (effectiveScreen === 'lobby' && mp.room) {
    overlayScreen = (
      <MultiplayerLobby
        room={mp.room}
        connected={mp.connected}
        isHost={mp.isHost}
        locating={mp.room.status === 'locating'}
        onStartMatch={() => {
          savedMultiplayerMatchRef.current = null;
          mp.startRound();
        }}
        onLeaveRoom={handleExitToTitle}
      />
    );
  } else if (effectiveScreen === 'handoff') {
    overlayScreen = (
      <HandoffScreen
        playerName={activePlayerName}
        playerColor={activePlayerColor}
        roundNumber={currentRoundIndex + 1}
        totalRounds={settings.totalRounds}
        regionName={activeRegion.name}
        isSecondPlayer={hotseatTurnIndex === 1}
        isDuel={isHotseatDuelActive}
        duelMultiplier={
          isHotseatDuelActive ? getDuelMultiplier(currentRoundIndex) : 1
        }
        scores={hotseatScoresBanner}
        onReady={() => {
          roundStartTimestampRef.current = Date.now();
          pausedAtRef.current = null;
          timeoutFiredRef.current = false;
          setResetSignal((s) => s + 1);
          setScreen('playing');
        }}
      />
    );
  } else if (effectiveScreen === 'round_result' && activeOutcomes.length > 0) {
    const latest = activeOutcomes[activeOutcomes.length - 1];
    const isDuelFinished = Boolean(
      (isOnlineDuelActive &&
        (mp.room?.duelWinnerId !== null ||
          mp.room?.players.some((p) => p.hp <= 0))) ||
        (isHotseatDuelActive &&
          (hotseatDuelWinnerId !== null ||
            Object.values(hotseatDuelHp).some((hp) => hp <= 0) ||
            currentRoundIndex + 1 >= DUEL_MAX_ROUNDS)),
    );
    overlayScreen = (
      <RoundResultView
        outcome={latest}
        totalRounds={activeTotalRounds}
        regionName={activeRegion.name}
        cumulativeScores={cumulativeScores}
        isDuel={isDuelActive}
        duelFinished={isDuelFinished}
        mapLayer={mapLayer}
        canAdvance={!isOnlineSession || mp.isHost}
        onChangeMapLayer={setMapLayer}
        onNextRound={handleNextRound}
      />
    );
  } else if (effectiveScreen === 'gameover' && activeOutcomes.length > 0) {
    overlayScreen = (
      <GameSummaryView
        mode={isOnlineSession ? 'multiplayer' : settings.mode}
        regionName={activeRegion.name}
        outcomes={activeOutcomes}
        isDuel={isDuelActive}
        duelPlayers={activeDuelPlayers}
        mapLayer={mapLayer}
        canRestart={!isOnlineSession || mp.isHost}
        onChangeMapLayer={setMapLayer}
        onPlayAgain={() => {
          if (isOnlineSession) {
            savedMultiplayerMatchRef.current = null;
            mp.resetRoom();
          } else {
            handleStartLocalGame();
          }
        }}
        onReturnToTitle={handleExitToTitle}
        onOpenStats={() => {
          setReturnFromStatsScreen('gameover');
          setScreen('stats');
        }}
      />
    );
  } else if (!isGameplayVisible) {
    overlayScreen = (
      <TitleScreen
        settings={settings}
        totalGamesPlayed={matchHistory.length}
        regionMedals={regionMedals}
        joinCodeInitial={initialJoinCode}
        multiplayerError={mp.error}
        hasEnvMapsKey={hasEnvMapsKey}
        savedCustomApiKey={savedCustomApiKey}
        apiKeySessionOnly={apiKeySessionOnly}
        hasEnvMapillaryToken={hasEnvMapillaryToken}
        savedMapillaryToken={savedMapillaryToken}
        panoramaPreference={panoramaPreference}
        openKeyPanelSignal={openKeyPanelSignal}
        onSaveCustomApiKey={onSaveCustomApiKey}
        onSaveMapillaryToken={onSaveMapillaryToken}
        onChangePanoramaPreference={onChangePanoramaPreference}
        onUpdateSettings={(patch) => {
          mp.clearError();
          setSettings((prev) => ({ ...prev, ...patch }));
        }}
        onStartLocalGame={handleStartLocalGame}
        onCreateOnlineRoom={(hostName) => {
          savedMultiplayerMatchRef.current = null;
          mp.createRoom({
            playerName: hostName,
            onlineFormat: settings.onlineFormat,
            regionId: settings.regionId,
            totalRounds: settings.totalRounds,
            timerSeconds: settings.timerSeconds,
            movementMode: settings.movementMode,
          });
        }}
        onJoinOnlineRoom={(code, playerName) => {
          savedMultiplayerMatchRef.current = null;
          mp.joinRoomByCode(code, playerName);
        }}
        onOpenStats={() => {
          setReturnFromStatsScreen('title');
          setScreen('stats');
        }}
      />
    );
  }

  const stageLocation = activeLocation ?? persistentLocation;

  return (
    <div className="relative h-full w-full bg-[#0B1220]">
      {/* Persistent Single-Instance StreetViewPanorama + Leaflet GuessMap (initialized ONCE, never recreated between rounds) */}
      {stageLocation && (
        <div
          aria-hidden={!isGameplayVisible}
          className={`absolute inset-0 overflow-hidden bg-[#0B1220] ${
            isGameplayVisible
              ? 'visible pointer-events-auto z-10'
              : 'invisible pointer-events-none z-0'
          }`}
        >
          <StreetViewStage
            visible={isGameplayVisible}
            location={stageLocation}
            movementMode={activeMovementMode}
            resetSignal={resetSignal}
            quotaExceeded={quotaExceeded}
            mapsError={mapsError}
            hasMapsKey={hasMapsKey}
            streetViewLib={streetViewLib}
            onHeadingChange={setCompassHeading}
            onOpenApiKeySetup={() => {
              handleExitToTitle();
              setOpenKeyPanelSignal((n) => n + 1);
            }}
          />

          {isGameplayVisible && (
            <>
              <CompassHud heading={compassHeading} offsetForDuel={isDuelActive} />

              <GameHud
                regionName={activeRegion.name}
                roundNumber={activeRoundIndex + 1}
                totalRounds={activeTotalRounds}
                score={activePlayerScore}
                timeLeftSec={timeLeftSec}
                activePlayerName={
                  settings.mode === 'hotseat' || isOnlineSession
                    ? activePlayerName
                    : undefined
                }
                activePlayerColor={activePlayerColor}
                showActiveTurnBadge={isHotseatDuelActive}
                roomCode={mp.room?.code}
                duelPlayers={activeDuelPlayers}
                duelMultiplier={
                  isDuelActive ? getDuelMultiplier(activeRoundIndex) : undefined
                }
                duelCountdownSec={isOnlineDuelActive ? duelCountdownSec : null}
                movementMode={activeMovementMode}
                muted={muted}
                onReturnToStart={() => setResetSignal((s) => s + 1)}
                onToggleMute={() => setMuted(soundEngine.toggleMute())}
                onPause={() => setScreen('paused')}
              />
            </>
          )}

          <GuessMapOverlay
            active={isGameplayVisible}
            region={activeRegion}
            roundKey={`${activeRoundIndex}_${hotseatTurnIndex}_${stageLocation.panoId || `${stageLocation.lat.toFixed(4)}_${stageLocation.lng.toFixed(4)}`}`}
            selectedGuess={selectedGuess}
            playerColor={activePlayerColor}
            playerName={activePlayerName}
            mapLayer={mapLayer}
            disabled={alreadySubmittedOnline}
            waitingLabel={
              alreadySubmittedOnline
                ? `Ждём остальных (${waitingPlayersCount})`
                : undefined
            }
            onSelectGuess={(coords) => {
              soundEngine.playPinDrop();
              setSelectedGuess(coords);
            }}
            onConfirmGuess={() => handleConfirmGuess(false)}
            onChangeMapLayer={setMapLayer}
          />

          {isGameplayVisible && effectiveScreen === 'paused' && (
            <PauseModal
              regionName={activeRegion.name}
              roundNumber={activeRoundIndex + 1}
              totalRounds={activeTotalRounds}
              score={activePlayerScore}
              isDuel={isDuelActive}
              canRestart={!isOnlineSession}
              onResume={() => setScreen('playing')}
              onRestart={() => handleStartLocalGame()}
              onExitToTitle={handleExitToTitle}
            />
          )}
        </div>
      )}

      {/* Active Menu / Lobby / Handoff / Reveal / Summary / Stats Screen */}
      {overlayScreen && (
        <div className="relative z-20 h-full w-full overflow-y-auto bg-[#0B1220]">
          {overlayScreen}
        </div>
      )}
    </div>
  );
};

const LiveStreetViewTerraSpotter: React.FC<{
  hasEnvMapsKey: boolean;
  savedCustomApiKey: string;
  apiKeySessionOnly: boolean;
  hasEnvMapillaryToken: boolean;
  savedMapillaryToken: string;
  effectiveMapillaryToken: string;
  panoramaPreference: PanoramaPreference;
  quotaExceeded: boolean;
  mapsError: MapsErrorCode;
  onSaveCustomApiKey: (key: string, sessionOnly: boolean) => void;
  onSaveMapillaryToken: (token: string, sessionOnly: boolean) => void;
  onChangePanoramaPreference: (pref: PanoramaPreference) => void;
}> = ({
  hasEnvMapsKey,
  savedCustomApiKey,
  apiKeySessionOnly,
  hasEnvMapillaryToken,
  savedMapillaryToken,
  effectiveMapillaryToken,
  panoramaPreference,
  quotaExceeded,
  mapsError,
  onSaveCustomApiKey,
  onSaveMapillaryToken,
  onChangePanoramaPreference,
}) => {
  // Load ONLY the streetView library — zero google.maps.Map, zero geometry, zero marker
  const streetViewLib = useMapsLibrary('streetView');
  return (
    <TerraSpotterCore
      hasMapsKey={true}
      hasEnvMapsKey={hasEnvMapsKey}
      savedCustomApiKey={savedCustomApiKey}
      apiKeySessionOnly={apiKeySessionOnly}
      hasEnvMapillaryToken={hasEnvMapillaryToken}
      savedMapillaryToken={savedMapillaryToken}
      effectiveMapillaryToken={effectiveMapillaryToken}
      panoramaPreference={panoramaPreference}
      quotaExceeded={quotaExceeded}
      mapsError={mapsError}
      streetViewLib={streetViewLib}
      onSaveCustomApiKey={onSaveCustomApiKey}
      onSaveMapillaryToken={onSaveMapillaryToken}
      onChangePanoramaPreference={onChangePanoramaPreference}
    />
  );
};

export default function App() {
  const envKey = sanitizeApiToken(
    (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) || '',
  );
  const envMapillaryToken = sanitizeApiToken(
    (import.meta.env.VITE_MAPILLARY_TOKEN as string | undefined) || '',
  );

  const [savedKeyState, setSavedKeyState] = useState<{
    key: string;
    sessionOnly: boolean;
  }>(() => loadSavedToken(CUSTOM_API_KEY_STORAGE));
  const [savedMapillaryState, setSavedMapillaryState] = useState<{
    key: string;
    sessionOnly: boolean;
  }>(() => loadSavedToken(MAPILLARY_TOKEN_STORAGE));
  const [panoramaPreference, setPanoramaPreference] =
    useState<PanoramaPreference>(() => loadPanoramaPreference());
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [mapsError, setMapsError] = useState<MapsErrorCode>(null);

  const effectiveApiKey = savedKeyState.key.trim() || envKey;
  const effectiveMapillaryToken =
    savedMapillaryState.key.trim() || envMapillaryToken;

  const shouldMountGoogleProvider =
    Boolean(effectiveApiKey) &&
    panoramaPreference !== 'panoramax' &&
    panoramaPreference !== 'mapillary';

  useEffect(() => {
    const onQuotaExceeded = () => {
      setQuotaExceeded(true);
    };
    const onMapsError = (e: Event) => {
      const code = (e as CustomEvent<MapsErrorCode>).detail ?? 'auth_failure';
      setMapsError((prev) => {
        if (prev && prev !== 'auth_failure' && code === 'auth_failure') return prev;
        return code;
      });
    };
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    window.addEventListener('gmp-maps-error', onMapsError);
    return () => {
      window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
      window.removeEventListener('gmp-maps-error', onMapsError);
    };
  }, []);

  const handleSaveCustomApiKey = useCallback(
    (rawNextKey: string, sessionOnly: boolean) => {
      const nextKey = sanitizeApiToken(rawNextKey);
      const hadGoogleLoaded =
        typeof window !== 'undefined' &&
        Boolean(
          (window as unknown as { google?: { maps?: unknown } }).google?.maps ||
            document.querySelector('script[src*="maps.googleapis.com"]'),
        );

      setSavedKeyState({ key: nextKey, sessionOnly });
      setQuotaExceeded(false);
      setMapsError(null);
      try {
        window.sessionStorage.removeItem(CUSTOM_API_KEY_STORAGE);
        window.localStorage.removeItem(CUSTOM_API_KEY_STORAGE);
        if (nextKey) {
          if (sessionOnly) {
            window.sessionStorage.setItem(CUSTOM_API_KEY_STORAGE, nextKey);
          } else {
            window.localStorage.setItem(CUSTOM_API_KEY_STORAGE, nextKey);
          }
        }
      } catch {
        // Ignore storage errors
      }

      if (hadGoogleLoaded && nextKey !== savedKeyState.key) {
        window.location.reload();
      }
    },
    [savedKeyState.key],
  );

  const handleSaveMapillaryToken = useCallback(
    (rawToken: string, sessionOnly: boolean) => {
      const nextToken = sanitizeApiToken(rawToken);
      setSavedMapillaryState({ key: nextToken, sessionOnly });
      try {
        window.sessionStorage.removeItem(MAPILLARY_TOKEN_STORAGE);
        window.localStorage.removeItem(MAPILLARY_TOKEN_STORAGE);
        if (nextToken) {
          if (sessionOnly) {
            window.sessionStorage.setItem(MAPILLARY_TOKEN_STORAGE, nextToken);
          } else {
            window.localStorage.setItem(MAPILLARY_TOKEN_STORAGE, nextToken);
          }
        }
      } catch {
        // Ignore storage errors
      }
    },
    [],
  );

  const handleChangePanoramaPreference = useCallback((pref: PanoramaPreference) => {
    setPanoramaPreference(pref);
    try {
      window.localStorage.setItem(PANORAMA_PREF_STORAGE, pref);
    } catch {
      // Ignore storage errors
    }
  }, []);

  const quotaBanner = quotaExceeded ? (
    <div className="z-50 shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-900 shadow-sm md:text-sm">
      <span>
        Google Maps Platform quota reached. If you are the app owner, visit{' '}
        <a
          href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-amber-950 underline hover:text-amber-800"
        >
          maps developer site
        </a>{' '}
        for instructions to update your account.
      </span>
    </div>
  ) : null;

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-[#0B1220]">
      {quotaBanner}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {shouldMountGoogleProvider ? (
          <APIProvider
            key={effectiveApiKey}
            apiKey={effectiveApiKey}
            language="ru"
            libraries={['streetView']}
          >
            <LiveStreetViewTerraSpotter
              hasEnvMapsKey={Boolean(envKey)}
              savedCustomApiKey={savedKeyState.key}
              apiKeySessionOnly={savedKeyState.sessionOnly}
              hasEnvMapillaryToken={Boolean(envMapillaryToken)}
              savedMapillaryToken={savedMapillaryState.key}
              effectiveMapillaryToken={effectiveMapillaryToken}
              panoramaPreference={panoramaPreference}
              quotaExceeded={quotaExceeded}
              mapsError={mapsError}
              onSaveCustomApiKey={handleSaveCustomApiKey}
              onSaveMapillaryToken={handleSaveMapillaryToken}
              onChangePanoramaPreference={handleChangePanoramaPreference}
            />
          </APIProvider>
        ) : (
          <TerraSpotterCore
            hasMapsKey={Boolean(effectiveApiKey)}
            hasEnvMapsKey={Boolean(envKey)}
            savedCustomApiKey={savedKeyState.key}
            apiKeySessionOnly={savedKeyState.sessionOnly}
            hasEnvMapillaryToken={Boolean(envMapillaryToken)}
            savedMapillaryToken={savedMapillaryState.key}
            effectiveMapillaryToken={effectiveMapillaryToken}
            panoramaPreference={panoramaPreference}
            quotaExceeded={quotaExceeded}
            mapsError={mapsError}
            streetViewLib={null}
            onSaveCustomApiKey={handleSaveCustomApiKey}
            onSaveMapillaryToken={handleSaveMapillaryToken}
            onChangePanoramaPreference={handleChangePanoramaPreference}
          />
        )}
      </div>
    </div>
  );
}
