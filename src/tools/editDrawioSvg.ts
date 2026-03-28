import fs from 'fs';
import type { InputEdge, InputGroup, LayoutOptions } from '../layout/elkLayout.js';
import { parseDrawioSvgFile, detectDrawioFormat } from '../parser/mxGraphModelParser.js';
import { handleCreateDrawioSvg, resolveIcons, type InputNodeWithHighlight } from './createDrawioSvg.js';
import { NODE_STYLE_OVERRIDES_SCHEMA, EDGE_STYLE_OVERRIDES_SCHEMA, GROUP_STYLE_OVERRIDES_SCHEMA } from '../schemas/styleOverrides.js';
import { surgicallyEditFormatB } from './surgicalMxEdit.js';
import { buildPreservedLayoutResult } from '../layout/preservedLayout.js';
import { generateMxGraphModel } from '../generator/mxGraphModel.js';
import { generateSvgVisual } from '../generator/svgRenderer.js';
import { assembleAndWrite } from '../generator/drawioSvg.js';

export const EDIT_DRAWIO_SVG_TOOL = {
  name: 'edit_drawio_svg',
  description:
    'Edit an existing .drawio.svg file by adding, removing, or updating nodes, edges, and groups. ' +
    'Use numeric IDs from read_drawio_svg to reference existing elements (e.g. remove_nodes: ["15"], update_nodes: [{id: "15", ...}]). ' +
    'For add operations, use temporary IDs to establish relationships within the same call (e.g. add_nodes: [{id: "new", ...}], add_edges: [{source: "15", target: "new"}]). ' +
    'By default (layout_mode: "preserve"), existing node and group positions are kept exactly as-is; ' +
    'only newly added elements are placed automatically outside the existing layout. ' +
    'Use layout_mode: "recompute" to fully recompute layout with ELK. ' +
    'Icons of existing (unchanged) nodes are preserved automatically — no need to pass icon data. ' +
    'To replace an icon on an existing node, use update_nodes with icon_path. ' +
    'Removing a group does not delete its child nodes — they become top-level nodes. ' +
    'All add/update operations support style_overrides for CSS-equivalent per-element visual customization: ' +
    'add_nodes/update_nodes (fill_color=background-color, stroke_color=border-color, stroke_width=border-width, ' +
    'stroke_dashed=border-style:dashed, font_bold=font-weight:bold, font_size=font-size, font_color=color, ' +
    'opacity=opacity, rounded=border-radius, shadow=box-shadow, text_align=text-align, etc.); ' +
    'add_edges/update_edges (stroke_color, stroke_width, stroke_dashed, font_color, font_size, opacity, etc.); ' +
    'add_groups/update_groups (fill_color, stroke_color, stroke_width, stroke_dashed, rounded, corner_radius=border-radius%, ' +
    'font_color, font_size, font_bold, opacity, text_align, shadow, etc.). ' +
    'update_edges also supports label, style (solid/dashed), connector, and arrow changes — identified by source+target pair. ' +
    'style_overrides from read_drawio_svg can be passed back to preserve or selectively override existing styles. ' +
    'IMPORTANT: style_overrides in update_nodes/update_edges/update_groups are MERGED with existing styles — ' +
    'only specified properties are changed, unspecified properties are preserved. ' +
    'You do NOT need to re-specify all existing style_overrides when making a partial update.',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'Absolute path to the .drawio.svg file to edit.',
      },
      layout_mode: {
        type: 'string',
        enum: ['preserve', 'recompute'],
        description:
          '"preserve" (default): keep existing node/group positions exactly; place only new elements outside. ' +
          '"recompute": fully recompute layout with ELK (ignores existing positions).',
      },
      add_nodes: {
        type: 'array',
        description: 'Nodes to add to the diagram.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Unique identifier for the new node.' },
            label: { type: 'string', description: 'Display label.' },
            icon_path: { type: 'string', nullable: true, description: 'Absolute path to local SVG icon.' },
            icon_data_uri: { type: 'string', description: 'Embedded SVG icon as a data URI. Use only if you have icon data from another source.' },
            highlight: { type: 'string', nullable: true, description: 'Highlight color (named or #RRGGBB).' },
            layer_hint: { type: 'string', enum: ['first', 'last'] },
            style_overrides: NODE_STYLE_OVERRIDES_SCHEMA,
          },
          required: ['id', 'label'],
        },
      },
      remove_nodes: {
        type: 'array',
        description: 'IDs of nodes to remove. All edges touching these nodes are also removed.',
        items: { type: 'string' },
      },
      update_nodes: {
        type: 'array',
        description: 'Update label, highlight, icon, or style of existing nodes.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'ID of the node to update.' },
            label: { type: 'string', description: 'New label.' },
            highlight: { type: 'string', nullable: true, description: 'New highlight color, or null to remove.' },
            icon_path: { type: 'string', nullable: true, description: 'New icon path, or null to remove.' },
            icon_data_uri: { type: 'string', description: 'New embedded icon data URI.' },
            style_overrides: NODE_STYLE_OVERRIDES_SCHEMA,
          },
          required: ['id'],
        },
      },
      add_edges: {
        type: 'array',
        description: 'Edges to add.',
        items: {
          type: 'object',
          properties: {
            source: { type: 'string' },
            target: { type: 'string' },
            label: { type: 'string' },
            style: { type: 'string', enum: ['solid', 'dashed'] },
            connector: { type: 'string', enum: ['straight', 'orthogonal', 'elbow-h', 'elbow-v'] },
            arrow: {
              type: 'string',
              enum: ['default', 'none', 'both'],
              description:
                'Arrow style. ' +
                '"default": arrow at target end only. ' +
                '"none": no arrowheads. ' +
                '"both": arrows at both source and target ends.',
            },
            style_overrides: EDGE_STYLE_OVERRIDES_SCHEMA,
          },
          required: ['source', 'target'],
        },
      },
      remove_edges: {
        type: 'array',
        description: 'Edges to remove, identified by source+target pair.',
        items: {
          type: 'object',
          properties: {
            source: { type: 'string' },
            target: { type: 'string' },
          },
          required: ['source', 'target'],
        },
      },
      update_edges: {
        type: 'array',
        description: 'Update label, style, connector, arrow, or visual style of existing edges, identified by source+target pair. style_overrides are merged with existing styles.',
        items: {
          type: 'object',
          properties: {
            source: { type: 'string' },
            target: { type: 'string' },
            label: { type: 'string' },
            style: { type: 'string', enum: ['solid', 'dashed'] },
            connector: { type: 'string', enum: ['straight', 'orthogonal', 'elbow-h', 'elbow-v'] },
            arrow: {
              type: 'string',
              enum: ['default', 'none', 'both'],
              description: 'Arrow style. "default": arrow at target end only. "none": no arrowheads. "both": arrows at both ends.',
            },
            style_overrides: EDGE_STYLE_OVERRIDES_SCHEMA,
          },
          required: ['source', 'target'],
        },
      },
      add_groups: {
        type: 'array',
        description: 'Groups to add.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            label: { type: 'string' },
            children: { type: 'array', items: { type: 'string' } },
            style: { type: 'string' },
            style_overrides: GROUP_STYLE_OVERRIDES_SCHEMA,
          },
          required: ['id', 'label', 'children'],
        },
      },
      remove_groups: {
        type: 'array',
        description: 'IDs of groups to remove. Child nodes are NOT deleted — they become top-level.',
        items: { type: 'string' },
      },
      update_groups: {
        type: 'array',
        description: 'Update label, style, children, or visual style of existing groups.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            label: { type: 'string' },
            style: { type: 'string' },
            children: { type: 'array', items: { type: 'string' } },
            style_overrides: GROUP_STYLE_OVERRIDES_SCHEMA,
          },
          required: ['id'],
        },
      },
      layout: {
        type: 'object',
        description: 'Optional layout options. Applies to recompute mode; spacing also used for new-element placement in preserve mode.',
        properties: {
          direction: { type: 'string', enum: ['RIGHT', 'DOWN', 'LEFT', 'UP'] },
          spacing: { type: 'number' },
          group_direction: { type: 'string', enum: ['RIGHT', 'DOWN', 'LEFT', 'UP'] },
          algorithm: {
            type: 'string',
            enum: ['layered', 'force', 'stress'],
            description:
              'Layout algorithm (recompute mode only). ' +
              '"layered" (default): hierarchical flow. ' +
              '"force": physics-based 2D placement. ' +
              '"stress": stress-minimization 2D placement.',
          },
        },
      },
    },
    required: ['file_path'],
  },
} as const;

