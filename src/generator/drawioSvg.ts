import fs from 'fs';
import path from 'path';
import type { LayoutOptions } from '../layout/elkLayout.js';

/**
 * Assemble and write the final .drawio.svg file.
 *
 * Format: An SVG file that contains both:
 *  1. Visual SVG content (for markdown/browser rendering)
 *  2. A "content" attribute on the root <svg> element containing
 *     HTML-entity-encoded mxGraphModel XML (for draw.io editor)
 *  3. A "data-layout" attribute storing the layout options as JSON
 *     (used by read_drawio_svg to preserve layout on re-generation)
 *
 * When draw.io opens the file, it reads l.getAttribute("content"),
 * checks if it starts with "<", and uses it directly as mxGraphModel XML.
 */
export function assembleAndWrite(
  mxGraphModelXml: string,
  svgVisual: string,
  outputPath: string,
  layoutOptions?: LayoutOptions,
): void {
  // Extract the inner content of the SVG visual (everything between <svg...> and </svg>)
  const svgInnerMatch = svgVisual.match(/^<svg[^>]*>([\s\S]*)<\/svg>$/);
  const svgAttrsMatch = svgVisual.match(/^<svg([^>]*)>/);

  if (!svgInnerMatch || !svgAttrsMatch) {
    throw new Error('Invalid SVG visual format');
  }

  const svgAttrs = svgAttrsMatch[1];
  const svgInner = svgInnerMatch[1];

  // HTML-entity encode the mxGraphModel XML for the content attribute
  const contentEncoded = mxGraphModelXml
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  // Embed layout options as data-layout attribute for round-trip fidelity
  const layoutAttr = layoutOptions
    ? ` data-layout='${JSON.stringify(layoutOptions)}'`
    : '';

  const drawioSvg =
    `<svg${svgAttrs} content="${contentEncoded}"${layoutAttr}>` +
    svgInner +
    `</svg>`;

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, drawioSvg, 'utf-8');
}
