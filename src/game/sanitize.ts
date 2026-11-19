const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const ALLOWED_PANORAMA_HOST_SUFFIXES = [
  'panoramax.xyz',
  'panoramax.openstreetmap.fr',
  'panoramax.ign.fr',
  'geovisio.fr',
  'mapillary.com',
  'fbcdn.net',
];

/**
 * Escapes HTML special characters so untrusted strings (e.g. remote peer nicknames)
 * can never inject HTML tags or attributes into DOM templates.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Validates that a color string is a strict 6-digit hex color (#RRGGBB).
 */
export function sanitizeHexColor(color: unknown, fallback = '#F59E0B'): string {
  if (typeof color === 'string' && HEX_COLOR_RE.test(color.trim())) {
    return color.trim();
  }
  return fallback;
}

/**
 * Checks whether a hostname belongs to the strict allowlist of trusted
 * public street-level panorama CDNs (Panoramax / Mapillary).
 */
export function isAllowedPanoramaHost(hostname: string): boolean {
  const lower = hostname.trim().toLowerCase();
  if (!lower || lower.includes('..') || lower.endsWith('.')) return false;
  return ALLOWED_PANORAMA_HOST_SUFFIXES.some(
    (suffix) => lower === suffix || lower.endsWith(`.${suffix}`),
  );
}

/**
 * Strictly validates an external panorama image or step-navigation URL.
 * Blocks javascript:, data:, http:, IP addresses, credentials in URLs,
 * and any untrusted third-party host (prevents SSRF & tracking-pixel
 * injection over untrusted WebRTC P2P room:state packets).
 */
export function sanitizePanoramaUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 600) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return undefined;
    if (parsed.username || parsed.password) return undefined;
    if (!isAllowedPanoramaHost(parsed.hostname)) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

/**
 * Strips whitespace and ASCII control characters from user-entered API keys/tokens.
 */
export function sanitizeApiToken(raw: unknown, maxLen = 256): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\u0000-\u0020\u007F]/g, '').slice(0, maxLen);
}
