import type { InputEdge, LayoutGroup, LayoutNode, LayoutResult, NodeStyleOverrides, GroupStyleOverrides } from '../layout/elkLayout.js';
import { buildBoundsMap, computeEdgePoints } from './edgeLayout.js';
import { escapeXmlAttr } from '../utils/xmlEncoding.js';
import { resolveColor, resolveColorLight, hexToLightBackground, resolveGroupColors, type ColorTriple } from '../utils/colorResolution.js';

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
        `style="${buildGroupStyle(group.style, group.style_overrides)}" vertex="1" parent="${parentCellId}">` +
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
  const style = buildNodeStyle(icon?.drawioDataUri, highlight, node.style_overrides);
  return (
    `<mxCell id="${idMap[node.id]}" value="${escapeXmlAttr(node.label)}" ` +
    `style="${style}" vertex="1" parent="${parentCellId}">` +
    `<mxGeometry x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" as="geometry"/>` +
    `</mxCell>`
  );
}

export function buildNodeStyle(drawioDataUri?: string, highlight?: string, so?: NodeStyleOverrides): string {
  const fontStyle = buildFontStyleBitmask(so);

  if (drawioDataUri) {
    // Icon node
    const strokeColor = so?.stroke_color ?? (highlight ? resolveColor(highlight) : 'none');
    const strokeWidth = so?.stroke_width ?? (highlight ? 3 : undefined);
    const strokePart = strokeColor === 'none'
      ? 'strokeColor=none;'
      : `strokeColor=${strokeColor};${strokeWidth !== undefined ? `strokeWidth=${strokeWidth};` : ''}`;
    let style =
      `shape=image;verticalLabelPosition=bottom;verticalAlign=top;align=center;` +
      `${strokePart}fillColor=none;aspect=fixed;image=${drawioDataUri};`;
    if (so?.stroke_dashed) style += 'dashed=1;';
    if (so?.font_color) style += `fontColor=${so.font_color};`;
    if (so?.font_size !== undefined) style += `fontSize=${so.font_size};`;
    if (fontStyle > 0) style += `fontStyle=${fontStyle};`;
    if (so?.opacity !== undefined && so.opacity !== 100) style += `opacity=${so.opacity};`;
    if (so?.shadow) style += 'shadow=1;';
    return style;
  }

  // Rectangle node
  const fillColor = so?.fill_color ?? (highlight ? resolveColorLight(highlight) : '#f5f5f5');
  const strokeColor = so?.stroke_color ?? (highlight ? resolveColor(highlight) : '#666666');
  const rounded = so?.rounded !== undefined ? (so.rounded ? 1 : 0) : 1;
  let style = `rounded=${rounded};whiteSpace=wrap;html=1;fillColor=${fillColor};strokeColor=${strokeColor};`;
  if (so?.stroke_width !== undefined) style += `strokeWidth=${so.stroke_width};`;
  if (so?.stroke_dashed) style += 'dashed=1;';
  if (so?.font_color) style += `fontColor=${so.font_color};`;
  if (so?.font_size !== undefined) style += `fontSize=${so.font_size};`;
  if (fontStyle > 0) style += `fontStyle=${fontStyle};`;
  if (so?.opacity !== undefined && so.opacity !== 100) style += `opacity=${so.opacity};`;
  if (so?.shadow) style += 'shadow=1;';
  if (so?.text_align && so.text_align !== 'center') style += `align=${so.text_align};`;
  if (so?.text_vertical_align && so.text_vertical_align !== 'middle') style += `verticalAlign=${so.text_vertical_align};`;
  return style;
}

