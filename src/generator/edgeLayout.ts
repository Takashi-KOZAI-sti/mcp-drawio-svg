import type { InputEdge, LayoutResult, LayoutGroup } from '../layout/elkLayout.js';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type Side = 'right' | 'left' | 'bottom' | 'top';

export interface EdgePoints {
  /** Absolute SVG coordinates for the start point (on source node boundary) */
  srcX: number;
  srcY: number;
  /** Absolute SVG coordinates for the end point (on target node boundary) */
  tgtX: number;
  tgtY: number;
  /** draw.io relative fractions for source exit (0–1) */
  exitX: number;
  exitY: number;
  /** draw.io relative fractions for target entry (0–1) */
  entryX: number;
  entryY: number;
  /** Which side the edge exits from the source */
  exitSide: Side;
}

/**
 * Build a flat map of nodeId/groupId → absolute bounding rect.
 * Groups use their own position; nodes within groups get absolute coords.
 */
export function buildBoundsMap(layout: LayoutResult): Record<string, Rect> {
  const map: Record<string, Rect> = {};

  for (const node of layout.nodes) {
    map[node.id] = { x: node.x, y: node.y, width: node.width, height: node.height };
  }

  function traverse(group: LayoutGroup, offsetX: number, offsetY: number): void {
    const absX = offsetX + group.x;
    const absY = offsetY + group.y;
    map[group.id] = { x: absX, y: absY, width: group.width, height: group.height };
    for (const node of group.nodes) {
      map[node.id] = { x: absX + node.x, y: absY + node.y, width: node.width, height: node.height };
    }
    for (const child of group.groups) {
      traverse(child, absX, absY);
    }
  }
  for (const group of layout.groups) {
    traverse(group, 0, 0);
  }

  return map;
}

function centerOf(r: Rect): { x: number; y: number } {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

function determineSide(src: Rect, tgt: Rect): Side {
  const sc = centerOf(src);
  const tc = centerOf(tgt);
  const dx = tc.x - sc.x;
  const dy = tc.y - sc.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left';
  }
  return dy >= 0 ? 'bottom' : 'top';
}

function oppositeSide(side: Side): Side {
  switch (side) {
    case 'right':  return 'left';
    case 'left':   return 'right';
    case 'bottom': return 'top';
    case 'top':    return 'bottom';
  }
}

function fractionToAbsolute(bounds: Rect, side: Side, fraction: number): { x: number; y: number } {
  switch (side) {
    case 'right':  return { x: bounds.x + bounds.width, y: bounds.y + fraction * bounds.height };
    case 'left':   return { x: bounds.x,                y: bounds.y + fraction * bounds.height };
    case 'bottom': return { x: bounds.x + fraction * bounds.width, y: bounds.y + bounds.height };
    case 'top':    return { x: bounds.x + fraction * bounds.width, y: bounds.y };
  }
}

function fractionToDrawio(side: Side, fraction: number): { fx: number; fy: number } {
  switch (side) {
    case 'right':  return { fx: 1, fy: fraction };
    case 'left':   return { fx: 0, fy: fraction };
    case 'bottom': return { fx: fraction, fy: 1 };
    case 'top':    return { fx: fraction, fy: 0 };
  }
}

/**
 * Compute per-edge connection points, distributed evenly along the node boundary
 * when multiple edges share the same source node / side or target node / side.
 */
