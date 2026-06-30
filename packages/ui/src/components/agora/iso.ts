/** Dimetric projection: 30° style, 2:1 ratio flattened. */
export const ISO_COS = 0.866;
export const ISO_SIN = 0.4;

export function toIso(x: number, y: number): { x: number; y: number } {
  return {
    x: (x - y) * ISO_COS,
    y: (x + y) * ISO_SIN,
  };
}

/** Project a logical-space rectangle into the 4 iso polygon corners. */
export function rectIso(x: number, y: number, w: number, h: number): string {
  const tl = toIso(x, y);
  const tr = toIso(x + w, y);
  const br = toIso(x + w, y + h);
  const bl = toIso(x, y + h);
  return `${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`;
}

/** Z-sort comparator: deeper (further from camera, lower y in iso) drawn first. */
export function zKey(x: number, y: number): number {
  return x + y;
}

/** Logical world bounds (top-down). */
export const WORLD_W = 2200;
export const WORLD_H = 1500;

/** Iso viewBox covering the full polis with padding. */
export const ISO_VIEWBOX = "-1340 -60 3290 1620";

