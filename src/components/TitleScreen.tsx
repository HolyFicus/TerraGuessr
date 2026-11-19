import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Globe2,
  Play,
  Swords,
  Users,
  Radio,
  ArrowRight,
  Clock,
  KeyRound,
  Check,
  X,
  Layers,
} from 'lucide-react';
import { formatScore, MAX_ROUND_SCORE, MAX_ROUNDS, MIN_ROUNDS } from '../game/geoMath';
import { REGIONS, getRegionById } from '../game/regions';
import { normalizeInviteCode } from '../game/roomState';
import type {
  GameMode,
  GameSettings,
  MovementMode,
  OnlineFormat,
  RegionMedalRecord,
} from '../game/types';
import { MedalIcon } from './MedalIcon';

interface TitleScreenProps {
  settings: GameSettings;
  totalGamesPlayed: number;
  regionMedals: Map<string, RegionMedalRecord>;
  joinCodeInitial: string;
  multiplayerError: string | null;
  hasEnvMapsKey: boolean;
  savedCustomApiKey: string;
  apiKeySessionOnly: boolean;
  openKeyPanelSignal?: number;
  onSaveCustomApiKey: (key: string, sessionOnly: boolean) => void;
  onUpdateSettings: (patch: Partial<GameSettings>) => void;
  onStartLocalGame: () => void;
  onCreateOnlineRoom: (hostName: string) => void;
  onJoinOnlineRoom: (code: string, playerName: string) => void;
  onOpenStats: () => void;
}

function pluralRoundsRu(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'раунд';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'раунда';
  return 'раундов';
}

const ROUND_OPTIONS = Array.from(
  { length: MAX_ROUNDS - MIN_ROUNDS + 1 },
  (_, i) => MIN_ROUNDS + i,
);

/**
 * Pure abstract minimalist cartographic background:
 * hairline orbital rings, subtle meridian arcs, fine coordinate ticks,
 * and low-contrast ambient gradients. Scales cleanly across portrait,
 * landscape mobile, and desktop viewports.
 */
const AbstractMinimalBackground: React.FC = () => (
  <div
    className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#0B1220]"
    aria-hidden="true"
  >
    {/* Subtle ambient radial gradients */}
    <div
      className="absolute -top-32 -right-32 h-[540px] w-[540px] rounded-full opacity-70"
      style={{
        background:
          'radial-gradient(circle, rgba(245, 158, 11, 0.085) 0%, rgba(245, 158, 11, 0) 68%)',
      }}
    />
    <div
      className="absolute -bottom-40 -left-32 h-[520px] w-[520px] rounded-full opacity-70"
      style={{
        background:
          'radial-gradient(circle, rgba(56, 189, 248, 0.07) 0%, rgba(56, 189, 248, 0) 68%)',
      }}
    />

    {/* Abstract geometric SVG layer */}
    <svg
      className="h-full w-full"
      viewBox="0 0 1440 900"
      fill="none"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Fine geometric grid hairlines */}
      <g stroke="#94A3B8" strokeOpacity="0.045" strokeWidth="1">
        <line x1="240" y1="0" x2="240" y2="900" />
        <line x1="720" y1="0" x2="720" y2="900" />
        <line x1="1200" y1="0" x2="1200" y2="900" />
        <line x1="0" y1="225" x2="1440" y2="225" />
        <line x1="0" y1="450" x2="1440" y2="450" />
        <line x1="0" y1="675" x2="1440" y2="675" />
      </g>

      {/* Large minimalist orbital & meridian arcs on the right */}
      <g transform="translate(1060 440)">
        <circle r="390" stroke="#94A3B8" strokeOpacity="0.09" strokeWidth="1" />
        <circle
          r="285"
          stroke="#F59E0B"
          strokeOpacity="0.14"
          strokeWidth="1"
          strokeDasharray="4 10"
        />
        <circle r="175" stroke="#94A3B8" strokeOpacity="0.08" strokeWidth="1" />
        <ellipse
          rx="390"
          ry="135"
          transform="rotate(-24)"
          stroke="#94A3B8"
          strokeOpacity="0.08"
          strokeWidth="1"
        />
        <ellipse
          rx="390"
          ry="190"
          transform="rotate(32)"
          stroke="#38BDF8"
          strokeOpacity="0.07"
          strokeWidth="1"
        />
        {/* Minimal geometric anchor dots */}
        <circle cx="-248" cy="-142" r="3" fill="#F59E0B" fillOpacity="0.45" />
        <circle cx="196" cy="208" r="2.5" fill="#38BDF8" fillOpacity="0.4" />
        <circle cx="285" cy="0" r="2.5" fill="#F8FAFC" fillOpacity="0.28" />
      </g>

      {/* Soft abstract contour curves bottom-left */}
      <path
        d="M-80 760C160 660 360 720 620 620C840 535 1040 580 1520 440"
        stroke="#94A3B8"
        strokeOpacity="0.07"
        strokeWidth="1"
      />
      <path
        d="M-80 830C210 730 430 790 690 690C910 605 1120 645 1520 520"
        stroke="#F59E0B"
        strokeOpacity="0.06"
        strokeWidth="1"
      />

      {/* Minimal crosshair accents */}
      <g stroke="#94A3B8" strokeOpacity="0.2" strokeWidth="1">
        <path d="M235 225H245M240 220V230" />
        <path d="M715 675H725M720 670V680" />
        <path d="M1195 225H1205M1200 220V230" />
      </g>
    </svg>
  </div>
);

