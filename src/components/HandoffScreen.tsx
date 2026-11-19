import React from 'react';
import { ArrowRight, EyeOff, Heart, Swords } from 'lucide-react';
import { formatScore } from '../game/geoMath';
import { DUEL_STARTING_HP } from '../game/roomState';

interface HandoffScreenProps {
  playerName: string;
  playerColor: string;
  roundNumber: number;
  totalRounds: number;
  regionName: string;
  isSecondPlayer: boolean;
  isDuel?: boolean;
  duelMultiplier?: number;
  scores: Array<{ name: string; color: string; score: number; hp?: number }>;
  onReady: () => void;
}

export const HandoffScreen: React.FC<HandoffScreenProps> = ({
  playerName,
  playerColor,
  roundNumber,
  totalRounds,
  regionName,
  isSecondPlayer,
  isDuel = false,
  duelMultiplier = 1,
  scores,
  onReady,
}) => {
  return (
    <div
      className="safe-area-inset flex min-h-[100dvh] w-full items-center justify-center bg-[#0B1220] p-4 text-slate-100"
      data-testid="handoff-screen"
    >
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-[#111A2E] p-6 text-center shadow-2xl landscape-phone:flex landscape-phone:max-w-xl landscape-phone:items-center landscape-phone:justify-between landscape-phone:gap-5 landscape-phone:p-5 landscape-phone:text-left">
        <div className="landscape-phone:flex-1">
          <div className="mb-3 flex items-center justify-center gap-2 landscape-phone:justify-start">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full border"
              style={{
                borderColor: playerColor,
                backgroundColor: `${playerColor}1A`,
              }}
            >
              <EyeOff className="h-4 w-4" style={{ color: playerColor }} aria-hidden="true" />
            </span>
            <span className="inline-flex items-center gap-1.5 font-mono text-xs text-slate-400">
              {isDuel ? (
                <>
                  <span>Раунд {roundNumber}</span>
                  <span
                    className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-bold ${
                      duelMultiplier > 1
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    <Swords className="h-3 w-3" aria-hidden="true" />×
                    {duelMultiplier.toFixed(1)}
                  </span>
                  <span>· {regionName}</span>
                </>
              ) : (
                <span>
                  {roundNumber}/{totalRounds} · {regionName}
                </span>
              )}
            </span>
          </div>

          <h2 className="font-display text-xl font-bold text-white sm:text-2xl">
            {isSecondPlayer ? `Передайте: ${playerName}` : `Ход: ${playerName}`}
          </h2>

          <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-xl border border-slate-800 bg-[#0B1220] p-3 landscape-phone:mt-3">
            {scores.map((s) => {
              const hpPct =
                isDuel && typeof s.hp === 'number'
                  ? Math.max(0, Math.min(100, (s.hp / DUEL_STARTING_HP) * 100))
                  : null;
              return (
                <div key={s.name} className="text-left">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: s.color }}
                      aria-hidden="true"
                    />
                    <span className="truncate">{s.name}</span>
                  </div>
                  {isDuel && typeof s.hp === 'number' && hpPct !== null ? (
                    <>
                      <div className="mt-1 inline-flex items-center gap-1 font-mono text-sm font-bold tabular-nums text-emerald-400">
                        <Heart className="h-3 w-3 fill-current" aria-hidden="true" />
                        <span>{formatScore(s.hp)} HP</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                        <div
                          className={`h-full rounded-full ${
                            hpPct <= 25 ? 'bg-rose-500' : 'bg-emerald-400'
                          }`}
                          style={{ width: `${hpPct}%` }}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="mt-0.5 font-mono text-sm font-bold tabular-nums text-white">
                      {formatScore(s.score)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={onReady}
          className="mt-5 flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 font-display text-sm font-bold text-slate-950 shadow-lg transition-colors hover:bg-amber-400 landscape-phone:mt-0 landscape-phone:w-auto landscape-phone:shrink-0"
        >
          <span>Готов</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
