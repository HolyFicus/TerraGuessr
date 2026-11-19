import React from 'react';
import { Flag, Pause, Volume2, VolumeX, Clock, Heart } from 'lucide-react';
import { formatScore } from '../game/geoMath';
import { DUEL_STARTING_HP } from '../game/roomState';
import type { MovementMode } from '../game/types';

interface GameHudProps {
  regionName: string;
  roundNumber: number;
  totalRounds: number;
  score: number;
  timeLeftSec: number | null;
  activePlayerName?: string;
  activePlayerColor?: string;
  showActiveTurnBadge?: boolean;
  roomCode?: string;
  duelPlayers?: Array<{ id: string; name: string; color: string; hp: number }>;
  duelMultiplier?: number;
  duelCountdownSec?: number | null;
  movementMode: MovementMode;
  muted: boolean;
  onReturnToStart: () => void;
  onToggleMute: () => void;
  onPause: () => void;
}

function formatTimer(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins}:${rem.toString().padStart(2, '0')}`;
}

export const GameHud: React.FC<GameHudProps> = ({
  roundNumber,
  totalRounds,
  score,
  timeLeftSec,
  activePlayerName,
  activePlayerColor,
  showActiveTurnBadge = false,
  roomCode,
  duelPlayers,
  duelMultiplier = 1,
  duelCountdownSec = null,
  muted,
  onReturnToStart,
  onToggleMute,
  onPause,
}) => {
  const isDuel = Boolean(duelPlayers && duelPlayers.length >= 2);
  const effectiveTimer =
    duelCountdownSec !== null
      ? timeLeftSec !== null
        ? Math.min(timeLeftSec, duelCountdownSec)
        : duelCountdownSec
      : timeLeftSec;
  const isLowTime = effectiveTimer !== null && effectiveTimer <= 15;
  const isDuelCountdownActive = isDuel && duelCountdownSec !== null;

  const showTurnOrRoomBadge =
    (!isDuel && Boolean(activePlayerName || roomCode)) ||
    (isDuel && showActiveTurnBadge && Boolean(activePlayerName));

  return (
    <div
      className={`pointer-events-none absolute inset-x-0 top-0 z-20 flex gap-2 p-2.5 sm:flex-row sm:items-start sm:justify-between sm:p-3.5 landscape-phone:flex-row landscape-phone:items-start landscape-phone:justify-between landscape-phone:p-2 ${
        isDuel ? 'flex-col' : 'items-start justify-between'
      }`}
      style={{
        paddingTop: 'max(0.625rem, env(safe-area-inset-top, 0px))',
        paddingLeft: 'max(0.625rem, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(0.625rem, env(safe-area-inset-right, 0px))',
      }}
    >
      {/* Top-Left: Minimal Touch-Friendly Controls (+ mobile Duel turn pill on right of row 1) */}
      <div
        className={`flex gap-1.5 ${
          isDuel
            ? 'w-full items-center justify-between sm:w-auto sm:flex-col sm:items-start'
            : 'flex-col'
        }`}
      >
        <div className="pointer-events-auto flex items-center gap-1.5">
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onReturnToStart();
            }}
            aria-label="Вернуться в начальную точку (R)"
            title="К старту (R)"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700/80 text-slate-200 shadow transition-colors hover:border-amber-500/60 hover:text-amber-300 sm:h-9 sm:w-9 landscape-phone:h-9 landscape-phone:w-9"
            style={{ backgroundColor: 'rgba(11, 18, 32, 0.88)' }}
          >
            <Flag className="h-4 w-4" />
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            aria-label={muted ? 'Включить звук (M)' : 'Выключить звук (M)'}
            title={muted ? 'Включить звук (M)' : 'Выключить звук (M)'}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700/80 text-slate-200 shadow transition-colors hover:border-amber-500/60 hover:text-amber-300 sm:h-9 sm:w-9 landscape-phone:h-9 landscape-phone:w-9"
            style={{ backgroundColor: 'rgba(11, 18, 32, 0.88)' }}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            aria-label="Пауза (Esc)"
            title="Пауза (Esc)"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700/80 text-slate-200 shadow transition-colors hover:border-amber-500/60 hover:text-amber-300 sm:h-9 sm:w-9 landscape-phone:h-9 landscape-phone:w-9"
            style={{ backgroundColor: 'rgba(11, 18, 32, 0.88)' }}
          >
            <Pause className="h-4 w-4" />
          </button>
        </div>

        {showTurnOrRoomBadge && (
          <div
            className="pointer-events-auto flex items-center gap-2 rounded-lg border border-slate-700/80 px-2.5 py-1.5 text-xs shadow sm:py-1"
            style={{ backgroundColor: 'rgba(11, 18, 32, 0.88)' }}
          >
            {activePlayerName && (
              <span className="flex items-center gap-1.5 font-semibold text-slate-100">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: activePlayerColor || '#F59E0B' }}
                  aria-hidden="true"
                />
                <span className="max-w-[120px] truncate">{activePlayerName}</span>
              </span>
            )}
            {!isDuel && roomCode && (
              <span className="font-mono text-[11px] font-semibold tracking-wider text-amber-300">
                {roomCode}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Top-Right (or Row 2 Full-Width on Mobile Portrait Duel): Duel HP Strip OR Classic Round & Score Strip */}
      <div
        className={`flex flex-col gap-1.5 ${
          isDuel ? 'w-full items-stretch sm:w-auto sm:items-end' : 'items-end'
        }`}
      >
        {isDuel && duelPlayers ? (
          <div
            className={`pointer-events-auto flex w-full items-center divide-x divide-slate-700/80 rounded-xl border shadow-lg transition-colors sm:w-auto ${
              isDuelCountdownActive
                ? 'border-rose-500/80 ring-2 ring-rose-500/35'
                : 'border-slate-700/80'
            }`}
            style={{ backgroundColor: 'rgba(11, 18, 32, 0.92)' }}
            data-testid="duel-hud-strip"
          >
            <div className="flex shrink-0 items-center gap-1 px-2 py-1.5 font-mono text-xs font-bold tabular-nums text-slate-200 sm:gap-1.5 sm:px-2.5">
              <span>Р{roundNumber}</span>
              <span
                data-testid="duel-multiplier-badge"
                className={`rounded px-1.5 py-0.5 text-[11px] font-extrabold ${
                  duelMultiplier >= 2.5
                    ? 'bg-rose-500/25 text-rose-300'
                    : duelMultiplier > 1
                      ? 'bg-amber-500/25 text-amber-300'
                      : 'bg-slate-800 text-slate-300'
                }`}
              >
                ×{duelMultiplier.toFixed(1)}
              </span>
            </div>

            {duelPlayers.slice(0, 2).map((p) => {
              const pct = Math.max(0, Math.min(100, (p.hp / DUEL_STARTING_HP) * 100));
              return (
                <div
                  key={p.id}
                  className="min-w-0 flex-1 px-2 py-1.5 sm:min-w-[114px] sm:flex-none sm:px-2.5"
                >
                  <div className="flex items-center justify-between gap-1 text-[11px]">
                    <span className="flex min-w-0 items-center gap-1 font-semibold text-slate-100">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: p.color }}
                        aria-hidden="true"
                      />
                      <span className="truncate sm:max-w-[78px]">{p.name}</span>
                    </span>
                    <span
                      className={`inline-flex shrink-0 items-center gap-0.5 font-mono font-bold tabular-nums ${
                        pct <= 25 ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      <Heart className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
                      {formatScore(p.hp)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        pct <= 25 ? 'bg-rose-500' : 'bg-emerald-400'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}

            {effectiveTimer !== null && (
              <div
                className={`flex shrink-0 items-center gap-1 px-2 py-1.5 font-mono text-xs font-bold tabular-nums sm:px-2.5 sm:text-sm ${
                  isDuelCountdownActive || isLowTime
                    ? 'bg-rose-500/15 text-rose-400'
                    : 'text-emerald-400'
                }`}
              >
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{formatTimer(effectiveTimer)}</span>
              </div>
            )}
          </div>
        ) : (
          <div
            className="pointer-events-auto flex h-10 items-center divide-x divide-slate-700/80 rounded-xl border border-slate-700/80 shadow-lg sm:h-9 landscape-phone:h-9"
            style={{ backgroundColor: 'rgba(11, 18, 32, 0.88)' }}
          >
            <div className="px-3 font-mono text-sm font-bold tabular-nums text-slate-100">
              {roundNumber}
              <span className="text-xs font-medium text-slate-400">/{totalRounds}</span>
            </div>

            <div className="px-3 font-mono text-sm font-bold tabular-nums text-amber-400">
              {formatScore(score)}
            </div>

            {effectiveTimer !== null && (
              <div
                className={`flex items-center gap-1 px-3 font-mono text-sm font-bold tabular-nums ${
                  isLowTime ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{formatTimer(effectiveTimer)}</span>
              </div>
            )}
          </div>
        )}

        {isDuelCountdownActive && (
          <div
            role="status"
            className="pointer-events-none self-end animate-pulse rounded-lg border border-rose-500/70 bg-rose-950/90 px-3 py-1 text-xs font-bold text-rose-200 shadow-lg"
          >
            Соперник ответил · осталось {Math.max(0, Math.ceil(duelCountdownSec!))} с
          </div>
        )}
      </div>
    </div>
  );
};
