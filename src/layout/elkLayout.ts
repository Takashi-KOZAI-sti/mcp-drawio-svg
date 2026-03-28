import type { ELK, ElkNode } from 'elkjs/lib/elk-api.js';
// elk.bundled.js exports the constructor as the module default
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import ElkLib from 'elkjs/lib/elk.bundled.js';
const ELKConstructor = ElkLib as unknown as new () => ELK;

/** Fine-grained visual style overrides for nodes (rectangles and icons). */
export interface NodeStyleOverrides {
  /** Background fill color (#RRGGBB or "none"). Equivalent to CSS background-color. Ignored for icon nodes. */
  fill_color?: string;
  /** Border color (#RRGGBB or "none"). Equivalent to CSS border-color. */
  stroke_color?: string;
  /** Border thickness in pixels (1–10). Equivalent to CSS border-width. Default: 1. */
  stroke_width?: number;
  /** Draw border as dashed. Equivalent to CSS border-style: dashed. Default: false. */
  stroke_dashed?: boolean;
  /** Label text color (#RRGGBB). Equivalent to CSS color. Default: "#333333". */
  font_color?: string;
  /** Label text size in points (8–72). Equivalent to CSS font-size. Default: 11. */
  font_size?: number;
  /** Bold label text. Equivalent to CSS font-weight: bold. Default: false. */
  font_bold?: boolean;
  /** Italic label text. Equivalent to CSS font-style: italic. Default: false. */
  font_italic?: boolean;
  /** Underline label text. Equivalent to CSS text-decoration: underline. Default: false. */
  font_underline?: boolean;
  /** Strike-through label text. Equivalent to CSS text-decoration: line-through. Default: false. */
  font_strikethrough?: boolean;
  /** Transparency (0–100). 100 = opaque (default), 0 = invisible. Equivalent to CSS opacity × 100. */
  opacity?: number;
  /** Rounded corners. Equivalent to CSS border-radius > 0. Default: true. Rectangle nodes only. */
  rounded?: boolean;
  /** Drop shadow. Equivalent to CSS box-shadow. Default: false. */
  shadow?: boolean;
  /** Horizontal text alignment. Equivalent to CSS text-align. Default: "center". Rectangle nodes only. */
  text_align?: 'left' | 'center' | 'right';
  /** Vertical text alignment. Equivalent to CSS vertical-align. Default: "middle". Rectangle nodes only. */
  text_vertical_align?: 'top' | 'middle' | 'bottom';
}

/** Fine-grained visual style overrides for edges (connectors). */
export interface EdgeStyleOverrides {
  /** Line color (#RRGGBB). Equivalent to CSS border-color. Default: "#000000". */
  stroke_color?: string;
  /** Line thickness in pixels (1–10). Equivalent to CSS border-width. Default: 1. */
  stroke_width?: number;
  /** Draw line as dashed. Equivalent to CSS border-style: dashed. Default: false. Overrides top-level style: "dashed". */
  stroke_dashed?: boolean;
  /** Label text color (#RRGGBB). Equivalent to CSS color. Default: "#333333". */
  font_color?: string;
  /** Label text size in points (8–72). Equivalent to CSS font-size. Default: 11. */
  font_size?: number;
  /** Bold label text. Equivalent to CSS font-weight: bold. Default: false. */
  font_bold?: boolean;
  /** Italic label text. Equivalent to CSS font-style: italic. Default: false. */
  font_italic?: boolean;
  /** Underline label text. Equivalent to CSS text-decoration: underline. Default: false. */
  font_underline?: boolean;
  /** Transparency (0–100). 100 = opaque (default), 0 = invisible. Equivalent to CSS opacity × 100. */
  opacity?: number;
}

