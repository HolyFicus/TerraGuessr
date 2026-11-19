import React, { useState } from 'react';
import { Check, Copy, Heart, Link2, LogOut, Play, Swords, Users } from 'lucide-react';
import { formatScore } from '../game/geoMath';
import { getRegionById } from '../game/regions';
import { buildInviteLink, DUEL_STARTING_HP } from '../game/roomState';
import type { MovementMode, MultiplayerRoomPublicState } from '../game/types';

async function copyTextSafely(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

interface MultiplayerLobbyProps {
  room: MultiplayerRoomPublicState;
  connected: boolean;
  isHost: boolean;
  locating: boolean;
  onStartMatch: () => void;
  onLeaveRoom: () => void;
}

function movementLabel(mode: MovementMode): string {
  if (mode === 'no_move') return 'No Move';
  if (mode === 'nmpz') return 'NMPZ';
  return 'Moving';
}

export const MultiplayerLobby: React.FC<MultiplayerLobbyProps> = ({
  room,
  connected,
  isHost,
  locating,
  onStartMatch,
  onLeaveRoom,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const region = getRegionById(room.regionId);
  const isDuel = room.onlineFormat === 'duel';
  const maxPlayers = isDuel ? 2 : 6;
  const waitingForDuelOpponent = isDuel && room.players.length < 2;

  const copyCode = async () => {
    if (await copyTextSafely(room.code)) {
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const copyInviteLink = async () => {
    const link = buildInviteLink(window.location.href, room.code);
    if (await copyTextSafely(link)) {
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  return (
    <div
      className="safe-area-inset flex min-h-[100dvh] w-full items-center justify-center bg-[#0B1220] p-4 text-slate-100"
      data-testid="multiplayer-lobby"
    >
      <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-[#111A2E] p-5 shadow-2xl sm:p-7 landscape-phone:max-w-3xl landscape-phone:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3.5 landscape-phone:pb-2.5">
          <div>
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white sm:text-xl">
              {isDuel && <Swords className="h-5 w-5 text-amber-400" aria-hidden="true" />}
              <span>{isDuel ? 'Дуэль 1 на 1' : 'Комната P2P'}</span>
            </h2>
            <p className="text-xs text-slate-400">
              {region.name} ·{' '}
              {isDuel
                ? `${formatScore(DUEL_STARTING_HP)} HP · 15с после первого ответа`
                : `${room.totalRounds} р.`}{' '}
              · {movementLabel(room.movementMode)}
              {room.timerSeconds > 0 ? ` · ${room.timerSeconds}с` : ''}
            </p>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-300">
            <span
              className={`h-2 w-2 rounded-full ${
                connected ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
              aria-hidden="true"
            />
            <span>{connected ? 'P2P готов' : 'Подключение...'}</span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 landscape-phone:mt-3 landscape-phone:grid-cols-2">
          <div className="rounded-xl border border-amber-500/35 bg-[#0B1220] p-4 landscape-phone:p-3">
            <div className="text-xs text-slate-400">
              {isDuel ? 'Код дуэли для второго устройства' : 'Код комнаты'}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2.5">
              <span
                data-testid="room-invite-code"
                className="font-mono text-2xl font-bold tracking-[0.16em] text-amber-400 select-all sm:text-3xl"
              >
                {room.code}
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={copyCode}
                  className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/90 px-3 text-xs font-semibold text-slate-100 whitespace-nowrap transition-colors hover:border-amber-500/60 hover:text-amber-300 landscape-phone:h-9"
                >
                  {copiedCode ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  <span>{copiedCode ? 'Готово' : 'Код'}</span>
                </button>

                <button
                  type="button"
                  onClick={copyInviteLink}
                  className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/90 px-3 text-xs font-semibold text-slate-100 whitespace-nowrap transition-colors hover:border-amber-500/60 hover:text-amber-300 landscape-phone:h-9"
                >
                  {copiedLink ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Link2 className="h-3.5 w-3.5" />
                  )}
                  <span>{copiedLink ? 'Готово' : 'Ссылка'}</span>
                </button>
              </div>
            </div>
            {isDuel && waitingForDuelOpponent && (
              <p className="mt-2.5 text-[11px] text-slate-400">
                Отправьте код или ссылку другу — как только он войдёт со своего устройства, можно начинать дуэль.
              </p>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-300">
              {isDuel ? (
                <Swords className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
              ) : (
                <Users className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
              )}
              <span>
                {isDuel ? 'Дуэлянты' : 'Участники'} ({room.players.length}/{maxPlayers})
              </span>
            </div>

            {isDuel ? (
              <div className="flex flex-col gap-2">
                {room.players.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-lg border border-slate-800 bg-[#0B1220] px-3 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: p.color }}
                        aria-hidden="true"
                      />
                      <span className="truncate text-sm font-semibold text-white">
                        {p.name}
                      </span>
                      {p.isHost && (
                        <span className="text-[11px] text-slate-500">· Хост</span>
                      )}
                    </div>
                    <span className="inline-flex items-center gap-1 font-mono text-xs font-bold tabular-nums text-emerald-400">
                      <Heart className="h-3 w-3 fill-current" aria-hidden="true" />
                      {formatScore(p.hp)}
                    </span>
                  </div>
                ))}
                {waitingForDuelOpponent && (
                  <div className="flex items-center justify-between rounded-lg border border-dashed border-slate-700/80 bg-[#0B1220]/50 px-3 py-2.5 text-xs text-slate-400">
                    <span>Ожидание соперника...</span>
                    <span className="font-mono text-slate-500">1 / 2</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid max-h-[160px] grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2 landscape-phone:grid-cols-1">
                {room.players.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-lg border border-slate-800 bg-[#0B1220] px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: p.color }}
                        aria-hidden="true"
                      />
                      <span className="truncate text-sm font-semibold text-white">
                        {p.name}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400 whitespace-nowrap">
                      {p.isHost ? 'Хост' : p.connected ? 'Готов' : 'Офлайн'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2.5 border-t border-slate-800 pt-4 landscape-phone:mt-3 landscape-phone:pt-3">
          <button
            type="button"
            onClick={onLeaveRoom}
            className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-700 bg-[#0B1220] px-4 text-sm font-semibold text-slate-300 whitespace-nowrap transition-colors hover:border-rose-500/50 hover:text-rose-300 landscape-phone:h-10"
          >
            <LogOut className="h-4 w-4" />
            <span>Выйти</span>
          </button>

          {isHost ? (
            <button
              type="button"
              disabled={locating || waitingForDuelOpponent}
              onClick={onStartMatch}
              className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-amber-500 px-6 font-display text-sm font-bold text-slate-950 whitespace-nowrap shadow-lg transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50 landscape-phone:h-10"
            >
              {isDuel ? (
                <Swords className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4 fill-current" />
              )}
              <span>
                {locating
                  ? 'Поиск...'
                  : waitingForDuelOpponent
                    ? 'Ждём соперника (1/2)'
                    : isDuel
                      ? 'Начать дуэль'
                      : 'Начать матч'}
              </span>
            </button>
          ) : (
            <span className="text-xs text-slate-400">
              {locating ? 'Подбор панорамы...' : 'Ожидание старта от хоста...'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
