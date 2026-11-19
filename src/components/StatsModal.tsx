import React, { useMemo, useState } from 'react';
import { ArrowLeft, Swords, Trash2, Trophy } from 'lucide-react';
import { formatDistanceRu, formatScore, getMedalForScore } from '../game/geoMath';
import { computeStatsSummary, getDistinctPlayers } from '../game/statsStorage';
import type { MatchRecord } from '../game/types';
import { MedalIcon } from './MedalIcon';

interface StatsModalProps {
  records: MatchRecord[];
  onClose: () => void;
  onClearHistory: () => void;
}

export const StatsModal: React.FC<StatsModalProps> = ({
  records,
  onClose,
  onClearHistory,
}) => {
  const players = useMemo(() => getDistinctPlayers(records), [records]);
  const [selectedPlayer, setSelectedPlayer] = useState<string>('');
  const [confirmClear, setConfirmClear] = useState(false);

  const summary = useMemo(
    () => computeStatsSummary(records, selectedPlayer || undefined),
    [records, selectedPlayer],
  );

  const visibleHistory = useMemo(
    () =>
      selectedPlayer
        ? records.filter((r) => r.playerName === selectedPlayer)
        : records,
    [records, selectedPlayer],
  );

  const modeLabel = (rec: MatchRecord) => {
    if (rec.isDuel) {
      return rec.mode === 'hotseat' ? 'Дуэль (2 игрока)' : 'Дуэль (P2P)';
    }
    if (rec.mode === 'solo') return 'Одиночная';
    if (rec.mode === 'hotseat') return '2 игрока';
    return 'Онлайн';
  };

  const hasDuels = summary.duelWins + summary.duelLosses > 0;

  return (
    <div
      className="safe-area-inset min-h-[100dvh] w-full bg-[#0B1220] px-4 py-5 text-slate-100 sm:px-8 landscape-phone:py-3"
      data-testid="stats-screen"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-800 bg-[#111A2E] px-3.5 text-sm font-semibold text-slate-200 whitespace-nowrap transition-colors hover:border-amber-500/60 hover:text-amber-300"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Назад</span>
            </button>
            <h2 className="font-display text-xl font-extrabold text-white sm:text-2xl">
              Статистика
            </h2>
          </div>

          {records.length > 0 && (
            <div className="flex items-center gap-2">
              {confirmClear ? (
                <>
                  <span className="text-xs text-rose-300">Очистить всю историю?</span>
                  <button
                    type="button"
                    onClick={() => {
                      onClearHistory();
                      setSelectedPlayer('');
                      setConfirmClear(false);
                    }}
                    className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500"
                  >
                    Удалить
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                  >
                    Отмена
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-800 px-3 text-xs font-medium text-slate-400 transition-colors hover:border-rose-500/40 hover:text-rose-300"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Сбросить статистику</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Player Filter Bar */}
        {players.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Фильтр по игроку">
            <button
              type="button"
              onClick={() => setSelectedPlayer('')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                selectedPlayer === ''
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-[#131D31] text-slate-300 hover:bg-slate-800'
              }`}
            >
              Все игроки
            </button>
            {players.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setSelectedPlayer(name)}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                  selectedPlayer === name
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-[#131D31] text-slate-300 hover:bg-slate-800'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        )}

        {records.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-800 bg-[#131D31] px-6 py-16 text-center">
            <Trophy className="mb-3 h-10 w-10 text-slate-600" aria-hidden="true" />
            <h3 className="font-display text-lg font-bold text-slate-200">
              Пока нет завершённых игр
            </h3>
            <p className="mt-1 max-w-md text-sm text-slate-400">
              Сыграйте первую партию в одиночном режиме, вдвоём на одном устройстве или в дуэли по коду — ваши медали, рекорды и статистика дуэлей появятся здесь автоматически.
            </p>
          </div>
        ) : (
          <>
            {/* Unboxed KPI Summary Strip */}
            <div
              className={`grid grid-cols-2 gap-4 rounded-xl border border-slate-800 bg-[#131D31] p-5 ${
                hasDuels ? 'sm:grid-cols-5' : 'sm:grid-cols-4'
              }`}
            >
              <div>
                <div className="text-xs text-slate-400">Сыграно игр</div>
                <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-white">
                  {summary.gamesPlayed}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Лучший счёт</div>
                <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-amber-400">
                  {formatScore(summary.bestScore)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Средний счёт</div>
                <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-100">
                  {formatScore(summary.avgScore)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Средняя ошибка</div>
                <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-emerald-400">
                  {formatDistanceRu(summary.avgDistanceKm)}
                </div>
              </div>
              {hasDuels && (
                <div>
                  <div className="inline-flex items-center gap-1 text-xs text-slate-400">
                    <Swords className="h-3 w-3 text-amber-400" aria-hidden="true" />
                    <span>Дуэли (П / Пр)</span>
                  </div>
                  <div className="mt-1 font-mono text-2xl font-bold tabular-nums">
                    <span className="text-emerald-400">{summary.duelWins}</span>
                    <span className="mx-1 text-slate-500">/</span>
                    <span className="text-rose-400">{summary.duelLosses}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Explorer Mode Regional Breakdown with Best Medals */}
            {summary.regionBreakdown.length > 0 && (
              <section>
                <h3 className="mb-3 font-display text-sm font-bold text-slate-200">
                  Медали и рекорды по регионам и странам
                </h3>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {summary.regionBreakdown.map((reg) => (
                    <div
                      key={reg.regionId}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-[#131D31] px-4 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <MedalIcon tier={reg.bestMedal} size="md" />
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-white">
                            {reg.regionName}
                          </div>
                          <div className="text-xs text-slate-400 tabular-nums">
                            Игр: {reg.games} · Средний: {formatScore(reg.avgScore)}
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-mono text-base font-bold tabular-nums text-amber-400">
                          {formatScore(reg.bestScore)}
                        </div>
                        <div className="text-[11px] text-slate-500">рекорд</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Recent Matches Table */}
            <section className="overflow-hidden rounded-xl border border-slate-800 bg-[#131D31]">
              <div className="border-b border-slate-800 px-4 py-3">
                <h3 className="font-display text-sm font-bold text-slate-200">
                  История матчей ({visibleHistory.length})
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 bg-[#0B1220]/70 text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Дата</th>
                      <th className="px-4 py-2.5 font-medium">Игрок</th>
                      <th className="px-4 py-2.5 font-medium">Карта</th>
                      <th className="px-4 py-2.5 font-medium">Режим</th>
                      <th className="px-4 py-2.5 font-medium">Награда</th>
                      <th className="px-4 py-2.5 font-medium text-right">Ср. ошибка</th>
                      <th className="px-4 py-2.5 font-medium text-right">Очки</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {visibleHistory.slice(0, 30).map((rec) => {
                      const recMedal = rec.isDuel
                        ? 'none'
                        : rec.medal ??
                          getMedalForScore(rec.totalScore, rec.maxPossibleScore);
                      return (
                        <tr key={rec.id} className="hover:bg-slate-800/35">
                          <td className="px-4 py-2.5 whitespace-nowrap text-slate-400 tabular-nums">
                            {new Date(rec.timestamp).toLocaleDateString('ru-RU', {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="px-4 py-2.5 font-semibold text-white">
                            {rec.playerName}
                            {rec.won ? ' ★' : ''}
                          </td>
                          <td className="px-4 py-2.5 text-slate-300">{rec.regionName}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-slate-400">
                            {modeLabel(rec)} · {rec.totalRounds}р
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            {rec.isDuel ? (
                              <span
                                className={`inline-flex items-center gap-1 font-semibold ${
                                  rec.won ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                <Swords className="h-3 w-3" aria-hidden="true" />
                                {rec.won ? 'Победа' : 'Поражение'}
                              </span>
                            ) : (
                              <MedalIcon
                                tier={recMedal}
                                size="xs"
                                showLabel
                                className="text-xs"
                              />
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-300">
                            {formatDistanceRu(rec.avgDistanceKm)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold tabular-nums text-amber-400">
                            {formatScore(rec.totalScore)}
                            <span className="font-normal text-slate-500">
                              /{formatScore(rec.maxPossibleScore)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
};
