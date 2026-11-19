import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInviteLink,
  createRoom,
  disconnectPlayer,
  DUEL_LOCKOUT_SECONDS,
  DUEL_STARTING_HP,
  expirePendingDuelGuesses,
  generateInviteCode,
  getDuelMultiplier,
  inviteCodeToPeerId,
  joinRoom,
  normalizeInviteCode,
  resolveDuelRoundDamage,
  sanitizeLatLng,
  sanitizePublicRoomState,
  setRoundLocation,
  startLocatingRound,
  submitPlayerGuess,
  toPublicRoomState,
} from './roomState';
import { escapeHtml, sanitizeHexColor } from './sanitize';
import {
  computeStatsSummary,
  getRegionBestMap,
  sanitizeMatchRecord,
} from './statsStorage';

test('invite code generation (6-char), normalization, and WebRTC Peer ID mapping work reliably', () => {
  const existing = new Set<string>(['GEO-AAAAAA']);
  const code = generateInviteCode(existing, () => 0.25);
  assert.match(code, /^GEO-[A-Z0-9]{6}$/);
  assert.notEqual(code, 'GEO-AAAAAA');

  assert.equal(normalizeInviteCode(' ab12cd '), 'GEO-AB12CD');
  assert.equal(normalizeInviteCode('geo-7k4m9p'), 'GEO-7K4M9P');
  assert.equal(inviteCodeToPeerId('GEO-7K4M9P'), 'terraspotter-room-geo7k4m9p');

  // GitHub Pages subpath preservation + stale query/hash stripping
  assert.equal(
    buildInviteLink('https://alice.github.io/terraspotter/?autostart=1#top', '7k4m9p'),
    'https://alice.github.io/terraspotter/?join=GEO-7K4M9P',
  );
  assert.equal(
    buildInviteLink('https://terraspotter.vercel.app/', 'GEO-7K4M9P'),
    'https://terraspotter.vercel.app/?join=GEO-7K4M9P',
  );
});

test('multiplayer room flow: configurable up to 10 rounds, anti-cheat coord hiding, adaptive mapSize scoring', () => {
  const room = createRoom({
    code: 'GEO-TEST99',
    hostId: 'p1',
    hostName: 'Анна',
    regionId: 'europe',
    totalRounds: 10,
    timerSeconds: 90,
    movementMode: 'no_move',
  });

  assert.equal(room.totalRounds, 10);
  assert.equal(room.players.length, 1);
  assert.equal(room.players[0].isHost, true);

  const j1 = joinRoom(room, 'p2', 'Борис');
  assert.equal(j1.ok, true);
  assert.equal(room.players.length, 2);

  // Idempotent duplicate join
  const jDup = joinRoom(room, 'p2', 'Борис');
  assert.equal(jDup.ok, true);
  assert.equal(room.players.length, 2);

  assert.equal(startLocatingRound(room, 'p2').ok, false);
  assert.equal(startLocatingRound(room, 'p1').ok, true);
  assert.equal(room.status, 'locating');

  assert.equal(
    setRoundLocation(room, 'p1', {
      lat: 48.8566,
      lng: 2.3522,
      panoId: 'pano-paris',
      heading: 120,
      pitch: 0,
      hintLabel: 'Франция',
      countryCode: 'FR',
      isLiveStreetView: true,
    }).ok,
    true,
  );
  assert.equal(room.status, 'playing');

  // Anti-cheat: public state during playing hides hintLabel, countryCode AND exact lat/lng when panoId is present
  const playingPublic = toPublicRoomState(room);
  assert.equal(playingPublic.currentLocation?.hintLabel, '');
  assert.equal(playingPublic.currentLocation?.countryCode, '');
  assert.equal(playingPublic.currentLocation?.lat, 0);
  assert.equal(playingPublic.currentLocation?.lng, 0);
  assert.equal(playingPublic.currentLocation?.panoId, 'pano-paris');

  // Invalid coordinates rejected cleanly
  assert.equal(
    submitPlayerGuess(room, 'p1', { lat: Number.NaN, lng: 2.35 }, 10).ok,
    false,
  );

  // Player 1 guesses within 12 meters of Paris -> exact 5000 points (5K!)
  const g1 = submitPlayerGuess(room, 'p1', { lat: 48.8567, lng: 2.3522 }, 12);
  assert.equal(g1.ok, true);
  assert.equal(g1.roundCompleted, false);

  // Duplicate guess ignored
  const g1Dup = submitPlayerGuess(room, 'p1', { lat: 0, lng: 0 }, 20);
  assert.equal(g1Dup.ok, true);
  assert.equal(g1Dup.roundCompleted, false);

  // Player 2 guesses Madrid (~1053 km from Paris) -> scored with adaptive Europe mapSize
  const g2 = submitPlayerGuess(room, 'p2', { lat: 40.4168, lng: -3.7038 }, 18);
  assert.equal(g2.ok, true);
  assert.equal(g2.roundCompleted, true);
  assert.equal(room.status, 'round_result');
  assert.equal(room.roundHistory.length, 1);

  // After round completion, actual coordinates are revealed in roundHistory
  assert.equal(room.roundHistory[0].actual.lat, 48.8566);

  const p1Score = room.players.find((p) => p.id === 'p1')!.totalScore;
  const p2Score = room.players.find((p) => p.id === 'p2')!.totalScore;
  assert.equal(p1Score, 5000);
  assert.ok(p2Score > 100 && p2Score < 2000, `Expected Europe-scaled score for Paris-Madrid, got ${p2Score}`);

  assert.equal(startLocatingRound(room, 'p1').ok, true);
  assert.equal(room.currentRoundIndex, 1);
  assert.equal(room.status, 'locating');
});

