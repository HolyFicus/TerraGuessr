import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInviteLink,
  createRoom,
  disconnectPlayer,
  generateInviteCode,
  inviteCodeToPeerId,
  joinRoom,
  normalizeInviteCode,
  sanitizeLatLng,
  sanitizePublicRoomState,
  setRoundLocation,
  startLocatingRound,
  submitPlayerGuess,
  toPublicRoomState,
} from './roomState';
import { escapeHtml, sanitizeHexColor } from './sanitize';
import { computeStatsSummary, sanitizeMatchRecord } from './statsStorage';

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

test('multiplayer room flow: create, idempotent join, anti-cheat coord hiding, simultaneous guess, score', () => {
  const room = createRoom({
    code: 'GEO-TEST99',
    hostId: 'p1',
    hostName: 'Анна',
    regionId: 'europe',
    totalRounds: 5,
    timerSeconds: 90,
    movementMode: 'no_move',
  });

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

  // Player 1 guesses within 20 meters of Paris -> exact 5000 points
  const g1 = submitPlayerGuess(room, 'p1', { lat: 48.8567, lng: 2.3522 }, 12);
  assert.equal(g1.ok, true);
  assert.equal(g1.roundCompleted, false);

  // Duplicate guess ignored
  const g1Dup = submitPlayerGuess(room, 'p1', { lat: 0, lng: 0 }, 20);
  assert.equal(g1Dup.ok, true);
  assert.equal(g1Dup.roundCompleted, false);

  // Player 2 guesses Madrid -> completes round 1
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
  assert.ok(p2Score < p1Score && p2Score > 2500);

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

test('statsStorage rejects corrupted records and handles prototype-like regionId safely', () => {
  assert.equal(sanitizeMatchRecord({ id: '', totalScore: 'oops' }), null);

  const rec = sanitizeMatchRecord({
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
  assert.ok(rec);
  const summary = computeStatsSummary([rec]);
  assert.equal(summary.gamesPlayed, 1);
  assert.equal(summary.regionBreakdown[0].regionId, '__proto__');
});