export const TitleScreen: React.FC<TitleScreenProps> = ({
  settings,
  totalGamesPlayed,
  regionMedals,
  joinCodeInitial,
  multiplayerError,
  hasEnvMapsKey,
  savedCustomApiKey,
  apiKeySessionOnly,
  openKeyPanelSignal = 0,
  onSaveCustomApiKey,
  onUpdateSettings,
  onStartLocalGame,
  onCreateOnlineRoom,
  onJoinOnlineRoom,
  onOpenStats,
}) => {
  const [regionTab, setRegionTab] = useState<'region' | 'country'>('region');
  const [inviteInput, setInviteInput] = useState(joinCodeInitial);
  const [apiKeyInput, setApiKeyInput] = useState(savedCustomApiKey);
  const [sessionOnlyInput, setSessionOnlyInput] = useState(apiKeySessionOnly);
  const [apiKeySavedToast, setApiKeySavedToast] = useState(false);
  const [showKeyPanel, setShowKeyPanel] = useState(!hasEnvMapsKey && !savedCustomApiKey);
  const [onlineActionError, setOnlineActionError] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setApiKeyInput(savedCustomApiKey);
  }, [savedCustomApiKey]);

  useEffect(() => {
    setSessionOnlyInput(apiKeySessionOnly);
  }, [apiKeySessionOnly]);

  useEffect(() => {
    if (openKeyPanelSignal > 0) {
      setShowKeyPanel(true);
    }
  }, [openKeyPanelSignal]);

  const selectedRegion = getRegionById(settings.regionId);
  const filteredRegions = REGIONS.filter((r) => r.category === regionTab);

  const player1Name = settings.playerNames[0] ?? 'Игрок 1';
  const player2Name = settings.playerNames[1] ?? 'Игрок 2';

  const isDuelSelected =
    (settings.mode === 'hotseat' && settings.hotseatFormat === 'duel') ||
    (settings.mode === 'multiplayer' && settings.onlineFormat === 'duel');

  const setPlayerName = (index: number, value: string) => {
    const next = [...settings.playerNames];
    next[index] = value;
    onUpdateSettings({ playerNames: next });
    setLocalError(null);
    setOnlineActionError(null);
  };

  const handleModeChange = (mode: GameMode) => {
    onUpdateSettings({ mode });
    setLocalError(null);
    setOnlineActionError(null);
  };

  const handleSaveApiKey = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveCustomApiKey(apiKeyInput.trim(), sessionOnlyInput);
    setApiKeySavedToast(true);
    window.setTimeout(() => setApiKeySavedToast(false), 1800);
  };

  const handlePrimaryStart = () => {
    if (settings.mode === 'solo') {
      if (!player1Name.trim()) {
        setLocalError('Введите имя игрока');
        return;
      }
      onStartLocalGame();
      return;
    }

    if (settings.mode === 'hotseat') {
      if (!player1Name.trim() || !player2Name.trim()) {
        setLocalError('Введите имена обоих игроков');
        return;
      }
      if (player1Name.trim().toLowerCase() === player2Name.trim().toLowerCase()) {
        setLocalError('Имена игроков должны различаться');
        return;
      }
      onStartLocalGame();
      return;
    }

    if (!player1Name.trim()) {
      setOnlineActionError('Введите имя');
      return;
    }
    onCreateOnlineRoom(player1Name.trim());
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = normalizeInviteCode(inviteInput);
    if (!code || code.length < 8) {
      setOnlineActionError('Неверный код (пример: GEO-7K4M9P)');
      return;
    }
    if (!player1Name.trim()) {
      setOnlineActionError('Введите имя');
      return;
    }
    setOnlineActionError(null);
    onJoinOnlineRoom(code, player1Name.trim());
  };

  const modeTabs: Array<{ id: GameMode; label: string; icon: React.ReactNode }> = [
    { id: 'solo', label: 'Соло', icon: <Globe2 className="h-4 w-4 shrink-0" /> },
    { id: 'hotseat', label: '2 игрока', icon: <Users className="h-4 w-4 shrink-0" /> },
    { id: 'multiplayer', label: 'По коду', icon: <Radio className="h-4 w-4 shrink-0" /> },
  ];

  const movementModes: Array<{ id: MovementMode; label: string }> = [
    { id: 'moving', label: 'Moving' },
    { id: 'no_move', label: 'No Move' },
    { id: 'nmpz', label: 'NMPZ' },
  ];

  const timerOptions = [
    { value: 0, label: '∞' },
    { value: 30, label: '30с' },
    { value: 60, label: '60с' },
    { value: 120, label: '2м' },
    { value: 180, label: '3м' },
  ];

  const activeMapsReady = hasEnvMapsKey || Boolean(savedCustomApiKey);

  const formatButtons: Array<{
    id: OnlineFormat;
    label: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'duel',
      label: 'Дуэль 1×1 · 6000 HP',
      icon: <Swords className="h-3.5 w-3.5 shrink-0" />,
    },
    {
      id: 'classic',
      label: `Очки · ${settings.totalRounds} р.`,
      icon: <Users className="h-3.5 w-3.5 shrink-0" />,
    },
  ];

  return (
    <div className="safe-area-inset relative flex min-h-[100dvh] w-full flex-col overflow-x-hidden bg-[#0B1220] text-slate-100">
      <AbstractMinimalBackground />

      <main className="relative z-10 mx-auto flex w-full max-w-[1140px] flex-1 flex-col justify-between px-4 py-4 sm:px-8 sm:py-7 landscape-phone:px-5 landscape-phone:py-2.5">
        {/* Minimal Top Bar */}
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <svg
              width="32"
              height="32"
              viewBox="0 0 42 42"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
              className="h-8 w-8 shrink-0 landscape-phone:h-7 landscape-phone:w-7"
            >
              <circle
                cx="21"
                cy="21"
                r="18.5"
                stroke="#F59E0B"
                strokeWidth="1.5"
                strokeOpacity="0.85"
              />
              <path
                d="M21 6.5L23.8 18.2L35.5 21L23.8 23.8L21 35.5L18.2 23.8L6.5 21L18.2 18.2L21 6.5Z"
                fill="#F59E0B"
                fillOpacity="0.16"
                stroke="#F59E0B"
                strokeWidth="1.35"
                strokeLinejoin="round"
              />
              <circle cx="21" cy="21" r="2.4" fill="#F8FAFC" />
            </svg>
            <h1 className="font-display text-xl font-bold tracking-tight text-white whitespace-nowrap sm:text-2xl landscape-phone:text-lg">
              TerraSpotter
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowKeyPanel((v) => !v)}
              aria-expanded={showKeyPanel}
              aria-label="API-ключ Maps"
              title="API-ключ Google Maps"
              className={`inline-flex h-10 min-w-[40px] items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-medium whitespace-nowrap transition-colors landscape-phone:h-8 landscape-phone:min-w-[36px] ${
                !activeMapsReady || showKeyPanel
                  ? 'border-amber-500/60 bg-amber-500/10 text-amber-300'
                  : 'border-slate-800 bg-[#111A2E]/85 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              <KeyRound className="h-4 w-4 shrink-0" aria-hidden="true" />
              {!activeMapsReady && <span>API</span>}
            </button>

            <button
              type="button"
              onClick={onOpenStats}
              aria-label="Статистика"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-800 bg-[#111A2E]/85 px-3.5 text-xs font-semibold text-slate-200 whitespace-nowrap transition-colors hover:border-slate-700 hover:text-white landscape-phone:h-8 landscape-phone:px-3"
            >
              <BarChart3 className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
              <span>Статистика</span>
              {totalGamesPlayed > 0 && (
                <span className="font-mono text-[11px] tabular-nums text-slate-400">
                  {totalGamesPlayed}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* Optional API Key Bar */}
        {showKeyPanel && (
          <form
            onSubmit={handleSaveApiKey}
            autoComplete="off"
            className="mt-3 flex flex-col gap-2 rounded-xl border border-slate-800 bg-[#111A2E]/95 p-3 landscape-phone:mt-2 landscape-phone:p-2"
          >
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="gmaps-api-key-input"
                aria-label="GOOGLE_MAPS_API_KEY"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="GOOGLE_MAPS_API_KEY"
                className="h-10 min-w-[180px] flex-1 rounded-lg border border-slate-700/80 bg-[#0B1220] px-3 font-mono text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none landscape-phone:h-8"
              />
              <button
                type="submit"
                className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 text-xs font-bold text-slate-950 whitespace-nowrap hover:bg-amber-400 landscape-phone:h-8"
              >
                {apiKeySavedToast ? <Check className="h-3.5 w-3.5" /> : <span>OK</span>}
              </button>
              {savedCustomApiKey && (
                <button
                  type="button"
                  onClick={() => {
                    setApiKeyInput('');
                    onSaveCustomApiKey('', sessionOnlyInput);
                  }}
                  className="h-10 cursor-pointer rounded-lg border border-slate-700 px-3 text-xs text-slate-300 hover:bg-slate-800 landscape-phone:h-8"
                >
                  Сброс
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowKeyPanel(false)}
                aria-label="Закрыть панель API-ключа"
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white landscape-phone:h-8 landscape-phone:w-8"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
              <label className="inline-flex cursor-pointer items-center gap-1.5 select-none">
                <input
                  type="checkbox"
                  checked={sessionOnlyInput}
                  onChange={(e) => setSessionOnlyInput(e.target.checked)}
                  className="h-3.5 w-3.5 accent-amber-500"
                />
                <span>Хранить только до закрытия вкладки</span>
              </label>
              <span>Ограничьте ключ по HTTP Referrer в Google Cloud Console</span>
            </div>
          </form>
        )}

        {/* Main Minimalist Workspace — 1-col Portrait Phone, 2-col Desktop & Landscape Phone */}
        <div className="my-auto grid grid-cols-1 items-start gap-4 py-4 sm:gap-6 sm:py-8 lg:grid-cols-12 lg:items-center lg:gap-10 landscape-phone:grid-cols-12 landscape-phone:items-stretch landscape-phone:gap-4 landscape-phone:py-2">
          {/* Controls Column */}
          <section className="flex flex-col gap-3 sm:gap-4 lg:col-span-5 landscape-phone:col-span-6 landscape-phone:gap-2">
            {/* Mode Switcher */}
            <div
              role="tablist"
              aria-label="Режим игры"
              className="grid grid-cols-3 gap-1 rounded-xl border border-slate-800/90 bg-[#111A2E]/90 p-1"
            >
              {modeTabs.map((tab) => {
                const active = settings.mode === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => handleModeChange(tab.id)}
                    className={`flex h-11 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold whitespace-nowrap transition-colors sm:text-sm landscape-phone:h-9 ${
                      active
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                    }`}
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Compact Setup Surface */}
            <div className="flex flex-col gap-3 rounded-xl border border-slate-800/90 bg-[#111A2E]/88 p-3.5 sm:p-4 landscape-phone:gap-2 landscape-phone:p-2.5">
              {/* Player Name(s) */}
              {settings.mode === 'solo' && (
                <input
                  id="solo-player-name"
                  aria-label="Имя игрока"
                  type="text"
                  maxLength={24}
                  value={player1Name}
                  onChange={(e) => setPlayerName(0, e.target.value)}
                  placeholder="Имя игрока"
                  className="h-11 w-full rounded-lg border border-slate-800 bg-[#0B1220] px-3.5 text-sm text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none landscape-phone:h-9"
                />
              )}

              {settings.mode === 'hotseat' && (
                <div className="flex flex-col gap-2">
                  {/* Hotseat Duel vs Classic Format Switcher */}
                  <div
                    role="group"
                    aria-label="Формат игры на одном устройстве"
                    className="grid grid-cols-2 gap-1 rounded-lg bg-[#0B1220] p-1"
                  >
                    {formatButtons.map((fmt) => {
                      const active = settings.hotseatFormat === fmt.id;
                      return (
                        <button
                          key={fmt.id}
                          type="button"
                          onClick={() => onUpdateSettings({ hotseatFormat: fmt.id })}
                          className={`inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 text-xs font-semibold whitespace-nowrap transition-colors landscape-phone:h-8 ${
                            active
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {fmt.icon}
                          <span>{fmt.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative flex items-center">
                      <span
                        className="pointer-events-none absolute left-3 h-2 w-2 rounded-full bg-amber-400"
                        aria-hidden="true"
                      />
                      <input
                        id="p1-name"
                        aria-label="Игрок 1"
                        type="text"
                        maxLength={24}
                        value={player1Name}
                        onChange={(e) => setPlayerName(0, e.target.value)}
                        placeholder="Игрок 1"
                        className="h-11 w-full rounded-lg border border-slate-800 bg-[#0B1220] pr-3 pl-7 text-sm text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none landscape-phone:h-9"
                      />
                    </div>
                    <div className="relative flex items-center">
                      <span
                        className="pointer-events-none absolute left-3 h-2 w-2 rounded-full bg-sky-400"
                        aria-hidden="true"
                      />
                      <input
                        id="p2-name"
                        aria-label="Игрок 2"
                        type="text"
                        maxLength={24}
                        value={player2Name}
                        onChange={(e) => setPlayerName(1, e.target.value)}
                        placeholder="Игрок 2"
                        className="h-11 w-full rounded-lg border border-slate-800 bg-[#0B1220] pr-3 pl-7 text-sm text-white placeholder-slate-500 focus:border-sky-400 focus:outline-none landscape-phone:h-9"
                      />
                    </div>
                  </div>
                </div>
              )}

              {settings.mode === 'multiplayer' && (
                <div className="flex flex-col gap-2">
                  {/* Duel vs Classic Online Format Switcher */}
                  <div
                    role="group"
                    aria-label="Формат онлайн-игры"
                    className="grid grid-cols-2 gap-1 rounded-lg bg-[#0B1220] p-1"
                  >
                    {formatButtons.map((fmt) => {
                      const active = settings.onlineFormat === fmt.id;
                      return (
                        <button
                          key={fmt.id}
                          type="button"
                          onClick={() => onUpdateSettings({ onlineFormat: fmt.id })}
                          className={`inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 text-xs font-semibold whitespace-nowrap transition-colors landscape-phone:h-8 ${
                            active
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {fmt.icon}
                          <span>{fmt.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  <input
                    id="online-player-name"
                    aria-label="Ваше имя"
                    type="text"
                    maxLength={24}
                    value={player1Name}
                    onChange={(e) => setPlayerName(0, e.target.value)}
                    placeholder="Имя в комнате"
                    className="h-11 w-full rounded-lg border border-slate-800 bg-[#0B1220] px-3.5 text-sm text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none landscape-phone:h-9"
                  />
                  <form onSubmit={handleJoinSubmit} className="flex gap-2">
                    <input
                      id="invite-code-input"
                      aria-label="Код приглашения"
                      type="text"
                      maxLength={12}
                      value={inviteInput}
                      onChange={(e) => {
                        setInviteInput(e.target.value.toUpperCase());
                        setOnlineActionError(null);
                      }}
                      placeholder="GEO-7K4M9P"
                      className="h-11 min-w-0 flex-1 rounded-lg border border-slate-800 bg-[#0B1220] px-3 font-mono text-sm tracking-wider text-white uppercase placeholder-slate-500 focus:border-amber-500 focus:outline-none landscape-phone:h-9"
                    />
                    <button
                      type="submit"
                      className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/90 px-4 text-xs font-semibold text-white whitespace-nowrap transition-colors hover:border-amber-500 hover:text-amber-300 landscape-phone:h-9"
                    >
                      <span>Войти</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </form>
                </div>
              )}

              {/* Movement Mode + Rounds (1-10) + Timer in one ultra-clean row */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div
                  role="group"
                  aria-label="Режим панорамы"
                  className="grid min-w-0 flex-1 grid-cols-3 gap-1 rounded-lg bg-[#0B1220] p-1"
                >
                  {movementModes.map((m) => {
                    const active = settings.movementMode === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => onUpdateSettings({ movementMode: m.id })}
                        className={`h-9 rounded-md px-1 font-mono text-[11px] font-semibold whitespace-nowrap transition-colors sm:text-xs landscape-phone:h-8 ${
                          active
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>

                {!isDuelSelected && (
                  <div className="relative flex shrink-0 items-center">
                    <Layers
                      className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-slate-400"
                      aria-hidden="true"
                    />
                    <select
                      aria-label="Количество раундов"
                      value={settings.totalRounds}
                      onChange={(e) =>
                        onUpdateSettings({ totalRounds: Number(e.target.value) })
                      }
                      className="h-11 rounded-lg border border-slate-800 bg-[#0B1220] pr-2 pl-6.5 font-mono text-xs font-semibold text-slate-200 focus:border-amber-500 focus:outline-none landscape-phone:h-10"
                    >
                      {ROUND_OPTIONS.map((count) => (
                        <option key={count} value={count}>
                          {count} р.
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="relative flex shrink-0 items-center">
                  <Clock
                    className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-slate-400"
                    aria-hidden="true"
                  />
                  <select
                    aria-label="Таймер"
                    value={settings.timerSeconds}
                    onChange={(e) =>
                      onUpdateSettings({ timerSeconds: Number(e.target.value) })
                    }
                    className="h-11 rounded-lg border border-slate-800 bg-[#0B1220] pr-2 pl-6.5 font-mono text-xs font-semibold text-slate-200 focus:border-amber-500 focus:outline-none landscape-phone:h-10"
                  >
                    {timerOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {(localError || onlineActionError || multiplayerError) && (
              <div
                role="alert"
                className="rounded-lg border border-rose-500/40 bg-rose-950/60 px-3 py-2 text-xs font-medium text-rose-200"
              >
                {localError || onlineActionError || multiplayerError}
              </div>
            )}

            {/* Single Dominant Start CTA */}
            <button
              type="button"
              data-start="true"
              onClick={handlePrimaryStart}
              className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 font-display text-base font-bold text-slate-950 shadow-lg transition-transform hover:bg-amber-400 active:scale-[0.98] landscape-phone:h-10 landscape-phone:text-sm"
            >
              {isDuelSelected ? (
                <Swords className="h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                <Play className="h-4 w-4 fill-current shrink-0" aria-hidden="true" />
              )}
              <span className="truncate">
                {settings.mode === 'multiplayer'
                  ? settings.onlineFormat === 'duel'
                    ? `Создать дуэль · ${selectedRegion.name}`
                    : `Создать комнату · ${selectedRegion.name}`
                  : isDuelSelected
                    ? `Начать дуэль · ${selectedRegion.name}`
                    : `Играть · ${selectedRegion.name}`}
              </span>
            </button>
          </section>

          {/* Minimal Region & Country Picker with Explorer Mode Medals */}
          <section className="flex flex-col gap-3 rounded-xl border border-slate-800/90 bg-[#111A2E]/85 p-3.5 sm:p-4 lg:col-span-7 landscape-phone:col-span-6 landscape-phone:gap-2 landscape-phone:p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-display text-sm font-bold text-white">
                {selectedRegion.name}
              </span>

              <div className="flex shrink-0 rounded-lg bg-[#0B1220] p-0.5">
                <button
                  type="button"
                  onClick={() => setRegionTab('region')}
                  className={`h-8 rounded-md px-3 text-xs font-semibold whitespace-nowrap transition-colors ${
                    regionTab === 'region'
                      ? 'bg-slate-800 text-amber-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Регионы
                </button>
                <button
                  type="button"
                  onClick={() => setRegionTab('country')}
                  className={`h-8 rounded-md px-3 text-xs font-semibold whitespace-nowrap transition-colors ${
                    regionTab === 'country'
                      ? 'bg-slate-800 text-amber-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Страны
                </button>
              </div>
            </div>

            <div className="grid max-h-[260px] grid-cols-2 gap-1.5 overflow-y-auto pr-0.5 sm:max-h-[340px] sm:grid-cols-3 sm:gap-2 landscape-phone:max-h-[210px] landscape-phone:grid-cols-2">
              {filteredRegions.map((reg) => {
                const isSelected = reg.id === settings.regionId;
                const record = regionMedals.get(reg.id);
                return (
                  <button
                    key={reg.id}
                    type="button"
                    onClick={() => onUpdateSettings({ regionId: reg.id })}
                    className={`flex min-h-[44px] items-center justify-between gap-1.5 rounded-lg border px-2.5 py-2 text-left text-xs font-semibold transition-colors sm:px-3 sm:text-sm landscape-phone:min-h-[38px] landscape-phone:px-2.5 ${
                      isSelected
                        ? 'border-amber-500/80 bg-amber-500/15 text-amber-200'
                        : 'border-slate-800/90 bg-[#0B1220]/80 text-slate-200 hover:border-slate-700 hover:text-white'
                    }`}
                  >
                    <span className="min-w-0 truncate">{reg.name}</span>
                    {record && (
                      <span
                        className="flex shrink-0 items-center gap-1"
                        title={`Рекорд: ${formatScore(record.bestScore)}`}
                      >
                        {record.bestMedal !== 'none' && (
                          <MedalIcon tier={record.bestMedal} size="xs" />
                        )}
                        <span className="font-mono text-[10px] tabular-nums text-slate-400">
                          {formatScore(record.bestScore)}
                        </span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* Quiet Single-Line Attribution */}
        <footer className="flex items-center justify-between pt-1 text-[11px] text-slate-500 landscape-phone:hidden">
          <span data-testid="footer-format-summary">
            {isDuelSelected
              ? 'Дуэль 1×1 · 6 000 HP · множитель с 5-го раунда'
              : `${settings.totalRounds} ${pluralRoundsRu(settings.totalRounds)} · до ${formatScore(settings.totalRounds * MAX_ROUND_SCORE)}`}
          </span>
          <span>Google Maps Platform</span>
        </footer>
      </main>
    </div>
  );
};