export interface EditDrawioSvgInput {
  file_path: string;
  layout_mode?: 'preserve' | 'recompute';
  add_nodes?: Array<{
    id: string;
    label: string;
    icon_path?: string | null;
    icon_data_uri?: string;
    highlight?: string | null;
    layer_hint?: 'first' | 'last';
    style_overrides?: import('../layout/elkLayout.js').NodeStyleOverrides;
  }>;
  remove_nodes?: string[];
  update_nodes?: Array<{
    id: string;
    label?: string;
    highlight?: string | null;
    icon_path?: string | null;
    icon_data_uri?: string;
    style_overrides?: import('../layout/elkLayout.js').NodeStyleOverrides;
  }>;
  add_edges?: InputEdge[];
  remove_edges?: Array<{ source: string; target: string }>;
  update_edges?: Array<{
    source: string;
    target: string;
    label?: string;
    style?: 'solid' | 'dashed';
    connector?: 'straight' | 'orthogonal' | 'elbow-h' | 'elbow-v';
    arrow?: 'default' | 'none' | 'both';
    style_overrides?: import('../layout/elkLayout.js').EdgeStyleOverrides;
  }>;
  add_groups?: InputGroup[];
  remove_groups?: string[];
  update_groups?: Array<{
    id: string;
    label?: string;
    style?: string;
    children?: string[];
    style_overrides?: import('../layout/elkLayout.js').GroupStyleOverrides;
  }>;
  layout?: LayoutOptions;
}

