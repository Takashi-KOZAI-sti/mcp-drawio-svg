import type { InputNode, InputEdge, InputGroup, LayoutOptions, NodeStyleOverrides, EdgeStyleOverrides, GroupStyleOverrides } from '../layout/elkLayout.js';
import { computeLayout } from '../layout/elkLayout.js';
import { resolveIconSvg } from '../icons/iconResolver.js';
import { encodeIcon } from '../icons/iconEncoder.js';
import { generateMxGraphModel, type NodeIcons, type NodeHighlights } from '../generator/mxGraphModel.js';
import { generateSvgVisual } from '../generator/svgRenderer.js';
import { assembleAndWrite } from '../generator/drawioSvg.js';

export interface InputNodeWithHighlight extends InputNode {
  highlight?: string | null;
  /** Embedded SVG icon as a data URI from a prior read_drawio_svg call. Takes precedence over icon_path. */
  icon_data_uri?: string;
}

// Re-export StyleOverrides types so other modules can import them from here
export type { NodeStyleOverrides, EdgeStyleOverrides, GroupStyleOverrides };

export const NODE_STYLE_OVERRIDES_SCHEMA = {
  type: 'object',
  description: 'Fine-grained visual style overrides. Takes precedence over the highlight parameter.',
  properties: {
    fill_color: { type: 'string', description: 'Background fill color (#RRGGBB or "none" for transparent). Equivalent to CSS background-color. Ignored for icon nodes. Example: "#e8f5e9".' },
    stroke_color: { type: 'string', description: 'Border color (#RRGGBB or "none" for no border). Equivalent to CSS border-color. Example: "#4caf50".' },
    stroke_width: { type: 'number', description: 'Border thickness in pixels (1–10). Equivalent to CSS border-width. Default: 1.' },
    stroke_dashed: { type: 'boolean', description: 'Dashed border. Equivalent to CSS border-style: dashed. Default: false.' },
    font_color: { type: 'string', description: 'Label text color (#RRGGBB). Equivalent to CSS color. Default: "#333333".' },
    font_size: { type: 'number', description: 'Label text size in points (8–72). Equivalent to CSS font-size. Default: 11.' },
    font_bold: { type: 'boolean', description: 'Bold label text. Equivalent to CSS font-weight: bold. Default: false.' },
    font_italic: { type: 'boolean', description: 'Italic label text. Equivalent to CSS font-style: italic. Default: false.' },
    font_underline: { type: 'boolean', description: 'Underline label text. Equivalent to CSS text-decoration: underline. Default: false.' },
    font_strikethrough: { type: 'boolean', description: 'Strike-through label text. Equivalent to CSS text-decoration: line-through. Default: false.' },
    opacity: { type: 'number', description: 'Transparency (0–100). 100 = fully opaque (default), 0 = invisible. Equivalent to CSS opacity × 100.' },
    rounded: { type: 'boolean', description: 'Rounded corners. Equivalent to CSS border-radius > 0. Default: true. Rectangle nodes only.' },
    shadow: { type: 'boolean', description: 'Drop shadow. Equivalent to CSS box-shadow. Default: false.' },
    text_align: { type: 'string', enum: ['left', 'center', 'right'], description: 'Horizontal text alignment. Equivalent to CSS text-align. Default: "center". Rectangle nodes only.' },
    text_vertical_align: { type: 'string', enum: ['top', 'middle', 'bottom'], description: 'Vertical text alignment. Equivalent to CSS vertical-align. Default: "middle". Rectangle nodes only.' },
  },
} as const;

