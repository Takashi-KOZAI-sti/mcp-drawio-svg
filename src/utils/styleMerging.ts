import type { NodeStyleOverrides, GroupStyleOverrides, EdgeStyleOverrides } from '../layout/elkLayout.js';

/** Parse a draw.io style string (e.g. "key1=val1;key2=val2;") into a Map. */
export function parseStyleMap(style: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of style.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    map.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
  }
  return map;
}

/**
 * Parse a style string preserving insertion order.
 * Returns the map and the key order array for faithful reconstruction.
 */
export function parseStyleWithOrder(style: string): { map: Map<string, string>; order: string[] } {
  const parts = style.split(';').filter((p) => p.trim());
  const map = new Map<string, string>();
  const order: string[] = [];
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq === -1) { map.set(part, ''); order.push(part); }
    else { const k = part.slice(0, eq); map.set(k, part.slice(eq + 1)); order.push(k); }
  }
  return { map, order };
}

/** Reconstruct a style string from a map and order array. */
export function styleMapToString(map: Map<string, string>, order: string[]): string {
  return order.filter((k) => map.has(k)).map((k) => map.get(k) ? `${k}=${map.get(k)}` : k).join(';') + ';';
}

/**
 * Merge style_overrides into an existing drawio style string for nodes.
 * Reads the current key=value pairs and applies overrides on top.
 */
export function mergeNodeStyleOverrides(existingStyle: string, so: NodeStyleOverrides): string {
  const { map, order } = parseStyleWithOrder(existingStyle);

  function set(k: string, v: string): void {
    if (!map.has(k)) order.push(k);
    map.set(k, v);
  }
  function del(k: string): void { map.delete(k); }

  if (so.fill_color !== undefined) set('fillColor', so.fill_color);
  if (so.stroke_color !== undefined) set('strokeColor', so.stroke_color);
  if (so.stroke_width !== undefined) set('strokeWidth', String(so.stroke_width));
  if (so.stroke_dashed !== undefined) { if (so.stroke_dashed) set('dashed', '1'); else del('dashed'); }
  if (so.font_color !== undefined) set('fontColor', so.font_color);
  if (so.font_size !== undefined) set('fontSize', String(so.font_size));

  // fontStyle bitmask: merge with existing
  let fontBits = parseInt(map.get('fontStyle') ?? '0') || 0;
  if (so.font_bold !== undefined) { if (so.font_bold) fontBits |= 1; else fontBits &= ~1; }
  if (so.font_italic !== undefined) { if (so.font_italic) fontBits |= 2; else fontBits &= ~2; }
  if (so.font_underline !== undefined) { if (so.font_underline) fontBits |= 4; else fontBits &= ~4; }
  if (so.font_strikethrough !== undefined) { if (so.font_strikethrough) fontBits |= 8; else fontBits &= ~8; }
  if (fontBits > 0) set('fontStyle', String(fontBits)); else del('fontStyle');

  if (so.opacity !== undefined) { if (so.opacity !== 100) set('opacity', String(so.opacity)); else del('opacity'); }
  if (so.rounded !== undefined) set('rounded', so.rounded ? '1' : '0');
  if (so.shadow !== undefined) { if (so.shadow) set('shadow', '1'); else del('shadow'); }
  if (so.text_align !== undefined) set('align', so.text_align);
  if (so.text_vertical_align !== undefined) set('verticalAlign', so.text_vertical_align);

  return styleMapToString(map, order);
}