export async function handleEditDrawioSvg(input: EditDrawioSvgInput): Promise<string> {
  const rawSvgContent = fs.readFileSync(input.file_path, 'utf-8');
  const format = detectDrawioFormat(rawSvgContent);
  const effectiveLayoutMode = input.layout_mode ?? 'preserve';

  // Format B + preserve: use surgical edit to retain draw.io custom styles
  if (format === 'B' && effectiveLayoutMode !== 'recompute') {
    const updatedSvg = await surgicallyEditFormatB(rawSvgContent, input);
    fs.writeFileSync(input.file_path, updatedSvg, 'utf-8');
    return `Successfully edited: ${input.file_path}`;
  }

  // Format A (all modes) or Format B + recompute: parse → regenerate pipeline

  // 1. Parse existing file
  const spec = parseDrawioSvgFile(input.file_path);

  const removedNodeIds = new Set(input.remove_nodes ?? []);
  const removedGroupIds = new Set(input.remove_groups ?? []);

  // 2. Apply node removals — carry over preserve-mode coordinate fields
  let nodes: InputNodeWithHighlight[] = spec.nodes
    .filter((n) => !removedNodeIds.has(n.id))
    .map((n) => ({
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

  // 3. Apply node updates
  for (const upd of input.update_nodes ?? []) {
    nodes = nodes.map((n) => {
      if (n.id !== upd.id) return n;
      return {
        ...n,
        label: upd.label ?? n.label,
        highlight: upd.highlight !== undefined ? upd.highlight : n.highlight,
        icon_path: upd.icon_path !== undefined ? (upd.icon_path ?? undefined) : n.icon_path,
        icon_data_uri: upd.icon_data_uri !== undefined ? upd.icon_data_uri : n.icon_data_uri,
        style_overrides: upd.style_overrides !== undefined
          ? { ...n.style_overrides, ...upd.style_overrides }
          : n.style_overrides,
      };
    });
  }

  // 4. Apply edge removals (also remove edges touching deleted nodes)
  const removeEdgeSet = new Set(
    (input.remove_edges ?? []).map((e) => `${e.source}::${e.target}`),
  );
  let edges: InputEdge[] = spec.edges.filter(
    (e) =>
      !removedNodeIds.has(e.source) &&
      !removedNodeIds.has(e.target) &&
      !removeEdgeSet.has(`${e.source}::${e.target}`),
  );

  // 5a. Apply edge updates
  for (const upd of input.update_edges ?? []) {
    edges = edges.map((e) => {
      if (e.source !== upd.source || e.target !== upd.target) return e;
      return {
        ...e,
        label: upd.label !== undefined ? upd.label : e.label,
        style: upd.style ?? e.style,
        connector: upd.connector ?? e.connector,
        arrow: upd.arrow ?? e.arrow,
        style_overrides: upd.style_overrides !== undefined
          ? { ...e.style_overrides, ...upd.style_overrides }
          : e.style_overrides,
      };
    });
  }

  // 5. Apply group removals (children become top-level — no action needed since they stay in nodes array)
  let groups: InputGroup[] = spec.groups
    .filter((g) => !removedGroupIds.has(g.id))
    .map((g) => ({
      id: g.id,
      label: g.label,
      style: g.style,
      // Remove deleted nodes/groups from children lists
      children: g.children.filter((c) => !removedNodeIds.has(c) && !removedGroupIds.has(c)),
      // Carry over preserve-mode coordinate fields
      x: g.x,
      y: g.y,
      width: g.width,
      height: g.height,
      style_overrides: g.style_overrides,
    }));

  // 6. Apply group updates
  for (const upd of input.update_groups ?? []) {
    groups = groups.map((g) => {
      if (g.id !== upd.id) return g;
      return {
        ...g,
        label: upd.label ?? g.label,
        style: upd.style ?? g.style,
        children: upd.children ?? g.children,
        style_overrides: upd.style_overrides !== undefined
          ? { ...g.style_overrides, ...upd.style_overrides }
          : g.style_overrides,
      };
    });
  }

  // 7. Add new items
  nodes = [...nodes, ...(input.add_nodes ?? []).map((n) => ({
    id: n.id,
    label: n.label,
    icon_path: n.icon_path ?? undefined,
    icon_data_uri: n.icon_data_uri,
    highlight: n.highlight ?? null,
    layer_hint: n.layer_hint,
    style_overrides: n.style_overrides,
  }))];
  edges = [...edges, ...(input.add_edges ?? [])];
  groups = [...groups, ...(input.add_groups ?? [])];

  // 8. Determine effective layout: explicit override > file's stored layout > defaults
  const effectiveLayout = input.layout ?? spec.layout;

  // 9. Branch on layout_mode
  if (effectiveLayoutMode === 'recompute') {
    // Full ELK recompute — strip preserved coordinates and connection points
    // so that ELK computes a fresh layout from scratch
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return handleCreateDrawioSvg({
      nodes: nodes.map(({ x_hint, y_hint, x_geom, y_geom, width, height, ...rest }) => rest),
      edges: edges.map(({ exitX, exitY, entryX, entryY, ...rest }) => rest),
      groups: groups.map(({ x, y, width, height, ...rest }) => rest),
      layout: effectiveLayout,
      output_path: input.file_path,
    });
  }

  // preserve mode: bypass ELK, use stored coordinates for existing elements
  const newNodeIds = new Set((input.add_nodes ?? []).map((n) => n.id));
  const newGroupIds = new Set((input.add_groups ?? []).map((g) => g.id));
  const spacing = effectiveLayout?.spacing ?? 60;

  const layoutResult = buildPreservedLayoutResult(nodes, edges, groups, newNodeIds, newGroupIds, spacing);
  const { icons, highlights, warnings } = await resolveIcons(nodes);
  const mxXml = generateMxGraphModel(layoutResult, edges, icons, highlights);
  const svgVisual = generateSvgVisual(layoutResult, edges, icons, highlights);
  assembleAndWrite(mxXml, svgVisual, input.file_path, effectiveLayout);

  const warningText = warnings.length > 0
    ? `\n\nWarnings:\n${warnings.map((w) => `  - ${w}`).join('\n')}`
    : '';
  return `Successfully edited: ${input.file_path}${warningText}`;
}
