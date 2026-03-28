/**
 * Format B encoding / decoding for .drawio.svg files.
 *
 * Format B stores mxGraphModel XML inside an <mxfile><diagram>…</diagram></mxfile>
 * wrapper which is then HTML-encoded into a `content` attribute on the root <svg>.
 *
 * The diagram body is typically compressed: URL-encode → deflate-raw → base64.
 * Some draw.io versions embed uncompressed XML directly.
 */

import zlib from 'zlib';
import { htmlDecode, htmlEncode } from '../utils/xmlEncoding.js';

/** Parts of a Format B .drawio.svg content attribute after decoding. */
export interface FormatBParts {
  /** Decoded mxGraphModel XML (ready to parse / modify). */
  mxXml: string;
  /** The decoded mxfile string, up to and including the opening <diagram ...> tag. */
  preDiagram: string;
  /** The decoded mxfile string from </diagram> to the end. */
  postDiagram: string;
}

/**
 * Decode a Format B .drawio.svg's content attribute.
 * Handles both compressed (base64+deflate) and uncompressed variants.
 */
export function extractFormatBMxXml(rawSvgContent: string): FormatBParts {
  const contentMatch = rawSvgContent.match(/\bcontent="([\s\S]*?)(?="(?:\s|\/?>|\s+data-))/);
  if (!contentMatch) throw new Error('No content attribute found in SVG');

  const decoded = htmlDecode(contentMatch[1]);
  if (!decoded.startsWith('<mxfile')) throw new Error('Not a Format B drawio file');

  const diagramRe = /(<diagram[^>]*>)([\s\S]*?)(<\/diagram>)/;
  const dm = decoded.match(diagramRe);
  if (!dm) throw new Error('No <diagram> element found in mxfile content');

  const base64Data = dm[2].trim();
  // Some draw.io versions embed the XML directly (uncompressed) inside <diagram>
  const mxXml = base64Data.startsWith('<mxGraphModel')
    ? base64Data
    : decodeURIComponent(zlib.inflateRawSync(Buffer.from(base64Data, 'base64')).toString('utf-8'));

  const diagTagEnd = decoded.indexOf(dm[1]) + dm[1].length;
  const diagContentEnd = diagTagEnd + dm[2].length;

  return {
    mxXml,
    preDiagram: decoded.substring(0, diagTagEnd),
    postDiagram: decoded.substring(diagContentEnd),
  };
}

/**
 * Re-encode edited mxGraphModel XML back into Format B content attribute value.
 * Always encodes as compressed (URL-encode → deflate-raw → base64).
 */
export function encodeFormatBContent(mxXml: string, parts: FormatBParts): string {
  const urlEncoded = encodeURIComponent(mxXml);
  const compressed = zlib.deflateRawSync(Buffer.from(urlEncoded, 'utf-8'));
  const base64Data = compressed.toString('base64');
  const newDecoded = parts.preDiagram + base64Data + parts.postDiagram;
  return htmlEncode(newDecoded);
}