export const EDGE_STYLE_OVERRIDES_SCHEMA = {
  type: 'object',
  description: 'Fine-grained visual style overrides for the edge. stroke_dashed overrides the top-level style: "dashed" parameter.',
  properties: {
    stroke_color: { type: 'string', description: 'Line color (#RRGGBB). Equivalent to CSS border-color. Default: "#000000".' },
    stroke_width: { type: 'number', description: 'Line thickness in pixels (1–10). Equivalent to CSS border-width. Default: 1.' },
    stroke_dashed: { type: 'boolean', description: 'Dashed line. Equivalent to CSS border-style: dashed. Default: false.' },
    font_color: { type: 'string', description: 'Edge label text color (#RRGGBB). Equivalent to CSS color. Default: "#333333".' },
    font_size: { type: 'number', description: 'Edge label text size in points (8–72). Equivalent to CSS font-size. Default: 11.' },
    font_bold: { type: 'boolean', description: 'Bold label text. Equivalent to CSS font-weight: bold. Default: false.' },
    font_italic: { type: 'boolean', description: 'Italic label text. Equivalent to CSS font-style: italic. Default: false.' },
    font_underline: { type: 'boolean', description: 'Underline label text. Equivalent to CSS text-decoration: underline. Default: false.' },
    opacity: { type: 'number', description: 'Transparency (0–100). 100 = fully opaque (default), 0 = invisible. Equivalent to CSS opacity × 100.' },
  },
} as const;

export const GROUP_STYLE_OVERRIDES_SCHEMA = {
  type: 'object',
  description: 'Fine-grained visual style overrides for the group. Takes precedence over the style color parameter.',
  properties: {
    fill_color: { type: 'string', description: 'Background fill color (#RRGGBB or "none" for transparent). Equivalent to CSS background-color.' },
    stroke_color: { type: 'string', description: 'Border color (#RRGGBB or "none" for no border). Equivalent to CSS border-color.' },
    stroke_width: { type: 'number', description: 'Border thickness in pixels (1–10). Equivalent to CSS border-width. Default: 1.' },
    stroke_dashed: { type: 'boolean', description: 'Dashed border. Equivalent to CSS border-style: dashed. Default: false.' },
    rounded: { type: 'boolean', description: 'Rounded corners. Equivalent to CSS border-radius > 0. Default: true.' },
    corner_radius: { type: 'number', description: 'Corner rounding amount (0–50). 0 = square corners, 50 = very rounded. Analogous to CSS border-radius as % of the shorter edge. Default: 7. Only effective when rounded is true.' },
    font_color: { type: 'string', description: 'Label text color (#RRGGBB). Equivalent to CSS color.' },
    font_size: { type: 'number', description: 'Label text size in points (8–72). Equivalent to CSS font-size. Default: 11.' },
    font_bold: { type: 'boolean', description: 'Bold label text. Equivalent to CSS font-weight: bold. Default: true for groups.' },
    font_italic: { type: 'boolean', description: 'Italic label text. Equivalent to CSS font-style: italic. Default: false.' },
    font_underline: { type: 'boolean', description: 'Underline label text. Equivalent to CSS text-decoration: underline. Default: false.' },
    opacity: { type: 'number', description: 'Transparency (0–100). 100 = fully opaque (default), 0 = invisible. Equivalent to CSS opacity × 100.' },
    text_align: { type: 'string', enum: ['left', 'center', 'right'], description: 'Horizontal text alignment. Equivalent to CSS text-align. Default: "left".' },
    text_vertical_align: { type: 'string', enum: ['top', 'middle', 'bottom'], description: 'Vertical text alignment. Equivalent to CSS vertical-align. Default: "top".' },
    shadow: { type: 'boolean', description: 'Drop shadow. Equivalent to CSS box-shadow. Default: false.' },
  },
} as const;

