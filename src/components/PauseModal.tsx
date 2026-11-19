import React from 'react';
import { Home, Play, RotateCcw } from 'lucide-react';
import { formatScore } from '../game/geoMath';

interface PauseModalProps {
  regionName: string;
  roundNumber: number;
  totalRounds: number;
  score: number;
  canRestart: boolean;
  onResume: () => void;
  onRestart: () => void;
  onExitToTitle: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  regionName,
  roundNumber,
  totalRounds,
  score,
  canRestart,
  onResume,
  onRestart,
  onExitToTitle,
}) => {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-modal-title"
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#0B1220]/85 p-4"
    >
      <div className="w-full max-w-xs rounded-2xl border border-slate-800 bg-[#111A2E] p-5 shadow-2xl landscape-phone:p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2
            id="pause-modal-title"
            className="font-display text-xl font-bold text-white"
          >
            Пауза
          </h2>
          <span className="font-mono text-xs tabular-nums text-slate-400">
            {roundNumber}/{totalRounds} ·{' '}
            <span className="text-amber-400">{formatScore(score)}</span>
          </span>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={onResume}
            className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-amber-500 font-display text-sm font-bold text-slate-950 transition-colors hover:bg-amber-400"
          >
            <Play className="h-4 w-4 fill-current" />
            <span>Продолжить</span>
          </button>

          {canRestart && (
            <button
              type="button"
              onClick={onRestart}
              className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-700 bg-[#0B1220] text-sm font-semibold text-slate-200 transition-colors hover:border-amber-500/60 hover:text-amber-300"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Заново</span>
            </button>
          )}

          <button
            type="button"
            onClick={onExitToTitle}
            className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-800 bg-transparent text-sm font-semibold text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <Home className="h-4 w-4" />
            <span>Меню</span>
          </button>
        </div>
      </div>
    </div>
  );
};
