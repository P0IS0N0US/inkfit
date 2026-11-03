import { distance, lengthOf } from '../geometry.mjs';

/** @typedef {import('../geometry.mjs').Point} Point */
/** @typedef {[Point, Point, Point, Point]} Cubic */

/** How far a curve may stray from its stroke before it splits, as a share of the drawing's
 * size. It sits near the hand's own noise: much tighter and the curve follows the wobble,
 * in more pieces, when it should smooth it away. */
const TOLERANCE = 0.04;

/** How many steps along each piece stand for it in a path. */
const STEPS = 16;

const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const scale = (a, k) => ({ x: a.x * k, y: a.y * k });
const dot = (a, b) => a.x * b.x + a.y * b.y;
const unit = a => { const n = Math.hypot(a.x, a.y) || 1; return { x: a.x / n, y: a.y / n }; };

/** A point on a cubic. @param {Cubic} c @param {number} u */
function pointOn([p0, p1, p2, p3], u) {
  const v = 1 - u;
  const b = [v * v * v, 3 * v * v * u, 3 * v * u * u, u * u * u];
  return { x: b[0] * p0.x + b[1] * p1.x + b[2] * p2.x + b[3] * p3.x, y: b[0] * p0.y + b[1] * p1.y + b[2] * p2.y + b[3] * p3.y };
}

/** Each point's position along a run of points, from 0 to 1. @param {Point[]} points */
function positions(points) {
  const out = [0];
  for (let i = 1; i < points.length; i += 1) out.push(out[i - 1] + distance(points[i], points[i - 1]));
  const total = out.at(-1) || 1;
  return out.map(d => d / total);
}

/** The cubic from a run's ends, along given tangents, closest to its points (Schneider).
 * @param {Point[]} points @param {number[]} u @param {Point} startTangent @param {Point} endTangent @returns {Cubic} */
function cubicThrough(points, u, startTangent, endTangent) {
  const first = points[0], last = points.at(-1);
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
  points.forEach((p, i) => {
    const t = u[i], v = 1 - t;
    const b0 = v * v * v, b1 = 3 * v * v * t, b2 = 3 * v * t * t, b3 = t * t * t;
    const a0 = scale(startTangent, b1), a1 = scale(endTangent, b2);
    const rest = sub(p, add(scale(first, b0 + b1), scale(last, b2 + b3)));
    c00 += dot(a0, a0);
    c01 += dot(a0, a1);
    c11 += dot(a1, a1);
    x0 += dot(a0, rest);
    x1 += dot(a1, rest);
  });
  const det = c00 * c11 - c01 * c01;
  let alpha = det === 0 ? 0 : (x0 * c11 - x1 * c01) / det;
  let beta = det === 0 ? 0 : (c00 * x1 - c01 * x0) / det;
  if (!(alpha > 0 && beta > 0)) alpha = beta = distance(first, last) / 3;
  return [first, add(first, scale(startTangent, alpha)), add(last, scale(endTangent, beta)), last];
}

/** The furthest a run's points lie from a cubic, and where.
 * @param {Point[]} points @param {number[]} u @param {Cubic} cubic */
function worstMiss(points, u, cubic) {
  let worst = -1, at = 0;
  points.forEach((p, i) => {
    const d = distance(p, pointOn(cubic, u[i]));
    if (d > worst) { worst = d; at = i; }
  });
  return { worst, at };
}

/** Tangent at a run's start, from a few points in. @param {Point[]} points */
const tangentAt = points => unit(sub(points[Math.min(2, points.length - 1)], points[0]));

/** Cubics through a run of points, split until each stays within tolerance.
 * @param {Point[]} points @param {Point} startTangent @param {Point} endTangent @param {number} tolerance
 * @returns {Cubic[]} */
function cubicsThrough(points, startTangent, endTangent, tolerance) {
  if (points.length === 2) {
    const third = distance(points[0], points[1]) / 3;
    return [[points[0], add(points[0], scale(startTangent, third)), add(points[1], scale(endTangent, third)), points[1]]];
  }
  const u = positions(points);
  const cubic = cubicThrough(points, u, startTangent, endTangent);
  const miss = worstMiss(points, u, cubic);
  if (miss.worst <= tolerance) return [cubic];
  const split = Math.max(1, Math.min(points.length - 2, miss.at));
  const centre = unit(sub(points[split - 1], points[split + 1]));
  return [
    ...cubicsThrough(points.slice(0, split + 1), startTangent, centre, tolerance),
    ...cubicsThrough(points.slice(split), scale(centre, -1), endTangent, tolerance),
  ];
}

/** A smooth curve along one stroke. It can follow anything, so its freedom grows with
 * every piece it needs: a simple curve costs little, a scribble more than it can pay. */
export const curve = {
  name: 'curve',
  fit(drawing) {
    if (drawing.strokes.length !== 1) return null;
    const stroke = drawing.strokes[0].map(p => ({ ...p }));   // what it returns is the caller's to change
    if (stroke.length < 2 || lengthOf(stroke) === 0) return null;
    const segments = cubicsThrough(stroke, tangentAt(stroke), tangentAt([...stroke].reverse()), drawing.size * TOLERANCE);
    const path = [stroke[0], ...segments.flatMap(c => Array.from({ length: STEPS }, (_, i) => pointOn(c, (i + 1) / STEPS)))];
    return { paths: [path], freedom: 2 + 6 * segments.length, segments };
  },
};