export const CREATE_DRAWIO_SVG_TOOL = {
  name: 'create_drawio_svg',
  description:
    'Generate a .drawio.svg file from a diagram description. ' +
    'The file works in two ways simultaneously: ' +
    '(1) editable in draw.io / VS Code draw.io extension, ' +
    '(2) embeddable as SVG in Markdown design documents with ![](file.drawio.svg). ' +
    'This single-file format prevents inconsistency between the source diagram and its SVG export. ' +
    'Layout is computed automatically via elkjs — no need to specify coordinates. ' +
    'Icons can be provided as local file paths; if omitted, a fallback icon is searched automatically. ' +
    'Each element supports style_overrides for CSS-equivalent visual customization: ' +
    'nodes[].style_overrides (fill_color=background-color, stroke_color=border-color, stroke_width=border-width, ' +
    'stroke_dashed=border-style:dashed, font_bold=font-weight:bold, font_size=font-size, font_color=color, ' +
    'opacity=opacity, rounded=border-radius, shadow=box-shadow, text_align=text-align, etc.); ' +
    'edges[].style_overrides (stroke_color, stroke_width, stroke_dashed, font_color, font_size, font_bold, opacity, etc.); ' +
    'groups[].style_overrides (fill_color, stroke_color, stroke_width, stroke_dashed, rounded, corner_radius=border-radius%, ' +
    'font_color, font_size, font_bold, opacity, text_align, shadow, etc.).',
  inputSchema: {
    type: 'object',
    properties: {
      nodes: {
        type: 'array',
        description: 'List of nodes (components) in the diagram.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Unique identifier for this node.' },
            label: { type: 'string', description: 'Display label for this node.' },
            icon_path: {
              type: 'string',
              description:
                'Absolute path to a local SVG icon file for this node. ' +
                'If omitted, an icon is searched from simple-icons based on the label.',
              nullable: true,
            },
            icon_data_uri: {
              type: 'string',
              description:
                'Embedded SVG icon as a data URI, as returned by read_drawio_svg. ' +
                'Pass this back to preserve the icon from an existing file. ' +
                'Takes precedence over icon_path.',
            },
            highlight: {
              type: 'string',
              description:
                'Highlight color for this node. ' +
                'Named colors: "red", "yellow", "blue", "orange", "green". ' +
                'Custom: "#RRGGBB" hex code. ' +
                'Adds a colored border (icon nodes) or background (rectangle nodes).',
              nullable: true,
            },
            layer_hint: {
              type: 'string',
              enum: ['first', 'last'],
              description:
                'Hint to place this node in the first or last layer along the flow direction. ' +
                '"first" = leftmost (direction:RIGHT) or topmost (direction:DOWN). ' +
                '"last" = rightmost or bottommost. ' +
                'Does not guarantee exact position — use draw.io manual editing for precise placement.',
            },
            style_overrides: NODE_STYLE_OVERRIDES_SCHEMA,
          },
          required: ['id', 'label'],
        },
      },
      edges: {
        type: 'array',
        description: 'Connections between nodes.',
        items: {
          type: 'object',
          properties: {
            source: { type: 'string', description: 'Source node ID.' },
            target: { type: 'string', description: 'Target node ID.' },
            label: { type: 'string', description: 'Optional label on the edge.' },
            style: {
              type: 'string',
              enum: ['solid', 'dashed'],
              description: 'Line style. Defaults to solid.',
            },
            connector: {
              type: 'string',
              enum: ['straight', 'orthogonal', 'elbow-h', 'elbow-v'],
              description:
                'Connector routing style. ' +
                '"orthogonal" (default): right-angle auto-routing, draw.io computes optimal bends. ' +
                '"elbow-h": single horizontal-first L-bend (src → horizontal → vertical → tgt). ' +
                '"elbow-v": single vertical-first L-bend (src → vertical → horizontal → tgt). ' +
                '"straight": direct diagonal line.',
            },
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
        default: [],
      },
      groups: {
        type: 'array',
        description: 'Optional grouping containers (e.g. network boundaries, system domains).',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Unique identifier for this group.' },
            label: { type: 'string', description: 'Display label for this group.' },
            children: {
              type: 'array',
              items: { type: 'string' },
              description: 'Node IDs or group IDs that belong to this group. Groups can be nested by including another group\'s ID here.',
            },
            style: {
              type: 'string',
              description:
                'Color style for the group border and background. ' +
                'Named colors: "blue", "orange", "red", "green", "purple", "gray". ' +
                'Custom: "#RRGGBB" hex code. ' +
                'Default: "green".',
            },
            style_overrides: GROUP_STYLE_OVERRIDES_SCHEMA,
          },
          required: ['id', 'label', 'children'],
        },
        default: [],
      },
      layout: {
        type: 'object',
        description: 'Optional layout configuration.',
        properties: {
          algorithm: {
            type: 'string',
            enum: ['layered', 'force', 'stress'],
            description:
              'Layout algorithm. Default: "layered". ' +
              '"layered": hierarchical flow (left→right or top→bottom). Best for flowcharts and pipelines. ' +
              '"force": physics-based 2D placement. Best for network and relationship diagrams. ' +
              '"stress": stress-minimization 2D placement. Best for uniform node spacing.',
          },
          direction: {
            type: 'string',
            enum: ['RIGHT', 'DOWN', 'LEFT', 'UP'],
            description: 'Overall flow direction (layered only). Default: "RIGHT" (left to right).',
          },
          spacing: {
            type: 'number',
            description: 'Spacing between nodes in pixels. Default: 60.',
          },
          group_direction: {
            type: 'string',
            enum: ['RIGHT', 'DOWN', 'LEFT', 'UP'],
            description: 'Flow direction inside groups (layered only). Default: "DOWN" (top to bottom).',
          },
        },
      },
      output_path: {
        type: 'string',
        description: 'Absolute path where the .drawio.svg file should be saved.',
      },
    },
    required: ['nodes', 'output_path'],
  },
} as const;

