import fs from 'fs';
import * as simpleIcons from 'simple-icons';

type SimpleIcon = { title: string; slug: string; svg: string };

/**
 * Resolve an icon for a node.
 * - If icon_path is given: read that local SVG file.
 * - Otherwise: fuzzy-search simple-icons by label.
 * Returns the raw SVG string, or null if nothing found.
 */
export async function resolveIconSvg(
  label: string,
  iconPath?: string | null,
): Promise<string | null> {
  if (iconPath) {
    if (!fs.existsSync(iconPath)) {
      throw new Error(`Icon file not found: ${iconPath}`);
    }
    return fs.readFileSync(iconPath, 'utf-8');
  }

  return findSimpleIcon(label);
}

/**
 * Try to find an icon in simple-icons that best matches the label.
 * Strategy:
 *  1. Exact slug match (e.g. "GitHub" → "siGithub")
 *  2. Partial title match (scan all icons)
 */
function findSimpleIcon(label: string): string | null {
  const icons = simpleIcons as unknown as Record<string, SimpleIcon>;

  // Attempt 1: derive slug by removing spaces/special chars → camelCase key
  const slug = label.toLowerCase().replace(/[^a-z0-9]/g, '');
  const key = `si${slug.charAt(0).toUpperCase()}${slug.slice(1)}`;
  if (icons[key]?.svg) {
    return icons[key].svg;
  }

  // Attempt 2: scan all icons for a title match (case-insensitive substring)
  const labelLower = label.toLowerCase();
  const words = labelLower.split(/\s+/).filter(Boolean);

  let bestMatch: SimpleIcon | null = null;
  let bestScore = 0;

  for (const value of Object.values(icons)) {
    if (!value?.title || !value?.svg) continue;
    const titleLower = value.title.toLowerCase();

    // Score: how many words from label appear in the title
    const score = words.filter((w) => titleLower.includes(w)).length;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = value;
    }
  }

  if (bestMatch && bestScore > 0) {
    return bestMatch.svg;
  }

  return null;
}
