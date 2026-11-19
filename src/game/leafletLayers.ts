import L from 'leaflet';
import { escapeHtml, sanitizeHexColor } from './sanitize';
import type { MapLayerType } from './types';

export { escapeHtml, sanitizeHexColor };

export interface LeafletBaseLayers {
  roadmap: L.TileLayer;
  satellite: L.LayerGroup;
}

/**
 * Creates free OpenStreetMap ("Карта") and Esri World Imagery + Reference
 * Boundaries & Places ("Спутник / Земля") layers for Leaflet.
 */
export function createLeafletBaseLayers(): LeafletBaseLayers {
  const roadmap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  });

  const esriImagery = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri',
    },
  );

  const esriBoundaries = L.tileLayer(
    'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 19,
      opacity: 0.9,
      pane: 'overlayPane',
    },
  );

  const satellite = L.layerGroup([esriImagery, esriBoundaries]);

  return { roadmap, satellite };
}

export function applyLeafletBaseLayer(
  map: L.Map,
  layers: LeafletBaseLayers,
  active: MapLayerType,
): void {
  if (active === 'satellite') {
    if (map.hasLayer(layers.roadmap)) map.removeLayer(layers.roadmap);
    if (!map.hasLayer(layers.satellite)) layers.satellite.addTo(map);
  } else {
    if (map.hasLayer(layers.satellite)) map.removeLayer(layers.satellite);
    if (!map.hasLayer(layers.roadmap)) layers.roadmap.addTo(map);
  }
}

/**
 * Creates a crisp, dependency-free SVG pin marker icon for Leaflet.
 * Strictly sanitizes color values and escapes badge text to prevent DOM XSS.
 */
export function createPinDivIcon(options: {
  color: string;
  innerColor?: string;
  badgeText?: string;
  size?: number;
}): L.DivIcon {
  const size = Math.max(18, Math.min(64, Math.round(options.size ?? 32)));
  const safeColor = sanitizeHexColor(options.color, '#F59E0B');
  const safeInnerColor = sanitizeHexColor(options.innerColor, '#0B1220');
  const safeBadge =
    typeof options.badgeText === 'string' && options.badgeText.length > 0
      ? escapeHtml(options.badgeText.slice(0, 3))
      : '';

  const badgeHtml = safeBadge
    ? `<span style="position:absolute;top:6px;left:50%;transform:translateX(-50%);font-family:var(--font-mono),monospace;font-size:10px;font-weight:800;color:${safeInnerColor};line-height:1;">${safeBadge}</span>`
    : `<span style="position:absolute;top:8px;left:50%;transform:translateX(-50%);width:8px;height:8px;border-radius:9999px;background:${safeInnerColor};"></span>`;

  return L.divIcon({
    className: 'terraspotter-leaflet-pin',
    iconSize: [size, Math.round(size * 1.25)],
    iconAnchor: [size / 2, Math.round(size * 1.2)],
    popupAnchor: [0, -Math.round(size * 1.1)],
    html: `
      <div style="position:relative;width:${size}px;height:${Math.round(size * 1.25)}px;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.55));">
        <svg viewBox="0 0 32 40" width="${size}" height="${Math.round(size * 1.25)}" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 1C8.268 1 2 7.268 2 15c0 9.6 12.2 22.7 13.3 23.8a1 1 0 0 0 1.4 0C17.8 37.7 30 24.6 30 15 30 7.268 23.732 1 16 1Z" fill="${safeColor}" stroke="#0B1220" stroke-width="2.2"/>
        </svg>
        ${badgeHtml}
      </div>
    `,
  });
}
