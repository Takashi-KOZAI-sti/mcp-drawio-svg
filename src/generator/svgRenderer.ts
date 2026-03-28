import type { InputEdge } from '../layout/elkLayout.js';
import type { LayoutResult, LayoutNode, LayoutGroup, NodeStyleOverrides, GroupStyleOverrides } from '../layout/elkLayout.js';
import type { NodeIcons, NodeHighlights } from './mxGraphModel.js';
import { buildBoundsMap, computeEdgePoints } from './edgeLayout.js';

// Re-export color helpers by inlining them (avoids circular deps in SVG context)
function resolveColor(color: string): string {
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

function resolveColorLight(color: string): string {
  switch (color.toLowerCase()) {
    case 'red':    return '#FFEBEE';
    case 'yellow': return '#FFFDE7';
    case 'blue':   return '#E3F2FD';
    case 'orange': return '#FFF3E0';
    case 'green':  return '#E8F5E9';
    case 'purple': return '#F3E5F5';
  }
  if (/^#[0-9a-f]{6}$/i.test(color)) return hexToLight(color);
  return '#f5f5f5';
}

function hexToLight(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.round(r * 0.15 + 255 * 0.85);
  const lg = Math.round(g * 0.15 + 255 * 0.85);
  const lb = Math.round(b * 0.15 + 255 * 0.85);
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
}

function groupColors(style?: string): { stroke: string; fill: string; font: string } {
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
    return { stroke: normalized, fill: hexToLight(normalized), font: normalized };
  }
  return { stroke: '#82b366', fill: '#d5e8d4', font: '#333333' };
}

const LABEL_FONT_SIZE = 11;
const LABEL_LINE_HEIGHT = 14;
const PADDING = 20;

/**
 * Generate the SVG visual rendering section (the part humans actually see).
 * This is the SVG content that gets embedded in markdown/browsers.
 */
export function generateSvgVisual(
  layout: LayoutResult,
  edges: InputEdge[],
  icons: NodeIcons,
  highlights: NodeHighlights = {},
): string {
  const width = layout.totalWidth;
  const height = layout.totalHeight;

  const parts: string[] = [];

  // Background
  parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="white"/>`);

  // Groups (draw background first so nodes appear on top)
  function renderGroupRecursive(group: LayoutGroup, offsetX: number, offsetY: number): void {
    const absX = offsetX + group.x;
    const absY = offsetY + group.y;
    parts.push(renderGroupAt(group, absX, absY));
    for (const node of group.nodes) {
      parts.push(renderNode(node, absX + node.x, absY + node.y, icons[node.id], highlights[node.id], node.style_overrides));
    }
    for (const child of group.groups) {
      renderGroupRecursive(child, absX, absY);
    }
  }
  for (const group of layout.groups) {
    renderGroupRecursive(group, 0, 0);
  }

  // Top-level nodes
  for (const node of layout.nodes) {
    parts.push(renderNode(node, node.x, node.y, icons[node.id], highlights[node.id], node.style_overrides));
  }

  // Edges (draw last so they appear on top)
  parts.push(...renderEdges(edges, layout));

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${width + PADDING * 2}" height="${height + PADDING * 2}" ` +
    `viewBox="${-PADDING} ${-PADDING} ${width + PADDING * 2} ${height + PADDING * 2}">` +
    `<defs>` +
    `<marker id="arrow-end" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">` +
    `<polygon points="0 0, 10 3.5, 0 7" fill="#666"/></marker>` +
    `<marker id="arrow-start" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">` +
    `<polygon points="10 0, 0 3.5, 10 7" fill="#666"/></marker>` +
    `</defs>` +
    parts.join('') +
    `</svg>`
  );
}

