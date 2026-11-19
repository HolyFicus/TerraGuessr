import React from 'react';
import { Home, RotateCcw, Trophy, BarChart3 } from 'lucide-react';
import {
  formatDistanceRu,
  formatScore,
  getAccuracyGrade,
  MAX_ROUND_SCORE,
} from '../game/geoMath';
import type { GameMode, MapLayerType, RoundOutcome } from '../game/types';
import { RevealMap } from './RevealMap';

interface GameSummaryViewProps {
  mode: GameMode;
  regionName: string;
  outcomes: RoundOutcome[];
  mapLayer: MapLayerType;
  canRestart: boolean;
  onChangeMapLayer: (layer: MapLayerType) => void;
  onPlayAgain: () => void;
  onReturnToTitle: () => void;
  onOpenStats: () => void;
}

export const GameSummaryView: React.FC<GameSummaryViewProps> = ({
  mode,
  regionName,
  outcomes,
  mapLayer,
  canRestart,
  onChangeMapLayer,
  onPlayAgain,
  onReturnToTitle,
  onOpenStats,
}) => {
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
    }
  > = {};

  outcomes.forEach((outcome) => {
    outcome.guesses.forEach((g) => {
      const entry = playerMap[g.playerId] ?? {
        playerId: g.playerId,
        playerName: g.playerName,
        color: g.color,
        totalScore: 0,
        distances: [],
        bestRound: 0,
      };
      entry.totalScore += g.score;
      if (g.distanceKm !== null) entry.distances.push(g.distanceKm);
      if (g.score > entry.bestRound) entry.bestRound = g.score;
      playerMap[g.playerId] = entry;
    });
  });

  const standings = Object.values(playerMap).sort(
    (a, b) => b.totalScore - a.totalScore,
  );
  const topPlayer = standings[0];
  const isMultiplayer = standings.length > 1;
  const grade = topPlayer
    ? getAccuracyGrade(topPlayer.totalScore, maxPossible)
    : { grade: 'D' as const, label: 'Завершено' };

  return (
    <div
      className="safe-area-inset flex min-h-[100dvh] w-full flex-col bg-[#0B1220] text-slate-100"
      data-testid="game-summary-view"
    >
      {/* Minimal Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3 sm:px-8 sm:py-4 landscape-phone:py-2">
        <div className="min-w-0">
          <h2 className="truncate font-display text-lg font-extrabold text-white sm:text-2xl">
            {isMultiplayer && topPlayer ? topPlayer.playerName : 'Итоги'}
          </h2>
          <p className="text-xs text-slate-400">
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
          {/* Standings / Solo Hero Score */}
          <div className="rounded-xl border border-slate-800 bg-[#111A2E] p-4 sm:p-5 landscape-phone:p-3">
            {isMultiplayer ? (
              <div className="flex flex-col gap-3">
                <h3 className="font-display text-sm font-bold text-slate-300">
                  Итоговая таблица игроков
                </h3>
                {standings.map((player, index) => {
                  const avgDist =
                    player.distances.length > 0
                      ? player.distances.reduce((s, d) => s + d, 0) /
                        player.distances.length
                      : null;
                  return (
                    <div
                      key={player.playerId}
                      className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
                        index === 0
                          ? 'border-amber-500/50 bg-amber-500/10'
                          : 'border-slate-800 bg-[#0B1220]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
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
                            Средняя ошибка: {formatDistanceRu(avgDist)}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
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
                <div className="flex flex-col items-center rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-center">
                  <span className="font-display text-3xl font-extrabold text-amber-400">
                    {grade.grade}
                  </span>
                  <span className="text-[11px] text-slate-300">{grade.label}</span>
                </div>
              </div>
            ) : null}
          </div>

          {/* Round-by-Round Table */}
          <div className="flex-1 overflow-hidden rounded-xl border border-slate-800 bg-[#131D31]">
            <div className="border-b border-slate-800 px-4 py-3">
              <h3 className="font-display text-sm font-bold text-slate-200">
                Результаты по раундам
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
                          {g.playerName}
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
