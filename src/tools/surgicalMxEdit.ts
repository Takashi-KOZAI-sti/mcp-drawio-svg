/**
 * Surgical editing for Format B (draw.io hand-crafted) .drawio.svg files.
 *
 * Strategy:
 *   1. Decode the mxGraphModel XML from the Format B `content` attribute
 *      (base64 → inflate-raw → URL-decode).
 *   2. Apply surgical changes directly to the mxCell XML via regex substitution:
 *        - Deletions: remove matching <mxCell> elements (and cascading edges).
 *        - Updates:   rewrite `value` / `style` attributes in-place.
 *        - Additions: append new <mxCell> elements with positions computed
 *                     from the existing cell bounding box.
 *   3. Re-encode the edited mxGraphModel (URL-encode → deflate-raw → base64)
 *      back into the <mxfile><diagram>…</diagram></mxfile> wrapper.
 *   4. Parse the edited mxGraphModel to produce a DiagramSpec, then build
 *      a LayoutResult (all positions preserved from mxGeometry) and render
 *      a fresh SVG visual with our standard renderer.
 *   5. Assemble: Format-B content attribute + fresh SVG body.
 *
 * Result: draw.io editing retains all original cell styles; SVG preview
 * accurately reflects every change (deletions gone, additions visible,
 * labels updated).
 */

import zlib from 'zlib';
import type { EditDrawioSvgInput } from './editDrawioSvg.js';
import { parseDrawioSvgContent } from '../parser/mxGraphModelParser.js';
import { resolveIcons, type InputNodeWithHighlight } from './createDrawioSvg.js';
import { buildPreservedLayoutResult } from '../layout/preservedLayout.js';
import { generateSvgVisual } from '../generator/svgRenderer.js';
import { buildGroupStyle, buildNodeStyle, buildEdgeStyle } from '../generator/mxGraphModel.js';
import type { InputEdge, NodeStyleOverrides, GroupStyleOverrides, EdgeStyleOverrides } from '../layout/elkLayout.js';
import { buildBoundsMap, computeEdgePoints, type Rect } from '../generator/edgeLayout.js';
import type { LayoutResult, LayoutNode, LayoutGroup } from '../layout/elkLayout.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const NODE_WIDTH = 65;
const NODE_HEIGHT = 85;
const GROUP_PADDING_TOP = 40;
const GROUP_PADDING_SIDE = 20;

// ─── HTML / XML helpers ────────────────────────────────────────────────────────

