import { centreOf, mean, lengthOf, resample } from '../geometry.mjs';

/** @typedef {import('../geometry.mjs').Point} Point */

/** How many points stand for an outline while it is being placed. Placing costs the
 * product of this and `DRAWING_POINTS`, and what gets drawn is the outline's own points. */
const OUTLINE_POINTS = 32;

/** How many of a drawing's points are matched against while placing. */
const DRAWING_POINTS = 32;

/** How many starting angles are tried: matching only finds the nearest fit. */
const ANGLES = 24;

/** How many of the best starting angles get settled. Each costs as much as trying all. */
const SETTLED = 3;

/** How many rounds of matching settle an outline onto a drawing. */
const ROUNDS = 5;

/** Points moved to around their even spread's centre, with a root-mean-square radius of 1.
 * The even spread is for placing, and the points themselves are what gets drawn, so
 * no corner is cut. @param {readonly Point[]} points */
function normalised(points) {
  const even = resample([...points], lengthOf(points) / OUTLINE_POINTS);
  const centre = centreOf(even);
  const radius = Math.sqrt(mean(even.map(p => (p.x - centre.x) ** 2 + (p.y - centre.y) ** 2)));
  const moved = list => list.map(p => ({ x: (p.x - centre.x) / radius, y: (p.y - centre.y) / radius }));
  return { spread: moved(even), exact: moved(points) };
}

/** @param {{x: number, y: number, scale: number, angle: number}} place @param {Point} p */
function placed({ x, y, scale, angle }, p) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return { x: x + scale * (p.x * c - p.y * s), y: y + scale * (p.x * s + p.y * c) };
}

/** Which of a drawing's points lies nearest each outline point, placed, as indexes into
 * `xs` and `ys`, and how far each is. Placing is the costly part of an outline, so this
 * compares squared distances over flat arrays, and turns the angle into a sine once.
 * @param {readonly Point[]} outline @param {{x: number, y: number, scale: number, angle: number}} place
 * @param {Float64Array} xs @param {Float64Array} ys */
function nearestAll(outline, place, xs, ys) {
  const c = Math.cos(place.angle) * place.scale, s = Math.sin(place.angle) * place.scale;
  const nearest = new Int32Array(outline.length);
  let sum = 0;
  outline.forEach((p, i) => {
    const x = place.x + p.x * c - p.y * s, y = place.y + p.x * s + p.y * c;
    let least = Infinity, at = 0;
    for (let j = 0; j < xs.length; j += 1) {
      const dx = x - xs[j], dy = y - ys[j];
      const d = dx * dx + dy * dy;
      if (d < least) { least = d; at = j; }
    }
    nearest[i] = at;
    sum += Math.sqrt(least);
  });
  return { nearest, miss: sum / outline.length };
}

/** The placement that best lays matched points onto their partners (Procrustes).
 * @param {Point[]} from On the outline, around its own origin. @param {Point[]} to On the drawing. */
function bestPlacement(from, to) {
  const a = centreOf(from), b = centreOf(to);
  let dot = 0, cross = 0, squared = 0;
  from.forEach((p, i) => {
    const [ux, uy, vx, vy] = [p.x - a.x, p.y - a.y, to[i].x - b.x, to[i].y - b.y];
    dot += ux * vx + uy * vy;
    cross += ux * vy - uy * vx;
    squared += ux * ux + uy * uy;
  });
  const angle = Math.atan2(cross, dot);
  const scale = Math.hypot(dot, cross) / squared;
  const shift = placed({ x: 0, y: 0, scale, angle }, a);
  return { x: b.x - shift.x, y: b.y - shift.y, scale, angle };
}

/** Moves a placement onto a drawing, one matching round after another.
 * @param {readonly Point[]} outline @param {object} start @param {readonly Point[]} points
 * @param {Float64Array} xs @param {Float64Array} ys */
function settle(outline, start, points, xs, ys) {
  let place = start;
  for (let round = 0; round < ROUNDS; round += 1) {
    const { nearest } = nearestAll(outline, place, xs, ys);
    place = bestPlacement(outline, Array.from(nearest, i => points[i]));
  }
  return place;
}

/** A shape from an outline: one path of points, placed at any position, size and angle.
 * Write a definition instead for a shape with no fixed proportions, such as a rectangle,
 * or with branches, such as a plus: a path would have to retrace them, and retraced
 * length counts as ink the drawing doesn't have. @param {string} name @param {readonly Point[]} points */
export function outline(name, points) {
  if (!(points.length >= 2 && lengthOf(points) > 0)) throw new Error(`outline ${name} has no extent`);
  const { spread: shape, exact } = normalised(points);
  return {
    name,
    fit(drawing) {
      const { points } = drawing;
      const step = Math.max(1, points.length / DRAWING_POINTS);
      const some = Array.from({ length: Math.min(points.length, DRAWING_POINTS) }, (_, i) => points[Math.floor(i * step)]);
      const { x, y } = centreOf(points);
      const scale = Math.sqrt(mean(points.map(p => (p.x - x) ** 2 + (p.y - y) ** 2)));
      const xs = Float64Array.from(some, p => p.x), ys = Float64Array.from(some, p => p.y);
      const ranked = list => list.map(place => ({ place, miss: nearestAll(shape, place, xs, ys).miss })).sort((a, b) => a.miss - b.miss).map(r => r.place);
      const starts = ranked(Array.from({ length: ANGLES }, (_, i) => ({ x, y, scale, angle: i / ANGLES * 2 * Math.PI })));
      const [best] = ranked(starts.slice(0, SETTLED).map(start => settle(shape, start, some, xs, ys)));
      return { paths: [exact.map(p => placed(best, p))], freedom: 4, center: { x: best.x, y: best.y }, scale: best.scale, rotation: best.angle };
    },
  };
}