test('host disconnect transfers host role to next connected player', () => {
  const room = createRoom({
    code: 'GEO-HOST99',
    hostId: 'p1',
    hostName: 'Хост',
    regionId: 'world',
    totalRounds: 5,
    timerSeconds: 0,
    movementMode: 'moving',
  });
  joinRoom(room, 'p2', 'Игрок 2');

  disconnectPlayer(room, 'p1');
  assert.equal(room.hostId, 'p2');
  assert.equal(room.players.find((p) => p.id === 'p2')?.isHost, true);
  assert.equal(room.players.find((p) => p.id === 'p1')?.connected, false);
});

test('security hardening: XSS escaping, strict color validation, and untrusted P2P payload sanitization', () => {
  assert.equal(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(sanitizeHexColor('#10B981'), '#10B981');
  assert.equal(sanitizeHexColor('red; background:url(x)', '#F59E0B'), '#F59E0B');

  assert.equal(sanitizeLatLng({ lat: 95, lng: 10 }), null);
  assert.equal(sanitizeLatLng({ lat: 'bad', lng: 10 }), null);
  assert.deepEqual(sanitizeLatLng({ lat: 48.85, lng: 2.35 }), { lat: 48.85, lng: 2.35 });

  // Malformed P2P room:state rejected
  assert.equal(sanitizePublicRoomState({ code: 123, players: null }), null);

  // Untrusted room:state with malicious color & oversized scores gets sanitized safely
  const sanitized = sanitizePublicRoomState({
    code: 'GEO-SAFE99',
    hostId: 'pl_host1234',
    status: 'lobby',
    regionId: 'world',
    totalRounds: 999,
    timerSeconds: -50,
    movementMode: 'invalid_mode',
    currentRoundIndex: 0,
    roundStartedAt: null,
    currentLocation: null,
    players: [
      {
        id: 'pl_host1234',
        name: '<b>Hacker</b>',
        color: '" onload="alert(1)',
        isHost: true,
        connected: true,
        totalScore: 99999999,
        hasGuessedCurrentRound: false,
        readyForNext: false,
      },
    ],
    roundHistory: [],
  });
  assert.ok(sanitized);
  assert.equal(sanitized.totalRounds, 10);
  assert.equal(sanitized.timerSeconds, 0);
  assert.equal(sanitized.movementMode, 'moving');
  assert.match(sanitized.players[0].color, /^#[0-9a-fA-F]{6}$/);
  assert.equal(sanitized.players[0].totalScore, 100000);
});

test('statsStorage saves Explorer medals, Duel W/L counts, and handles prototype-like regionId safely', () => {
  assert.equal(sanitizeMatchRecord({ id: '', totalScore: 'oops' }), null);

  const rec1 = sanitizeMatchRecord({
    id: 'm1',
    timestamp: Date.now(),
    mode: 'solo',
    regionId: '__proto__',
    regionName: 'Test',
    totalRounds: 5,
    playerName: 'Игрок',
    totalScore: 15000,
    maxPossibleScore: 25000,
    avgDistanceKm: 120,
    bestRoundScore: 4500,
    perfectRounds: 0,
    movementMode: 'moving',
    timerSeconds: 0,
  });
  const rec2 = sanitizeMatchRecord({
    id: 'm2',
    timestamp: Date.now() + 1000,
    mode: 'solo',
    regionId: 'france',
    regionName: 'Франция',
    totalRounds: 5,
    playerName: 'Игрок',
    totalScore: 23100,
    maxPossibleScore: 25000,
    avgDistanceKm: 18,
    bestRoundScore: 5000,
    perfectRounds: 2,
    medal: 'gold',
    movementMode: 'no_move',
    timerSeconds: 60,
  });
  const recDuelWin = sanitizeMatchRecord({
    id: 'm3',
    timestamp: Date.now() + 2000,
    mode: 'hotseat',
    isDuel: true,
    regionId: 'france',
    regionName: 'Франция',
    totalRounds: 4,
    playerName: 'Игрок 1',
    totalScore: 18000,
    maxPossibleScore: 20000,
    avgDistanceKm: 40,
    bestRoundScore: 5000,
    perfectRounds: 1,
    maxDamageDealt: 2450,
    won: true,
    movementMode: 'moving',
    timerSeconds: 0,
  });
  const recDuelLoss = sanitizeMatchRecord({
    id: 'm4',
    timestamp: Date.now() + 3000,
    mode: 'multiplayer',
    isDuel: true,
    regionId: 'world',
    regionName: 'Весь мир',
    totalRounds: 6,
    playerName: 'Игрок 1',
    totalScore: 19000,
    maxPossibleScore: 30000,
    avgDistanceKm: 320,
    bestRoundScore: 4700,
    perfectRounds: 0,
    maxDamageDealt: 1200,
    won: false,
    movementMode: 'moving',
    timerSeconds: 0,
  });

  assert.ok(rec1 && rec2 && recDuelWin && recDuelLoss);
  // Backfills medal when omitted (15000 / 25000 = silver)
  assert.equal(rec1.medal, 'silver');
  assert.equal(rec2.medal, 'gold');

  const records = [rec1, rec2, recDuelWin, recDuelLoss];
  const summary = computeStatsSummary(records);
  assert.equal(summary.gamesPlayed, 4);
  assert.equal(summary.duelWins, 1);
  assert.equal(summary.duelLosses, 1);

  const regionBest = getRegionBestMap(records);
  assert.equal(regionBest.get('france')?.bestMedal, 'gold');
  assert.equal(regionBest.get('france')?.bestScore, 23100);
  assert.equal(regionBest.get('__proto__')?.bestMedal, 'silver');
});

test('resolveDuelRoundDamage computes shared Hotseat/Online duel damage, ties, multipliers, and knockouts', () => {
  // Tie => 0 damage, no winner/loser
  const tie = resolveDuelRoundDamage(
    [
      { playerId: 'p1', playerName: 'A', color: '#F59E0B', guess: { lat: 0, lng: 0 }, distanceKm: 10, score: 4000, timeSpentSec: 5 },
      { playerId: 'p2', playerName: 'B', color: '#38BDF8', guess: { lat: 0, lng: 0 }, distanceKm: 10, score: 4000, timeSpentSec: 7 },
    ],
    { p1: 6000, p2: 6000 },
    0,
  );
  assert.equal(tie.duelDamage.damage, 0);
  assert.equal(tie.duelDamage.winnerPlayerId, null);
  assert.equal(tie.duelDamage.hpAfter.p1, 6000);
  assert.equal(tie.duelDamage.hpAfter.p2, 6000);
  assert.equal(tie.knockoutWinnerId, null);

  // Round 5 (index 4) => multiplier x1.5; diff = 2000 -> damage = 3000 -> knockout from 2500 HP
  const ko = resolveDuelRoundDamage(
    [
      { playerId: 'p1', playerName: 'A', color: '#F59E0B', guess: { lat: 0, lng: 0 }, distanceKm: 1, score: 4500, timeSpentSec: 5 },
      { playerId: 'p2', playerName: 'B', color: '#38BDF8', guess: { lat: 0, lng: 0 }, distanceKm: 500, score: 2500, timeSpentSec: 7 },
    ],
    { p1: 4200, p2: 2500 },
    4,
  );
  assert.equal(ko.duelDamage.multiplier, 1.5);
  assert.equal(ko.duelDamage.damage, 3000);
  assert.equal(ko.duelDamage.winnerPlayerId, 'p1');
  assert.equal(ko.duelDamage.loserPlayerId, 'p2');
  assert.equal(ko.duelDamage.hpBefore?.p2, 2500);
  assert.equal(ko.duelDamage.hpAfter.p2, 0);
  assert.equal(ko.duelDamage.hpAfter.p1, 4200);
  assert.equal(ko.knockoutWinnerId, 'p1');
});

test('duel 1v1 mode: 2-player cap, 6000 HP, 15s countdown, escalating multiplier, and knockout victory', () => {
  assert.equal(getDuelMultiplier(0), 1);
  assert.equal(getDuelMultiplier(3), 1);
  assert.equal(getDuelMultiplier(4), 1.5);
  assert.equal(getDuelMultiplier(5), 2);
  assert.equal(getDuelMultiplier(6), 2.5);

  const duel = createRoom({
    code: 'GEO-DUEL01',
    hostId: 'pl_host1111',
    hostName: 'Алиса',
    onlineFormat: 'duel',
    regionId: 'europe',
    totalRounds: 5,
    timerSeconds: 0,
    movementMode: 'moving',
  });

  // Cannot start a duel alone
  assert.equal(startLocatingRound(duel, 'pl_host1111').ok, false);

  // 2nd player joins cleanly with 6000 HP
  assert.equal(joinRoom(duel, 'pl_guest2222', 'Боб').ok, true);
  assert.equal(duel.players[0].hp, DUEL_STARTING_HP);
  assert.equal(duel.players[1].hp, DUEL_STARTING_HP);

  // 3rd player is blocked in 1v1 duel
  assert.equal(joinRoom(duel, 'pl_third3333', 'Лишний').ok, false);

  // Round 1 starts
  assert.equal(startLocatingRound(duel, 'pl_host1111').ok, true);
  assert.equal(
    setRoundLocation(
      duel,
      'pl_host1111',
      {
        lat: 48.8566,
        lng: 2.3522,
        panoId: 'pano-duel-1',
        heading: 0,
        pitch: 0,
        hintLabel: 'Париж',
        countryCode: 'FR',
        isLiveStreetView: true,
      },
      1_000_000,
    ).ok,
    true,
  );

  // First duelist locks in -> 15-second pressure countdown begins
  const g1 = submitPlayerGuess(
    duel,
    'pl_host1111',
    { lat: 48.8566, lng: 2.3522 },
    10,
    undefined,
    1_010_000,
  );
  assert.equal(g1.ok, true);
  assert.equal(g1.roundCompleted, false);
  assert.equal(duel.duelCountdownEndsAt, 1_010_000 + DUEL_LOCKOUT_SECONDS * 1000);

  // Second duelist times out -> host expires countdown -> 5000 vs 0 => 5000 damage (x1.0)
  const exp = expirePendingDuelGuesses(duel, 'pl_host1111');
  assert.equal(exp.ok, true);
  assert.equal(exp.roundCompleted, true);
  assert.equal(duel.status, 'round_result');
  assert.equal(duel.players.find((p) => p.id === 'pl_host1111')?.hp, 6000);
  assert.equal(duel.players.find((p) => p.id === 'pl_guest2222')?.hp, 1000);
  assert.equal(duel.roundHistory[0].duelDamage?.damage, 5000);
  assert.equal(duel.roundHistory[0].duelDamage?.multiplier, 1);
  assert.equal(duel.roundHistory[0].duelDamage?.hpBefore?.pl_guest2222, 6000);
  assert.equal(duel.roundHistory[0].duelDamage?.hpAfter.pl_guest2222, 1000);
  assert.equal(duel.duelWinnerId, null);

  // Round 2 knockout: Alice scores 5000 again, Bob scores 0 => Bob hits 0 HP -> Alice wins duel
  assert.equal(startLocatingRound(duel, 'pl_host1111').ok, true);
  assert.equal(
    setRoundLocation(duel, 'pl_host1111', {
      lat: 51.5074,
      lng: -0.1278,
      panoId: 'pano-duel-2',
      heading: 0,
      pitch: 0,
      hintLabel: 'Лондон',
      countryCode: 'GB',
      isLiveStreetView: true,
    }).ok,
    true,
  );
  submitPlayerGuess(duel, 'pl_host1111', { lat: 51.5074, lng: -0.1278 }, 8);
  expirePendingDuelGuesses(duel, 'pl_host1111');

  assert.equal(duel.players.find((p) => p.id === 'pl_guest2222')?.hp, 0);
  assert.equal(duel.duelWinnerId, 'pl_host1111');

  // Next step after knockout transitions directly to gameover
  assert.equal(startLocatingRound(duel, 'pl_host1111').ok, true);
  assert.equal(duel.status, 'gameover');

  // Public state sanitizes duel metadata cleanly
  const pub = sanitizePublicRoomState(toPublicRoomState(duel));
  assert.ok(pub);
  assert.equal(pub.onlineFormat, 'duel');
  assert.equal(pub.duelWinnerId, 'pl_host1111');
  assert.equal(pub.players[1].hp, 0);
  assert.equal(pub.roundHistory[0].duelDamage?.hpBefore?.pl_guest2222, 6000);
});
