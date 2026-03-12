/**
 * Deterministic color derivation from a branch name.
 * Uses a fast string hash to map the name to a stable HSL hue.
 */

function hue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (Math.imul(31, h) + name.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 360;
}

/** Bright foreground color for text / SVG strokes. */
export function branchColor(name: string): string {
  return `hsl(${hue(name)}, 65%, 60%)`;
}

/** Muted variant for edge strokes. */
export function branchColorDim(name: string): string {
  return `hsl(${hue(name)}, 45%, 38%)`;
}

/** Subtle background tint for pills / node borders. */
export function branchColorBg(name: string): string {
  return `hsl(${hue(name)}, 40%, 14%)`;
}

/** Faint border color for branch-tinted nodes. */
export function branchColorBorder(name: string): string {
  return `hsl(${hue(name)}, 40%, 28%)`;
}
