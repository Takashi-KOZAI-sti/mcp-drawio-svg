import { htmlDecode } from './xmlEncoding.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const NODE_WIDTH = 65;
const NODE_HEIGHT = 85;

// ─── XML attribute extraction ─────────────────────────────────────────────────

/** Extract an XML attribute value by name from an attribute string. */
export function extractAttr(attrs: string, name: string): string | undefined {
  const re = new RegExp(`\\b${name}="([^"]*)"`, 'i');
  const m = re.exec(attrs);
  return m ? m[1] : undefined;
}

// ─── Slug utility ─────────────────────────────────────────────────────────────

/** Slugify a label string into a URL-safe identifier. */
export function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'node';
}

// ─── Raw cell types & parsing ──────────────────────────────────────────────────

/** Parsed mxCell representation. */
export interface RawCell {
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

/** Parse all <mxCell> elements from mxGraphModel XML. */
export function parseCells(xml: string): RawCell[] {
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

/** Extract geometry (x, y, width, height) from a cell XML string. */
export function extractGeometry(cellXml: string): { x: number; y: number; width: number; height: number } {
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

// ─── ID maps ──────────────────────────────────────────────────────────────────

/** Build logical↔numeric ID maps from parsed cells. */
export function buildIdMaps(cells: RawCell[]): {
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

/** Compute absolute coordinates for all cells (resolving parent offsets). */
export function computeAbsCoords(cells: RawCell[]): Map<string, { x: number; y: number }> {
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

/** Compute bounding box (maxRight, maxBottom) of all cells. */
export function computeBbox(cells: RawCell[], absCoords: Map<string, { x: number; y: number }>): {
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