function renderGroupAt(group: LayoutGroup, absX: number, absY: number): string {
  const so = group.style_overrides as GroupStyleOverrides | undefined;
  const { stroke, fill, font } = groupColors(group.style);
  const finalStroke = so?.stroke_color ?? stroke;
  const finalFill = so?.fill_color ?? fill;
  const finalFont = so?.font_color ?? font;
  const fontSize = so?.font_size ?? LABEL_FONT_SIZE;
  const strokeWidth = so?.stroke_width ?? 1.5;
  const rounded = so?.rounded !== undefined ? so.rounded : true;
  const rx = rounded ? (so?.corner_radius !== undefined ? String(so.corner_radius * 0.6) : '6') : '0';
  const dashAttr = so?.stroke_dashed ? ' stroke-dasharray="6,3"' : '';
  const opacityAttr = (so?.opacity !== undefined && so.opacity !== 100) ? ` opacity="${so.opacity / 100}"` : '';
  const fontWeight = (so?.font_bold !== undefined ? so.font_bold : true) ? 'bold' : 'normal';
  const fontStyle = so?.font_italic ? 'italic' : 'normal';
  const textDecoration = so?.font_underline ? 'underline' : 'none';
  const filterAttr = so?.shadow ? ' filter="drop-shadow(2px 2px 3px rgba(0,0,0,0.3))"' : '';
  return (
    `<rect x="${absX}" y="${absY}" width="${group.width}" height="${group.height}" ` +
    `rx="${rx}" fill="${finalFill}" stroke="${finalStroke}" stroke-width="${strokeWidth}"${dashAttr}${opacityAttr}${filterAttr}/>` +
    `<text x="${absX + 10}" y="${absY + 16}" ` +
    `font-family="Arial,sans-serif" font-size="${fontSize}" ` +
    `font-weight="${fontWeight}" font-style="${fontStyle}" text-decoration="${textDecoration}" fill="${finalFont}">${escapeXml(group.label)}</text>`
  );
}

function renderNode(
  node: LayoutNode,
  absX: number,
  absY: number,
  icon?: { drawioDataUri: string; svgDataUri: string },
  highlight?: string,
  so?: NodeStyleOverrides,
): string {
  const iconSize = 65;
  const cx = absX + node.width / 2;
  const fontSize = so?.font_size ?? LABEL_FONT_SIZE;
  const fontColor = so?.font_color ?? '#333';
  const fontWeight = so?.font_bold ? 'bold' : 'normal';
  const fontStyleAttr = so?.font_italic ? 'italic' : 'normal';
  const textDecoration = so?.font_underline ? 'underline' : (so?.font_strikethrough ? 'line-through' : 'none');
  const opacityAttr = (so?.opacity !== undefined && so.opacity !== 100) ? ` opacity="${so.opacity / 100}"` : '';
  const filterAttr = so?.shadow ? ' filter="drop-shadow(2px 2px 3px rgba(0,0,0,0.3))"' : '';

  if (icon) {
    const lines = node.label.split('\n').flatMap((l) => wrapText(l, 80));
    const textY = absY + iconSize + fontSize;
    const textLines = lines
      .map(
        (line, i) =>
          `<tspan x="${cx}" dy="${i === 0 ? 0 : LABEL_LINE_HEIGHT}">${escapeXml(line)}</tspan>`,
      )
      .join('');

    const strokeColor = so?.stroke_color ?? (highlight ? resolveColor(highlight) : null);
    const strokeWidth = so?.stroke_width ?? (highlight ? 2.5 : null);
    const highlightRect = strokeColor
      ? `<rect x="${absX - 2}" y="${absY - 2}" width="${iconSize + 4}" height="${iconSize + 4}" ` +
        `rx="4" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}"` +
        (so?.stroke_dashed ? ' stroke-dasharray="6,3"' : '') + `/>`
      : '';

    return (
      `<g${opacityAttr}${filterAttr}>` +
      `<image x="${absX}" y="${absY}" width="${iconSize}" height="${iconSize}" ` +
      `href="${icon.svgDataUri}" xlink:href="${icon.svgDataUri}"/>` +
      highlightRect +
      `<text x="${cx}" y="${textY}" text-anchor="middle" ` +
      `font-family="Arial,sans-serif" font-size="${fontSize}" fill="${fontColor}" ` +
      `font-weight="${fontWeight}" font-style="${fontStyleAttr}" text-decoration="${textDecoration}">` +
      textLines +
      `</text>` +
      `</g>`
    );
  } else {
    // Rectangle node
    const fill = so?.fill_color ?? (highlight ? resolveColorLight(highlight) : '#f5f5f5');
    const stroke = so?.stroke_color ?? (highlight ? resolveColor(highlight) : '#666');
    const strokeWidth = so?.stroke_width ?? (highlight ? 2 : 1);
    const rounded = so?.rounded !== undefined ? so.rounded : true;
    const rx = rounded ? '4' : '0';
    const dashAttr = so?.stroke_dashed ? ' stroke-dasharray="6,3"' : '';
    const rectLines = node.label.split('\n');
    const totalTextH = rectLines.length * LABEL_LINE_HEIGHT;
    const startY = absY + (node.height - totalTextH) / 2 + fontSize;
    const textAnchor = so?.text_align === 'left' ? 'start' : (so?.text_align === 'right' ? 'end' : 'middle');
    const textX = so?.text_align === 'left' ? absX + 6 : (so?.text_align === 'right' ? absX + node.width - 6 : cx);
    const tspans = rectLines
      .map((line, i) => `<tspan x="${textX}" dy="${i === 0 ? 0 : LABEL_LINE_HEIGHT}">${escapeXml(line)}</tspan>`)
      .join('');
    return (
      `<g${opacityAttr}${filterAttr}>` +
      `<rect x="${absX}" y="${absY}" width="${node.width}" height="${node.height}" ` +
      `rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${dashAttr}/>` +
      `<text x="${textX}" y="${startY}" text-anchor="${textAnchor}" ` +
      `font-family="Arial,sans-serif" font-size="${fontSize}" fill="${fontColor}" ` +
      `font-weight="${fontWeight}" font-style="${fontStyleAttr}" text-decoration="${textDecoration}">` +
      tspans +
      `</text>` +
      `</g>`
    );
  }
}