function htmlDecode(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#10;/g, '\n')
    .replace(/&#13;/g, '\r');
}

function htmlEncode(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeXmlAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * mxCell value attribute encoder.
 * Normalizes existing entities first (avoids double-encoding &#10; → &amp;#10;),
 * then re-encodes as valid XML attribute value with newlines as &#10;.
 */
function valueToXmlAttr(str: string): string {
  return str
    // Step 1: normalize entities → characters
    .replace(/&#10;/g, '\n')
    .replace(/&#13;/g, '\r')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    // Step 2: XML attribute encode (newlines → &#10;)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '&#10;')
    .replace(/\r/g, '&#13;');
}

function extractAttr(attrs: string, name: string): string | undefined {
  const re = new RegExp(`\\b${name}="([^"]*)"`, 'i');
  const m = re.exec(attrs);
  return m ? m[1] : undefined;
}

// ─── Format B decode / encode ─────────────────────────────────────────────────

interface FormatBParts {
  /** Decoded mxGraphModel XML (ready to parse / modify). */
  mxXml: string;
  /** The decoded mxfile string, up to and including the opening <diagram ...> tag. */
  preDiagram: string;
  /** The decoded mxfile string from </diagram> to the end. */
  postDiagram: string;
}

function extractFormatBMxXml(rawSvgContent: string): FormatBParts {
  const contentMatch = rawSvgContent.match(/\bcontent="([\s\S]*?)(?="(?:\s|\/?>|\s+data-))/);
  if (!contentMatch) throw new Error('No content attribute found in SVG');

  const decoded = htmlDecode(contentMatch[1]);
  if (!decoded.startsWith('<mxfile')) throw new Error('Not a Format B drawio file');

  const diagramRe = /(<diagram[^>]*>)([\s\S]*?)(<\/diagram>)/;
  const dm = decoded.match(diagramRe);
  if (!dm) throw new Error('No <diagram> element found in mxfile content');

  const base64Data = dm[2].trim();
  // Some draw.io versions embed the XML directly (uncompressed) inside <diagram>
  const mxXml = base64Data.startsWith('<mxGraphModel')
    ? base64Data
    : decodeURIComponent(zlib.inflateRawSync(Buffer.from(base64Data, 'base64')).toString('utf-8'));

  const diagTagEnd = decoded.indexOf(dm[1]) + dm[1].length;
  const diagContentEnd = diagTagEnd + dm[2].length;

  return {
    mxXml,
    preDiagram: decoded.substring(0, diagTagEnd),
    postDiagram: decoded.substring(diagContentEnd),
  };
}

function encodeFormatBContent(mxXml: string, parts: FormatBParts): string {
  const urlEncoded = encodeURIComponent(mxXml);
  const compressed = zlib.deflateRawSync(Buffer.from(urlEncoded, 'utf-8'));
  const base64Data = compressed.toString('base64');
  const newDecoded = parts.preDiagram + base64Data + parts.postDiagram;
  return htmlEncode(newDecoded);
}

// ─── Raw cell types & parsing ──────────────────────────────────────────────────

interface RawCell {
  numericId: string;
  value: string;
  style: string;
  isVertex: boolean;
  isEdge: boolean;
  parent: string;
  source: string;
  target: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function parseCells(xml: string): RawCell[] {
  const cells: RawCell[] = [];
  const re = /<mxCell\s([\s\S]*?)(?:>[\s\S]*?<\/mxCell>|\/>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1];
    const numericId = extractAttr(attrs, 'id') ?? '';
    if (numericId === '0' || numericId === '1') continue;
    const value = htmlDecode(extractAttr(attrs, 'value') ?? '');
    const style = extractAttr(attrs, 'style') ?? '';
    const isVertex = /\bvertex="1"/.test(attrs);
    const isEdge = /\bedge="1"/.test(attrs);
    const parent = extractAttr(attrs, 'parent') ?? '1';
    const source = extractAttr(attrs, 'source') ?? '';
    const target = extractAttr(attrs, 'target') ?? '';
    const geom = extractGeometry(m[0]);
    cells.push({ numericId, value, style, isVertex, isEdge, parent, source, target, ...geom });
  }
  return cells;
}

function extractGeometry(cellXml: string): { x: number; y: number; width: number; height: number } {
  const gm = cellXml.match(/<mxGeometry\s([^>]*)(?:\/>|>)/);
  if (!gm) return { x: 0, y: 0, width: NODE_WIDTH, height: NODE_HEIGHT };
  const g = gm[1];
  return {
    x: parseFloat(extractAttr(g, 'x') ?? '0') || 0,
    y: parseFloat(extractAttr(g, 'y') ?? '0') || 0,
    width: parseFloat(extractAttr(g, 'width') ?? String(NODE_WIDTH)) || NODE_WIDTH,
    height: parseFloat(extractAttr(g, 'height') ?? String(NODE_HEIGHT)) || NODE_HEIGHT,
  };
}

function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'node';
}

// ─── ID maps ──────────────────────────────────────────────────────────────────

function buildIdMaps(cells: RawCell[]): {
  numericToLogical: Map<string, string>;
  logicalToNumeric: Map<string, string>;
} {
  const slugCount = new Map<string, number>();
  const numericToLogical = new Map<string, string>();
  for (const c of cells.filter((c) => c.isVertex)) {
    const slug = slugify(c.value || c.numericId);
    const count = (slugCount.get(slug) ?? 0) + 1;
    slugCount.set(slug, count);
    const logicalId = count === 1 ? slug : `${slug}_${count}`;
    numericToLogical.set(c.numericId, logicalId);
  }
  const logicalToNumeric = new Map<string, string>(
    Array.from(numericToLogical.entries()).map(([n, l]) => [l, n]),
  );
  return { numericToLogical, logicalToNumeric };
}

// ─── Absolute coordinates ─────────────────────────────────────────────────────

function computeAbsCoords(cells: RawCell[]): Map<string, { x: number; y: number }> {
  const byId = new Map<string, RawCell>(cells.map((c) => [c.numericId, c]));
  const result = new Map<string, { x: number; y: number }>();

  function getAbs(id: string, visited = new Set<string>()): { x: number; y: number } {
    if (result.has(id)) return result.get(id)!;
    if (visited.has(id)) return { x: 0, y: 0 };
    visited.add(id);
    const cell = byId.get(id);
    if (!cell) return { x: 0, y: 0 };
    if (cell.parent === '1' || cell.parent === '0') {
      const pos = { x: cell.x, y: cell.y };
      result.set(id, pos);
      return pos;
    }
    const pp = getAbs(cell.parent, visited);
    const pos = { x: pp.x + cell.x, y: pp.y + cell.y };
    result.set(id, pos);
    return pos;
  }
  for (const c of cells) if (c.isVertex) getAbs(c.numericId);
  return result;
}

/** Compute the bounding box of all existing vertex cells (absolute coords). */
function computeBbox(cells: RawCell[], absCoords: Map<string, { x: number; y: number }>): {
  maxRight: number; maxBottom: number;
} {
  let maxRight = 0;
  let maxBottom = 0;
  for (const c of cells) {
    if (!c.isVertex) continue;
    const abs = absCoords.get(c.numericId) ?? { x: c.x, y: c.y };
    const r = abs.x + c.width;
    const b = abs.y + c.height;
    if (r > maxRight) maxRight = r;
    if (b > maxBottom) maxBottom = b;
  }
  return { maxRight, maxBottom };
}

// ─── Style builders ───────────────────────────────────────────────────────────

/**
 * Merge style_overrides into an existing drawio style string.
 * Reads the current key=value pairs and applies overrides on top.
 */
function mergeNodeStyleOverrides(existingStyle: string, so: NodeStyleOverrides): string {
  const parts = existingStyle.split(';').filter((p) => p.trim());
  const map = new Map<string, string>();
  const order: string[] = [];
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq === -1) {
      map.set(part, '');
      order.push(part);
    } else {
      const k = part.slice(0, eq);
      map.set(k, part.slice(eq + 1));
      order.push(k);
    }
  }

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

  return order.filter((k) => map.has(k)).map((k) => map.get(k) ? `${k}=${map.get(k)}` : k).join(';') + ';';
}

function mergeGroupStyleOverrides(existingStyle: string, so: GroupStyleOverrides): string {
  const parts = existingStyle.split(';').filter((p) => p.trim());
  const map = new Map<string, string>();
  const order: string[] = [];
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq === -1) { map.set(part, ''); order.push(part); }
    else { const k = part.slice(0, eq); map.set(k, part.slice(eq + 1)); order.push(k); }
  }

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

  return order.filter((k) => map.has(k)).map((k) => map.get(k) ? `${k}=${map.get(k)}` : k).join(';') + ';';
}

