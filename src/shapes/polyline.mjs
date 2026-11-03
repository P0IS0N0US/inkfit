import { distance, distanceToSegment, sizeOf } from '../geometry.mjs';

/** @typedef {import('../geometry.mjs').Point} Point */

/** How far a stroke may stray from a straight piece before it gets a corner, as a share
 * of the drawing's size. */
const TOLERANCE = 0.03;

/** The gentlest turn, in radians, that is a corner. Straight pieces can follow any curve
 * closely, turning a little at each join. */
const MIN_TURN = Math.PI / 3;

/** How close a stroke's ends may come, as a share of its size, and it still be open.
 * Recorded closed shapes reached 0.30, and recorded open ones started at 0.65. */
const MIN_OPEN_GAP = 0.45;

/** The most vertices a polyline may have. Recorded zigzags had 4 to 7, and a scribble going
 * back and forth without crossing itself mostly had 8 to 10, so past this it is a scribble.
 * A caller's long zigzag falls here too. */
const MAX_VERTICES = 7;

/** The points that keep a stroke's shape, by Ramer-Douglas-Peucker.
 * @param {readonly Point[]} points @param {number} tolerance @returns {Point[]} */
function simplified(points, tolerance) {
  const keep = new Set([0, points.length - 1]);
  const pending = [[0, points.length - 1]];
  while (pending.length) {
    const [from, to] = pending.pop();
    let furthest = tolerance, at = -1;
    for (let i = from + 1; i < to; i += 1) {
      const d = distanceToSegment(points[i], points[from], points[to]);
      if (d > furthest) { furthest = d; at = i; }
    }
    if (at >= 0) {
      keep.add(at);
      pending.push([from, at], [at, to]);
    }
  }
  return [...keep].sort((a, b) => a - b).map(i => ({ ...points[i] }));
}

/** How sharply a path turns at a point. @param {Point} a @param {Point} b @param {Point} c */
function turnAt(a, b, c) {
  const ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y;
  return Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy));
}

/** A path with only its real corners, gentlest dropped first, as each drop changes the
 * turns beside it. @param {Point[]} path */
function cornersOnly(path) {
  const kept = [...path];
  for (;;) {
    let gentlest = MIN_TURN, at = -1;
    for (let i = 1; i < kept.length - 1; i += 1) {
      const turn = turnAt(kept[i - 1], kept[i], kept[i + 1]);
      if (turn < gentlest) { gentlest = turn; at = i; }
    }
    if (at < 0) return kept;
    kept.splice(at, 1);
  }
}

/** Whether two segments cross. @param {Point} a @param {Point} b @param {Point} c @param {Point} d */
function segmentsCross(a, b, c, d) {
  const side = (o, p, q) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

/** @param {readonly Point[]} path */
function crossesItself(path) {
  for (let i = 1; i < path.length; i += 1) {
    for (let j = i + 2; j < path.length; j += 1) {
      if (segmentsCross(path[i - 1], path[i], path[j - 1], path[j])) return true;
    }
  }
  return false;
}

/** Straight pieces joined at real corners along one stroke, such as a zigzag. It stays
 * open and never crosses itself: a closed one is a polygon, and a tangle is a scribble. */
export const polyline = {
  name: 'polyline',
  fit(drawing) {
    if (drawing.strokes.length !== 1) return null;
    const [stroke] = drawing.strokes;
    if (distance(stroke[0], stroke.at(-1)) < sizeOf(stroke) * MIN_OPEN_GAP) return null;
    const vertices = cornersOnly(simplified(stroke, drawing.size * TOLERANCE));
    if (vertices.length < 3 || vertices.length > MAX_VERTICES || crossesItself(stroke)) return null;
    return { paths: [vertices], freedom: 2 * vertices.length, vertices };
  },
};