/** Fine-grained visual style overrides for groups (containers). */
export interface GroupStyleOverrides {
  /** Background fill color (#RRGGBB or "none"). Equivalent to CSS background-color. */
  fill_color?: string;
  /** Border color (#RRGGBB or "none"). Equivalent to CSS border-color. */
  stroke_color?: string;
  /** Border thickness in pixels (1–10). Equivalent to CSS border-width. Default: 1. */
  stroke_width?: number;
  /** Draw border as dashed. Equivalent to CSS border-style: dashed. Default: false. */
  stroke_dashed?: boolean;
  /** Rounded corners. Equivalent to CSS border-radius > 0. Default: true. */
  rounded?: boolean;
  /** Corner rounding amount (0–50). 0 = square, 50 = very rounded. Analogous to CSS border-radius as a % of the shorter edge. Default: 7. Only effective when rounded is true. */
  corner_radius?: number;
  /** Label text color (#RRGGBB). Equivalent to CSS color. */
  font_color?: string;
  /** Label text size in points (8–72). Equivalent to CSS font-size. Default: 11. */
  font_size?: number;
  /** Bold label text. Equivalent to CSS font-weight: bold. Default: true for groups. */
  font_bold?: boolean;
  /** Italic label text. Equivalent to CSS font-style: italic. Default: false. */
  font_italic?: boolean;
  /** Underline label text. Equivalent to CSS text-decoration: underline. Default: false. */
  font_underline?: boolean;
  /** Transparency (0–100). 100 = opaque (default), 0 = invisible. Equivalent to CSS opacity × 100. */
  opacity?: number;
  /** Horizontal text alignment. Equivalent to CSS text-align. Default: "left". */
  text_align?: 'left' | 'center' | 'right';
  /** Vertical text alignment. Equivalent to CSS vertical-align. Default: "top". */
  text_vertical_align?: 'top' | 'middle' | 'bottom';
  /** Drop shadow. Equivalent to CSS box-shadow. Default: false. */
  shadow?: boolean;
}

export interface InputNode {
  id: string;
  label: string;
  icon_path?: string | null;
  layer_hint?: 'first' | 'last';
  /** X coordinate hint from an existing file's mxGeometry (absolute). Used for INTERACTIVE layering. */
  x_hint?: number;
  /** Y coordinate hint from an existing file's mxGeometry (absolute). Used for INTERACTIVE layering. */
  y_hint?: number;
  /** preserve mode: raw mxGeometry x (group-relative for group children) */
  x_geom?: number;
  /** preserve mode: raw mxGeometry y */
  y_geom?: number;
  /** preserve mode: node width from mxGeometry */
  width?: number;
  /** preserve mode: node height from mxGeometry */
  height?: number;
  /** Fine-grained visual style overrides. Takes precedence over highlight. */
  style_overrides?: NodeStyleOverrides;
}

export interface InputEdge {
  source: string;
  target: string;
  label?: string;
  style?: 'solid' | 'dashed';
  connector?: 'straight' | 'orthogonal' | 'elbow-h' | 'elbow-v';
  arrow?: 'default' | 'none' | 'both';
  /** Preserved exit/entry connection point fractions from existing file (draw.io 0–1 convention) */
  exitX?: number;
  exitY?: number;
  entryX?: number;
  entryY?: number;
  /** Fine-grained visual style overrides. stroke_dashed overrides top-level style: "dashed". */
  style_overrides?: EdgeStyleOverrides;
}

export interface InputGroup {
  id: string;
  label: string;
  /** Can contain node IDs and/or group IDs (nested groups supported) */
  children: string[];
  style?: string;
  /** preserve mode: mxGeometry x (group-relative for nested groups) */
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /** Fine-grained visual style overrides. Takes precedence over style color parameter. */
  style_overrides?: GroupStyleOverrides;
}

export interface LayoutNode {
  id: string;
  label: string;
  icon_path?: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Propagated from InputNode.style_overrides */
  style_overrides?: NodeStyleOverrides;
}

export interface LayoutGroup {
  id: string;
  label: string;
  style?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  nodes: LayoutNode[];    // direct child nodes (relative coords)
  groups: LayoutGroup[];  // direct child groups (relative coords, recursive)
  /** Propagated from InputGroup.style_overrides */
  style_overrides?: GroupStyleOverrides;
}

