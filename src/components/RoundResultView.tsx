import React, { useEffect, useState } from 'react';
import { ArrowRight, Heart, MapPin, Sparkles, Swords, Trophy } from 'lucide-react';
import { formatDistanceRu, formatScore, MAX_ROUND_SCORE } from '../game/geoMath';
import { DUEL_STARTING_HP } from '../game/roomState';
import type { MapLayerType, RoundOutcome } from '../game/types';
import { RevealMap } from './RevealMap';

interface RoundResultViewProps {
  outcome: RoundOutcome;
  totalRounds: number;
  regionName: string;
  cumulativeScores: Record<string, number>;
  isDuel?: boolean;
  duelFinished?: boolean;
  mapLayer: MapLayerType;
  canAdvance: boolean;
  waitingForHostLabel?: string;
  onChangeMapLayer: (layer: MapLayerType) => void;
  onNextRound: () => void;
}

export const RoundResultView: React.FC<RoundResultViewProps> = ({
  outcome,
  totalRounds,
  regionName,
  cumulativeScores,
  isDuel = false,
  duelFinished = false,
  mapLayer,
  canAdvance,
  waitingForHostLabel,
  onChangeMapLayer,
  onNextRound,
}) => {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    setAnimated(false);
    const raf = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setAnimated(true));
    });
    return () => window.cancelAnimationFrame(raf);
  }, [outcome.roundIndex]);

  const isLastRound = isDuel ? duelFinished : outcome.roundIndex + 1 >= totalRounds;
  const sortedGuesses = [...outcome.guesses].sort((a, b) => b.score - a.score);
  const isSolo = outcome.guesses.length === 1;
  const soloGuess = sortedGuesses[0];
  const duelDamage = outcome.duelDamage;

  return (
    <div
      className="safe-area-inset flex h-full w-full flex-col overflow-hidden bg-[#0B1220] text-slate-100"
      data-testid="round-result-view"
    >
      {/* Slim Top Strip */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-800 px-4 py-2.5 landscape-phone:py-1.5">
        <div className="flex min-w-0 items-center gap-2 text-xs sm:text-sm">
          <span className="shrink-0 font-mono font-bold text-white">
            {isDuel ? `Раунд ${outcome.roundIndex + 1}` : `${outcome.roundIndex + 1}/${totalRounds}`}
          </span>
          {duelDamage && (
            <>
              <span className="text-slate-600" aria-hidden="true">
                ·
              </span>
              <span
                className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-mono text-xs font-bold ${
                  duelDamage.multiplier > 1
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                <Swords className="h-3 w-3" aria-hidden="true" />
                <span>×{duelDamage.multiplier.toFixed(1)}</span>
              </span>
            </>
          )}
          <span className="text-slate-600" aria-hidden="true">
            ·
          </span>
          <span className="shrink-0 text-slate-300">{regionName}</span>
          {outcome.actual.hintLabel && (
            <>
              <span className="text-slate-600" aria-hidden="true">
                ·
              </span>
              <span className="inline-flex min-w-0 items-center gap-1 truncate font-medium text-emerald-400">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{outcome.actual.hintLabel}</span>
              </span>
            </>
          )}
        </div>
      </div>

      {/* Main Content: Vertical stack on Portrait/Desktop, Side-by-Side on Landscape Phone */}
      <div className="flex min-h-0 flex-1 flex-col landscape-phone:flex-row">
        {/* Reveal Map */}
        <div className="min-h-0 flex-1 p-2.5 sm:p-4 landscape-phone:p-2">
          <RevealMap
            outcomes={[outcome]}
            mapLayer={mapLayer}
            onChangeMapLayer={onChangeMapLayer}
          />
        </div>

        {/* Score Dock (Bottom on Portrait/Desktop, Right Sidebar on Landscape Phone) */}
        <div className="shrink-0 border-t border-slate-800 bg-[#111A2E] px-4 py-3.5 sm:px-8 sm:py-4 landscape-phone:flex landscape-phone:w-[276px] landscape-phone:flex-col landscape-phone:justify-between landscape-phone:border-t-0 landscape-phone:border-l landscape-phone:p-3">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 landscape-phone:h-full landscape-phone:justify-between">
            {isSolo && soloGuess ? (
              <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between landscape-phone:flex-col landscape-phone:items-stretch">
                <div className="w-full max-w-md flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-2xl font-extrabold tabular-nums text-amber-400">
                        +{formatScore(soloGuess.score)}
                      </span>
                      <span className="font-mono text-xs text-slate-500">
                        / {formatScore(MAX_ROUND_SCORE)}
                      </span>
                      {soloGuess.score >= MAX_ROUND_SCORE && (
                        <span
                          data-testid="perfect-5k-badge"
                          className="animate-perfect-pop inline-flex items-center gap-1 rounded-md border border-cyan-400/50 bg-cyan-400/15 px-2 py-0.5 font-mono text-xs font-extrabold text-cyan-300"
                        >
                          <Sparkles className="h-3 w-3" aria-hidden="true" />
                          5K!
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-sm font-semibold tabular-nums text-slate-200">
                      {formatDistanceRu(soloGuess.distanceKm)}
                    </span>
                  </div>
                  <div
                    className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-800"
                    role="progressbar"
                    aria-valuenow={soloGuess.score}
                    aria-valuemin={0}
                    aria-valuemax={MAX_ROUND_SCORE}
                  >
                    <div
                      className={`h-full rounded-full transition-all duration-700 ease-out ${
                        soloGuess.score >= MAX_ROUND_SCORE
                          ? 'bg-cyan-400'
                          : 'bg-amber-400'
                      }`}
                      style={{
                        width: animated
                          ? `${Math.min(100, (soloGuess.score / MAX_ROUND_SCORE) * 100)}%`
                          : '0%',
                      }}
                    />
                  </div>
                  <p className="mt-1.5 font-mono text-xs tabular-nums text-slate-400">
                    Всего: {formatScore(cumulativeScores[soloGuess.playerId] ?? soloGuess.score)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onNextRound}
                  className="inline-flex h-12 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 font-display text-sm font-bold text-slate-950 whitespace-nowrap transition-colors hover:bg-amber-400 landscape-phone:h-11 landscape-phone:w-full"
                >
                  <span>{isLastRound ? 'Итоги' : 'Дальше'}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col gap-2.5 landscape-phone:h-full landscape-phone:justify-between">
                <div className="grid max-h-[172px] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3 landscape-phone:min-h-0 landscape-phone:max-h-none landscape-phone:flex-1 landscape-phone:grid-cols-1">
                  {sortedGuesses.map((g, idx) => {
                    const remainingHp = duelDamage?.hpAfter[g.playerId];
                    const beforeHp =
                      duelDamage?.hpBefore?.[g.playerId] ??
                      (typeof remainingHp === 'number'
                        ? Math.min(
                            DUEL_STARTING_HP,
                            remainingHp +
                              (duelDamage?.loserPlayerId === g.playerId
                                ? duelDamage.damage
                                : 0),
                          )
                        : undefined);
                    const tookDamage =
                      duelDamage && duelDamage.loserPlayerId === g.playerId
                        ? duelDamage.damage
                        : 0;
                    const hpAfterPct =
                      typeof remainingHp === 'number'
                        ? Math.max(0, Math.min(100, (remainingHp / DUEL_STARTING_HP) * 100))
                        : null;
                    const hpBeforePct =
                      typeof beforeHp === 'number'
                        ? Math.max(0, Math.min(100, (beforeHp / DUEL_STARTING_HP) * 100))
                        : hpAfterPct;
                    const scorePct = Math.min(100, (g.score / MAX_ROUND_SCORE) * 100);

                    return (
                      <div
                        key={g.playerId}
                        className={`flex flex-col gap-1.5 rounded-lg border bg-[#0B1220] px-3 py-2 ${
                          tookDamage > 0 ? 'border-rose-500/40' : 'border-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2.5">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: g.color }}
                                aria-hidden="true"
                              />
                              <span className="truncate text-sm font-semibold text-white">
                                {g.playerName}
                              </span>
                              {idx === 0 && g.score > 0 && (
                                <Trophy
                                  className="h-3.5 w-3.5 shrink-0 text-amber-400"
                                  aria-hidden="true"
                                />
                              )}
                              {g.score >= MAX_ROUND_SCORE && (
                                <span className="animate-perfect-pop rounded border border-cyan-400/50 bg-cyan-400/15 px-1.5 py-0.2 font-mono text-[10px] font-extrabold text-cyan-300">
                                  5K!
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-400">
                              {formatDistanceRu(g.distanceKm)}
                              {!duelDamage &&
                                ` · ${formatScore(cumulativeScores[g.playerId] ?? g.score)}`}
                            </div>
                          </div>
                          <div className="shrink-0 text-right font-mono">
                            <div className="text-sm font-bold tabular-nums text-amber-400">
                              +{formatScore(g.score)}
                            </div>
                            {tookDamage > 0 && (
                              <div
                                data-testid="duel-damage-delta"
                                className="animate-duel-damage text-xs font-extrabold tabular-nums text-rose-400"
                              >
                                -{formatScore(tookDamage)} HP
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Animated Score Bar (0-5000) for non-duel, or Animated HP Drain Bar for Duel */}
                        {hpAfterPct !== null && typeof remainingHp === 'number' ? (
                          <div className="flex items-center gap-2">
                            <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                              {/* Rose damage trail */}
                              {tookDamage > 0 && hpBeforePct !== null && (
                                <div
                                  className="absolute inset-y-0 left-0 rounded-full bg-rose-500/45 transition-all duration-1000 ease-out"
                                  style={{
                                    width: `${hpBeforePct}%`,
                                  }}
                                />
                              )}
                              {/* Active remaining HP bar animating from before -> after */}
                              <div
                                className={`relative h-full rounded-full transition-all duration-700 ease-out ${
                                  hpAfterPct <= 25 ? 'bg-rose-500' : 'bg-emerald-400'
                                }`}
                                style={{
                                  width: `${animated ? hpAfterPct : (hpBeforePct ?? hpAfterPct)}%`,
                                }}
                              />
                            </div>
                            <span
                              className={`inline-flex items-center gap-1 font-mono text-[11px] font-bold tabular-nums ${
                                hpAfterPct <= 25 ? 'text-rose-400' : 'text-emerald-400'
                              }`}
                            >
                              <Heart className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
                              {formatScore(remainingHp)}
                            </span>
                          </div>
                        ) : (
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                            <div
                              className={`h-full rounded-full transition-all duration-700 ease-out ${
                                g.score >= MAX_ROUND_SCORE
                                  ? 'bg-cyan-400'
                                  : 'bg-amber-400'
                              }`}
                              style={{ width: animated ? `${scorePct}%` : '0%' }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-end landscape-phone:block">
                  {canAdvance ? (
                    <button
                      type="button"
                      onClick={onNextRound}
                      className="inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 font-display text-sm font-bold text-slate-950 whitespace-nowrap transition-colors hover:bg-amber-400 sm:w-auto landscape-phone:h-10 landscape-phone:w-full"
                    >
                      <span>
                        {isLastRound
                          ? isDuel
                            ? 'Итоги дуэли'
                            : 'Итоги'
                          : 'Дальше'}
                      </span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">
                      {waitingForHostLabel || 'Ожидание хоста...'}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