function mergeEdgeUpdates(existingStyle: string, upd: {
  style?: 'solid' | 'dashed';
  connector?: 'straight' | 'orthogonal' | 'elbow-h' | 'elbow-v';
  arrow?: 'default' | 'none' | 'both';
  style_overrides?: EdgeStyleOverrides;
}): string {
  const parts = existingStyle.split(';').filter((p) => p.trim());
  const map = new Map<string, string>();
  const order: string[] = [];
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq === -1) { map.set(part, ''); order.push(part); }
    else { const k = part.slice(0, eq); map.set(k, part.slice(eq + 1)); order.push(k); }
  }

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

  return order.filter((k) => map.has(k)).map((k) => map.get(k) ? `${k}=${map.get(k)}` : k).join(';') + ';';
}

// ─── Main surgical edit function ───────────────────────────────────────────────

/**
 * Apply all requested changes to a Format B mxGraphModel, regenerate the SVG
 * visual from the edited state, and return the assembled .drawio.svg string.
 */
export async function surgicallyEditFormatB(
  rawSvgContent: string,
  input: EditDrawioSvgInput,
): Promise<string> {
  // 1. Decode the mxGraphModel XML from the Format B content attribute
  const parts = extractFormatBMxXml(rawSvgContent);

  // 2. Parse existing cells and build logical⟷numeric ID maps
  const cells = parseCells(parts.mxXml);
  const { logicalToNumeric } = buildIdMaps(cells);

  // 3. Resolve icons for new nodes (needed to embed drawio data URIs in mxCell style)
  const newNodeIconMap = await resolveNewNodeIcons(input.add_nodes ?? []);

  // 4. Apply surgical changes to the mxXml string
  const editedMxXml = applyChanges(parts.mxXml, cells, logicalToNumeric, newNodeIconMap, input);

  // 5. Re-encode the edited mxGraphModel as Format B
  const newContentEncoded = encodeFormatBContent(editedMxXml, parts);

  // 6. Parse the edited mxGraphModel to build DiagramSpec (preserving all positions)
  const fakeSvg = `<svg content="${htmlEncode(editedMxXml)}"></svg>`;
  const spec = parseDrawioSvgContent(fakeSvg, input.file_path);

  // 7. Build LayoutResult — ALL positions come from mxGeometry (no new node IDs)
  const spacing = input.layout?.spacing ?? 60;
  const nodesForLayout: InputNodeWithHighlight[] = spec.nodes.map((n) => ({
    id: n.id,
    label: n.label,
    icon_path: undefined,
    icon_data_uri: n.icon_data_uri,
    highlight: n.highlight ?? null,
    x_hint: n.x_hint,
    y_hint: n.y_hint,
    x_geom: n.x_geom,
    y_geom: n.y_geom,
    width: n.width,
    height: n.height,
    style_overrides: n.style_overrides,
  }));
  const layoutResult = buildPreservedLayoutResult(
    nodesForLayout,
    spec.edges,
    spec.groups,
    new Set<string>(),  // no "new" node IDs — all positions already in mxGeometry
    new Set<string>(),  // no "new" group IDs
    spacing,
  );

  // 8. Resolve icons for SVG rendering (includes existing nodes' embedded icons)
  const { icons, highlights } = await resolveIcons(nodesForLayout);

  // 9. Generate SVG visual
  const svgVisual = generateSvgVisual(layoutResult, spec.edges, icons, highlights);

  // 10. Assemble final file
  return assembleSvgFile(svgVisual, newContentEncoded);
}

