import type { InputEdge, LayoutGroup, LayoutNode, LayoutResult } from '../layout/elkLayout.js';
import { buildBoundsMap, computeEdgePoints } from './edgeLayout.js';

export interface NodeIcons {
  [nodeId: string]: {
    drawioDataUri: string;
    svgDataUri: string;
  } | undefined;
}

export interface NodeHighlights {
  [nodeId: string]: string | undefined;
}

/**
 * Generate mxGraphModel XML for the .drawio.svg content attribute.
 * Supports nested groups (groups containing other groups).
 */
export function generateMxGraphModel(
  layout: LayoutResult,
  edges: InputEdge[],
  icons: NodeIcons,
  highlights: NodeHighlights = {},
): string {
  let cellId = 2;
  const idMap: Record<string, string> = {};
  const cells: string[] = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>'];

  // Phase 1: assign numeric cell IDs to every node and group recursively
  function assignIds(groups: LayoutGroup[], nodes: LayoutNode[]): void {
    for (const n of nodes) idMap[n.id] = String(cellId++);
    for (const g of groups) {
      idMap[g.id] = String(cellId++);
      assignIds(g.groups, g.nodes);
    }
  }
  assignIds(layout.groups, layout.nodes);

  // Phase 2: emit top-level node cells (parent = "1")
  for (const node of layout.nodes) {
    cells.push(makeNodeCell(node, '1', icons, highlights, idMap));
  }

  // Phase 3: emit group cells recursively
  function emitGroup(group: LayoutGroup, parentCellId: string): void {
    const gId = idMap[group.id];
    cells.push(
      `<mxCell id="${gId}" value="${escapeXmlAttr(group.label)}" ` +
        `style="${buildGroupStyle(group.style)}" vertex="1" parent="${parentCellId}">` +
        `<mxGeometry x="${group.x}" y="${group.y}" width="${group.width}" height="${group.height}" as="geometry"/>` +
        `</mxCell>`,
    );
    for (const n of group.nodes) {
      cells.push(makeNodeCell(n, gId, icons, highlights, idMap));
    }
    for (const cg of group.groups) {
      emitGroup(cg, gId);
    }
  }
  for (const group of layout.groups) {
    emitGroup(group, '1');
  }

  // Phase 4: emit edges — distributed connection points to avoid overlaps
  const boundsMap = buildBoundsMap(layout);
  const edgePts = computeEdgePoints(edges, boundsMap);
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    const pts = edgePts[i];
    const edgeStyle = buildEdgeStyle(edge, pts);
    cells.push(
      `<mxCell id="${String(cellId++)}" value="${escapeXmlAttr(edge.label ?? '')}" ` +
        `style="${edgeStyle}" edge="1" source="${idMap[edge.source] ?? ''}" target="${idMap[edge.target] ?? ''}" parent="1">` +
        `<mxGeometry relative="1" as="geometry"/>` +
        `</mxCell>`,
    );
  }

  return `<mxGraphModel><root>${cells.join('')}</root></mxGraphModel>`;
}

function makeNodeCell(
  node: LayoutNode,
  parentCellId: string,
  icons: NodeIcons,
  highlights: NodeHighlights,
  idMap: Record<string, string>,
): string {
  const icon = icons[node.id];
  const highlight = highlights[node.id];
  const style = buildNodeStyle(icon?.drawioDataUri, highlight);
  return (
    `<mxCell id="${idMap[node.id]}" value="${escapeXmlAttr(node.label)}" ` +
    `style="${style}" vertex="1" parent="${parentCellId}">` +
    `<mxGeometry x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" as="geometry"/>` +
    `</mxCell>`
  );
}

function buildNodeStyle(drawioDataUri?: string, highlight?: string): string {
  if (drawioDataUri) {
    const strokePart = highlight
      ? `strokeColor=${resolveColor(highlight)};strokeWidth=3;`
      : 'strokeColor=none;';
    return (
      `shape=image;verticalLabelPosition=bottom;verticalAlign=top;align=center;` +
      `${strokePart}fillColor=none;aspect=fixed;image=${drawioDataUri};`
    );
  }
  const fillColor = highlight ? resolveColorLight(highlight) : '#f5f5f5';
  const strokeColor = highlight ? resolveColor(highlight) : '#666666';
  return `rounded=1;whiteSpace=wrap;html=1;fillColor=${fillColor};strokeColor=${strokeColor};`;
}

function buildEdgeStyle(edge: InputEdge, pts: { exitX: number; exitY: number; entryX: number; entryY: number }): string {
  const connector = edge.connector ?? 'orthogonal';
  const connectorPart =
    connector === 'straight' ? '' :
    connector === 'elbow-h'  ? 'edgeStyle=elbowEdgeStyle;elbow=horizontal;' :
    connector === 'elbow-v'  ? 'edgeStyle=elbowEdgeStyle;elbow=vertical;' :
    /* orthogonal (default) */ 'edgeStyle=orthogonalEdgeStyle;';
  const dashPart = edge.style === 'dashed' ? 'dashed=1;' : '';
  const exitPart = `exitX=${pts.exitX};exitY=${pts.exitY};exitDx=0;exitDy=0;`;
  const entryPart = `entryX=${pts.entryX};entryY=${pts.entryY};entryDx=0;entryDy=0;`;
  const arrowPart =
    edge.arrow === 'none' ? 'endArrow=none;' :
    edge.arrow === 'both' ? 'startArrow=block;startFill=1;endArrow=block;endFill=1;' :
    /* default */ 'endArrow=block;endFill=1;';
  return `${connectorPart}${exitPart}${entryPart}rounded=1;orthogonalLoop=1;jettySize=auto;${dashPart}${arrowPart}`;
}

/**
 * Build draw.io style for a group container.
 * Named colors: "blue", "orange", "red", "green", "purple", "gray".
 * Custom hex: "#RRGGBB". Legacy "vnet" is aliased to "blue".
 */
export function buildGroupStyle(style?: string): string {
  const { stroke, fill, font } = resolveGroupColors(style);
  return (
    `points=[];rounded=1;arcSize=7;` +
    `strokeColor=${stroke};fillColor=${fill};` +
    `fontSize=11;fontColor=${font};fontStyle=1;` +
    `align=left;verticalAlign=top;spacingLeft=10;`
  );
}

interface ColorTriple { stroke: string; fill: string; font: string }

function resolveGroupColors(style?: string): ColorTriple {
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
  if (/^#[0-9a-f]{6}$/i.test(color)) return hexToLightBackground(color);
  return '#f5f5f5';
}

function hexToLightBackground(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.round(r * 0.15 + 255 * 0.85);
  const lg = Math.round(g * 0.15 + 255 * 0.85);
  const lb = Math.round(b * 0.15 + 255 * 0.85);
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
}

function escapeXmlAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