export interface CreateDrawioSvgInput {
  nodes: InputNodeWithHighlight[];
  edges?: InputEdge[];
  groups?: InputGroup[];
  layout?: LayoutOptions;
  output_path: string;
}

/**
 * Resolve icons and highlights for a list of nodes.
 * Reused by both handleCreateDrawioSvg and handleEditDrawioSvg (preserve mode).
 */
export async function resolveIcons(
  nodes: InputNodeWithHighlight[],
): Promise<{ icons: NodeIcons; highlights: NodeHighlights; warnings: string[] }> {
  const icons: NodeIcons = {};
  const highlights: NodeHighlights = {};
  const warnings: string[] = [];

  for (const node of nodes) {
    let svgContent: string | null = null;
    if (node.icon_data_uri) {
      svgContent = decodeIconDataUri(node.icon_data_uri);
    }
    if (!svgContent) {
      svgContent = await resolveIconSvg(node.label, node.icon_path ?? undefined);
    }
    if (svgContent) {
      icons[node.id] = encodeIcon(svgContent);
    } else {
      warnings.push(`No icon found for "${node.label}" (id: ${node.id}); using default rectangle style.`);
    }
    if (node.highlight) {
      highlights[node.id] = node.highlight;
    }
  }

  return { icons, highlights, warnings };
}

export async function handleCreateDrawioSvg(input: CreateDrawioSvgInput): Promise<string> {
  const { nodes, edges = [], groups = [], layout, output_path } = input;

  // 1. Resolve icons
  const { icons, highlights, warnings: iconWarnings } = await resolveIcons(nodes);

  // 2. Compute layout
  const layoutResult = await computeLayout(nodes, edges, groups, layout);

  // 3. Generate mxGraphModel XML
  const mxXml = generateMxGraphModel(layoutResult, edges, icons, highlights);

  // 4. Generate SVG visual
  const svgVisual = generateSvgVisual(layoutResult, edges, icons, highlights);

  // 5. Assemble and write (embed layout options for round-trip fidelity)
  assembleAndWrite(mxXml, svgVisual, output_path, layout);

  const warnings =
    iconWarnings.length > 0
      ? `\n\nWarnings:\n${iconWarnings.map((w) => `  - ${w}`).join('\n')}`
      : '';

  return `Successfully created: ${output_path}${warnings}`;
}

/**
 * Decode an embedded SVG icon data URI back to raw SVG string.
 * Handles both "data:image/svg+xml,<base64>" (draw.io format)
 * and "data:image/svg+xml;base64,<base64>" (standard format).
 * Returns null if decoding fails.
 */
export function decodeIconDataUri(iconDataUri: string): string | null {
  // Standard format: data:image/svg+xml;base64,<base64>
  const standardMatch = iconDataUri.match(/^data:image\/svg\+xml;base64,(.+)$/);
  if (standardMatch) {
    try {
      return Buffer.from(standardMatch[1], 'base64').toString('utf-8');
    } catch {
      return null;
    }
  }
  // draw.io format: data:image/svg+xml,<base64> (no semicolon before base64)
  const drawioMatch = iconDataUri.match(/^data:image\/svg\+xml,(.+)$/);
  if (drawioMatch) {
    try {
      return Buffer.from(drawioMatch[1], 'base64').toString('utf-8');
    } catch {
      return null;
    }
  }
  return null;
}