// ─── Icon resolution for new nodes ────────────────────────────────────────────

interface NewNodeIconData {
  drawioDataUri?: string;
  highlight?: string | null;
  style_overrides?: import('../layout/elkLayout.js').NodeStyleOverrides;
}

async function resolveNewNodeIcons(
  addNodes: NonNullable<EditDrawioSvgInput['add_nodes']>,
): Promise<Map<string, NewNodeIconData>> {
  const result = new Map<string, NewNodeIconData>();
  const nodesForResolve: InputNodeWithHighlight[] = addNodes.map((n) => ({
    id: n.id,
    label: n.label,
    icon_path: n.icon_path ?? undefined,
    icon_data_uri: n.icon_data_uri,
    highlight: n.highlight ?? null,
    style_overrides: n.style_overrides,
  }));
  const { icons, highlights } = await resolveIcons(nodesForResolve);
  for (const n of addNodes) {
    result.set(n.id, {
      drawioDataUri: icons[n.id]?.drawioDataUri,
      highlight: highlights[n.id] ?? n.highlight ?? null,
      style_overrides: n.style_overrides,
    });
  }
  return result;
}

// ─── Core surgical mxXml modification ─────────────────────────────────────────

function applyChanges(
  mxXml: string,
  cells: RawCell[],
  logicalToNumeric: Map<string, string>,
  newNodeIconMap: Map<string, NewNodeIconData>,
  input: EditDrawioSvgInput,
): string {
  const spacing = input.layout?.spacing ?? 60;
  const absCoords = computeAbsCoords(cells);
  const bbox = computeBbox(cells, absCoords);

  // ── Deletion sets ──
  const removeLogicals = new Set([...(input.remove_nodes ?? []), ...(input.remove_groups ?? [])]);
  const removeNumIds = new Set<string>();
  for (const logId of removeLogicals) {
    const numId = logicalToNumeric.get(logId);
    if (numId) removeNumIds.add(numId);
  }

  // When a GROUP is deleted, its direct children should be re-parented to the group's parent.
  // Build a map: deletedGroupNumId → its parent numId.
  const groupParentMap = new Map<string, string>();
  for (const c of cells) {
    if (c.isVertex && removeNumIds.has(c.numericId)) {
      groupParentMap.set(c.numericId, c.parent);
    }
  }

  // remove_edges by source::target
  const removeEdgeSet = new Set<string>();
  for (const e of input.remove_edges ?? []) {
    const s = logicalToNumeric.get(e.source) ?? e.source;
    const t = logicalToNumeric.get(e.target) ?? e.target;
    removeEdgeSet.add(`${s}::${t}`);
  }

  // ── Update map ──
  // style can be a full new style string, or a style_overrides merger function
  const updateMap = new Map<string, {
    value?: string;
    style?: string;
    styleOverridesFn?: (existing: string) => string;
  }>();
  for (const upd of input.update_nodes ?? []) {
    const numId = logicalToNumeric.get(upd.id);
    if (!numId) continue;
    const entry: { value?: string; style?: string; styleOverridesFn?: (s: string) => string } = {};
    if (upd.label !== undefined) entry.value = upd.label;
    if (upd.style_overrides !== undefined) {
      const so = upd.style_overrides;
      entry.styleOverridesFn = (existing: string) => mergeNodeStyleOverrides(existing, so);
    }
    updateMap.set(numId, entry);
  }
  for (const upd of input.update_groups ?? []) {
    const numId = logicalToNumeric.get(upd.id);
    if (!numId) continue;
    const entry: { value?: string; style?: string; styleOverridesFn?: (s: string) => string } = {};
    if (upd.label !== undefined) entry.value = upd.label;
    if (upd.style !== undefined) entry.style = buildGroupStyle(upd.style, upd.style_overrides);
    else if (upd.style_overrides !== undefined) {
      const so = upd.style_overrides;
      entry.styleOverridesFn = (existing: string) => mergeGroupStyleOverrides(existing, so);
    }
    updateMap.set(numId, entry);
  }

  // ── Edge update map (keyed by "numericSrc::numericTgt") ──
  const updateEdgeMap = new Map<string, {
    value?: string;
    styleFn?: (existing: string) => string;
  }>();
  for (const upd of input.update_edges ?? []) {
    const s = logicalToNumeric.get(upd.source) ?? upd.source;
    const t = logicalToNumeric.get(upd.target) ?? upd.target;
    const entry: { value?: string; styleFn?: (existing: string) => string } = {};
    if (upd.label !== undefined) entry.value = upd.label;
    if (upd.style !== undefined || upd.connector !== undefined ||
        upd.arrow !== undefined || upd.style_overrides !== undefined) {
      const captured = upd;
      entry.styleFn = (existing: string) => mergeEdgeUpdates(existing, captured);
    }
    updateEdgeMap.set(`${s}::${t}`, entry);
  }

  // ── IDs of nodes being moved into a new group ──
  const newGroupChildIds = new Set<string>(
    (input.add_groups ?? []).flatMap((g) => g.children),
  );

  // ── Phase A: apply deletions / reparenting / updates via regex ──
  const cellRegex = /<mxCell\s([\s\S]*?)(?:>[\s\S]*?<\/mxCell>|\/>)/g;
  let result = mxXml.replace(cellRegex, (match, attrs) => {
    const id  = extractAttr(attrs, 'id');
    const par = extractAttr(attrs, 'parent');
    const src = extractAttr(attrs, 'source');
    const tgt = extractAttr(attrs, 'target');

    // Delete this node/group
    if (id && removeNumIds.has(id)) return '';
    // Delete edges connected to removed nodes
    if ((src && removeNumIds.has(src)) || (tgt && removeNumIds.has(tgt))) return '';
    // Delete explicitly requested edges
    if (src && tgt && removeEdgeSet.has(`${src}::${tgt}`)) return '';

    // Re-parent children whose group was deleted
    if (par && groupParentMap.has(par)) {
      match = match.replace(`parent="${par}"`, `parent="${groupParentMap.get(par)}"`);
    }

    // Apply value / style updates (nodes and groups)
    if (id) {
      const upd = updateMap.get(id);
      if (upd?.value !== undefined) {
        match = match.replace(/\bvalue="[^"]*"/, `value="${valueToXmlAttr(upd.value)}"`);
      }
      if (upd?.style !== undefined) {
        match = match.replace(/\bstyle="[^"]*"/, `style="${upd.style}"`);
      } else if (upd?.styleOverridesFn) {
        // Merge style_overrides into the existing style string
        const existingStyleMatch = match.match(/\bstyle="([^"]*)"/);
        if (existingStyleMatch) {
          const newStyle = upd.styleOverridesFn(existingStyleMatch[1]);
          match = match.replace(/\bstyle="[^"]*"/, `style="${newStyle}"`);
        }
      }
    }

    // Apply edge updates (identified by source::target pair)
    if (src && tgt) {
      const edgeUpd = updateEdgeMap.get(`${src}::${tgt}`);
      if (edgeUpd) {
        if (edgeUpd.value !== undefined) {
          match = match.replace(/\bvalue="[^"]*"/, `value="${valueToXmlAttr(edgeUpd.value)}"`);
        }
        if (edgeUpd.styleFn) {
          const existingStyleMatch = match.match(/\bstyle="([^"]*)"/);
          if (existingStyleMatch) {
            const newStyle = edgeUpd.styleFn(existingStyleMatch[1]);
            match = match.replace(/\bstyle="[^"]*"/, `style="${newStyle}"`);
          }
        }
      }
    }

    return match;
  });

  // ── Phase B: generate new mxCell elements ──
  let nextId = Math.max(...cells.map((c) => parseInt(c.numericId) || 0)) + 1;
  const newIdMap = new Map<string, string>(); // logical id → assigned numeric id
  const newCells: string[] = [];

  // New top-level nodes (not in any new group)
  let newNodeX = bbox.maxRight > 0 ? bbox.maxRight + spacing : 0;
  let newNodeY = 20;
  for (const n of input.add_nodes ?? []) {
    if (newGroupChildIds.has(n.id)) continue; // will be placed inside group
    const numId = String(nextId++);
    newIdMap.set(n.id, numId);
    const iconData = newNodeIconMap.get(n.id);
    const style = buildNodeStyle(iconData?.drawioDataUri, iconData?.highlight ?? n.highlight ?? undefined, iconData?.style_overrides);
    newCells.push(
      `<mxCell id="${numId}" value="${valueToXmlAttr(n.label)}" ` +
      `style="${style}" vertex="1" parent="1">` +
      `<mxGeometry x="${newNodeX}" y="${newNodeY}" width="${NODE_WIDTH}" height="${NODE_HEIGHT}" as="geometry"/>` +
      `</mxCell>`,
    );
    newNodeY += NODE_HEIGHT + spacing;
  }

  // New groups (with their children)
  let newGroupX = bbox.maxRight > 0 ? bbox.maxRight + spacing : 0;
  // Advance past newly placed top-level nodes
  if (input.add_nodes?.some((n) => !newGroupChildIds.has(n.id))) {
    newGroupX = newNodeX + NODE_WIDTH + spacing;
  }

  for (const g of input.add_groups ?? []) {
    const groupNumId = String(nextId++);
    newIdMap.set(g.id, groupNumId);

    // Split children into existing (already in diagram) and new (from add_nodes)
    const existingChildren: Array<{ logId: string; numId: string; abs: { x: number; y: number }; width: number; height: number }> = [];
    const newChildren: Array<{ logId: string; n: NonNullable<EditDrawioSvgInput['add_nodes']>[number] }> = [];

    for (const childId of g.children) {
      const existingNumId = logicalToNumeric.get(childId);
      if (existingNumId) {
        const cell = cells.find((c) => c.numericId === existingNumId);
        if (cell) {
          const abs = absCoords.get(existingNumId) ?? { x: cell.x, y: cell.y };
          existingChildren.push({ logId: childId, numId: existingNumId, abs, width: cell.width, height: cell.height });
        }
      } else {
        const newNode = (input.add_nodes ?? []).find((n) => n.id === childId);
        if (newNode) newChildren.push({ logId: childId, n: newNode });
      }
    }

    // Compute group position:
    // If there are existing children: wrap around them (group pos = top-left of children - padding)
    // If only new children: place to the right of existing diagram
    let groupX: number;
    let groupY: number;
    let groupWidth: number;
    let groupHeight: number;

    if (existingChildren.length > 0) {
      const minX = Math.min(...existingChildren.map((c) => c.abs.x)) - GROUP_PADDING_SIDE;
      const minY = Math.min(...existingChildren.map((c) => c.abs.y)) - GROUP_PADDING_TOP;
      const maxX = Math.max(...existingChildren.map((c) => c.abs.x + c.width)) + GROUP_PADDING_SIDE;
      const maxY = Math.max(...existingChildren.map((c) => c.abs.y + c.height)) + GROUP_PADDING_SIDE;
      groupX = minX;
      groupY = minY;
      groupWidth = maxX - minX;
      groupHeight = maxY - minY;
      // Add room for new children below existing ones
      const extraHeight = newChildren.length * (NODE_HEIGHT + spacing);
      groupHeight += extraHeight;
    } else {
      // All new children
      groupX = newGroupX;
      groupY = 20;
      groupWidth = NODE_WIDTH + GROUP_PADDING_SIDE * 2;
      groupHeight = GROUP_PADDING_TOP + newChildren.length * (NODE_HEIGHT + spacing) + GROUP_PADDING_SIDE;
      newGroupX += groupWidth + spacing;
    }

    // Group cell
    newCells.push(
      `<mxCell id="${groupNumId}" value="${valueToXmlAttr(g.label)}" ` +
      `style="${buildGroupStyle(g.style)}" vertex="1" parent="1">` +
      `<mxGeometry x="${groupX}" y="${groupY}" width="${groupWidth}" height="${groupHeight}" as="geometry"/>` +
      `</mxCell>`,
    );

    // Existing children: update parent and convert to group-relative coords
    // (Do this via a second pass regex substitution below)
    for (const ec of existingChildren) {
      const relX = ec.abs.x - groupX;
      const relY = ec.abs.y - groupY;
      // We'll patch these cells in the result string
      result = patchCellParentAndPos(result, ec.numId, groupNumId, relX, relY);
    }

    // New children inside group
    let childY = GROUP_PADDING_TOP;
    // If there are existing children, start new ones below them
    if (existingChildren.length > 0) {
      const maxExistingRelY = Math.max(...existingChildren.map((ec) => (ec.abs.y - groupY) + ec.height));
      childY = maxExistingRelY + spacing;
    }

    for (const { n } of newChildren) {
      const childNumId = String(nextId++);
      newIdMap.set(n.id, childNumId);
      const iconData = newNodeIconMap.get(n.id);
      const style = buildNodeStyle(iconData?.drawioDataUri, iconData?.highlight ?? n.highlight ?? undefined, iconData?.style_overrides);
      newCells.push(
        `<mxCell id="${childNumId}" value="${valueToXmlAttr(n.label)}" ` +
        `style="${style}" vertex="1" parent="${groupNumId}">` +
        `<mxGeometry x="${GROUP_PADDING_SIDE}" y="${childY}" width="${NODE_WIDTH}" height="${NODE_HEIGHT}" as="geometry"/>` +
        `</mxCell>`,
      );
      childY += NODE_HEIGHT + spacing;
    }
  }

  // New edges
  if ((input.add_edges ?? []).length > 0) {
    // Build a bounds map from all cells (including newly added ones) for edge point computation
    const allCellsForEdges = buildBoundsMapFromCells(cells, absCoords, newIdMap, newCells, input);
    const newEdges = buildNewEdgesWithNumericIds(input.add_edges ?? [], logicalToNumeric, newIdMap);

    const edgePts = computeEdgePoints(
      newEdges.map((e) => ({
        source: e.sourceNumId,
        target: e.targetNumId,
        label: e.label,
        style: e.style,
        connector: e.connector,
        arrow: e.arrow,
      })),
      allCellsForEdges,
    );

    for (let i = 0; i < newEdges.length; i++) {
      const e = newEdges[i];
      const pts = edgePts[i];
      if (!pts) continue;
      const edgeStyle = buildEdgeStyle(
        { source: e.sourceNumId, target: e.targetNumId, label: e.label, style: e.style, connector: e.connector, arrow: e.arrow, style_overrides: e.style_overrides },
        pts,
      );
      const edgeNumId = String(nextId++);
      newCells.push(
        `<mxCell id="${edgeNumId}" value="${valueToXmlAttr(e.label ?? '')}" ` +
        `style="${edgeStyle}" edge="1" source="${e.sourceNumId}" target="${e.targetNumId}" parent="1">` +
        `<mxGeometry relative="1" as="geometry"/>` +
        `</mxCell>`,
      );
    }
  }

  // Insert all new cells before </root>
  result = result.replace('</root>', newCells.join('') + '</root>');
  return result;
}

