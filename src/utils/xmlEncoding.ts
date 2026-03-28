/** Decode HTML entities commonly used in draw.io content attributes. */
export function htmlDecode(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#10;/g, '\n')
    .replace(/&#13;/g, '\r');
}

/** Encode special characters for HTML/XML attribute embedding. */
export function htmlEncode(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Alias for htmlEncode — escapes characters unsafe in XML attribute values. */
export const escapeXmlAttr = htmlEncode;

/**
 * Normalize any existing entities in a label string, then re-encode for
 * safe embedding in an XML attribute value (including newline entities).
 */
export function valueToXmlAttr(str: string): string {
  return str
    // Step 1: normalize entities → characters
    .replace(/&#10;/g, '\n')
    .replace(/&#13;/g, '\r')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    // Step 2: XML attribute encode (newlines → &#10;)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '&#10;')
    .replace(/\r/g, '&#13;');
}
