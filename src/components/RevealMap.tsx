import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Layers } from 'lucide-react';
import {
  applyLeafletBaseLayer,
  createLeafletBaseLayers,
  createPinDivIcon,
  sanitizeHexColor,
  type LeafletBaseLayers,
} from '../game/leafletLayers';
import type { MapLayerType, RoundOutcome } from '../game/types';

interface RevealMapProps {
  outcomes: RoundOutcome[];
  mapLayer: MapLayerType;
  onChangeMapLayer: (layer: MapLayerType) => void;
}

export const RevealMap: React.FC<RevealMapProps> = ({
  outcomes,
  mapLayer,
  onChangeMapLayer,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseLayersRef = useRef<LeafletBaseLayers | null>(null);
  const overlayGroupRef = useRef<L.LayerGroup | null>(null);

  // Initialize Leaflet map ONCE per mount
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const first = outcomes[0]?.actual ?? { lat: 30, lng: 10 };
    const map = L.map(containerRef.current, {
      center: [first.lat, first.lng],
      zoom: 4,
      zoomControl: false,
      worldCopyJump: true,
      minZoom: 2,
      maxZoom: 18,
    });

    const baseLayers = createLeafletBaseLayers();
    applyLeafletBaseLayer(map, baseLayers, mapLayer);

    const overlayGroup = L.layerGroup().addTo(map);

    mapRef.current = map;
    baseLayersRef.current = baseLayers;
    overlayGroupRef.current = overlayGroup;

    const ro = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      baseLayersRef.current = null;
      overlayGroupRef.current = null;
    };
    // Initialize map once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch between OpenStreetMap and Esri World Imagery + Boundaries
  useEffect(() => {
    if (!mapRef.current || !baseLayersRef.current) return;
    applyLeafletBaseLayer(mapRef.current, baseLayersRef.current, mapLayer);
  }, [mapLayer]);

  // Render target markers, player guess markers, dashed L.polyline(s), and fitBounds()
  useEffect(() => {
    const map = mapRef.current;
    const overlayGroup = overlayGroupRef.current;
    if (!map || !overlayGroup) return;

    overlayGroup.clearLayers();
    if (outcomes.length === 0) return;

    const boundsPoints: L.LatLngExpression[] = [];

    outcomes.forEach((outcome) => {
      const actualLatLng: [number, number] = [
        outcome.actual.lat,
        outcome.actual.lng,
      ];
      boundsPoints.push(actualLatLng);

      // Actual target pin (Emerald)
      const actualIcon = createPinDivIcon({
        color: '#10B981',
        innerColor: '#022C22',
        badgeText: outcomes.length > 1 ? String(outcome.roundIndex + 1) : '★',
        size: 34,
      });

      const actualLabel = outcome.actual.hintLabel
        ? `${outcomes.length > 1 ? `#${outcome.roundIndex + 1} · ` : ''}${outcome.actual.hintLabel}`
        : `Цель · Раунд ${outcome.roundIndex + 1}`;
      const actualTooltipNode = document.createElement('span');
      actualTooltipNode.textContent = actualLabel;

      L.marker(actualLatLng, {
        icon: actualIcon,
        zIndexOffset: 200,
        title: actualLabel,
      })
        .bindTooltip(actualTooltipNode, { direction: 'top', offset: [0, -32] })
        .addTo(overlayGroup);

      outcome.guesses.forEach((g) => {
        if (!g.guess) return;
        const guessLatLng: [number, number] = [g.guess.lat, g.guess.lng];
        boundsPoints.push(guessLatLng);

        const safeColor = sanitizeHexColor(g.color, '#F59E0B');

        // Dashed polyline connecting guess and actual point
        L.polyline([actualLatLng, guessLatLng], {
          color: safeColor,
          weight: 3,
          opacity: 0.92,
          dashArray: '7, 7',
        }).addTo(overlayGroup);

        // Player guess pin
        const guessIcon = createPinDivIcon({
          color: safeColor,
          innerColor: '#0B1220',
          badgeText: g.playerName.slice(0, 1).toUpperCase(),
          size: 30,
        });

        const guessTooltipNode = document.createElement('span');
        guessTooltipNode.textContent = `${g.playerName} · +${g.score}`;

        L.marker(guessLatLng, {
          icon: guessIcon,
          zIndexOffset: 100,
          title: `${g.playerName}: +${g.score}`,
        })
          .bindTooltip(guessTooltipNode, {
            direction: 'top',
            offset: [0, -28],
          })
          .addTo(overlayGroup);
      });
    });

    const rafId = window.requestAnimationFrame(() => {
      map.invalidateSize({ animate: false });
      if (boundsPoints.length === 1) {
        map.setView(boundsPoints[0], 6, { animate: false });
      } else if (boundsPoints.length > 1) {
        const bounds = L.latLngBounds(boundsPoints);
        map.fitBounds(bounds, {
          padding: [44, 44],
          maxZoom: 12,
          animate: false,
        });
      }
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [outcomes]);

  const layers: Array<{ id: MapLayerType; label: string }> = [
    { id: 'roadmap', label: 'Карта' },
    { id: 'satellite', label: 'Спутник / Земля' },
  ];

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-slate-800 bg-[#0D1A2D]">
      <div
        className="absolute top-3 left-3 z-[450] flex items-center gap-1 rounded-lg border border-slate-700/80 p-1 shadow-lg"
        style={{ backgroundColor: 'rgba(11, 18, 32, 0.90)' }}
      >
        <Layers className="mx-1.5 h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
        {layers.map((l) => (
          <button
            key={l.id}
            type="button"
            data-testid={`reveal-layer-${l.id}`}
            onClick={() => onChangeMapLayer(l.id)}
            className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
              mapLayer === l.id
                ? 'bg-amber-500/20 text-amber-300'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>

      <div
        ref={containerRef}
        data-testid="leaflet-reveal-map"
        className="h-full w-full"
      />
    </div>
  );
};
