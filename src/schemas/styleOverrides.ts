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
