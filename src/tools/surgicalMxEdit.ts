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

import type { EditDrawioSvgInput } from './editDrawioSvg.js';
import { parseDrawioSvgContent } from '../parser/mxGraphModelParser.js';
import { resolveIcons, type InputNodeWithHighlight } from './createDrawioSvg.js';
import { buildPreservedLayoutResult } from '../layout/preservedLayout.js';
import { generateSvgVisual } from '../generator/svgRenderer.js';
import { buildGroupStyle, buildNodeStyle, buildEdgeStyle } from '../generator/mxGraphModel.js';
import type { InputEdge, NodeStyleOverrides, GroupStyleOverrides, EdgeStyleOverrides } from '../layout/elkLayout.js';
import { buildBoundsMap, computeEdgePoints, type Rect } from '../generator/edgeLayout.js';
import type { LayoutResult, LayoutNode, LayoutGroup } from '../layout/elkLayout.js';
import { mergeNodeStyleOverrides, mergeGroupStyleOverrides, mergeEdgeUpdates } from '../utils/styleMerging.js';
import { htmlDecode, htmlEncode, escapeXmlAttr, valueToXmlAttr } from '../utils/xmlEncoding.js';
import { extractAttr, slugify, type RawCell, parseCells, extractGeometry, buildIdMaps, computeAbsCoords, computeBbox } from '../utils/mxCellUtils.js';
import { extractFormatBMxXml, encodeFormatBContent, type FormatBParts } from '../parser/formatBCodec.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const NODE_WIDTH = 65;
const NODE_HEIGHT = 85;
const GROUP_PADDING_TOP = 40;
const GROUP_PADDING_SIDE = 20;

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