// ─── Patch a cell's parent and position in an already-processed mxXml string ──

function patchCellParentAndPos(
  mxXml: string,
  numericId: string,
  newParentId: string,
  relX: number,
  relY: number,
): string {
  // Find the specific mxCell by id and update its parent attribute + mxGeometry x/y
  const idAttr = `id="${numericId}"`;
  const idx = mxXml.indexOf(idAttr);
  if (idx === -1) return mxXml;

  // Find the start of the <mxCell tag
  const tagStart = mxXml.lastIndexOf('<mxCell', idx);
  if (tagStart === -1) return mxXml;

  // Find the end of the cell (either self-closing or </mxCell>)
  let tagEnd = mxXml.indexOf('/>', tagStart);
  const closeTag = mxXml.indexOf('</mxCell>', tagStart);
  if (closeTag !== -1 && (tagEnd === -1 || closeTag < tagEnd + 2)) {
    tagEnd = closeTag + '</mxCell>'.length;
  } else {
    tagEnd += 2;
  }

  const original = mxXml.substring(tagStart, tagEnd);
  let patched = original;

  // Update parent attribute
  patched = patched.replace(/\bparent="[^"]*"/, `parent="${newParentId}"`);

  // Update mxGeometry x and y
  patched = patched.replace(
    /<mxGeometry\s([^>]*)(?:\/>|>)/,
    (geomMatch) => {
      let updated = geomMatch;
      // Update or insert x attribute
      if (/\bx="[^"]*"/.test(updated)) {
        updated = updated.replace(/\bx="[^"]*"/, `x="${Math.round(relX)}"`);
      } else {
        updated = updated.replace('<mxGeometry ', `<mxGeometry x="${Math.round(relX)}" `);
      }
      // Update or insert y attribute
      if (/\by="[^"]*"/.test(updated)) {
        updated = updated.replace(/\by="[^"]*"/, `y="${Math.round(relY)}"`);
      } else {
        updated = updated.replace('<mxGeometry ', `<mxGeometry y="${Math.round(relY)}" `);
      }
      return updated;
    },
  );

  return mxXml.substring(0, tagStart) + patched + mxXml.substring(tagEnd);
}

