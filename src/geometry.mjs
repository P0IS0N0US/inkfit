/* Plain geometry on `{x, y}` points, shared by reduction, scoring and the shapes. */

/** @typedef {{x: number, y: number}} Point */

/** @param {Point} a @param {Point} b */
export function distance(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** @param {Point} a @param {Point} b @param {number} u How far along, from 0 at `a` to 1 at `b`. */
export const between = (a, b, u) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });

/** @param {Point[]} points */
export const lengthOf = points => points.reduce((sum, p, i) => sum + (i ? distance(p, points[i - 1]) : 0), 0);

/** @param {number[]} values */
export const mean = values => values.reduce((sum, v) => sum + v, 0) / values.length;

/** @param {Point[]} points */
export function centreOf(points) {
  return { x: mean(points.map(p => p.x)), y: mean(points.map(p => p.y)) };
}

/** The diagonal of a set of points' bounding box. Thresholds are shares of this,
 * so a drawing means the same at any scale. @param {Point[]} points */
export function sizeOf(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { x, y } of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return Math.hypot(maxX - minX, maxY - minY);
}

/** A point's distance from a segment. @param {Point} p @param {Point} a @param {Point} b */
export function distanceToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const squared = dx * dx + dy * dy;
  const px = p.x - a.x, py = p.y - a.y;
  const u = squared === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / squared));
  const ex = px - dx * u, ey = py - dy * u;
  return Math.sqrt(ex * ex + ey * ey);
}

/** The convex hull of a set of points, by Andrew's monotone chain. @param {readonly Point[]} points */
export function hullOf(points) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = list => {
    const out = [];
    for (const p of list) {
      while (out.length > 1 && cross(out.at(-2), out.at(-1), p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

/** A gap, as a share of the spacing, too small to be anything but rounding. */
const ROUNDING_GAP = 1e-9;

/** Points evenly spaced along a path, both ends included. A path whose length is a
 * whole number of gaps lands on its end, or a rounding error short of it. Either way
 * it ends once, so the last digit of a distance can't change how many points there are.
 * @param {Point[]} path @param {number} spacing @returns {Point[]} */
export function resample(path, spacing) {
  if (path.length < 2 || spacing <= 0) return [...path];
  const out = [path[0]];
  let due = spacing;
  for (let i = 1; i < path.length; i += 1) {
    let from = path[i - 1];
    let left = distance(from, path[i]);
    while (left >= due) {
      from = between(from, path[i], due / left);
      out.push(from);
      left -= due;
      due = spacing;
    }
    due -= left;
  }
  const end = path.at(-1);
  if (distance(out.at(-1), end) > spacing * ROUNDING_GAP) out.push(end);
  else out[out.length - 1] = end;
  return out;
}

/** The direction that best follows a set of points, as a unit vector.
 * @param {Point[]} points @returns {Point} */
export function principalDirection(points) {
  const c = centreOf(points);
  let xx = 0, xy = 0, yy = 0;
  for (const { x, y } of points) {
    xx += (x - c.x) ** 2;
    xy += (x - c.x) * (y - c.y);
    yy += (y - c.y) ** 2;
  }
  const angle = Math.atan2(2 * xy, xx - yy) / 2;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

/** @param {Point} p @param {Point} origin @param {Point} direction A unit vector.
 * @returns {number} How far along `direction` a point lies from `origin`. */
export const along = (p, origin, direction) => (p.x - origin.x) * direction.x + (p.y - origin.y) * direction.y;

/** @param {Point} p @param {Point} origin @param {Point} direction A unit vector.
 * @returns {number} How far to the side of `direction` a point lies, signed. */
export const beside = (p, origin, direction) => (p.y - origin.y) * direction.x - (p.x - origin.x) * direction.y;

/** The point `s` along and `t` beside a line. @param {Point} origin @param {Point} direction
 * @param {number} s @param {number} [t] @returns {Point} */
export const offset = (origin, direction, s, t = 0) => ({
  x: origin.x + direction.x * s - direction.y * t,
  y: origin.y + direction.y * s + direction.x * t,
});
