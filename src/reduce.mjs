/* Turns raw strokes into a drawing the shapes can work on. The steps are the same
   for every input: nothing here knows or asks what drew a stroke. The drawing is
   frozen and shares nothing with the caller's strokes, so no shape can change what
   the next one sees. */

import { distance, hullOf, lengthOf, resample, sizeOf } from './geometry.mjs';

/** @typedef {import('./geometry.mjs').Point} Point */
/** `hull` is the points' convex hull: several shapes need it, and it is usually far smaller.
 * @typedef {{strokes: readonly (readonly Point[])[], points: readonly Point[], hull: readonly Point[], size: number, ink: number}} Drawing */

/** The gap between resampled points, as a share of the drawing's size. */
const SPACING = 1 / 50;

/** The most points a drawing's path keeps, each stroke's ends aside. A long scribble
 * gets a wider gap instead: every later step costs more with each point, and a stroke
 * can have any length. */
const MAX_POINTS = 1024;

/** How far a point must move from the last one kept, as a share of the spacing. */
const STILL = 0.5;

/** How far a hook can reach from a stroke's end, as a share of the drawing's size. It
 * is measured on the drawing, not the stroke: a longer stroke has no longer hooks, and
 * a controller's reached about 3.5% of a drawing's size. At the usual spacing this is
 * 2.75 points: away from a rounding edge, where a drawing's scale would decide. */
const HOOK_REACH = 0.055;

/** The sharpest turn, in radians, that still counts as the stroke going on. */
const HOOK_TURN = Math.PI / 4;

/** How many points before a turn set the direction it turns from. */
const HOOK_RUN = 4;

/** A stroke with only the points that moved on from the last one kept, and its end.
 * Repeats go, and so does a rest: shaking on the spot builds up path but goes nowhere.
 * The points are copies holding only `x` and `y`.
 * @param {Point[]} stroke @param {number} step */
function dropStill(stroke, step) {
  const kept = [stroke[0]];
  for (const p of stroke) if (distance(p, kept.at(-1)) >= step) kept.push(p);
  const end = stroke.at(-1);
  if (distance(end, kept.at(-1)) > 0) kept.push(end);
  return kept.map(({ x, y }) => ({ x, y }));
}

/** The angle between two directions, each given by a pair of points.
 * @param {Point} a @param {Point} b @param {Point} c @param {Point} d */
function turnBetween(a, b, c, d) {
  const ux = b.x - a.x, uy = b.y - a.y, vx = d.x - c.x, vy = d.y - c.y;
  return Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy));
}

/** How many points to cut from a stroke's end: a press or a release can drag the
 * pointer aside, and leaves a short tail going the wrong way. It looks past `reach`
 * for the sharpest turn, because a real corner just beyond it also bends the
 * directions inside it, and only a turn that truly lies within `reach` is a hook.
 * @param {Point[]} points @param {number} reach In points. */
function hookAtEnd(points, reach) {
  const last = points.length - 1;
  let sharpest = HOOK_TURN;
  let at = last;
  for (let i = last - 1; i >= Math.max(HOOK_RUN, last - reach * 2); i -= 1) {
    const turn = turnBetween(points[i - HOOK_RUN], points[i], points[i], points[Math.min(last, i + HOOK_RUN)]);
    if (turn > sharpest) {
      sharpest = turn;
      at = i;
    }
  }
  return last - at <= reach ? last - at : 0;
}

/** A stroke without the hooks at its ends. @param {Point[]} points @param {number} reach In points. */
function trimHooks(points, reach) {
  if (points.length <= reach * 2 + HOOK_RUN) return points;
  const atEnd = hookAtEnd(points, reach);
  const atStart = hookAtEnd([...points].reverse(), reach);
  return points.slice(atStart, points.length - atEnd);
}

/** @param {Point[]} points */
const frozen = points => Object.freeze(points.map(Object.freeze));

/** A drawing from raw strokes, or null if they hold no extent to work with.
 * @param {Point[][]} strokes @returns {Drawing | null} */
export function reduce(strokes) {
  const given = strokes.filter(s => s.length > 0);
  if (!given.length) return null;
  const size = sizeOf(given.flat());
  if (size === 0) return null;
  const moving = given.map(s => dropStill(s, size * SPACING * STILL));
  const pathLength = moving.reduce((sum, s) => sum + lengthOf(s), 0);
  const spacing = Math.max(size * SPACING, pathLength / MAX_POINTS);
  const reach = Math.round(size * HOOK_REACH / spacing);
  const reduced = moving.map(s => frozen(trimHooks(resample(s, spacing), reach)));
  const points = Object.freeze(reduced.flat());
  const ink = reduced.reduce((sum, s) => sum + lengthOf(s), 0);
  const hull = Object.freeze(hullOf(points));
  if (hull.length < 2) return null;   // a bad point makes the size NaN, and every stroke collapses
  return Object.freeze({ strokes: Object.freeze(reduced), points, hull, size: sizeOf(points), ink });
}