export function mergeGroupStyleOverrides(existingStyle: string, so: GroupStyleOverrides): string {
  const { map, order } = parseStyleWithOrder(existingStyle);

  function set(k: string, v: string): void { if (!map.has(k)) order.push(k); map.set(k, v); }
  function del(k: string): void { map.delete(k); }

  if (so.fill_color !== undefined) set('fillColor', so.fill_color);
  if (so.stroke_color !== undefined) set('strokeColor', so.stroke_color);
  if (so.stroke_width !== undefined) set('strokeWidth', String(so.stroke_width));
  if (so.stroke_dashed !== undefined) { if (so.stroke_dashed) set('dashed', '1'); else del('dashed'); }
  if (so.rounded !== undefined) set('rounded', so.rounded ? '1' : '0');
  if (so.corner_radius !== undefined) set('arcSize', String(so.corner_radius));
  if (so.font_color !== undefined) set('fontColor', so.font_color);
  if (so.font_size !== undefined) set('fontSize', String(so.font_size));
  let fontBits = parseInt(map.get('fontStyle') ?? '1') || 1; // groups default bold
  if (so.font_bold !== undefined) { if (so.font_bold) fontBits |= 1; else fontBits &= ~1; }
  if (so.font_italic !== undefined) { if (so.font_italic) fontBits |= 2; else fontBits &= ~2; }
  if (so.font_underline !== undefined) { if (so.font_underline) fontBits |= 4; else fontBits &= ~4; }
  set('fontStyle', String(fontBits));
  if (so.opacity !== undefined) { if (so.opacity !== 100) set('opacity', String(so.opacity)); else del('opacity'); }
  if (so.text_align !== undefined) set('align', so.text_align);
  if (so.text_vertical_align !== undefined) set('verticalAlign', so.text_vertical_align);
  if (so.shadow !== undefined) { if (so.shadow) set('shadow', '1'); else del('shadow'); }

  return styleMapToString(map, order);
}

export function mergeEdgeUpdates(existingStyle: string, upd: {
  style?: 'solid' | 'dashed';
  connector?: 'straight' | 'orthogonal' | 'elbow-h' | 'elbow-v';
  arrow?: 'default' | 'none' | 'both';
  style_overrides?: EdgeStyleOverrides;
}): string {
  const { map, order } = parseStyleWithOrder(existingStyle);

  function set(k: string, v: string): void { if (!map.has(k)) order.push(k); map.set(k, v); }
  function del(k: string): void { map.delete(k); }

  // High-level style (solid/dashed)
  if (upd.style === 'dashed') set('dashed', '1');
  else if (upd.style === 'solid') del('dashed');

  // Connector (edgeStyle)
  if (upd.connector !== undefined) {
    switch (upd.connector) {
      case 'orthogonal': set('edgeStyle', 'orthogonalEdgeStyle'); del('elbow'); break;
      case 'straight':   del('edgeStyle'); del('elbow'); break;
      case 'elbow-h':    set('edgeStyle', 'elbowEdgeStyle'); set('elbow', 'horizontal'); break;
      case 'elbow-v':    set('edgeStyle', 'elbowEdgeStyle'); set('elbow', 'vertical'); break;
    }
  }

  // Arrow (startArrow / endArrow)
  if (upd.arrow !== undefined) {
    switch (upd.arrow) {
      case 'none':    set('endArrow', 'none'); set('startArrow', 'none'); break;
      case 'both':    del('endArrow'); set('startArrow', 'block'); break;
      case 'default': del('endArrow'); del('startArrow'); break;
    }
  }

  // style_overrides (fine-grained CSS-equivalent properties)
  const so = upd.style_overrides;
  if (so) {
    if (so.stroke_color !== undefined) set('strokeColor', so.stroke_color);
    if (so.stroke_width !== undefined) set('strokeWidth', String(so.stroke_width));
    if (so.stroke_dashed !== undefined) { if (so.stroke_dashed) set('dashed', '1'); else del('dashed'); }
    if (so.font_color !== undefined) set('fontColor', so.font_color);
    if (so.font_size !== undefined) set('fontSize', String(so.font_size));
    let fontBits = parseInt(map.get('fontStyle') ?? '0') || 0;
    if (so.font_bold !== undefined) { if (so.font_bold) fontBits |= 1; else fontBits &= ~1; }
    if (so.font_italic !== undefined) { if (so.font_italic) fontBits |= 2; else fontBits &= ~2; }
    if (so.font_underline !== undefined) { if (so.font_underline) fontBits |= 4; else fontBits &= ~4; }
    if (fontBits > 0) set('fontStyle', String(fontBits)); else del('fontStyle');
    if (so.opacity !== undefined) { if (so.opacity !== 100) set('opacity', String(so.opacity)); else del('opacity'); }
  }

  return styleMapToString(map, order);
}