export interface LayoutOptions {
  /** Overall flow direction. Default: "RIGHT" (layered only) */
  direction?: 'RIGHT' | 'DOWN' | 'LEFT' | 'UP';
  /** Spacing between nodes in px. Default: 60 */
  spacing?: number;
  /** Flow direction inside groups. Default: "DOWN" (layered only) */
  group_direction?: 'RIGHT' | 'DOWN' | 'LEFT' | 'UP';
  /**
   * Layout algorithm. Default: "layered".
   * - "layered": hierarchical flow (best for flowcharts, pipelines)
   * - "force": physics-based 2D placement (best for network/relationship diagrams)
   * - "stress": stress-minimization 2D placement (best for uniform node spacing)
   */
  algorithm?: 'layered' | 'force' | 'stress';
}

export interface LayoutResult {
  nodes: LayoutNode[];   // top-level nodes only, absolute coords
  groups: LayoutGroup[]; // top-level groups (recursive), absolute coords
  totalWidth: number;
  totalHeight: number;
}

const NODE_WIDTH = 65;
const NODE_HEIGHT = 85; // 65 icon + 20 label

const elk: ELK = new ELKConstructor();

/**
 * Recursively build an ELK compound node for a group.
 * Children can be leaf nodes or nested compound nodes.
 */
function buildElkCompoundNode(
  group: InputGroup,
  allGroups: InputGroup[],
  allNodes: InputNode[],
  groupDirection: string,
  algorithm: string,
): ElkNode {
  const childNodeElkNodes: ElkNode[] = allNodes
    .filter((n) => group.children.includes(n.id))
    .map((n) => {
      const el: ElkNode = { id: n.id, width: NODE_WIDTH, height: NODE_HEIGHT };
      if (algorithm === 'layered') {
        if (n.layer_hint === 'first') {
          el.layoutOptions = { 'elk.layered.layering.layerConstraint': 'FIRST' };
        } else if (n.layer_hint === 'last') {
          el.layoutOptions = { 'elk.layered.layering.layerConstraint': 'LAST' };
        }
      }
      if (n.x_hint !== undefined) el.x = n.x_hint;
      if (n.y_hint !== undefined) el.y = n.y_hint;
      return el;
    });

  const childGroupElkNodes: ElkNode[] = allGroups
    .filter((g) => group.children.includes(g.id))
    .map((g) => buildElkCompoundNode(g, allGroups, allNodes, groupDirection, algorithm));

  const groupLayoutOptions: Record<string, string> = {
    'elk.algorithm': algorithm,
    'elk.padding': '[top=40,left=20,bottom=20,right=20]',
    'elk.spacing.nodeNode': '40',
  };
  if (algorithm === 'layered') {
    groupLayoutOptions['elk.direction'] = groupDirection;
  }

  return {
    id: group.id,
    layoutOptions: groupLayoutOptions,
    children: [...childNodeElkNodes, ...childGroupElkNodes],
  };
}

/**
 * Recursively parse the ELK layout result for a compound node into LayoutGroup.
 * Coordinates of children are relative to this group.
 */
function parseElkGroup(
  elkNode: ElkNode,
  inputGroup: InputGroup,
  allGroups: InputGroup[],
  allNodes: InputNode[],
): LayoutGroup {
  const resultNodes: LayoutNode[] = [];
  const resultGroups: LayoutGroup[] = [];

  for (const child of elkNode.children ?? []) {
    const childInputNode = allNodes.find((n) => n.id === child.id);
    const childInputGroup = allGroups.find((g) => g.id === child.id);

    if (childInputGroup) {
      resultGroups.push(parseElkGroup(child, childInputGroup, allGroups, allNodes));
    } else if (childInputNode) {
      resultNodes.push({
        id: child.id,
        label: childInputNode.label,
        icon_path: childInputNode.icon_path,
        x: child.x ?? 0,
        y: child.y ?? 0,
        width: child.width ?? NODE_WIDTH,
        height: child.height ?? NODE_HEIGHT,
        style_overrides: childInputNode.style_overrides,
      });
    }
  }

  return {
    id: elkNode.id ?? inputGroup.id,
    label: inputGroup.label,
    style: inputGroup.style,
    x: elkNode.x ?? 0,
    y: elkNode.y ?? 0,
    width: elkNode.width ?? 200,
    height: elkNode.height ?? 150,
    nodes: resultNodes,
    groups: resultGroups,
    style_overrides: inputGroup.style_overrides,
  };
}

