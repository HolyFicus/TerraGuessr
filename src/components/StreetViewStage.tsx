import React, { useEffect, useRef, useState } from 'react';
import { Compass, Lock, RotateCcw } from 'lucide-react';
import type { MovementMode, RoundLocation } from '../game/types';

interface StreetViewStageProps {
  visible?: boolean;
  location: RoundLocation;
  movementMode: MovementMode;
  resetSignal: number;
  quotaExceeded: boolean;
  hasMapsKey: boolean;
  streetViewLib: google.maps.StreetViewLibrary | null;
  onHeadingChange: (heading: number) => void;
}

export const StreetViewStage: React.FC<StreetViewStageProps> = ({
  visible = true,
  location,
  movementMode,
  resetSignal,
  quotaExceeded,
  hasMapsKey,
  streetViewLib,
  onHeadingChange,
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

  const shouldUseLiveStreetView =
    hasMapsKey && !quotaExceeded && Boolean(streetViewLib) && location.isLiveStreetView;

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
              <Compass className="h-5 w-5" />
            </div>
            <p className="font-display text-lg font-semibold text-slate-100">
              Автономный режим наблюдения 360°
            </p>
            <p className="mt-1.5 text-sm text-slate-300">{climateBand}</p>
            <p className="mt-1 text-xs text-slate-400">
              {hemisphere} ·{' '}
              {isNmpz
                ? 'Режим NMPZ: камера зафиксирована'
                : 'Перетаскивайте панораму мышью, чтобы сверить солнце и компас'}
            </p>
            <div className="mt-4 flex items-center justify-center gap-3 text-xs text-slate-400">
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
