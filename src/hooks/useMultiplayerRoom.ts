import { useCallback, useEffect, useRef, useState } from 'react';
import Peer, { type DataConnection } from 'peerjs';
import {
  createRoom as createRoomModel,
  disconnectPlayer,
  finishMatch as finishMatchModel,
  generateInviteCode,
  inviteCodeToPeerId,
  joinRoom as joinRoomModel,
  normalizeInviteCode,
  resetRoomToLobby,
  sanitizeLatLng,
  sanitizePlayerName,
  sanitizePublicRoomState,
  setRoundLocation,
  startLocatingRound,
  submitPlayerGuess,
  toPublicRoomState,
  type InternalRoom,
} from '../game/roomState';
import type {
  LatLng,
  MovementMode,
  MultiplayerRoomPublicState,
  RoundLocation,
} from '../game/types';

function generateSecureClientId(): string {
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(12);
    window.crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `pl_${hex}`;
  }
  return `pl_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
}

function getOrCreateClientId(): string {
  try {
    const existing = window.sessionStorage.getItem('terraspotter_client_id');
    if (existing && /^pl_[a-zA-Z0-9_-]{8,48}$/.test(existing)) return existing;
    const generated = generateSecureClientId();
    window.sessionStorage.setItem('terraspotter_client_id', generated);
    return generated;
  } catch {
    return generateSecureClientId();
  }
}

export interface CreateRoomParams {
  playerName: string;
  regionId: string;
  totalRounds: number;
  timerSeconds: number;
  movementMode: MovementMode;
}

type PeerEnvelope =
  | { type: 'room:join'; playerId: string; playerName: string }
  | { type: 'room:submit_guess'; playerId: string; guess: LatLng | null; timeSpentSec: number }
  | { type: 'room:state'; room: MultiplayerRoomPublicState }
  | { type: 'room:error'; error: string };

const PEER_OPTIONS = {
  debug: 0,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
    ],
  },
};

/**
 * Serverless WebRTC P2P multiplayer room hook powered by PeerJS.
 * Host runs the authoritative roomState reducer locally, binds each guest
 * connection strictly to a single verified playerId (anti-spoofing), and
 * validates every incoming packet on both host and guest sides.
 */
export function useMultiplayerRoom(
  distanceFn?: (a: LatLng, b: LatLng) => number,
) {
  const [clientId] = useState<string>(() => getOrCreateClientId());
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState<MultiplayerRoomPublicState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const peerRef = useRef<Peer | null>(null);
  const hostRoomRef = useRef<InternalRoom | null>(null);
  const hostConnectionsRef = useRef<Record<string, DataConnection>>({});
  const guestConnRef = useRef<DataConnection | null>(null);
  const distanceFnRef = useRef(distanceFn);
  distanceFnRef.current = distanceFn;

  const cleanupPeer = useCallback(() => {
    Object.values(hostConnectionsRef.current).forEach((conn) => {
      try {
        conn.close();
      } catch {
        // Ignore close errors
      }
    });
    hostConnectionsRef.current = {};

    if (guestConnRef.current) {
      try {
        guestConnRef.current.close();
      } catch {
        // Ignore
      }
      guestConnRef.current = null;
    }

    if (peerRef.current) {
      try {
        peerRef.current.destroy();
      } catch {
        // Ignore
      }
      peerRef.current = null;
    }

    hostRoomRef.current = null;
    setConnected(false);
  }, []);

  useEffect(() => {
    return () => {
      cleanupPeer();
    };
  }, [cleanupPeer]);

  const broadcastFromHost = useCallback(() => {
    const internal = hostRoomRef.current;
    if (!internal) return;
    const publicState = toPublicRoomState(internal);
    setRoom(publicState);
    const packet: PeerEnvelope = { type: 'room:state', room: publicState };
    Object.values(hostConnectionsRef.current).forEach((conn) => {
      if (conn.open) {
        conn.send(packet);
      }
    });
  }, []);

  const createRoom = useCallback(
    (params: CreateRoomParams) => {
      cleanupPeer();
      setError(null);

      const code = generateInviteCode();
      const hostPeerId = inviteCodeToPeerId(code);

      const internal = createRoomModel({
        code,
        hostId: clientId,
        hostName: params.playerName,
        regionId: params.regionId,
        totalRounds: params.totalRounds,
        timerSeconds: params.timerSeconds,
        movementMode: params.movementMode,
      });

      hostRoomRef.current = internal;
      setRoom(toPublicRoomState(internal));

      try {
        const peer = new Peer(hostPeerId, PEER_OPTIONS);
        peerRef.current = peer;

        peer.on('open', () => {
          setConnected(true);
          setError(null);
        });

        peer.on('connection', (conn) => {
          // Security: bind each WebRTC DataConnection strictly to ONE verified playerId
          let boundPlayerId: string | null = null;

          conn.on('data', (raw) => {
            const activeRoom = hostRoomRef.current;
            if (!activeRoom || !raw || typeof raw !== 'object') return;
            const msg = raw as Record<string, unknown>;

            if (msg.type === 'room:join') {
              // Prevent re-binding an already joined connection to another playerId
              if (boundPlayerId) return;

              const requestedId =
                typeof msg.playerId === 'string' &&
                /^pl_[a-zA-Z0-9_-]{8,48}$/.test(msg.playerId)
                  ? msg.playerId
                  : null;

              if (!requestedId) {
                conn.send({
                  type: 'room:error',
                  error: 'Некорректный идентификатор игрока.',
                } satisfies PeerEnvelope);
                return;
              }

              // Anti-spoofing: block impersonating the host or an already-connected guest
              const existingConn = hostConnectionsRef.current[requestedId];
              if (
                requestedId === activeRoom.hostId ||
                (existingConn && existingConn !== conn && existingConn.open)
              ) {
                conn.send({
                  type: 'room:error',
                  error: 'Этот игрок уже подключён к комнате.',
                } satisfies PeerEnvelope);
                return;
              }

              const safeName = sanitizePlayerName(msg.playerName, 'Гость');
              const res = joinRoomModel(activeRoom, requestedId, safeName);
              if (!res.ok) {
                conn.send({
                  type: 'room:error',
                  error: res.error || 'Не удалось войти в комнату.',
                } satisfies PeerEnvelope);
                return;
              }

              boundPlayerId = requestedId;
              hostConnectionsRef.current[boundPlayerId] = conn;
              broadcastFromHost();
            } else if (msg.type === 'room:submit_guess') {
              // Anti-spoofing: strictly use boundPlayerId, NEVER trust msg.playerId from packet
              if (!boundPlayerId) return;

              const rawGuess = msg.guess;
              const safeGuess =
                rawGuess === null ? null : sanitizeLatLng(rawGuess);
              if (rawGuess !== null && !safeGuess) return;

              const safeTime =
                typeof msg.timeSpentSec === 'number' &&
                Number.isFinite(msg.timeSpentSec)
                  ? Math.max(0, Math.min(3600, Math.round(msg.timeSpentSec)))
                  : 0;

              const res = submitPlayerGuess(
                activeRoom,
                boundPlayerId,
                safeGuess,
                safeTime,
                distanceFnRef.current,
              );
              if (res.ok) {
                broadcastFromHost();
              }
            }
          });

          conn.on('close', () => {
            if (boundPlayerId && hostRoomRef.current) {
              if (hostConnectionsRef.current[boundPlayerId] === conn) {
                delete hostConnectionsRef.current[boundPlayerId];
              }
              disconnectPlayer(hostRoomRef.current, boundPlayerId);
              broadcastFromHost();
            }
          });
        });

        peer.on('error', (err) => {
          const errType = (err as { type?: string }).type || '';
          if (errType === 'unavailable-id') {
            setError('Код комнаты уже занят. Попробуйте создать комнату ещё раз.');
          } else {
            setConnected(false);
          }
        });

        let reconnectAttempts = 0;
        peer.on('disconnected', () => {
          setConnected(false);
          // Re-establish PeerJS signaling socket automatically if lobby is still active
          if (
            peerRef.current === peer &&
            !peer.destroyed &&
            hostRoomRef.current &&
            reconnectAttempts < 3
          ) {
            reconnectAttempts += 1;
            window.setTimeout(() => {
              if (peerRef.current === peer && !peer.destroyed && peer.disconnected) {
                try {
                  peer.reconnect();
                } catch {
                  // Ignore reconnect failure
                }
              }
            }, 1500 * reconnectAttempts);
          }
        });
      } catch {
        setConnected(false);
      }
    },
    [broadcastFromHost, cleanupPeer, clientId],
  );

  const joinRoomByCode = useCallback(
    (rawCode: string, playerName: string) => {
      cleanupPeer();
      setError(null);

      const code = normalizeInviteCode(rawCode);
      const targetPeerId = inviteCodeToPeerId(code);

      try {
        const peer = new Peer(PEER_OPTIONS);
        peerRef.current = peer;

        peer.on('open', () => {
          const conn = peer.connect(targetPeerId, { reliable: true });
          guestConnRef.current = conn;

          const connectTimeout = window.setTimeout(() => {
            if (!conn.open) {
              setError(
                `Комната «${code}» не отвечает. Проверьте код или убедитесь, что хост открыл лобби.`,
              );
            }
          }, 9000);

          conn.on('open', () => {
            window.clearTimeout(connectTimeout);
            setConnected(true);
            setError(null);
            conn.send({
              type: 'room:join',
              playerId: clientId,
              playerName: sanitizePlayerName(playerName, 'Гость'),
            } satisfies PeerEnvelope);
          });

          conn.on('data', (raw) => {
            if (!raw || typeof raw !== 'object') return;
            const msg = raw as Record<string, unknown>;
            if (msg.type === 'room:state') {
              const sanitized = sanitizePublicRoomState(msg.room);
              if (sanitized) {
                setRoom(sanitized);
                setError(null);
              }
            } else if (msg.type === 'room:error' && typeof msg.error === 'string') {
              setError(msg.error.slice(0, 160));
            }
          });

          conn.on('close', () => {
            window.clearTimeout(connectTimeout);
            setConnected(false);
            // Return guest cleanly out of dead room so the disconnect message is immediately shown
            setRoom(null);
            setError('Соединение с хостом комнаты прервано.');
          });

          conn.on('error', () => {
            window.clearTimeout(connectTimeout);
            setConnected(false);
            setRoom(null);
            setError(`Не удалось подключиться к комнате «${code}».`);
          });
        });

        peer.on('error', (err) => {
          const errType = (err as { type?: string }).type || '';
          if (errType === 'peer-unavailable') {
            setError(`Комната «${code}» не найдена. Проверьте пригласительный код.`);
          } else {
            setError('Не удалось установить WebRTC-соединение (PeerJS).');
          }
          setConnected(false);
        });
      } catch {
        setError('WebRTC недоступен в этом браузере.');
      }
    },
    [cleanupPeer, clientId],
  );

  const leaveRoom = useCallback(() => {
    cleanupPeer();
    setRoom(null);
    setError(null);
  }, [cleanupPeer]);

  const startRound = useCallback(() => {
    const internal = hostRoomRef.current;
    if (!internal) return;
    const res = startLocatingRound(internal, clientId);
    if (res.ok) broadcastFromHost();
  }, [broadcastFromHost, clientId]);

  const publishLocation = useCallback(
    (location: RoundLocation) => {
      const internal = hostRoomRef.current;
      if (!internal) return;
      const res = setRoundLocation(internal, clientId, location);
      if (res.ok) broadcastFromHost();
    },
    [broadcastFromHost, clientId],
  );

  const submitGuess = useCallback(
    (guess: LatLng | null, timeSpentSec: number) => {
      if (hostRoomRef.current) {
        const res = submitPlayerGuess(
          hostRoomRef.current,
          clientId,
          guess,
          timeSpentSec,
          distanceFnRef.current,
        );
        if (res.ok) broadcastFromHost();
        return;
      }

      if (guestConnRef.current && guestConnRef.current.open) {
        guestConnRef.current.send({
          type: 'room:submit_guess',
          playerId: clientId,
          guess,
          timeSpentSec,
        } satisfies PeerEnvelope);
      }
    },
    [broadcastFromHost, clientId],
  );

  const finishMatch = useCallback(() => {
    const internal = hostRoomRef.current;
    if (!internal) return;
    const res = finishMatchModel(internal, clientId);
    if (res.ok) broadcastFromHost();
  }, [broadcastFromHost, clientId]);

  const resetRoom = useCallback(() => {
    const internal = hostRoomRef.current;
    if (!internal) return;
    const res = resetRoomToLobby(internal, clientId);
    if (res.ok) broadcastFromHost();
  }, [broadcastFromHost, clientId]);

  const isHost = Boolean(room && room.hostId === clientId);
  const currentPlayer = room?.players.find((p) => p.id === clientId) ?? null;

  return {
    clientId,
    connected,
    room,
    error,
    isHost,
    currentPlayer,
    clearError: () => setError(null),
    createRoom,
    joinRoomByCode,
    leaveRoom,
    startRound,
    publishLocation,
    submitGuess,
    finishMatch,
    resetRoom,
  };
}