export function buildEdgeStyle(edge: InputEdge, pts: { exitX: number; exitY: number; entryX: number; entryY: number }): string {
  const connector = edge.connector ?? 'orthogonal';
  const so = edge.style_overrides;
  const connectorPart =
    connector === 'straight' ? '' :
    connector === 'elbow-h'  ? 'edgeStyle=elbowEdgeStyle;elbow=horizontal;' :
    connector === 'elbow-v'  ? 'edgeStyle=elbowEdgeStyle;elbow=vertical;' :
    /* orthogonal (default) */ 'edgeStyle=orthogonalEdgeStyle;';
  const isDashed = so?.stroke_dashed ?? (edge.style === 'dashed');
  const dashPart = isDashed ? 'dashed=1;' : '';
  const exitPart = `exitX=${pts.exitX};exitY=${pts.exitY};exitDx=0;exitDy=0;`;
  const entryPart = `entryX=${pts.entryX};entryY=${pts.entryY};entryDx=0;entryDy=0;`;
  const arrowPart =
    edge.arrow === 'none' ? 'endArrow=none;' :
    edge.arrow === 'both' ? 'startArrow=block;startFill=1;endArrow=block;endFill=1;' :
    /* default */ 'endArrow=block;endFill=1;';
  let style = `${connectorPart}${exitPart}${entryPart}rounded=1;orthogonalLoop=1;jettySize=auto;${dashPart}${arrowPart}`;
  if (so) {
    if (so.stroke_color) style += `strokeColor=${so.stroke_color};`;
    if (so.stroke_width !== undefined) style += `strokeWidth=${so.stroke_width};`;
    if (so.font_color) style += `fontColor=${so.font_color};`;
    if (so.font_size !== undefined) style += `fontSize=${so.font_size};`;
    const fontStyle = buildFontStyleBitmask(so);
    if (fontStyle > 0) style += `fontStyle=${fontStyle};`;
    if (so.opacity !== undefined && so.opacity !== 100) style += `opacity=${so.opacity};`;
  }
  return style;
}

/**
 * Build draw.io style for a group container.
 * Named colors: "blue", "orange", "red", "green", "purple", "gray".
 * Custom hex: "#RRGGBB". Legacy "vnet" is aliased to "blue".
 */
export function buildGroupStyle(style?: string, so?: GroupStyleOverrides): string {
  const { stroke, fill, font } = resolveGroupColors(style);
  const finalStroke = so?.stroke_color ?? stroke;
  const finalFill = so?.fill_color ?? fill;
  const finalFont = so?.font_color ?? font;
  const finalFontSize = so?.font_size ?? 11;
  const rounded = so?.rounded !== undefined ? (so.rounded ? 1 : 0) : 1;
  const arcSize = so?.corner_radius ?? 7;
  const textAlign = so?.text_align ?? 'left';
  const verticalAlign = so?.text_vertical_align ?? 'top';

  // Group label is bold by default; style_overrides.font_bold can override
  let fontStyle = so?.font_bold !== undefined ? (so.font_bold ? 1 : 0) : 1;
  if (so?.font_italic) fontStyle |= 2;
  if (so?.font_underline) fontStyle |= 4;

  let result =
    `points=[];rounded=${rounded};arcSize=${arcSize};` +
    `strokeColor=${finalStroke};fillColor=${finalFill};`;
  if (so?.stroke_width !== undefined) result += `strokeWidth=${so.stroke_width};`;
  if (so?.stroke_dashed) result += 'dashed=1;';
  result +=
    `fontSize=${finalFontSize};fontColor=${finalFont};fontStyle=${fontStyle};` +
    `align=${textAlign};verticalAlign=${verticalAlign};spacingLeft=10;`;
  if (so?.opacity !== undefined && so.opacity !== 100) result += `opacity=${so.opacity};`;
  if (so?.shadow) result += 'shadow=1;';
  return result;
}

/** Compute drawio fontStyle bitmask from style_overrides font flags. */
function buildFontStyleBitmask(so?: { font_bold?: boolean; font_italic?: boolean; font_underline?: boolean; font_strikethrough?: boolean }): number {
  if (!so) return 0;
  let v = 0;
  if (so.font_bold) v |= 1;
  if (so.font_italic) v |= 2;
  if (so.font_underline) v |= 4;
  if (so.font_strikethrough) v |= 8;
  return v;
}


