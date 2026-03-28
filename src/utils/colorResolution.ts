export interface ColorTriple {
  stroke: string;
  fill: string;
  font: string;
}

/** Resolve a named highlight color (or #hex) to a stroke/border color. */
export function resolveColor(color: string): string {
  switch (color.toLowerCase()) {
    case 'red':    return '#C62828';
    case 'yellow': return '#F9A825';
    case 'blue':   return '#0078D4';
    case 'orange': return '#E47911';
    case 'green':  return '#2E7D32';
    case 'purple': return '#6A1B9A';
  }
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  return '#666666';
}

/** Resolve a named highlight color (or #hex) to a light fill/background color. */
export function resolveColorLight(color: string): string {
  switch (color.toLowerCase()) {
    case 'red':    return '#FFEBEE';
    case 'yellow': return '#FFFDE7';
    case 'blue':   return '#E3F2FD';
    case 'orange': return '#FFF3E0';
    case 'green':  return '#E8F5E9';
    case 'purple': return '#F3E5F5';
  }
  if (/^#[0-9a-f]{6}$/i.test(color)) return hexToLightBackground(color);
  return '#f5f5f5';
}

/** Convert a hex color to a light pastel background version (85% white mix). */
export function hexToLightBackground(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.round(r * 0.15 + 255 * 0.85);
  const lg = Math.round(g * 0.15 + 255 * 0.85);
  const lb = Math.round(b * 0.15 + 255 * 0.85);
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
}

/** Resolve a named group style (or #hex) to a color triple (stroke, fill, font). */
export function resolveGroupColors(style?: string): ColorTriple {
  const normalized = style?.toLowerCase() ?? 'green';
  switch (normalized) {
    case 'blue':
    case 'vnet':
      return { stroke: '#0078D4', fill: '#E6F2FF', font: '#0078D4' };
    case 'orange':
      return { stroke: '#E47911', fill: '#FFF3E0', font: '#B25000' };
    case 'red':
      return { stroke: '#C62828', fill: '#FFEBEE', font: '#C62828' };
    case 'purple':
      return { stroke: '#6A1B9A', fill: '#F3E5F5', font: '#6A1B9A' };
    case 'gray':
      return { stroke: '#616161', fill: '#F5F5F5', font: '#424242' };
    case 'green':
    case 'default':
      return { stroke: '#82b366', fill: '#d5e8d4', font: '#333333' };
  }
  if (/^#[0-9a-f]{6}$/i.test(normalized)) {
    return { stroke: normalized, fill: hexToLightBackground(normalized), font: normalized };
  }
  return { stroke: '#82b366', fill: '#d5e8d4', font: '#333333' };
}
