import { parseDrawioSvgFile, type DiagramSpec } from '../parser/mxGraphModelParser.js';

export const READ_DRAWIO_SVG_TOOL = {
  name: 'read_drawio_svg',
  description:
    'Read an existing .drawio.svg file and return its diagram as structured JSON ' +
    '(nodes, edges, groups, layout). ' +
    'Use this to understand the current structure of an existing file before editing. ' +
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
  summary: string;
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
    summary: buildSummary(spec),
  };
  return JSON.stringify(output, null, 2);
}

function buildSummary(spec: DiagramSpec): string {
  const nodeCount = spec.nodes.length;
  const edgeCount = spec.edges.length;
  const groupCount = spec.groups.length;

  const nodeLabels = spec.nodes.map((n) => `${n.label} (id: ${n.id})`).join(', ');
  const groupLabels = spec.groups.map((g) => `${g.label} (id: ${g.id}, children: ${g.children.join(', ')})`).join('; ');
  const hasIconCount = spec.nodes.filter((n) => n.icon_data_uri).length;
  const layoutDesc = spec.layout
    ? `direction=${spec.layout.direction ?? 'RIGHT'}, spacing=${spec.layout.spacing ?? 60}`
    : 'default layout (direction=RIGHT, spacing=60) — no data-layout found in file';

  const parts = [
    `Diagram contains ${nodeCount} node(s), ${edgeCount} edge(s), ${groupCount} group(s).`,
  ];
  if (nodeCount > 0) parts.push(`Nodes: ${nodeLabels}.`);
  if (groupCount > 0) parts.push(`Groups: ${groupLabels}.`);
  if (hasIconCount > 0) parts.push(`${hasIconCount} node(s) have icons (has_icon: true). Icons are preserved automatically when using edit_drawio_svg.`);
  parts.push(`Layout: ${layoutDesc}.`);
  parts.push(
    'To edit: modify the nodes/edges/groups in this JSON and call create_drawio_svg with output_path, ' +
    'or use edit_drawio_svg for targeted add/remove/update operations.',
  );

  return parts.join(' ');
}
