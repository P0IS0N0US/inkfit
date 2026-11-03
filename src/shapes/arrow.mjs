import { along, beside, centreOf, distance, mean, offset, principalDirection } from '../geometry.mjs';

/** @typedef {import('../geometry.mjs').Point} Point */

/** How much of an arrow's length, from the tip, the head can take up. */
const HEAD_REACH = 0.4;

/** How much of its length, from the tail, is sure to be shaft. */
const SHAFT_REACH = 0.55;

/** The least a barb must stand off the shaft, as a share of its length, to be one. */
const MIN_BARB = 0.04;

/** The two points furthest apart. They always lie on the hull, so that is all it needs.
 * @param {readonly Point[]} points */
function furthestPair(points) {
  let pair = [points[0], points[0]];
  let furthest = 0;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const d = distance(points[i], points[j]);
      if (d > furthest) { furthest = d; pair = [points[i], points[j]]; }
    }
  }
  return pair;
}

/** The arrow pointing away from `tail`, or null if nothing near its far end looks
 * like a head. Its head is made symmetrical, because that is what clean means here.
 * @param {Point[]} points @param {Point} tail @param {Point} far */
function arrowFrom(points, tail, far) {
  const roughLength = distance(tail, far);
  const rough = { x: (far.x - tail.x) / roughLength, y: (far.y - tail.y) / roughLength };
  const shaft = points.filter(p => along(p, tail, rough) < roughLength * SHAFT_REACH);
  if (shaft.length < 2) return null;
  const middle = centreOf(shaft);
  let direction = principalDirection(shaft);
  if (direction.x * rough.x + direction.y * rough.y < 0) direction = { x: -direction.x, y: -direction.y };

  const s = points.map(p => along(p, middle, direction));
  const [start, end] = [Math.min(...s), Math.max(...s)];
  const length = end - start;
  const head = points.filter((_, i) => s[i] > end - length * HEAD_REACH);
  if (!head.length) return null;
  // Barbs are measured from the tip, not the shaft's line: a head is often drawn a
  // little to one side of it, and read from the line one barb would nearly vanish. The
  // tip is what lies furthest on and nearest the line, as a barb can run further on.
  const reachOf = p => along(p, middle, direction) - Math.abs(beside(p, middle, direction));
  const apex = head.reduce((a, p) => (reachOf(p) > reachOf(a) ? p : a));
  const t = head.map(p => beside(p, apex, direction));
  const [left, right] = [Math.max(...t), -Math.min(...t)];
  if (Math.min(left, right) < length * MIN_BARB) return null;

  const [a, b] = [head[t.indexOf(left)], head[t.indexOf(-right)]];
  const tip = { x: apex.x, y: apex.y };
  const back = along(tip, middle, direction) - (along(a, middle, direction) + along(b, middle, direction)) / 2;
  if (back <= 0) return null;   // barbs that run ahead of the tip make a fork, not a head
  const spread = (left + right) / 2;
  const barbs = [offset(tip, direction, -back, spread), offset(tip, direction, -back, -spread)];
  const wobble = mean(shaft.map(p => Math.abs(beside(p, middle, direction)))) / length;
  return { tail: offset(middle, direction, start), tip, barbs, wobble };
}

/** An arrow: a straight shaft and a two-barbed head, in one stroke or several. */
export const arrow = {
  name: 'arrow',
  fit(drawing) {
    const [a, b] = furthestPair(drawing.hull);
    // Read backwards, the head falls where the shaft should be, so the true way
    // round is the one that leaves the straighter shaft.
    const found = [arrowFrom(drawing.points, a, b), arrowFrom(drawing.points, b, a)]
      .filter(Boolean).sort((x, y) => x.wobble - y.wobble)[0];
    if (!found) return null;
    const { tail, tip, barbs } = found;
    return { paths: [[tail, tip], [barbs[0], { ...tip }, barbs[1]]], freedom: 6, tail, tip, barbs };
  },
};
