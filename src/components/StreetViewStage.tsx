import React, { useEffect, useRef, useState } from 'react';
import { Compass, KeyRound, Loader2, Lock, RotateCcw } from 'lucide-react';
import type { MovementMode, RoundLocation } from '../game/types';

export type MapsErrorCode =
  | 'quota'
  | 'referer'
  | 'billing'
  | 'invalid_key'
  | 'auth_failure'
  | null;

interface StreetViewStageProps {
  visible?: boolean;
  location: RoundLocation;
  movementMode: MovementMode;
  resetSignal: number;
  quotaExceeded: boolean;
  mapsError?: MapsErrorCode;
  hasMapsKey: boolean;
  streetViewLib: google.maps.StreetViewLibrary | null;
  onHeadingChange: (heading: number) => void;
  onOpenApiKeySetup?: () => void;
}

export const StreetViewStage: React.FC<StreetViewStageProps> = ({
  visible = true,
  location,
  movementMode,
  resetSignal,
  quotaExceeded,
  mapsError = null,
  hasMapsKey,
  streetViewLib,
  onHeadingChange,
  onOpenApiKeySetup,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const initCountRef = useRef<number>(0);
  const onHeadingRef = useRef(onHeadingChange);
  onHeadingRef.current = onHeadingChange;

  const [fallbackMode, setFallbackMode] = useState(false);
  const [nmpzLocked, setNmpzLocked] = useState(false);
  const [fallbackHeading, setFallbackHeading] = useState(location.heading);
  const [isDraggingFallback, setIsDraggingFallback] = useState(false);
  const dragStartRef = useRef<{ x: number; heading: number } | null>(null);

  // Do not gate on location.isLiveStreetView so live panoramas still appear if
  // streetViewLib finishes loading right after the user clicks Play.
  const isWaitingForLibrary =
    hasMapsKey && !quotaExceeded && !mapsError && !streetViewLib;
  const shouldUseLiveStreetView =
    hasMapsKey && !quotaExceeded && !mapsError && Boolean(streetViewLib);

  const isMovingAllowed = movementMode === 'moving';
  const isNmpz = movementMode === 'nmpz';

  useEffect(() => {
    setFallbackHeading(location.heading);
    onHeadingRef.current(location.heading);
  }, [location, resetSignal]);

  // Initialize StreetViewPanorama ONCE and reuse it across rounds via setPano() / setPosition()
  useEffect(() => {
    if (!shouldUseLiveStreetView || !streetViewLib || !containerRef.current) {
      setFallbackMode(true);
      setNmpzLocked(isNmpz);
      return;
    }

    setFallbackMode(false);
    setNmpzLocked(isNmpz);
    const container = containerRef.current;

    if (!panoramaRef.current) {
      initCountRef.current += 1;
      container.dataset.panoInitCount = String(initCountRef.current);

      const pano = new streetViewLib.StreetViewPanorama(container, {
        visible: true,
        addressControl: false,
        showRoadLabels: false,
        enableCloseButton: false,
        fullscreenControl: false,
        motionTracking: false,
        motionTrackingControl: false,
        panControl: false,
        zoomControl: !isNmpz,
        zoomControlOptions: {
          position: google.maps.ControlPosition.LEFT_BOTTOM,
        },
        scrollwheel: !isNmpz,
        linksControl: isMovingAllowed,
        clickToGo: isMovingAllowed,
      });

      pano.addListener('pov_changed', () => {
        const pov = pano.getPov();
        if (pov && Number.isFinite(pov.heading)) {
          onHeadingRef.current(pov.heading);
        }
      });

      pano.addListener('status_changed', () => {
        const status = pano.getStatus();
        if (status && status !== google.maps.StreetViewStatus.OK) {
          setFallbackMode(true);
        }
      });

      panoramaRef.current = pano;
    }

    const pano = panoramaRef.current;
    pano.setOptions({
      linksControl: isMovingAllowed,
      clickToGo: isMovingAllowed,
      scrollwheel: !isNmpz,
      zoomControl: !isNmpz,
      addressControl: false,
      showRoadLabels: false,
      enableCloseButton: false,
    });

    if (location.panoId) {
      pano.setPano(location.panoId);
    } else {
      pano.setPosition({ lat: location.lat, lng: location.lng });
    }
    pano.setPov({ heading: location.heading, pitch: location.pitch });
    pano.setZoom(1);
    pano.setVisible(true);
  }, [
    location,
    isMovingAllowed,
    isNmpz,
    resetSignal,
    shouldUseLiveStreetView,
    streetViewLib,
  ]);

  // Trigger resize when the persistent StreetViewStage becomes visible again (e.g. next round / handoff)
  useEffect(() => {
    if (!visible || !panoramaRef.current) return;
    const pano = panoramaRef.current;
    const rafId = window.requestAnimationFrame(() => {
      if (typeof google !== 'undefined' && google.maps?.event) {
        google.maps.event.trigger(pano, 'resize');
      }
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [visible, location]);

  useEffect(() => {
    return () => {
      if (panoramaRef.current) {
        google.maps.event.clearInstanceListeners(panoramaRef.current);
        panoramaRef.current = null;
      }
    };
  }, []);

  const handleFallbackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isNmpz) return;
    setIsDraggingFallback(true);
    dragStartRef.current = { x: e.clientX, heading: fallbackHeading };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleFallbackPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isNmpz || !isDraggingFallback || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const next = (dragStartRef.current.heading - dx * 0.25 + 360) % 360;
    setFallbackHeading(next);
    onHeadingRef.current(next);
  };

  const handleFallbackPointerUp = () => {
    setIsDraggingFallback(false);
    dragStartRef.current = null;
  };

  const absLat = Math.abs(location.lat);
  const climateBand =
    absLat > 58
      ? 'Субарктический пояс · Хвойные леса и низкое солнце'
      : absLat > 42
        ? 'Умеренный пояс · Смешанные леса и равнинные дороги'
        : absLat > 23
          ? 'Субтропический пояс · Высокое солнце и тёплый рельеф'
          : 'Тропический пояс · Густая зелень и экваториальный свет';
  const hemisphere =
    location.lat >= 0
      ? 'Северное полушарие (солнце к югу)'
      : 'Южное полушарие (солнце к северу)';
  const sunAzimuth = location.lat >= 0 ? 180 : 0;
  const relativeSun = ((sunAzimuth - fallbackHeading + 540) % 360) - 180;
  const sunPercentX = 50 + (relativeSun / 90) * 45;

  return (
    <div
      className="relative h-full w-full overflow-hidden bg-[#0B1220]"
      data-testid="streetview-stage"
      data-movement-mode={movementMode}
    >
      {/* Persistent Single-Instance Google Street View Container */}
      <div
        ref={containerRef}
        data-testid="streetview-pano-container"
        className={`h-full w-full ${fallbackMode ? 'hidden' : 'block'} ${
          isNmpz && nmpzLocked ? 'pointer-events-none select-none' : ''
        }`}
        style={{ minWidth: '200px', minHeight: '200px' }}
      />

      {/* Subtle NMPZ lock indicator at bottom-left */}
      {visible && isNmpz && nmpzLocked && !fallbackMode && (
        <div
          className="pointer-events-none absolute bottom-9 left-3 z-20 flex items-center gap-1.5 rounded-lg border border-slate-700/80 px-2.5 py-1 font-mono text-[11px] font-semibold text-amber-300 shadow"
          style={{ backgroundColor: 'rgba(11, 18, 32, 0.86)' }}
        >
          <Lock className="h-3 w-3" aria-hidden="true" />
          <span>NMPZ</span>
        </div>
      )}

      {/* Graceful Interactive Offline Panoramic Explorer Fallback */}
      {fallbackMode && (
        <div
          className={`relative flex h-full w-full flex-col items-center justify-center overflow-hidden select-none ${
            isNmpz ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
          }`}
          onPointerDown={handleFallbackPointerDown}
          onPointerMove={handleFallbackPointerMove}
          onPointerUp={handleFallbackPointerUp}
          onPointerCancel={handleFallbackPointerUp}
          style={{
            background:
              absLat > 55
                ? 'linear-gradient(180deg, #16243D 0%, #2C4262 46%, #1B2938 48%, #0F1824 100%)'
                : absLat > 32
                  ? 'linear-gradient(180deg, #1B3358 0%, #3A5A7E 46%, #24362C 48%, #101A16 100%)'
                  : 'linear-gradient(180deg, #1D4168 0%, #4E7A96 46%, #2D3D24 48%, #121C11 100%)',
          }}
        >
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full opacity-35"
            preserveAspectRatio="none"
            viewBox="0 0 1440 900"
          >
            {Math.abs(relativeSun) < 110 && (
              <g>
                <circle
                  cx={`${Math.max(-10, Math.min(110, sunPercentX))}%`}
                  cy="24%"
                  r="64"
                  fill="rgba(251, 191, 36, 0.16)"
                />
                <circle
                  cx={`${Math.max(-10, Math.min(110, sunPercentX))}%`}
                  cy="24%"
                  r="22"
                  fill="rgba(253, 224, 71, 0.85)"
                />
              </g>
            )}
            <path
              d={`M ${-((fallbackHeading * 4) % 720)} 430 Q ${180 - ((fallbackHeading * 4) % 720)} 365 ${360 - ((fallbackHeading * 4) % 720)} 415 T ${720 - ((fallbackHeading * 4) % 720)} 400 T ${1080 - ((fallbackHeading * 4) % 720)} 420 T ${1440 - ((fallbackHeading * 4) % 720)} 390 T ${1800 - ((fallbackHeading * 4) % 720)} 415 T ${2160 - ((fallbackHeading * 4) % 720)} 430 L 2160 500 L -720 500 Z`}
              fill="#0E1726"
              opacity="0.85"
            />
            <polygon points="620,445 820,445 1120,900 320,900" fill="#182234" />
            <line
              x1="720"
              y1="445"
              x2="720"
              y2="900"
              stroke="#F59E0B"
              strokeWidth="3"
              strokeDasharray="18 22"
              opacity="0.7"
            />
          </svg>

          <div
            className="relative z-10 max-w-lg rounded-xl border border-slate-700/80 px-6 py-5 text-center shadow-2xl"
            style={{ backgroundColor: 'rgba(11, 18, 32, 0.90)' }}
          >
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-400">
              {isWaitingForLibrary ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Compass className="h-5 w-5" />
              )}
            </div>
            <p className="font-display text-lg font-semibold text-slate-100">
              {isWaitingForLibrary
                ? 'Загрузка Google Street View...'
                : 'Автономный режим наблюдения 360°'}
            </p>
            <p className="mt-1.5 text-sm text-slate-300">{climateBand}</p>
            <p className="mt-1 text-xs text-slate-400">
              {hemisphere} ·{' '}
              {isNmpz
                ? 'Режим NMPZ: камера зафиксирована'
                : 'Перетаскивайте панораму мышью, чтобы сверить солнце и компас'}
            </p>

            {!isWaitingForLibrary && (
              <div className="mt-3.5 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-300">
                {!hasMapsKey && (
                  <span>
                    Для живых 360°-панорам Google Street View укажите ваш Google Maps API-ключ.
                  </span>
                )}
                {hasMapsKey && mapsError === 'referer' && (
                  <span>
                    Домен <code className="text-amber-300">{window.location.origin}</code> не разрешён в настройках HTTP Referrer вашего ключа Google Cloud.
                  </span>
                )}
                {hasMapsKey && mapsError === 'billing' && (
                  <span>
                    В Google Cloud не включён Maps JavaScript API или не привязан биллинг-аккаунт (бесплатная квота требует активации биллинга).
                  </span>
                )}
                {hasMapsKey && mapsError === 'invalid_key' && (
                  <span>
                    Указанный Google Maps API-ключ недействителен — проверьте ключ без лишних пробелов.
                  </span>
                )}
                {hasMapsKey && (mapsError === 'quota' || (quotaExceeded && !mapsError)) && (
                  <span>
                    Квота Google Maps исчерпана — включён бесплатный автономный режим.
                  </span>
                )}
                {hasMapsKey && mapsError === 'auth_failure' && (
                  <span>
                    Google Maps отклонил ключ (проверьте HTTP Referrer для{' '}
                    <code className="text-amber-300">{window.location.origin}/*</code> и биллинг в Google Cloud).
                  </span>
                )}
                {hasMapsKey && !mapsError && !quotaExceeded && (
                  <span>
                    В выбранной точке нет панорамы Street View — используйте компас и карту Leaflet.
                  </span>
                )}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-400">
              <span className="font-mono tabular-nums text-amber-300">
                Азимут {Math.round(fallbackHeading)}°
              </span>
              {!isNmpz && (
                <>
                  <span aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={() => {
                      setFallbackHeading(location.heading);
                      onHeadingRef.current(location.heading);
                    }}
                    className="inline-flex cursor-pointer items-center gap-1.5 text-slate-200 underline-offset-4 hover:text-amber-300 hover:underline"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Сбросить обзор
                  </button>
                </>
              )}
              {onOpenApiKeySetup &&
                (!hasMapsKey ||
                  mapsError === 'invalid_key' ||
                  mapsError === 'referer' ||
                  mapsError === 'billing' ||
                  mapsError === 'auth_failure') && (
                  <>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={onOpenApiKeySetup}
                      className="inline-flex cursor-pointer items-center gap-1.5 font-semibold text-amber-400 underline-offset-4 hover:text-amber-300 hover:underline"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      Настроить API-ключ
                    </button>
                  </>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