export async function computeLayout(
  nodes: InputNode[],
  edges: InputEdge[],
  groups: InputGroup[],
  layoutOptions?: LayoutOptions,
): Promise<LayoutResult> {
  const direction = layoutOptions?.direction ?? 'RIGHT';
  const spacing = layoutOptions?.spacing ?? 60;
  const groupDirection = layoutOptions?.group_direction ?? 'DOWN';
  const algorithm = layoutOptions?.algorithm ?? 'layered';

  // All IDs that appear in any group's children (nodes or sub-groups)
  const allGroupChildIds = new Set(groups.flatMap((g) => g.children));

  // Top-level = not a child of any group
  const topLevelNodes = nodes.filter((n) => !allGroupChildIds.has(n.id));
  const topLevelGroups = groups.filter((g) => !allGroupChildIds.has(g.id));

  // Detect if any top-level node has position hints → use INTERACTIVE layering (layered only)
  const hasPositionHints = algorithm === 'layered' &&
    topLevelNodes.some((n) => n.x_hint !== undefined || n.y_hint !== undefined);

  // Build ELK graph
  const elkChildren: ElkNode[] = [
    ...topLevelNodes.map((n) => {
      const el: ElkNode = { id: n.id, width: NODE_WIDTH, height: NODE_HEIGHT };
      if (algorithm === 'layered') {
        if (n.layer_hint === 'first') {
          el.layoutOptions = { 'elk.layered.layering.layerConstraint': 'FIRST' };
        } else if (n.layer_hint === 'last') {
          el.layoutOptions = { 'elk.layered.layering.layerConstraint': 'LAST' };
        }
      }
      if (n.x_hint !== undefined) el.x = n.x_hint;
      if (n.y_hint !== undefined) el.y = n.y_hint;
      return el;
    }),
    ...topLevelGroups.map((g) => buildElkCompoundNode(g, groups, nodes, groupDirection, algorithm)),
  ];

  // Build algorithm-specific layout options
  const rootLayoutOptions: Record<string, string> = {
    'elk.algorithm': algorithm,
    'elk.spacing.nodeNode': String(spacing),
    'elk.padding': '[top=20,left=20,bottom=20,right=20]',
    'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  };

  if (algorithm === 'layered') {
    rootLayoutOptions['elk.direction'] = direction;
    rootLayoutOptions['elk.layered.spacing.nodeNodeBetweenLayers'] = String(Math.round(spacing * 1.3));
    if (hasPositionHints) {
      rootLayoutOptions['elk.layered.layeringStrategy'] = 'INTERACTIVE';
    }
  } else if (algorithm === 'stress') {
    rootLayoutOptions['elk.stress.desiredEdgeLength'] = String(spacing * 2);
  }
  // force: use ELK defaults (iterations=300, repulsion based on spacing)

  const elkGraph = {
    id: 'root',
    layoutOptions: rootLayoutOptions,
    children: elkChildren,
    edges: edges.map((e) => ({
      id: `${e.source}-${e.target}`,
      sources: [e.source],
      targets: [e.target],
    })),
  };

  const layout = await elk.layout(elkGraph);

  const resultNodes: LayoutNode[] = [];
  const resultGroups: LayoutGroup[] = [];

  for (const child of layout.children ?? []) {
    const inputNode = topLevelNodes.find((n) => n.id === child.id);
    const inputGroup = topLevelGroups.find((g) => g.id === child.id);

    if (inputGroup) {
      resultGroups.push(parseElkGroup(child, inputGroup, groups, nodes));
    } else if (inputNode) {
      resultNodes.push({
        id: child.id,
        label: inputNode.label,
        icon_path: inputNode.icon_path,
        x: child.x ?? 0,
        y: child.y ?? 0,
        width: child.width ?? NODE_WIDTH,
        height: child.height ?? NODE_HEIGHT,
        style_overrides: inputNode.style_overrides,
      });
    }
  }

  return {
    nodes: resultNodes,
    groups: resultGroups,
    totalWidth: layout.width ?? 800,
    totalHeight: layout.height ?? 600,
  };
}
