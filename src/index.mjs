/* The library: a fitter for a list of shapes. It holds no state beyond that list,
   and imports no shape: shapes are supplied, the built-ins in inkfit/shapes too. */

import { reduce } from './reduce.mjs';
import { scorerFor } from './score.mjs';

/** @typedef {import('./geometry.mjs').Point} Point */
/** @typedef {import('./reduce.mjs').Drawing} Drawing */

/** A shape's best version for a drawing. `paths` and `freedom` are read by the
 * scoring, and anything else passes through to the caller.
 * @typedef {{paths: Point[][], freedom: number, [key: string]: unknown}} Proposal */

/** A shape: `fit` proposes its best version for a drawing, or null. It never scores itself.
 * @typedef {{name: string, fit: (drawing: Drawing) => Proposal | null}} Shape */

/** A proposal with its shape's name and its score.
 * @typedef {Proposal & {name: string, score: number}} Candidate */

/** The lowest score that snaps. Below it the caller keeps the strokes it has. */
export const MIN_SCORE = 0.5;

/** Best first. Equal scores fall to the name, so a list's order never decides.
 * @param {Candidate} a @param {Candidate} b */
const byScore = (a, b) => b.score - a.score || (a.name < b.name ? -1 : 1);

/** A fitter for these shapes. It never changes: for another list, make another. It
 * keeps each shape's name and `fit` as they are now, so a shape can be a plain object
 * or a class, and a later change to the list or a swapped `fit` reaches nothing.
 * @param {Shape[]} shapes
 * @returns {(strokes: Point[][]) => {best: Candidate | null, candidates: Candidate[]}} */
export function createFitter(shapes) {
  const bound = shapes.map(shape => {
    if (typeof shape.fit !== 'function') throw new Error(`shape ${shape.name} has no fit`);
    return { name: shape.name, fit: shape.fit.bind(shape) };
  });
  if (new Set(bound.map(s => s.name)).size !== bound.length) throw new Error('two shapes share a name');
  return strokes => {
    const drawing = reduce(strokes);
    if (!drawing) return { best: null, candidates: [] };
    const scoreOf = scorerFor(drawing, MIN_SCORE);
    const candidates = bound.flatMap(shape => {
      const proposal = shape.fit(drawing);
      if (!proposal) return [];
      const score = scoreOf(proposal);
      return score === null ? [] : [{ ...proposal, name: shape.name, score }];
    }).sort(byScore);
    return { best: candidates[0]?.score >= MIN_SCORE ? candidates[0] : null, candidates };
  };
}