export function computeEdgePoints(
  edges: InputEdge[],
  boundsMap: Record<string, Rect>,
): EdgePoints[] {
  // --- Phase 1: determine exit/entry side for each edge ---
  const sides: { exitSide: Side; entrySide: Side }[] = edges.map((edge) => {
    const src = boundsMap[edge.source];
    const tgt = boundsMap[edge.target];
    if (!src || !tgt) {
      return { exitSide: 'right' as Side, entrySide: 'left' as Side };
    }
    const exitSide = determineSide(src, tgt);
    return { exitSide, entrySide: oppositeSide(exitSide) };
  });

  // --- Phase 2: group by (nodeId, side) and assign fractions ---
  // For exits
  const exitGroups: Record<string, number[]> = {};
  edges.forEach((edge, i) => {
    const key = `${edge.source}:${sides[i].exitSide}`;
    if (!exitGroups[key]) exitGroups[key] = [];
    exitGroups[key].push(i);
  });

  // For entries
  const entryGroups: Record<string, number[]> = {};
  edges.forEach((edge, i) => {
    const key = `${edge.target}:${sides[i].entrySide}`;
    if (!entryGroups[key]) entryGroups[key] = [];
    entryGroups[key].push(i);
  });

  const exitFractions: number[] = new Array(edges.length);
  const entryFractions: number[] = new Array(edges.length);

  // Sort each exit group by the target node's center position along the perpendicular axis,
  // so that connection points on a side are ordered to match target positions (minimizing crossings).
  for (const indices of Object.values(exitGroups)) {
    const exitSide = sides[indices[0]].exitSide;
    const sorted = [...indices].sort((a, b) => {
      const tA = boundsMap[edges[a].target];
      const tB = boundsMap[edges[b].target];
      if (!tA || !tB) return 0;
      return (exitSide === 'left' || exitSide === 'right')
        ? (tA.y + tA.height / 2) - (tB.y + tB.height / 2)  // left/right side: sort by target y-center
        : (tA.x + tA.width  / 2) - (tB.x + tB.width  / 2); // top/bottom side: sort by target x-center
    });
    const n = sorted.length;
    sorted.forEach((edgeIdx, rank) => {
      exitFractions[edgeIdx] = (rank + 1) / (n + 1);
    });
  }

  // Sort each entry group by the source node's center position along the perpendicular axis.
  for (const indices of Object.values(entryGroups)) {
    const entrySide = sides[indices[0]].entrySide;
    const sorted = [...indices].sort((a, b) => {
      const sA = boundsMap[edges[a].source];
      const sB = boundsMap[edges[b].source];
      if (!sA || !sB) return 0;
      return (entrySide === 'left' || entrySide === 'right')
        ? (sA.y + sA.height / 2) - (sB.y + sB.height / 2)
        : (sA.x + sA.width  / 2) - (sB.x + sB.width  / 2);
    });
    const n = sorted.length;
    sorted.forEach((edgeIdx, rank) => {
      entryFractions[edgeIdx] = (rank + 1) / (n + 1);
    });
  }

  // --- Phase 3: convert fractions to absolute + draw.io coords ---
  return edges.map((edge, i) => {
    const srcBounds = boundsMap[edge.source];
    const tgtBounds = boundsMap[edge.target];

    // Use preserved connection points if available (existing edges in preserve mode)
    if (
      edge.exitX !== undefined && edge.exitY !== undefined &&
      edge.entryX !== undefined && edge.entryY !== undefined &&
      srcBounds && tgtBounds
    ) {
      return {
        srcX: srcBounds.x + edge.exitX * srcBounds.width,
        srcY: srcBounds.y + edge.exitY * srcBounds.height,
        tgtX: tgtBounds.x + edge.entryX * tgtBounds.width,
        tgtY: tgtBounds.y + edge.entryY * tgtBounds.height,
        exitX: edge.exitX,
        exitY: edge.exitY,
        entryX: edge.entryX,
        entryY: edge.entryY,
        exitSide: inferExitSide(edge.exitX, edge.exitY),
      };
    }

    const { exitSide, entrySide } = sides[i];
    const ef = exitFractions[i];
    const nf = entryFractions[i];

    const srcPt = srcBounds ? fractionToAbsolute(srcBounds, exitSide, ef) : { x: 0, y: 0 };
    const tgtPt = tgtBounds ? fractionToAbsolute(tgtBounds, entrySide, nf) : { x: 0, y: 0 };
    const { fx: exitX, fy: exitY } = fractionToDrawio(exitSide, ef);
    const { fx: entryX, fy: entryY } = fractionToDrawio(entrySide, nf);

    return {
      srcX: srcPt.x, srcY: srcPt.y,
      tgtX: tgtPt.x, tgtY: tgtPt.y,
      exitX, exitY, entryX, entryY,
      exitSide,
    };
  });
}

function inferExitSide(exitX: number, exitY: number): Side {
  if (exitY === 0) return 'top';
  if (exitY === 1) return 'bottom';
  if (exitX === 0) return 'left';
  return 'right';
}
