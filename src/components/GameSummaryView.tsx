import React, { useEffect, useState } from 'react';
import { Home, RotateCcw, Trophy, BarChart3, Heart, Swords, Flame, Target } from 'lucide-react';
import {
  formatDistanceRu,
  formatScore,
  getMedalForScore,
  getMedalMeta,
  getMedalThresholds,
  MAX_ROUND_SCORE,
} from '../game/geoMath';
import type { GameMode, MapLayerType, RoundOutcome } from '../game/types';
import { MedalIcon } from './MedalIcon';
import { RevealMap } from './RevealMap';

interface GameSummaryViewProps {
  mode: GameMode;
  regionName: string;
  outcomes: RoundOutcome[];
  isDuel?: boolean;
  duelPlayers?: Array<{ id: string; name: string; color: string; hp: number }>;
  mapLayer: MapLayerType;
  canRestart: boolean;
  onChangeMapLayer: (layer: MapLayerType) => void;
  onPlayAgain: () => void;
  onReturnToTitle: () => void;
  onOpenStats: () => void;
}

export const GameSummaryView: React.FC<GameSummaryViewProps> = ({
  regionName,
  outcomes,
  isDuel = false,
  duelPlayers,
  mapLayer,
  canRestart,
  onChangeMapLayer,
  onPlayAgain,
  onReturnToTitle,
  onOpenStats,
}) => {
  const [barAnimated, setBarAnimated] = useState(false);

  useEffect(() => {
    setBarAnimated(false);
    const raf = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setBarAnimated(true));
    });
    return () => window.cancelAnimationFrame(raf);
  }, [outcomes.length]);

  const maxPossible = outcomes.length * MAX_ROUND_SCORE;

  // Aggregate per-player totals across all rounds
  const playerMap: Record<
    string,
    {
      playerId: string;
      playerName: string;
      color: string;
      totalScore: number;
      distances: number[];
      bestRound: number;
      maxDamageDealt: number;
    }
  > = {};

  let maxDuelDamageOverall = 0;

  outcomes.forEach((outcome) => {
    if (outcome.duelDamage && outcome.duelDamage.damage > maxDuelDamageOverall) {
      maxDuelDamageOverall = outcome.duelDamage.damage;
    }
    outcome.guesses.forEach((g) => {
      const entry = playerMap[g.playerId] ?? {
        playerId: g.playerId,
        playerName: g.playerName,
        color: g.color,
        totalScore: 0,
        distances: [],
        bestRound: 0,
        maxDamageDealt: 0,
      };
      entry.totalScore += g.score;
      if (g.distanceKm !== null) entry.distances.push(g.distanceKm);
      if (g.score > entry.bestRound) entry.bestRound = g.score;
      if (
        outcome.duelDamage &&
        outcome.duelDamage.winnerPlayerId === g.playerId &&
        outcome.duelDamage.damage > entry.maxDamageDealt
      ) {
        entry.maxDamageDealt = outcome.duelDamage.damage;
      }
      playerMap[g.playerId] = entry;
    });
  });

  const hpByPlayerId = new Map<string, number>();
  if (duelPlayers) {
    for (const dp of duelPlayers) hpByPlayerId.set(dp.id, dp.hp);
  }

  const standings = Object.values(playerMap).sort((a, b) => {
    if (isDuel) {
      const hpDiff = (hpByPlayerId.get(b.playerId) ?? 0) - (hpByPlayerId.get(a.playerId) ?? 0);
      if (hpDiff !== 0) return hpDiff;
    }
    return b.totalScore - a.totalScore;
  });

  const topPlayer = standings[0];
  const isMultiplayer = standings.length > 1;
  const topMedal = topPlayer
    ? getMedalForScore(topPlayer.totalScore, maxPossible)
    : 'none';
  const topMedalMeta = getMedalMeta(topMedal);
  const medalThresholds = getMedalThresholds(maxPossible);
  const topProgressPct =
    topPlayer && maxPossible > 0
      ? Math.max(0, Math.min(100, (topPlayer.totalScore / maxPossible) * 100))
      : 0;

  const allDistances = standings.flatMap((p) => p.distances);
  const matchAvgDist =
    allDistances.length > 0
      ? allDistances.reduce((s, d) => s + d, 0) / allDistances.length
      : null;

  return (
    <div
      className="safe-area-inset flex min-h-[100dvh] w-full flex-col bg-[#0B1220] text-slate-100"
      data-testid="game-summary-view"
    >
      {/* Minimal Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3 sm:px-8 sm:py-4 landscape-phone:py-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 truncate font-display text-lg font-extrabold text-white sm:text-2xl">
            {isDuel && <Swords className="h-5 w-5 shrink-0 text-amber-400" aria-hidden="true" />}
            <span>
              {isDuel && topPlayer
                ? `Победа в дуэли: ${topPlayer.playerName}`
                : isMultiplayer && topPlayer
                  ? `Победитель: ${topPlayer.playerName}`
                  : 'Итоги игры'}
            </span>
          </h2>
          <p className="text-xs text-slate-400">
            {isDuel ? 'Дуэль 1 на 1 · ' : ''}
            {regionName} · {outcomes.length} р.
          </p>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={onOpenStats}
            aria-label="Статистика"
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-800 bg-[#111A2E] px-3 text-xs font-semibold text-slate-200 whitespace-nowrap transition-colors hover:border-amber-500/60 hover:text-amber-300 sm:px-4 sm:text-sm landscape-phone:h-9"
          >
            <BarChart3 className="h-4 w-4 text-amber-400" />
            <span className="hidden sm:inline">Статистика</span>
          </button>
          <button
            type="button"
            onClick={onReturnToTitle}
            aria-label="Меню"
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-800 bg-[#111A2E] px-3 text-xs font-semibold text-slate-200 whitespace-nowrap transition-colors hover:bg-slate-800 sm:px-4 sm:text-sm landscape-phone:h-9"
          >
            <Home className="h-4 w-4" />
            <span className="hidden sm:inline">Меню</span>
          </button>
          {canRestart && (
            <button
              type="button"
              data-start="true"
              onClick={onPlayAgain}
              className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-amber-500 px-4 font-display text-xs font-bold text-slate-950 whitespace-nowrap transition-colors hover:bg-amber-400 sm:px-5 sm:text-sm landscape-phone:h-9"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Ещё раз</span>
            </button>
          )}
        </div>
      </div>

      {/* Content Split: Stacked on Portrait Phone, Side-by-Side on Desktop & Landscape Phone */}
      <div className="mx-auto grid w-full max-w-[1360px] flex-1 grid-cols-1 gap-4 p-3 sm:gap-6 sm:p-6 lg:grid-cols-12 landscape-phone:grid-cols-12 landscape-phone:gap-3 landscape-phone:p-3">
        {/* All-rounds Map */}
        <div className="min-h-[260px] sm:min-h-[360px] lg:col-span-7 lg:min-h-[520px] landscape-phone:col-span-6 landscape-phone:min-h-[260px]">
          <RevealMap
            outcomes={outcomes}
            mapLayer={mapLayer}
            onChangeMapLayer={onChangeMapLayer}
          />
        </div>

        {/* Right Breakdown Column */}
        <div className="flex flex-col gap-3 sm:gap-5 lg:col-span-5 landscape-phone:col-span-6 landscape-phone:gap-2.5">
          {/* Standings / Solo Hero Score & Medals */}
          <div className="rounded-xl border border-slate-800 bg-[#111A2E] p-4 sm:p-5 landscape-phone:p-3">
            {isDuel ? (
              <div className="flex flex-col gap-3.5" data-testid="duel-victory-panel">
                {/* Duel Match KPIs: Rounds, Max Damage, Average Accuracy */}
                <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-800 bg-[#0B1220] p-3 text-center">
                  <div>
                    <div className="text-[11px] text-slate-400">Раундов</div>
                    <div className="mt-0.5 font-mono text-base font-extrabold tabular-nums text-white">
                      {outcomes.length}
                    </div>
                  </div>
                  <div>
                    <div className="inline-flex items-center justify-center gap-1 text-[11px] text-slate-400">
                      <Flame className="h-3 w-3 text-rose-400" aria-hidden="true" />
                      <span>Макс. урон</span>
                    </div>
                    <div className="mt-0.5 font-mono text-base font-extrabold tabular-nums text-rose-400">
                      {formatScore(maxDuelDamageOverall)}
                    </div>
                  </div>
                  <div>
                    <div className="inline-flex items-center justify-center gap-1 text-[11px] text-slate-400">
                      <Target className="h-3 w-3 text-emerald-400" aria-hidden="true" />
                      <span>Ср. точность</span>
                    </div>
                    <div className="mt-0.5 font-mono text-sm font-extrabold tabular-nums text-emerald-400">
                      {formatDistanceRu(matchAvgDist)}
                    </div>
                  </div>
                </div>

                {/* Duelists Standings */}
                <div className="flex flex-col gap-2">
                  {standings.map((player, index) => {
                    const avgDist =
                      player.distances.length > 0
                        ? player.distances.reduce((s, d) => s + d, 0) /
                          player.distances.length
                        : null;
                    const finalHp = hpByPlayerId.get(player.playerId) ?? 0;
                    return (
                      <div
                        key={player.playerId}
                        className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
                          index === 0
                            ? 'border-amber-500/50 bg-amber-500/10'
                            : 'border-slate-800 bg-[#0B1220]'
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="font-mono text-sm font-bold text-slate-400">
                            #{index + 1}
                          </span>
                          <span
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: player.color }}
                            aria-hidden="true"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate font-semibold text-white">
                                {player.playerName}
                              </span>
                              {index === 0 && (
                                <Trophy className="h-4 w-4 shrink-0 text-amber-400" />
                              )}
                            </div>
                            <div className="text-xs text-slate-400 tabular-nums">
                              Точность: {formatDistanceRu(avgDist)}
                              {player.maxDamageDealt > 0
                                ? ` · макс. удар ${formatScore(player.maxDamageDealt)}`
                                : ''}
                            </div>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div
                            className={`inline-flex items-center gap-1 font-mono text-lg font-bold tabular-nums ${
                              finalHp > 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            <Heart className="h-4 w-4 fill-current" aria-hidden="true" />
                            {formatScore(finalHp)} HP
                          </div>
                          <div className="font-mono text-[11px] tabular-nums text-slate-400">
                            {formatScore(player.totalScore)} очков
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : isMultiplayer ? (
              <div className="flex flex-col gap-3">
                <h3 className="font-display text-sm font-bold text-slate-300">
                  Сравнительная таблица и медали
                </h3>
                {standings.map((player, index) => {
                  const avgDist =
                    player.distances.length > 0
                      ? player.distances.reduce((s, d) => s + d, 0) /
                        player.distances.length
                      : null;
                  const playerMedal = getMedalForScore(player.totalScore, maxPossible);
                  return (
                    <div
                      key={player.playerId}
                      className={`flex items-center justify-between gap-3 rounded-lg border px-3.5 py-3 ${
                        index === 0
                          ? 'border-amber-500/50 bg-amber-500/10'
                          : 'border-slate-800 bg-[#0B1220]'
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="font-mono text-sm font-bold text-slate-400">
                          #{index + 1}
                        </span>
                        <span
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: player.color }}
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-semibold text-white">
                              {player.playerName}
                            </span>
                            {index === 0 && (
                              <Trophy className="h-4 w-4 shrink-0 text-amber-400" />
                            )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400 tabular-nums">
                            <span>{formatDistanceRu(avgDist)}</span>
                            <MedalIcon
                              tier={playerMedal}
                              size="xs"
                              showLabel
                              className="text-[11px]"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-mono text-lg font-bold tabular-nums text-amber-400">
                          {formatScore(player.totalScore)}
                        </div>
                        <div className="font-mono text-[11px] tabular-nums text-slate-400">
                          из {formatScore(maxPossible)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : topPlayer ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-medium text-slate-400">
                      Итоговый счёт · {topPlayer.playerName}
                    </div>
                    <div className="mt-1 font-display text-3xl font-extrabold tabular-nums text-amber-400">
                      {formatScore(topPlayer.totalScore)}
                      <span className="ml-1.5 text-base font-medium text-slate-400">
                        / {formatScore(maxPossible)}
                      </span>
                    </div>
                    <div className="mt-1.5 text-xs text-slate-300 tabular-nums">
                      Среднее расстояние:{' '}
                      {formatDistanceRu(
                        topPlayer.distances.length > 0
                          ? topPlayer.distances.reduce((s, d) => s + d, 0) /
                              topPlayer.distances.length
                          : null,
                      )}{' '}
                      · Лучший раунд: {formatScore(topPlayer.bestRound)}
                    </div>
                  </div>
                  <div
                    data-testid="summary-medal-badge"
                    className={`flex shrink-0 flex-col items-center rounded-xl border px-3.5 py-2.5 text-center ${topMedalMeta.borderClass} ${topMedalMeta.bgClass}`}
                  >
                    <MedalIcon tier={topMedal} size="lg" />
                    <span className={`mt-1 text-xs font-bold ${topMedalMeta.textClass}`}>
                      {topMedalMeta.label}
                    </span>
                  </div>
                </div>

                {/* Progress Scale with all 4 Medal Threshold Markers */}
                <div data-testid="medal-progress-scale" className="pt-1">
                  <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{
                        width: barAnimated ? `${topProgressPct}%` : '0%',
                        backgroundColor:
                          topMedal === 'none' ? '#F59E0B' : topMedalMeta.color,
                      }}
                    />
                    {/* Threshold vertical ticks */}
                    {medalThresholds.slice(0, 3).map((th) => (
                      <span
                        key={th.tier}
                        aria-hidden="true"
                        className="absolute inset-y-0 w-0.5 bg-[#0B1220]/90"
                        style={{ left: `${th.percent}%` }}
                      />
                    ))}
                  </div>

                  {/* 4 Medal Labels & Exact Thresholds */}
                  <div className="mt-2.5 grid grid-cols-4 gap-1.5">
                    {medalThresholds.map((th) => {
                      const reached = topPlayer.totalScore >= th.minScore;
                      return (
                        <div
                          key={th.tier}
                          className={`flex flex-col items-center rounded-lg border px-1.5 py-1.5 text-center transition-colors ${
                            reached
                              ? 'border-slate-700 bg-[#0B1220]'
                              : 'border-slate-800/70 bg-[#0B1220]/40 opacity-55'
                          }`}
                        >
                          <MedalIcon tier={th.tier} size="xs" />
                          <span className="mt-0.5 text-[10px] font-semibold text-slate-200">
                            {th.label}
                          </span>
                          <span className="font-mono text-[10px] tabular-nums text-slate-400">
                            {formatScore(th.minScore)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Round-by-Round Table */}
          <div className="flex-1 overflow-hidden rounded-xl border border-slate-800 bg-[#131D31]">
            <div className="border-b border-slate-800 px-4 py-3">
              <h3 className="font-display text-sm font-bold text-slate-200">
                Результаты по раундам ({outcomes.length})
              </h3>
            </div>
            <div className="max-h-[340px] divide-y divide-slate-800/80 overflow-y-auto">
              {outcomes.map((o) => (
                <div key={o.roundIndex} className="px-4 py-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-200">
                      Раунд {o.roundIndex + 1}
                      {o.actual.hintLabel ? ` · ${o.actual.hintLabel}` : ''}
                    </span>
                    {o.duelDamage && o.duelDamage.damage > 0 && (
                      <span className="font-mono text-[11px] font-bold text-rose-400">
                        -{formatScore(o.duelDamage.damage)} HP (×
                        {o.duelDamage.multiplier.toFixed(1)})
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-col gap-1.5">
                    {o.guesses.map((g) => (
                      <div
                        key={g.playerId}
                        className="flex items-center justify-between text-xs tabular-nums"
                      >
                        <span className="flex items-center gap-2 text-slate-300">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: g.color }}
                            aria-hidden="true"
                          />
                          <span>{g.playerName}</span>
                          {g.score >= MAX_ROUND_SCORE && (
                            <span className="rounded border border-cyan-400/50 bg-cyan-400/15 px-1 font-mono text-[10px] font-bold text-cyan-300">
                              5K!
                            </span>
                          )}
                        </span>
                        <span className="font-mono text-slate-400">
                          {formatDistanceRu(g.distanceKm)}
                        </span>
                        <span className="font-mono font-semibold text-amber-300">
                          +{formatScore(g.score)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
