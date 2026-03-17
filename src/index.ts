#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  CREATE_DRAWIO_SVG_TOOL,
  handleCreateDrawioSvg,
  type CreateDrawioSvgInput,
} from './tools/createDrawioSvg.js';
import {
  READ_DRAWIO_SVG_TOOL,
  handleReadDrawioSvg,
  type ReadDrawioSvgInput,
} from './tools/readDrawioSvg.js';
import {
  EDIT_DRAWIO_SVG_TOOL,
  handleEditDrawioSvg,
  type EditDrawioSvgInput,
} from './tools/editDrawioSvg.js';

const server = new Server(
  { name: 'mcp-drawio-svg', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [CREATE_DRAWIO_SVG_TOOL, READ_DRAWIO_SVG_TOOL, EDIT_DRAWIO_SVG_TOOL],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: string;
    if (name === 'create_drawio_svg') {
      result = await handleCreateDrawioSvg(args as unknown as CreateDrawioSvgInput);
    } else if (name === 'read_drawio_svg') {
      result = await handleReadDrawioSvg(args as unknown as ReadDrawioSvgInput);
    } else if (name === 'edit_drawio_svg') {
      result = await handleEditDrawioSvg(args as unknown as EditDrawioSvgInput);
    } else {
      throw new Error(`Unknown tool: ${name}`);
    }
    return {
      content: [{ type: 'text', text: result }],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
