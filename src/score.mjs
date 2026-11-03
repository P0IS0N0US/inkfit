/* Scores a shape's proposal against a drawing. The score is absolute and the same
   sum for every shape, so scores compare across shapes, and binding another shape
   changes no other score.

   This is where a fit spends its time: every point against every piece of every
   proposal, both ways. So it works in squared distances over flat arrays, and takes
   a root only of the one distance it keeps. */

import { lengthOf, resample } from './geometry.mjs';

/** @typedef {import('./geometry.mjs').Point} Point */
/** @typedef {import('./reduce.mjs').Drawing} Drawing */

/** The gap between points checked along a proposal, as a share of the drawing's size. */
const SPACING = 1 / 50;

/** The most points checked along one path. A proposal can be far larger than its
 * drawing, and a caller's can hold anything. */
const MAX_SAMPLES = 512;

/** How far up its distances a proposal is judged, from 0 for the closest point to 1
 * for the worst. Nearly all of a shape must lie close: an average lets a circle pass
 * as a rectangle, because the four corners it misses are few among all its points.
 * Just short of the worst, so one stray point can't decide. */
const JUDGED_AT = 0.95;

/** The error, as a share of the drawing's size, that a hand can't get under. Being
 * closer than this earns nothing: all a freer shape can gain there is the wobble. */
export const NOISE_FLOOR = 0.05;

/** The error past the floor at which a fit has fallen to about 37%. */
export const ERROR_SCALE = 0.06;

/** How far a drawing's ink can be from its proposal's length and cost nothing, as a
 * log of their ratio. Distance can't see ink: a scribble fills a shape's area, and
 * lies near its outline, while using far more line than the outline has. Recorded
 * shapes kept their ratio within 0.89 to 1.14, and scribbles went to 2.15. */
export const INK_SLACK = 0.2;

/** The ink mismatch past the slack at which a fit has fallen to about 37%. */
export const INK_SCALE = 0.2;

/** What each unit of freedom keeps of a score. A curve can follow anything, so
 * freedom has to cost something or it would beat every other shape. */
export const KEPT_PER_FREEDOM = 0.985;

/** A list of points as flat coordinates. @param {readonly Point[]} points */
function flatPoints(points) {
  const xs = new Float64Array(points.length), ys = new Float64Array(points.length);
  points.forEach((p, i) => { xs[i] = p.x; ys[i] = p.y; });
  return { xs, ys };
}

/** Every piece of a proposal's paths as flat coordinates: a start, a step to its end, and
 * that step's squared length. A one-point path is a piece that goes nowhere.
 * @param {Point[][]} paths */
function flatPieces(paths) {
  const count = paths.reduce((sum, path) => sum + Math.max(1, path.length - 1), 0);
  const [ax, ay, dx, dy, squared] = [0, 1, 2, 3, 4].map(() => new Float64Array(count));
  let at = 0;
  for (const path of paths) {
    for (let i = 0; i < Math.max(1, path.length - 1); i += 1) {
      const a = path[i], b = path[i + 1] ?? a;
      ax[at] = a.x;
      ay[at] = a.y;
      dx[at] = b.x - a.x;
      dy[at] = b.y - a.y;
      squared[at] = dx[at] * dx[at] + dy[at] * dy[at];
      at += 1;
    }
  }
  return { ax, ay, dx, dy, squared, count };
}

/** The squared distance from a point to the nearest piece. */
function squaredToPieces(x, y, { ax, ay, dx, dy, squared, count }) {
  let nearest = Infinity;
  for (let i = 0; i < count; i += 1) {
    const px = x - ax[i], py = y - ay[i];
    let u = squared[i] === 0 ? 0 : (px * dx[i] + py * dy[i]) / squared[i];
    if (u < 0) u = 0; else if (u > 1) u = 1;
    const ex = px - dx[i] * u, ey = py - dy[i] * u;
    const d = ex * ex + ey * ey;
    if (d < nearest) nearest = d;
  }
  return nearest;
}

/** The squared distance from a point to the nearest of a flat list of points. */
function squaredToPoints(x, y, { xs, ys }) {
  let nearest = Infinity;
  for (let i = 0; i < xs.length; i += 1) {
    const ex = x - xs[i], ey = y - ys[i];
    const d = ex * ex + ey * ey;
    if (d < nearest) nearest = d;
  }
  return nearest;
}

/** The distance `JUDGED_AT` of the way up a list of squared distances.
 * @param {Float64Array} squared */
function judged(squared) {
  squared.sort();
  return Math.sqrt(squared[Math.floor((squared.length - 1) * JUDGED_AT)]);
}

/** How far a proposal is from a drawing, as a share of its size. It measures both
 * ways: a stroke can lie along a proposal it covers only part of.
 * @param {Drawing} drawing @param {ReturnType<typeof flatPoints>} flat The drawing's points.
 * @param {Point[][]} paths */
function errorOf(drawing, flat, paths) {
  const pieces = flatPieces(paths);
  const stray = judged(flat.xs.map((x, i) => squaredToPieces(x, flat.ys[i], pieces)));
  const samples = paths.flatMap(path => resample(path, Math.max(drawing.size * SPACING, lengthOf(path) / MAX_SAMPLES)));
  const missed = judged(Float64Array.from(samples, q => squaredToPoints(q.x, q.y, flat)));
  return Math.max(stray, missed) / drawing.size;
}

/** @param {Point[][]} paths */
const totalLength = paths => paths.reduce((sum, path) => sum + lengthOf(path), 0);

/** Whether a proposal's paths can be measured at all. @param {unknown} paths */
const hasPoints = paths => Array.isArray(paths) && paths.length > 0
  && paths.every(path => Array.isArray(path) && path.length > 0 && path.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y)));

/** A scorer for one drawing, which flattens its points once for every proposal. It gives
 * a proposal's score, from 0 up to 1, or null if it can't be scored: a caller's proposal
 * can hold anything, and it mustn't push out a shape that can. It also gives null for a
 * proposal that can't reach `bar`. Ink and freedom cost next to nothing to work out and
 * cap the score, so one that fails on those alone never pays for the distances, which
 * are nearly all the work.
 * @param {Drawing} drawing @param {number} [bar]
 * @returns {(proposal: {paths: Point[][], freedom: number}) => number | null} */
export function scorerFor(drawing, bar = 0) {
  const flat = flatPoints(drawing.points);
  return proposal => {
    if (!(proposal.freedom >= 0) || !hasPoints(proposal.paths)) return null;
    const mismatch = Math.max(0, Math.abs(Math.log(drawing.ink / totalLength(proposal.paths))) - INK_SLACK);
    const most = Math.exp(-((mismatch / INK_SCALE) ** 2)) * KEPT_PER_FREEDOM ** proposal.freedom;
    if (!(most >= bar)) return null;
    const error = Math.max(0, errorOf(drawing, flat, proposal.paths) - NOISE_FLOOR);
    const score = most * Math.exp(-((error / ERROR_SCALE) ** 2));
    return Number.isFinite(score) ? score : null;
  };
}
