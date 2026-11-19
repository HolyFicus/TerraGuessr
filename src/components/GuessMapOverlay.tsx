import React, { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Maximize2, Minimize2, Map as MapIcon, Check, X } from 'lucide-react';
import {
  applyLeafletBaseLayer,
  createLeafletBaseLayers,
  createPinDivIcon,
  type LeafletBaseLayers,
} from '../game/leafletLayers';
import type { LatLng, MapLayerType, RegionDefinition } from '../game/types';

interface GuessMapOverlayProps {
  active?: boolean;
  region: RegionDefinition;
  roundKey?: string | number;
  selectedGuess: LatLng | null;
  playerColor: string;
  playerName: string;
  mapLayer: MapLayerType;
  disabled?: boolean;
  waitingLabel?: string;
  onSelectGuess: (coords: LatLng) => void;
  onConfirmGuess: () => void;
  onChangeMapLayer: (layer: MapLayerType) => void;
}

function normalizeLng(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

export const GuessMapOverlay: React.FC<GuessMapOverlayProps> = ({
  active = true,
  region,
  roundKey,
  selectedGuess,
  playerColor,
  playerName,
  mapLayer,
  disabled = false,
  waitingLabel,
  onSelectGuess,
  onConfirmGuess,
  onChangeMapLayer,
}) => {
  // Optional map: collapsed by default to a small toggle button so Street View stays unobstructed
  const [isOpen, setIsOpen] = useState(false);
  const [hasOpenedOnce, setHasOpenedOnce] = useState(false);
  const [expandedDesktop, setExpandedDesktop] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseLayersRef = useRef<LeafletBaseLayers | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const lastRegionIdRef = useRef<string>(region.id);

  // Keep latest callbacks/props in refs so the single Leaflet instance never needs recreation
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const onSelectGuessRef = useRef(onSelectGuess);
  onSelectGuessRef.current = onSelectGuess;

  // Collapse back to the small button on each new round or when leaving gameplay
  useEffect(() => {
    setIsOpen(false);
  }, [roundKey, active]);

  const handleOpenMap = useCallback(() => {
    setHasOpenedOnce(true);
    setIsOpen(true);
  }, []);

  const handleCloseMap = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Optional keyboard shortcut: G toggles the guess map during active play
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }
      if (e.code === 'KeyG') {
        e.preventDefault();
        setIsOpen((prev) => {
          const next = !prev;
          if (next) setHasOpenedOnce(true);
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active]);

  // Initialize Leaflet map strictly ONCE when first opened
  useEffect(() => {
    if (!hasOpenedOnce || mapRef.current || !mapContainerRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [region.center.lat, region.center.lng],
      zoom: region.defaultZoom,
      zoomControl: false,
      worldCopyJump: true,
      minZoom: 2,
      maxZoom: 18,
    });

    const layers = createLeafletBaseLayers();
    applyLeafletBaseLayer(map, layers, mapLayer);

    map.on('click', (event: L.LeafletMouseEvent) => {
      if (disabledRef.current) return;
      onSelectGuessRef.current({
        lat: event.latlng.lat,
        lng: normalizeLng(event.latlng.lng),
      });
    });

    mapRef.current = map;
    baseLayersRef.current = layers;
    lastRegionIdRef.current = region.id;

    // ResizeObserver ensures tiles always redraw cleanly after drawer animation / orientation flip
    const ro = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
    });
    ro.observe(mapContainerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      baseLayersRef.current = null;
      markerRef.current = null;
    };
    // Intentionally initialize once after hasOpenedOnce becomes true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasOpenedOnce]);

  // Switch OSM / Esri Satellite+Boundaries layer without recreating map
  useEffect(() => {
    if (!mapRef.current || !baseLayersRef.current) return;
    applyLeafletBaseLayer(mapRef.current, baseLayersRef.current, mapLayer);
  }, [mapLayer, hasOpenedOnce]);

  // Recenter Leaflet map when user picks a different region
  useEffect(() => {
    if (!mapRef.current || lastRegionIdRef.current === region.id) return;
    lastRegionIdRef.current = region.id;
    mapRef.current.setView([region.center.lat, region.center.lng], region.defaultZoom, {
      animate: false,
    });
  }, [region]);

  // Call invalidateSize() whenever the mini-map opens, expands, or changes orientation
  useEffect(() => {
    if (!active || !isOpen || !mapRef.current) return;
    const map = mapRef.current;
    const rafId = window.requestAnimationFrame(() => {
      map.invalidateSize({ animate: false });
    });
    const timerId = window.setTimeout(() => {
      map.invalidateSize({ animate: false });
    }, 240);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timerId);
    };
  }, [active, isOpen, expandedDesktop]);

  // Sync single guess marker with selectedGuess & playerColor
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!selectedGuess) {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      return;
    }

    const icon = createPinDivIcon({
      color: playerColor,
      innerColor: '#0B1220',
      size: 32,
    });

    if (!markerRef.current) {
      markerRef.current = L.marker([selectedGuess.lat, selectedGuess.lng], {
        icon,
        title: playerName,
      }).addTo(map);
    } else {
      markerRef.current.setLatLng([selectedGuess.lat, selectedGuess.lng]);
      markerRef.current.setIcon(icon);
    }
  }, [selectedGuess, playerColor, playerName, hasOpenedOnce]);

  const layerOptions: Array<{ id: MapLayerType; label: string }> = [
    { id: 'roadmap', label: 'Карта' },
    { id: 'satellite', label: 'Спутник' },
  ];

  const showOpenDrawer = active && isOpen;

  return (
    <>
      {/* Compact floating toggle button when map is closed during gameplay */}
      {active && !isOpen && (
        <div
          className="pointer-events-auto absolute right-4 bottom-8 z-30 flex items-center gap-2 landscape-phone:right-3 landscape-phone:bottom-6"
          style={{
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            paddingRight: 'env(safe-area-inset-right, 0px)',
          }}
        >
          {selectedGuess && !disabled && (
            <button
              type="button"
              onClick={onConfirmGuess}
              aria-label="Подтвердить метку"
              className="flex h-12 cursor-pointer items-center gap-1.5 rounded-2xl bg-amber-500 px-4 font-display text-sm font-bold text-slate-950 shadow-2xl transition-transform hover:bg-amber-400 active:scale-95 landscape-phone:h-10 landscape-phone:px-3.5"
            >
              <Check className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />
              <span>Выбрать</span>
            </button>
          )}

          <button
            type="button"
            data-testid="toggle-map-btn"
            onClick={handleOpenMap}
            aria-label="Открыть карту"
            title="Открыть карту (G)"
            className="relative flex h-13 w-13 cursor-pointer items-center justify-center rounded-2xl border border-slate-700/90 text-slate-100 shadow-2xl transition-transform hover:border-amber-500/70 hover:text-amber-300 active:scale-95 landscape-phone:h-11 landscape-phone:w-11"
            style={{ backgroundColor: 'rgba(11, 18, 32, 0.92)' }}
          >
            <MapIcon className="h-5 w-5" aria-hidden="true" />
            {selectedGuess && (
              <span
                className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full border-2 border-[#0B1220] bg-amber-400"
                aria-hidden="true"
              />
            )}
          </button>
        </div>
      )}

      {/* Persistent Leaflet Guess Map Drawer / Overlay — initialized ONCE, resized via invalidateSize() */}
      {hasOpenedOnce && (
        <div
          data-testid="guess-map-overlay"
          aria-hidden={!showOpenDrawer}
          className={`absolute z-30 flex flex-col gap-2 transition-all duration-200 ${
            showOpenDrawer
              ? 'pointer-events-auto opacity-100 scale-100 visible'
              : 'pointer-events-none opacity-0 scale-95 invisible'
          } inset-x-3 bottom-3 h-[54dvh] md:inset-x-auto md:right-4 md:bottom-4 ${
            expandedDesktop
              ? 'md:h-[min(66vh,520px)] md:w-[min(92vw,700px)]'
              : 'md:h-[min(52vh,390px)] md:w-[min(90vw,460px)]'
          } landscape-phone:inset-x-auto landscape-phone:top-13 landscape-phone:right-3 landscape-phone:bottom-3 landscape-phone:h-auto landscape-phone:w-[min(52vw,420px)]`}
          style={{
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          <div
            className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-700/90 shadow-2xl"
            style={{ backgroundColor: 'rgba(11, 18, 32, 0.95)' }}
          >
            {/* Slim Map Toolbar */}
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-800 px-2.5 py-1.5">
              <div className="flex items-center gap-1" role="group" aria-label="Слой карты">
                {layerOptions.map((layer) => (
                  <button
                    key={layer.id}
                    type="button"
                    data-testid={`guess-layer-${layer.id}`}
                    onClick={() => onChangeMapLayer(layer.id)}
                    className={`h-8 cursor-pointer rounded-lg px-2.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                      mapLayer === layer.id
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {layer.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setExpandedDesktop((v) => !v)}
                  aria-label={expandedDesktop ? 'Уменьшить карту' : 'Увеличить карту'}
                  className="hidden h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200 md:flex landscape-phone:hidden"
                >
                  {expandedDesktop ? (
                    <Minimize2 className="h-4 w-4" />
                  ) : (
                    <Maximize2 className="h-4 w-4" />
                  )}
                </button>
                <button
                  type="button"
                  data-testid="close-map-btn"
                  onClick={handleCloseMap}
                  aria-label="Свернуть карту"
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Free Leaflet Canvas (OSM / Esri World Imagery + Boundaries) */}
            <div
              ref={mapContainerRef}
              data-testid="leaflet-guess-map"
              className="relative min-h-0 w-full flex-1 cursor-crosshair"
            />
          </div>

          {/* Thumb-Friendly Confirm CTA */}
          <button
            type="button"
            data-testid="confirm-guess-btn"
            disabled={disabled || !selectedGuess}
            onClick={onConfirmGuess}
            className={`flex h-12 w-full shrink-0 items-center justify-center gap-2 rounded-xl px-5 font-display text-sm font-bold whitespace-nowrap shadow-xl transition-all landscape-phone:h-10 ${
              disabled
                ? 'cursor-not-allowed border border-slate-700 bg-slate-800/95 text-slate-400'
                : selectedGuess
                  ? 'cursor-pointer bg-amber-500 text-slate-950 hover:bg-amber-400 active:scale-[0.98]'
                  : 'cursor-not-allowed border border-slate-700/80 bg-[#111A2E]/95 text-slate-400'
            }`}
          >
            {waitingLabel ? (
              <span>{waitingLabel}</span>
            ) : selectedGuess ? (
              <>
                <Check className="h-4 w-4 stroke-[2.5]" />
                <span>Сделать выбор</span>
              </>
            ) : (
              <span>Отметьте на карте</span>
            )}
          </button>
        </div>
      )}
    </>
  );
};
