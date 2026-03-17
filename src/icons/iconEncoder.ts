/**
 * Encode a raw SVG string to the two data URI formats used in .drawio.svg files.
 *
 * Background (discovered by reading draw.io's app.min.js):
 *   - draw.io style attributes are split on ";", so "data:image/svg+xml;base64,..."
 *     gets incorrectly split at the semicolon.
 *   - draw.io's own built-in stencils use "data:image/svg+xml,<base64>" (no ";base64").
 *   - Standard SVG <image> elements require the RFC-compliant form with ";base64".
 */
export function encodeIcon(svgContent: string): {
  drawioDataUri: string; // for draw.io mxCell style attribute
  svgDataUri: string;    // for SVG <image href="...">
} {
  const base64 = Buffer.from(svgContent).toString('base64');
  return {
    drawioDataUri: `data:image/svg+xml,${base64}`,
    svgDataUri: `data:image/svg+xml;base64,${base64}`,
  };
}
