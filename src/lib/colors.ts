/** Converts a hex color string to RGB tuple. */
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Linearly interpolates between two RGB colors. */
function mixRgb(
  r1: number, g1: number, b1: number,
  r2: number, g2: number, b2: number,
  t: number,
): [number, number, number] {
  return [
    Math.round(r1 + (r2 - r1) * t),
    Math.round(g1 + (g2 - g1) * t),
    Math.round(b1 + (b2 - b1) * t),
  ];
}

/**
 * Generates a full primary color palette from a single hex color
 * and applies it as CSS custom properties (RGB channels for Tailwind opacity support).
 */
export function applyPrimaryPalette(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  const root = document.documentElement;

  // Base shade (500)
  root.style.setProperty("--primary-500", `${r} ${g} ${b}`);

  // Light shades: mix base color toward white
  const lightShades: [string, number][] = [
    ["50",  0.92],
    ["100", 0.84],
    ["200", 0.72],
    ["300", 0.52],
    ["400", 0.28],
  ];
  for (const [shade, t] of lightShades) {
    const [sr, sg, sb] = mixRgb(r, g, b, 255, 255, 255, t);
    root.style.setProperty(`--primary-${shade}`, `${sr} ${sg} ${sb}`);
  }

  // Dark shades: mix base color toward a hue-preserving dark anchor
  const dr = Math.round(r * 0.08);
  const dg = Math.round(g * 0.08);
  const db = Math.round(b * 0.08);
  const darkShades: [string, number][] = [
    ["600", 0.18],
    ["700", 0.34],
    ["800", 0.48],
    ["900", 0.60],
    ["950", 0.76],
  ];
  for (const [shade, t] of darkShades) {
    const [sr, sg, sb] = mixRgb(r, g, b, dr, dg, db, t);
    root.style.setProperty(`--primary-${shade}`, `${sr} ${sg} ${sb}`);
  }
}