// ─── Bounds map for edge computation ──────────────────────────────────────────

interface NewEdge {
  sourceNumId: string;
  targetNumId: string;
  label?: string;
  style?: 'solid' | 'dashed';
  connector?: 'straight' | 'orthogonal' | 'elbow-h' | 'elbow-v';
  arrow?: 'default' | 'none' | 'both';
  style_overrides?: import('../layout/elkLayout.js').EdgeStyleOverrides;
}

function buildNewEdgesWithNumericIds(
  addEdges: NonNullable<EditDrawioSvgInput['add_edges']>,
  logicalToNumeric: Map<string, string>,
  newIdMap: Map<string, string>,
): NewEdge[] {
  return addEdges.map((e) => ({
    sourceNumId: logicalToNumeric.get(e.source) ?? newIdMap.get(e.source) ?? e.source,
    targetNumId: logicalToNumeric.get(e.target) ?? newIdMap.get(e.target) ?? e.target,
    label: e.label,
    style: e.style,
    connector: e.connector,
    arrow: e.arrow,
    style_overrides: e.style_overrides,
  }));
}

/**
 * Build a bounds map (numericId → absolute Rect) from the original cells
 * PLUS positions of newly created cells (extracted from the newCells XML strings).
 */
function buildBoundsMapFromCells(
  cells: RawCell[],
  absCoords: Map<string, { x: number; y: number }>,
  newIdMap: Map<string, string>,
  newCellXmlStrings: string[],
  input: EditDrawioSvgInput,
): Record<string, Rect> {
  const map: Record<string, Rect> = {};

  // Existing cells
  for (const c of cells) {
    if (!c.isVertex) continue;
    const abs = absCoords.get(c.numericId) ?? { x: c.x, y: c.y };
    map[c.numericId] = { x: abs.x, y: abs.y, width: c.width, height: c.height };
  }

  // New cells from generated XML
  for (const cellXml of newCellXmlStrings) {
    const idMatch = cellXml.match(/\bid="([^"]+)"/);
    if (!idMatch) continue;
    const numId = idMatch[1];
    const geom = extractGeometry(cellXml);
    // For cells with parent != "1", we need to compute absolute coords
    const parentMatch = cellXml.match(/\bparent="([^"]+)"/);
    const parentId = parentMatch?.[1] ?? '1';
    if (parentId === '1' || parentId === '0') {
      map[numId] = { x: geom.x, y: geom.y, width: geom.width, height: geom.height };
    } else {
      // Parent is a group — look up parent's absolute position
      const parentRect = map[parentId];
      if (parentRect) {
        map[numId] = {
          x: parentRect.x + geom.x,
          y: parentRect.y + geom.y,
          width: geom.width,
          height: geom.height,
        };
      } else {
        map[numId] = { x: geom.x, y: geom.y, width: geom.width, height: geom.height };
      }
    }
  }

  // Also add logical ID → Rect mapping for logical-ID-based edge lookup
  // (computeEdgePoints uses the IDs passed in the edges array, which are numeric IDs here)

  return map;
}

// ─── SVG assembly ──────────────────────────────────────────────────────────────

/**
 * Assemble the final .drawio.svg file:
 *   - SVG visual: from our renderer (accurate structure, simplified styling)
 *   - content attribute: Format B encoded mxfile (original draw.io styles preserved)
 */
function assembleSvgFile(svgVisual: string, formatBContentEncoded: string): string {
  const attrsMatch = svgVisual.match(/^<svg([^>]*)>/);
  const innerMatch = svgVisual.match(/^<svg[^>]*>([\s\S]*)<\/svg>$/);
  if (!attrsMatch || !innerMatch) throw new Error('Invalid SVG visual format');
  // Replace content attribute if present, or add it
  const svgAttrs = attrsMatch[1].replace(/\s+content="[^"]*"/, '');
  return `<svg${svgAttrs} content="${formatBContentEncoded}">${innerMatch[1]}</svg>`;
}