function renderEdges(edges: InputEdge[], layout: LayoutResult): string[] {
  const boundsMap = buildBoundsMap(layout);
  const edgePts = computeEdgePoints(edges, boundsMap);

  return edges.map((edge, i) => {
    const pts = edgePts[i];
    if (!pts) return '';

    const { srcX, srcY, tgtX, tgtY, exitSide } = pts;
    const so = edge.style_overrides;
    const isDashed = so?.stroke_dashed ?? (edge.style === 'dashed');
    const dash = isDashed ? 'stroke-dasharray="6,3"' : '';
    const strokeColor = so?.stroke_color ?? '#666';
    const strokeWidth = so?.stroke_width ?? 1.5;
    const opacityAttr = (so?.opacity !== undefined && so.opacity !== 100) ? ` opacity="${so.opacity / 100}"` : '';
    const connector = edge.connector ?? 'orthogonal';

    let points: string;
    let labelX: number;
    let labelY: number;

    if (connector === 'straight') {
      points = `${srcX},${srcY} ${tgtX},${tgtY}`;
      labelX = (srcX + tgtX) / 2;
      labelY = (srcY + tgtY) / 2 - 6;
    } else if (connector === 'elbow-h') {
      // Horizontal first bend
      points = `${srcX},${srcY} ${tgtX},${srcY} ${tgtX},${tgtY}`;
      labelX = (srcX + tgtX) / 2;
      labelY = srcY - 6;
    } else if (connector === 'elbow-v') {
      // Vertical first bend
      points = `${srcX},${srcY} ${srcX},${tgtY} ${tgtX},${tgtY}`;
      labelX = srcX + 4;
      labelY = (srcY + tgtY) / 2;
    } else {
      // orthogonal (default): route based on exit side
      let midPoints: string;
      if (exitSide === 'right' || exitSide === 'left') {
        // exit horizontally → turn vertically at midX
        const midX = (srcX + tgtX) / 2;
        midPoints = `${midX},${srcY} ${midX},${tgtY}`;
      } else {
        // exit vertically → turn horizontally at midY
        const midY = (srcY + tgtY) / 2;
        midPoints = `${srcX},${midY} ${tgtX},${midY}`;
      }
      points = `${srcX},${srcY} ${midPoints} ${tgtX},${tgtY}`;
      labelX = (srcX + tgtX) / 2;
      labelY = (srcY + tgtY) / 2 - 6;
    }

    const labelFontSize = so?.font_size ?? 10;
    const labelFontColor = so?.font_color ?? '#666';
    const labelFontWeight = so?.font_bold ? 'bold' : 'normal';
    const labelFontStyle = so?.font_italic ? 'italic' : 'normal';
    const labelTextDecoration = so?.font_underline ? 'underline' : 'none';
    const label = edge.label
      ? `<text x="${labelX}" y="${labelY}" text-anchor="middle" ` +
        `font-family="Arial,sans-serif" font-size="${labelFontSize}" fill="${labelFontColor}" ` +
        `font-weight="${labelFontWeight}" font-style="${labelFontStyle}" text-decoration="${labelTextDecoration}">${escapeXml(edge.label)}</text>`
      : '';

    const markerEnd = edge.arrow === 'none' ? '' : 'marker-end="url(#arrow-end)"';
    const markerStart = edge.arrow === 'both' ? 'marker-start="url(#arrow-start)"' : '';

    return (
      `<polyline points="${points}" ` +
      `fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" ${dash} ${markerStart} ${markerEnd}${opacityAttr}/>` +
      label
    );
  });
}

function wrapText(text: string, maxWidth: number): string[] {
  if (text.length <= maxWidth / 6) return [text];
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length * 6 > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
