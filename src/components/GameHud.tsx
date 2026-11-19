import React from 'react';
import { Flag, Pause, Volume2, VolumeX, Clock } from 'lucide-react';
import { formatScore } from '../game/geoMath';
import type { MovementMode } from '../game/types';

interface GameHudProps {
  regionName: string;
  roundNumber: number;
  totalRounds: number;
  score: number;
  timeLeftSec: number | null;
  activePlayerName?: string;
  activePlayerColor?: string;
  roomCode?: string;
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
  roomCode,
  muted,
  onReturnToStart,
  onToggleMute,
  onPause,
}) => {
  const isLowTime = timeLeftSec !== null && timeLeftSec <= 15;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-2.5 sm:p-3.5 landscape-phone:p-2"
      style={{
        paddingTop: 'max(0.625rem, env(safe-area-inset-top, 0px))',
        paddingLeft: 'max(0.625rem, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(0.625rem, env(safe-area-inset-right, 0px))',
      }}
    >
      {/* Top-Left: Minimal Touch-Friendly Controls */}
      <div className="flex flex-col gap-1.5">
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
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-700/80 text-slate-200 shadow transition-colors hover:border-amber-500/60 hover:text-amber-300 sm:h-9 sm:w-9 landscape-phone:h-9 landscape-phone:w-9"
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
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-700/80 text-slate-200 shadow transition-colors hover:border-amber-500/60 hover:text-amber-300 sm:h-9 sm:w-9 landscape-phone:h-9 landscape-phone:w-9"
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
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-700/80 text-slate-200 shadow transition-colors hover:border-amber-500/60 hover:text-amber-300 sm:h-9 sm:w-9 landscape-phone:h-9 landscape-phone:w-9"
            style={{ backgroundColor: 'rgba(11, 18, 32, 0.88)' }}
          >
            <Pause className="h-4 w-4" />
          </button>
        </div>

        {(activePlayerName || roomCode) && (
          <div
            className="pointer-events-auto flex items-center gap-2 rounded-lg border border-slate-700/80 px-2.5 py-1 text-xs shadow"
            style={{ backgroundColor: 'rgba(11, 18, 32, 0.88)' }}
          >
            {activePlayerName && (
              <span className="flex items-center gap-1.5 font-semibold text-slate-100">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: activePlayerColor || '#F59E0B' }}
                  aria-hidden="true"
                />
                <span className="max-w-[110px] truncate">{activePlayerName}</span>
              </span>
            )}
            {roomCode && (
              <span className="font-mono text-[11px] font-semibold tracking-wider text-amber-300">
                {roomCode}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Top-Right: Ultra-Compact Tabular Round & Score Pill-Free Strip */}
      <div
        className="pointer-events-auto flex h-11 items-center divide-x divide-slate-700/80 rounded-xl border border-slate-700/80 shadow-lg sm:h-9 landscape-phone:h-9"
        style={{ backgroundColor: 'rgba(11, 18, 32, 0.88)' }}
      >
        <div className="px-3 font-mono text-sm font-bold tabular-nums text-slate-100">
          {roundNumber}
          <span className="text-xs font-medium text-slate-400">/{totalRounds}</span>
        </div>

        <div className="px-3 font-mono text-sm font-bold tabular-nums text-amber-400">
          {formatScore(score)}
        </div>

        {timeLeftSec !== null && (
          <div
            className={`flex items-center gap-1 px-3 font-mono text-sm font-bold tabular-nums ${
              isLowTime ? 'text-rose-400' : 'text-emerald-400'
            }`}
          >
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{formatTimer(timeLeftSec)}</span>
          </div>
        )}
      </div>
    </div>
  );
};
