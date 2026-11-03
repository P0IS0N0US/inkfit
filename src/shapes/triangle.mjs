import { distance } from '../geometry.mjs';

/** @typedef {import('../geometry.mjs').Point} Point */

/** The most hull points tried as corners. Every triple is tried, so this bounds the cost. */
const MAX_CORNERS_TRIED = 48;

/** The narrowest a triangle may be: its height as a share of its longest side. As with
 * a rectangle, any stroke has a thin one around it. */
const MIN_ASPECT = 0.12;

/** @param {Point} a @param {Point} b @param {Point} c */
const areaOf = (a, b, c) => Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;

/** The largest triangle with corners on a convex hull. @param {readonly Point[]} hull */
function largestWithin(hull) {
  const step = Math.max(1, hull.length / MAX_CORNERS_TRIED);
  const tried = Array.from({ length: Math.min(hull.length, MAX_CORNERS_TRIED) }, (_, i) => hull[Math.floor(i * step)]);
  let best = null;
  let largest = 0;
  for (let i = 0; i < tried.length; i += 1) {
    for (let j = i + 1; j < tried.length; j += 1) {
      for (let k = j + 1; k < tried.length; k += 1) {
        const area = areaOf(tried[i], tried[j], tried[k]);
        if (area > largest) { largest = area; best = [tried[i], tried[j], tried[k]]; }
      }
    }
  }
  return best;
}

/** A triangle, of any proportions, with its corners on a drawing's points. */
export const triangle = {
  name: 'triangle',
  fit(drawing) {
    const within = largestWithin(drawing.hull);
    if (!within) return null;
    const corners = within.map(({ x, y }) => ({ x, y }));
    const longest = Math.max(...corners.map((c, i) => distance(c, corners[(i + 1) % 3])));
    if ((2 * areaOf(...corners)) / longest < longest * MIN_ASPECT) return null;
    return { paths: [[...corners, { ...corners[0] }]], freedom: 6, corners };
  },
};
