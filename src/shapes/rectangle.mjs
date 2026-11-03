import { along, beside, distance, offset } from '../geometry.mjs';

/** @typedef {import('../geometry.mjs').Point} Point */

/** The narrowest a rectangle may be, as a share of its length. Any stroke has a thin
 * box around it: recorded lines stay under 0.07, and recorded rectangles well over. */
const MIN_ASPECT = 0.12;

/** The share of a drawing's points, at each end, left outside its box. */
const EDGE_TRIM = 0.03;

/** The smallest rectangle around a convex hull: it always shares a side with it.
 * @param {readonly Point[]} hull */
export function smallestAround(hull) {
  let best = null;
  hull.forEach((a, i) => {
    const b = hull[(i + 1) % hull.length];
    const length = distance(a, b);
    if (length === 0) return;
    const direction = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
    let s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity;
    for (const p of hull) {
      const s = along(p, a, direction), t = beside(p, a, direction);
      if (s < s0) s0 = s;
      if (s > s1) s1 = s;
      if (t < t0) t0 = t;
      if (t > t1) t1 = t;
      if (best && (s1 - s0) * (t1 - t0) >= best.area) return;   // already no smaller: a round hull has many edges
    }
    const area = (s1 - s0) * (t1 - t0);
    if (!best || area < best.area) best = { area, a, direction, s0, s1, t0, t1 };
  });
  return best;
}

/** A drawing's box, at the smallest box's angle, with its sides set by nearly all its
 * points. The very furthest are overshoots: a hand runs past a corner, and one such point
 * would push a whole side out. @param {import('../reduce.mjs').Drawing} drawing */
export function boxOf(drawing) {
  const found = smallestAround(drawing.hull);
  if (!found) return null;
  const { a, direction } = found;
  const { points } = drawing;
  const trim = Math.floor(points.length * EDGE_TRIM);
  const edges = values => { values.sort(); return [values[trim], values[values.length - 1 - trim]]; };
  const [s0, s1] = edges(Float64Array.from(points, p => along(p, a, direction)));
  const [t0, t1] = edges(Float64Array.from(points, p => beside(p, a, direction)));
  return { a, direction, s0, s1, t0, t1 };
}

/** A rectangle around nearly all a drawing's points, at any angle. */
export const rectangle = {
  name: 'rectangle',
  fit(drawing) {
    const found = boxOf(drawing);
    if (!found) return null;
    const { a, direction, s0, s1, t0, t1 } = found;
    if (Math.min(s1 - s0, t1 - t0) < Math.max(s1 - s0, t1 - t0) * MIN_ASPECT) return null;
    const corners = [[s0, t0], [s1, t0], [s1, t1], [s0, t1]].map(([s, t]) => offset(a, direction, s, t));
    return {
      paths: [[...corners, { ...corners[0] }]],
      freedom: 5,
      corners,
      width: s1 - s0,
      height: t1 - t0,
      rotation: Math.atan2(direction.y, direction.x),
    };
  },
};
