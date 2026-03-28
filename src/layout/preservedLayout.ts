import type { InputEdge, InputGroup, LayoutGroup, LayoutNode, LayoutResult } from './elkLayout.js';
import type { InputNodeWithHighlight } from '../tools/createDrawioSvg.js';

const NODE_WIDTH = 65;
const NODE_HEIGHT = 85;
const GROUP_PADDING_TOP = 40;  // space for group label
const GROUP_PADDING_SIDE = 20;

/**
 * Build a LayoutResult by preserving existing node/group positions from a prior parse.
 * - Existing nodes/groups: use their stored x_geom/y_geom/width/height directly.
 * - New top-level nodes: placed to the right of the existing bounding box, stacked vertically.
 * - New nodes added to an existing group: placed below existing children; group is auto-expanded.
 * - New top-level groups: placed to the right of existing elements.
 */
export function buildPreservedLayoutResult(
  nodes: InputNodeWithHighlight[],
  _edges: InputEdge[],
  groups: InputGroup[],
  newNodeIds: Set<string>,
  newGroupIds: Set<string>,
  spacing: number,
): LayoutResult {
  // Build parentMap: nodeId/groupId → parentGroupId
  const parentMap = new Map<string, string>();
  for (const g of groups) {
    for (const child of g.children) {
      parentMap.set(child, g.id);
    }
  }

  // Top-level = not a child of any group
  const topLevelNodes = nodes.filter((n) => !parentMap.has(n.id));
  const topLevelGroups = groups.filter((g) => !parentMap.has(g.id));

  // Compute existing top-level bounding box (existing elements only)
  let maxRight = 0;
  for (const n of topLevelNodes) {
    if (!newNodeIds.has(n.id)) {
      const r = (n.x_geom ?? 0) + (n.width ?? NODE_WIDTH);
      if (r > maxRight) maxRight = r;
    }
  }
  for (const g of topLevelGroups) {
    if (!newGroupIds.has(g.id)) {
      const r = (g.x ?? 0) + (g.width ?? 200);
      if (r > maxRight) maxRight = r;
    }
  }

  // ── Existing top-level nodes ────────────────────────────────────────────────
  const resultNodes: LayoutNode[] = topLevelNodes
    .filter((n) => !newNodeIds.has(n.id))
    .map((n) => ({
      id: n.id,
      label: n.label,
      icon_path: n.icon_path,
      x: n.x_geom ?? 0,
      y: n.y_geom ?? 0,
      width: n.width ?? NODE_WIDTH,
      height: n.height ?? NODE_HEIGHT,
      style_overrides: n.style_overrides,
    }));

  // ── New top-level nodes ─────────────────────────────────────────────────────
  let newNodeCursor = 20;
  let newNodeColumnX = maxRight > 0 ? maxRight + spacing : 0;

  for (const n of topLevelNodes.filter((n) => newNodeIds.has(n.id))) {
    resultNodes.push({
      id: n.id,
      label: n.label,
      icon_path: n.icon_path,
      x: newNodeColumnX,
      y: newNodeCursor,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      style_overrides: n.style_overrides,
    });
    newNodeCursor += NODE_HEIGHT + spacing;
  }

  // Advance maxRight past newly placed top-level nodes
  if (topLevelNodes.some((n) => newNodeIds.has(n.id))) {
    maxRight = newNodeColumnX + NODE_WIDTH;
  }

  // ── Existing top-level groups (recursive) ──────────────────────────────────
  const resultGroups: LayoutGroup[] = [];

  function buildGroup(group: InputGroup): LayoutGroup {
    const childNodes = nodes.filter((n) => group.children.includes(n.id));
    const childGroups = groups.filter((g) => group.children.includes(g.id));

    // Split child nodes into existing and new
    const existingChildNodes = childNodes.filter((n) => !newNodeIds.has(n.id));
    const newChildNodes = childNodes.filter((n) => newNodeIds.has(n.id));

    // Build LayoutNodes for existing child nodes (group-relative coords)
    const layoutChildNodes: LayoutNode[] = existingChildNodes.map((n) => ({
      id: n.id,
      label: n.label,
      icon_path: n.icon_path,
      x: n.x_geom ?? GROUP_PADDING_SIDE,
      y: n.y_geom ?? GROUP_PADDING_TOP,
      width: n.width ?? NODE_WIDTH,
      height: n.height ?? NODE_HEIGHT,
      style_overrides: n.style_overrides,
    }));

    // Compute the bottom edge of existing children to place new children below
    let maxExistingBottom = GROUP_PADDING_TOP;
    for (const n of existingChildNodes) {
      const bottom = (n.y_geom ?? GROUP_PADDING_TOP) + (n.height ?? NODE_HEIGHT);
      if (bottom > maxExistingBottom) maxExistingBottom = bottom;
    }

    // Place new child nodes below existing children
    let newChildY = maxExistingBottom + spacing;
    for (const n of newChildNodes) {
      layoutChildNodes.push({
        id: n.id,
        label: n.label,
        icon_path: n.icon_path,
        x: GROUP_PADDING_SIDE,
        y: newChildY,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        style_overrides: n.style_overrides,
      });
      newChildY += NODE_HEIGHT + spacing;
    }

    // Recurse for child groups first (dimensions needed for bounding box)
    const layoutChildGroups = childGroups.map((g) => buildGroup(g));

    // Compute group dimensions from all children's bounding boxes
    // (handles both expansion on add and contraction on remove)
    let maxRight = GROUP_PADDING_SIDE + NODE_WIDTH;   // minimum
    let maxBottom = GROUP_PADDING_TOP + NODE_HEIGHT;  // minimum

    for (const n of layoutChildNodes) {
      if (n.x + n.width + GROUP_PADDING_SIDE > maxRight) maxRight = n.x + n.width + GROUP_PADDING_SIDE;
      if (n.y + n.height + GROUP_PADDING_SIDE > maxBottom) maxBottom = n.y + n.height + GROUP_PADDING_SIDE;
    }
    for (const cg of layoutChildGroups) {
      if (cg.x + cg.width + GROUP_PADDING_SIDE > maxRight) maxRight = cg.x + cg.width + GROUP_PADDING_SIDE;
      if (cg.y + cg.height + GROUP_PADDING_SIDE > maxBottom) maxBottom = cg.y + cg.height + GROUP_PADDING_SIDE;
    }

    // Fall back to stored dimensions only when the group is empty
    const hasChildren = layoutChildNodes.length > 0 || layoutChildGroups.length > 0;

    return {
      id: group.id,
      label: group.label,
      style: group.style,
      x: group.x ?? 0,
      y: group.y ?? 0,
      width: hasChildren ? maxRight : (group.width ?? 200),
      height: hasChildren ? maxBottom : (group.height ?? 150),
      nodes: layoutChildNodes,
      groups: layoutChildGroups,
      style_overrides: group.style_overrides,
    };
  }

  for (const g of topLevelGroups) {
    if (!newGroupIds.has(g.id)) {
      resultGroups.push(buildGroup(g));
    }
  }

  // ── New top-level groups ────────────────────────────────────────────────────
  let newGroupColumnX = maxRight > 0 ? maxRight + spacing : 0;

  for (const g of topLevelGroups.filter((g) => newGroupIds.has(g.id))) {
    const childNodes = nodes.filter((n) => g.children.includes(n.id));
    const childGroups = groups.filter((cg) => g.children.includes(cg.id));

    const groupHeight = GROUP_PADDING_TOP + childNodes.length * (NODE_HEIGHT + spacing) + GROUP_PADDING_SIDE;
    const groupWidth = NODE_WIDTH + GROUP_PADDING_SIDE * 2;

    let childY = GROUP_PADDING_TOP;
    const layoutChildNodes: LayoutNode[] = childNodes.map((n) => {
      const node: LayoutNode = {
        id: n.id, label: n.label, icon_path: n.icon_path,
        x: GROUP_PADDING_SIDE, y: childY,
        width: NODE_WIDTH, height: NODE_HEIGHT,
        style_overrides: n.style_overrides,
      };
      childY += NODE_HEIGHT + spacing;
      return node;
    });

    resultGroups.push({
      id: g.id,
      label: g.label,
      style: g.style,
      x: newGroupColumnX,
      y: 20,
      width: groupWidth,
      height: groupHeight,
      nodes: layoutChildNodes,
      groups: childGroups.map((cg) => buildGroup(cg)),
      style_overrides: g.style_overrides,
    });

    newGroupColumnX += groupWidth + spacing;
  }

  // ── Compute total bounding box ──────────────────────────────────────────────
  let totalWidth = 0;
  let totalHeight = 0;

  for (const n of resultNodes) {
    const r = n.x + n.width;
    const b = n.y + n.height;
    if (r > totalWidth) totalWidth = r;
    if (b > totalHeight) totalHeight = b;
  }
  for (const g of resultGroups) {
    const r = g.x + g.width;
    const b = g.y + g.height;
    if (r > totalWidth) totalWidth = r;
    if (b > totalHeight) totalHeight = b;
  }

  // Ensure minimum canvas size
  if (totalWidth < 200) totalWidth = 200;
  if (totalHeight < 100) totalHeight = 100;

  return { nodes: resultNodes, groups: resultGroups, totalWidth, totalHeight };
}
