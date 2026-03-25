import { parseDrawioSvgFile, type DiagramSpec } from '../parser/mxGraphModelParser.js';

export const READ_DRAWIO_SVG_TOOL = {
  name: 'read_drawio_svg',
  description:
    'Read an existing .drawio.svg file and return its diagram as structured JSON ' +
    '(nodes, edges, groups, layout). ' +
    'To understand the diagram content — e.g. what components exist, how they are connected, ' +
    'and which group they belong to — read the returned JSON directly: ' +
    '  nodes[].label: component names; ' +
    '  edges[].source / .target / .label: connectivity and protocol; ' +
    '  groups[].label / .children: logical boundaries (VNet, resource group, etc.). ' +
    'Typical workflows: ' +
    '(1) read_drawio_svg → edit_drawio_svg: targeted add/remove/update; node icons are preserved automatically. ' +
    '(2) read_drawio_svg → create_drawio_svg: full rebuild; icons are NOT carried over from the file, specify them via icon_path or icon_data_uri. ' +
    'Node IDs are synthesized from label slugs (e.g. "PostgreSQL" → "postgresql"). ' +
    'Icon data is NOT included in the response (use has_icon flag to see which nodes have icons). ' +
    'Note: layout is automatically recomputed when regenerating.',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'Absolute path to the .drawio.svg file to read.',
      },
    },
    required: ['file_path'],
  },
} as const;

export interface ReadDrawioSvgInput {
  file_path: string;
}

export interface ReadDrawioSvgNodeOutput {
  id: string;
  label: string;
  has_icon: boolean;
  highlight?: string;
  x_hint?: number;
  y_hint?: number;
}

export interface ReadDrawioSvgOutput {
  nodes: ReadDrawioSvgNodeOutput[];
  edges: DiagramSpec['edges'];
  groups: DiagramSpec['groups'];
  layout?: DiagramSpec['layout'];
  output_path: string;
}

export async function handleReadDrawioSvg(input: ReadDrawioSvgInput): Promise<string> {
  const spec = parseDrawioSvgFile(input.file_path);
  const output: ReadDrawioSvgOutput = {
    // Strip icon_data_uri (can be thousands of chars per node) — icons are preserved
    // automatically by edit_drawio_svg, or re-resolved by create_drawio_svg.
    nodes: spec.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      has_icon: !!n.icon_data_uri,
      highlight: n.highlight,
      x_hint: n.x_hint,
      y_hint: n.y_hint,
    })),
    edges: spec.edges,
    groups: spec.groups,
    layout: spec.layout,
    output_path: spec.output_path,
  };
  return JSON.stringify(output, null, 2);
}
