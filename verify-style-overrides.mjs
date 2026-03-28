/**
 * verify-style-overrides.mjs
 * End-to-end verification of style_overrides feature.
 * Run: node verify-style-overrides.mjs
 */

import { handleCreateDrawioSvg } from './dist/tools/createDrawioSvg.js';
import { handleReadDrawioSvg } from './dist/tools/readDrawioSvg.js';
import { handleEditDrawioSvg } from './dist/tools/editDrawioSvg.js';
import fs from 'fs';

const CREATE_PATH = '/tmp/test-style-overrides.drawio.svg';
const EDIT_PATH = '/tmp/test-style-overrides-edited.drawio.svg';
const ARCH_PATH = '/Users/takashi.kozai/Desktop/mcp-drawio-svg/アーキテクチャ図.drawio.svg';

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${label}`);
    console.log(`     expected: ${JSON.stringify(expected)}`);
    console.log(`     actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

function checkExists(label, value) {
  if (value !== undefined && value !== null) {
    console.log(`  ✅ PASS: ${label} (value: ${JSON.stringify(value)})`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${label} — value is ${value}`);
    failed++;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1a: Create with all style_overrides properties
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== Step 1a: create with all style_overrides ===\n');

await handleCreateDrawioSvg({
  nodes: [
    {
      // Use a label that won't match simple-icons, to test pure rectangle node styling
      id: 'rect_node',
      label: 'XyzRectLabel99',
      style_overrides: {
        fill_color: '#fff9c4',
        // Use a non-palette color to avoid being interpreted as highlight
        stroke_color: '#ab6523',
        stroke_width: 3,
        stroke_dashed: true,
        font_color: '#5d4037',
        font_size: 14,
        font_bold: true,
        font_italic: true,
        font_underline: true,
        font_strikethrough: true,
        opacity: 80,
        rounded: false,
        shadow: true,
        text_align: 'left',
        text_vertical_align: 'top',
      },
    },
    {
      id: 'icon_node',
      label: 'GitHub',
      style_overrides: {
        // Use a non-palette color + stroke_width != 3 to avoid highlight detection
        stroke_color: '#1a237e',
        stroke_width: 2,
        stroke_dashed: true,
        font_color: '#1a237e',
        font_size: 12,
        font_bold: true,
        opacity: 90,
        shadow: true,
      },
    },
  ],
  edges: [
    {
      source: 'rect_node',
      target: 'icon_node',
      label: 'styled edge',
      connector: 'orthogonal',
      arrow: 'both',
      style_overrides: {
        stroke_color: '#e53935',
        stroke_width: 3,
        stroke_dashed: true,
        font_color: '#b71c1c',
        font_size: 13,
        font_bold: true,
        font_italic: true,
        font_underline: true,
        opacity: 75,
      },
    },
  ],
  groups: [
    {
      id: 'styled_group',
      label: 'Styled Group',
      children: ['rect_node', 'icon_node'],
      style_overrides: {
        fill_color: '#e8f5e9',
        stroke_color: '#2e7d32',
        stroke_width: 2,
        stroke_dashed: true,
        rounded: false,
        corner_radius: 0,
        font_color: '#1b5e20',
        font_size: 13,
        font_bold: false,
        font_italic: true,
        font_underline: true,
        opacity: 85,
        text_align: 'center',
        text_vertical_align: 'middle',
        shadow: true,
      },
    },
  ],
  output_path: CREATE_PATH,
});
console.log(`  Created: ${CREATE_PATH}`);

// ─────────────────────────────────────────────────────────────────────────────
// Step 1b: Read and verify round-trip
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== Step 1b: read and verify create round-trip ===\n');

const readRaw = await handleReadDrawioSvg({ file_path: CREATE_PATH });
const readResult = JSON.parse(readRaw);

// IDs are slugged from labels by the parser
const rectNode = readResult.nodes.find(n => n.label === 'XyzRectLabel99');
const iconNode = readResult.nodes.find(n => n.label === 'GitHub');
const edge = readResult.edges[0];
const group = readResult.groups.find(g => g.id === 'styled_group');

// NodeStyleOverrides — rect_node (non-default values should appear)
console.log('  -- rect_node style_overrides --');
check('rect fill_color', rectNode?.style_overrides?.fill_color, '#fff9c4');
check('rect stroke_color', rectNode?.style_overrides?.stroke_color, '#ab6523');
check('rect stroke_width', rectNode?.style_overrides?.stroke_width, 3);
check('rect stroke_dashed', rectNode?.style_overrides?.stroke_dashed, true);
check('rect font_color', rectNode?.style_overrides?.font_color, '#5d4037');
check('rect font_size', rectNode?.style_overrides?.font_size, 14);
check('rect font_bold', rectNode?.style_overrides?.font_bold, true);
check('rect font_italic', rectNode?.style_overrides?.font_italic, true);
check('rect font_underline', rectNode?.style_overrides?.font_underline, true);
check('rect font_strikethrough', rectNode?.style_overrides?.font_strikethrough, true);
check('rect opacity', rectNode?.style_overrides?.opacity, 80);
check('rect rounded=false (non-default)', rectNode?.style_overrides?.rounded, false);
check('rect shadow', rectNode?.style_overrides?.shadow, true);
check('rect text_align=left (non-default)', rectNode?.style_overrides?.text_align, 'left');
check('rect text_vertical_align=top (non-default)', rectNode?.style_overrides?.text_vertical_align, 'top');

// NodeStyleOverrides — icon_node
console.log('  -- icon_node style_overrides --');
check('icon stroke_color', iconNode?.style_overrides?.stroke_color, '#1a237e');
check('icon stroke_width', iconNode?.style_overrides?.stroke_width, 2);
check('icon stroke_dashed', iconNode?.style_overrides?.stroke_dashed, true);
check('icon font_color', iconNode?.style_overrides?.font_color, '#1a237e');
check('icon font_size', iconNode?.style_overrides?.font_size, 12);
check('icon font_bold', iconNode?.style_overrides?.font_bold, true);
check('icon opacity', iconNode?.style_overrides?.opacity, 90);
check('icon shadow', iconNode?.style_overrides?.shadow, true);

// EdgeStyleOverrides
console.log('  -- edge style_overrides --');
check('edge stroke_color', edge?.style_overrides?.stroke_color, '#e53935');
check('edge stroke_width', edge?.style_overrides?.stroke_width, 3);
check('edge stroke_dashed', edge?.style_overrides?.stroke_dashed, true);
check('edge font_color', edge?.style_overrides?.font_color, '#b71c1c');
check('edge font_size', edge?.style_overrides?.font_size, 13);
check('edge font_bold', edge?.style_overrides?.font_bold, true);
check('edge font_italic', edge?.style_overrides?.font_italic, true);
check('edge font_underline', edge?.style_overrides?.font_underline, true);
check('edge opacity', edge?.style_overrides?.opacity, 75);

// GroupStyleOverrides
console.log('  -- group style_overrides --');
check('group fill_color', group?.style_overrides?.fill_color, '#e8f5e9');
check('group stroke_color', group?.style_overrides?.stroke_color, '#2e7d32');
check('group stroke_width', group?.style_overrides?.stroke_width, 2);
check('group stroke_dashed', group?.style_overrides?.stroke_dashed, true);
check('group rounded=false (non-default)', group?.style_overrides?.rounded, false);
check('group corner_radius=0 (non-default)', group?.style_overrides?.corner_radius, 0);
check('group font_color', group?.style_overrides?.font_color, '#1b5e20');
check('group font_size', group?.style_overrides?.font_size, 13);
check('group font_bold=false (non-default for groups)', group?.style_overrides?.font_bold, false);
check('group font_italic', group?.style_overrides?.font_italic, true);
check('group font_underline', group?.style_overrides?.font_underline, true);
check('group opacity', group?.style_overrides?.opacity, 85);
check('group text_align=center (non-default)', group?.style_overrides?.text_align, 'center');
check('group text_vertical_align=middle (non-default)', group?.style_overrides?.text_vertical_align, 'middle');
check('group shadow', group?.style_overrides?.shadow, true);

// ─────────────────────────────────────────────────────────────────────────────
// Step 1c: Copy and edit with style_overrides
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== Step 1c: copy and edit with style_overrides ===\n');

fs.copyFileSync(CREATE_PATH, EDIT_PATH);

await handleEditDrawioSvg({
  file_path: EDIT_PATH,
  layout_mode: 'preserve',
  update_nodes: [
    {
      // Use the slug ID that the parser assigned
      id: 'xyzrectlabel99',
      style_overrides: {
        fill_color: '#e3f2fd',
        font_size: 16,
        shadow: false,
      },
    },
    {
      id: 'github',
      style_overrides: {
        stroke_color: '#1565c0',
        // opacity 100 = default, should be omitted from read output
        opacity: 100,
      },
    },
  ],
  add_nodes: [
    {
      id: 'new_node',
      label: 'NewNodeXyz99',
      style_overrides: {
        fill_color: '#f3e5f5',
        // Use non-palette color to avoid highlight detection
        stroke_color: '#4a148c',
        font_bold: true,
      },
    },
  ],
  add_edges: [
    {
      source: 'new_node',
      target: 'xyzrectlabel99',
      style_overrides: {
        // Use non-palette color
        stroke_color: '#4a148c',
        stroke_width: 2,
      },
    },
  ],
  update_edges: [
    {
      // The original edge between rect_node and icon_node
      source: 'xyzrectlabel99',
      target: 'github',
      label: 'updated edge label',
      style_overrides: {
        stroke_color: '#880e4f',
        stroke_width: 3,
      },
    },
  ],
  update_groups: [
    {
      id: 'styled_group',
      // Don't change the label to keep the slug ID stable across parse rounds
      style_overrides: {
        font_color: '#0d47a1',
        stroke_dashed: false,
      },
    },
  ],
});
console.log(`  Edited: ${EDIT_PATH}`);

// ─────────────────────────────────────────────────────────────────────────────
// Step 1d: Read edited file and verify
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== Step 1d: read edited file and verify ===\n');

const editReadRaw = await handleReadDrawioSvg({ file_path: EDIT_PATH });
const editResult = JSON.parse(editReadRaw);

const eRectNode = editResult.nodes.find(n => n.label === 'XyzRectLabel99');
const eIconNode = editResult.nodes.find(n => n.label === 'GitHub');
const eNewNode = editResult.nodes.find(n => n.label === 'NewNodeXyz99');
const eRectId = eRectNode?.id;
const eIconId = eIconNode?.id;
const eNewEdge = editResult.edges.find(e => e.target === eRectId && e.source === eNewNode?.id);
const eUpdatedEdge = editResult.edges.find(e => e.source === eRectId && e.target === eIconId);
const eGroup = editResult.groups.find(g => g.id === 'styled_group');

console.log('  -- rect_node: updated fields --');
check('rect fill_color updated to #e3f2fd', eRectNode?.style_overrides?.fill_color, '#e3f2fd');
check('rect font_size updated to 16', eRectNode?.style_overrides?.font_size, 16);
// shadow=false is default, so it should be omitted
check('rect shadow=false (default, omitted)', eRectNode?.style_overrides?.shadow, undefined);

// update_nodes.style_overrides MERGES with existing style_overrides.
// Fields not specified in the update are preserved from the original.
console.log('  -- rect_node: original fields preserved (update_nodes merges style_overrides) --');
check('rect stroke_color preserved from original', eRectNode?.style_overrides?.stroke_color, '#ab6523');
check('rect stroke_width preserved from original', eRectNode?.style_overrides?.stroke_width, 3);
check('rect font_bold preserved from original', eRectNode?.style_overrides?.font_bold, true);
check('rect rounded=false preserved from original', eRectNode?.style_overrides?.rounded, false);

console.log('  -- icon_node: updated fields --');
// #1565c0 is not a highlight color, so it should appear in style_overrides (not as highlight)
check('icon stroke_color updated to #1565c0', eIconNode?.style_overrides?.stroke_color, '#1565c0');
// opacity=100 is default, should be omitted
check('icon opacity=100 (default, omitted)', eIconNode?.style_overrides?.opacity, undefined);

console.log('  -- new_node: added with style_overrides --');
checkExists('new_node exists', eNewNode);
check('new_node fill_color', eNewNode?.style_overrides?.fill_color, '#f3e5f5');
check('new_node stroke_color', eNewNode?.style_overrides?.stroke_color, '#4a148c');
check('new_node font_bold', eNewNode?.style_overrides?.font_bold, true);

console.log('  -- new edge: added with style_overrides --');
checkExists('new edge exists', eNewEdge);
check('new edge stroke_color', eNewEdge?.style_overrides?.stroke_color, '#4a148c');
check('new edge stroke_width', eNewEdge?.style_overrides?.stroke_width, 2);

console.log('  -- updated edge: label + style_overrides merged via update_edges --');
checkExists('updated edge exists', eUpdatedEdge);
check('updated edge label changed', eUpdatedEdge?.label, 'updated edge label');
check('updated edge stroke_color updated', eUpdatedEdge?.style_overrides?.stroke_color, '#880e4f');
check('updated edge stroke_width updated', eUpdatedEdge?.style_overrides?.stroke_width, 3);
// Original edge had stroke_dashed:true, font_color, font_size etc. — MERGE: these should be preserved
check('updated edge stroke_dashed preserved from original', eUpdatedEdge?.style_overrides?.stroke_dashed, true);
check('updated edge font_color preserved from original', eUpdatedEdge?.style_overrides?.font_color, '#b71c1c');

console.log('  -- group: updated style_overrides (label unchanged, font_color merged) --');
// update_groups MERGES style_overrides — only font_color changes, all other properties preserved
check('group font_color updated', eGroup?.style_overrides?.font_color, '#0d47a1');
// stroke_dashed=false overrides original true; false is default so it should be omitted
check('group stroke_dashed=false (default, omitted after merge)', eGroup?.style_overrides?.stroke_dashed, undefined);
// All other properties should be preserved from the original
check('group fill_color preserved from original', eGroup?.style_overrides?.fill_color, '#e8f5e9');
check('group rounded=false preserved from original', eGroup?.style_overrides?.rounded, false);
check('group corner_radius=0 preserved from original', eGroup?.style_overrides?.corner_radius, 0);
check('group font_italic preserved from original', eGroup?.style_overrides?.font_italic, true);
check('group stroke_color preserved from original', eGroup?.style_overrides?.stroke_color, '#2e7d32');

// ─────────────────────────────────────────────────────────────────────────────
// Step 1e: Read アーキテクチャ図.drawio.svg (Format B)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== Step 1e: read アーキテクチャ図.drawio.svg (Format B) ===\n');

const archReadRaw = await handleReadDrawioSvg({ file_path: ARCH_PATH });
const archResult = JSON.parse(archReadRaw);

const nodesWithStyle = archResult.nodes.filter(n => n.style_overrides && Object.keys(n.style_overrides).length > 0);
const edgesWithStyle = archResult.edges.filter(e => e.style_overrides && Object.keys(e.style_overrides).length > 0);
const groupsWithStyle = archResult.groups.filter(g => g.style_overrides && Object.keys(g.style_overrides).length > 0);

console.log(`  Total nodes: ${archResult.nodes.length}, with style_overrides: ${nodesWithStyle.length}`);
console.log(`  Total edges: ${archResult.edges.length}, with style_overrides: ${edgesWithStyle.length}`);
console.log(`  Total groups: ${archResult.groups.length}, with style_overrides: ${groupsWithStyle.length}`);

if (nodesWithStyle.length > 0) {
  console.log(`  ✅ PASS: at least one node has style_overrides`);
  passed++;
  console.log(`    Sample: ${nodesWithStyle[0].label} → ${JSON.stringify(nodesWithStyle[0].style_overrides)}`);
} else {
  console.log(`  ⚠️  INFO: no nodes have non-default style_overrides (all styles match defaults)`);
}

if (edgesWithStyle.length > 0) {
  console.log(`  ✅ PASS: at least one edge has style_overrides`);
  passed++;
  console.log(`    Sample: ${edgesWithStyle[0].source}→${edgesWithStyle[0].target} → ${JSON.stringify(edgesWithStyle[0].style_overrides)}`);
} else {
  console.log(`  ⚠️  INFO: no edges have non-default style_overrides`);
}

if (groupsWithStyle.length > 0) {
  console.log(`  ✅ PASS: at least one group has style_overrides`);
  passed++;
  console.log(`    Sample: ${groupsWithStyle[0].label} → ${JSON.stringify(groupsWithStyle[0].style_overrides)}`);
} else {
  console.log(`  ⚠️  INFO: no groups have non-default style_overrides`);
}

console.log('\n  Full アーキテクチャ図 read result (truncated to first 3 of each):');
const archSummary = {
  nodes: archResult.nodes.slice(0, 3).map(n => ({ id: n.id, label: n.label, style_overrides: n.style_overrides })),
  edges: archResult.edges.slice(0, 3).map(e => ({ source: e.source, target: e.target, style_overrides: e.style_overrides })),
  groups: archResult.groups.slice(0, 3).map(g => ({ id: g.id, label: g.label, style_overrides: g.style_overrides })),
};
console.log(JSON.stringify(archSummary, null, 2));

// ─────────────────────────────────────────────────────────────────────────────
// Step 1f: Uncompressed Format B edit test
// draw.io sometimes saves <diagram> with raw XML instead of base64+deflate.
// This step creates a synthetic uncompressed Format B file and verifies that
// edit_drawio_svg can handle it without "invalid distance too far back" error.
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== Step 1f: uncompressed Format B edit ===\n');

const UNCOMPRESSED_B_PATH = '/tmp/test-uncompressed-formatb.drawio.svg';

// Build a minimal Format B SVG with uncompressed XML inside <diagram>
{
  // Use the existing CREATE_PATH file as the base; extract its mxGraphModel XML
  const srcSvg = fs.readFileSync(CREATE_PATH, 'utf-8');

  // Extract the content attribute (Format A: raw mxGraphModel)
  const contentMatch = srcSvg.match(/\bcontent="([\s\S]*?)(?="(?:\s|\/?>|\s+data-))/);
  if (!contentMatch) throw new Error('Could not extract content from Format A file');

  const htmlDecode = s => s
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&#10;/g, '\n').replace(/&#13;/g, '\r');
  const htmlEncode = s => s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/\n/g, '&#10;').replace(/\r/g, '&#13;');

  const mxXml = htmlDecode(contentMatch[1]);
  // Wrap in mxfile + diagram with raw (uncompressed) XML — no base64, no deflate
  const mxfileContent = `<mxfile host="Electron" agent="draw.io" version="24.0.0"><diagram id="test" name="Page-1">${mxXml}</diagram></mxfile>`;
  const encodedContent = htmlEncode(mxfileContent);

  // Replace the content attribute in the SVG
  const newSvg = srcSvg.replace(/\bcontent="[\s\S]*?"(?=(?:\s|\/?>|\s+data-))/, `content="${encodedContent}"`);
  fs.writeFileSync(UNCOMPRESSED_B_PATH, newSvg, 'utf-8');
  console.log(`  Created uncompressed Format B file: ${UNCOMPRESSED_B_PATH}`);
}

// Edit the uncompressed Format B file — update a node label
let uncompressedEditError = null;
try {
  await handleEditDrawioSvg({
    file_path: UNCOMPRESSED_B_PATH,
    layout_mode: 'preserve',
    update_nodes: [
      { id: 'xyzrectlabel99', label: 'UpdatedLabel99' },
    ],
  });
  console.log('  Edit completed without error');
} catch (e) {
  uncompressedEditError = e;
  console.log(`  Edit threw error: ${e.message}`);
}

if (uncompressedEditError) {
  console.log('  ❌ FAIL: edit_drawio_svg on uncompressed Format B threw an error');
  failed++;
} else {
  console.log('  ✅ PASS: edit_drawio_svg on uncompressed Format B succeeded');
  passed++;
}

// Read back and verify the label was updated
const ubReadRaw = await handleReadDrawioSvg({ file_path: UNCOMPRESSED_B_PATH });
const ubResult = JSON.parse(ubReadRaw);
const ubUpdatedNode = ubResult.nodes.find(n => n.label === 'UpdatedLabel99');
check('uncompressed Format B: label updated after edit', !!ubUpdatedNode, true);

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('All checks passed! ✅');
} else {
  console.log('Some checks failed. ❌');
  process.exit(1);
}
