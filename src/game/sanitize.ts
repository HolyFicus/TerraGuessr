const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

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
